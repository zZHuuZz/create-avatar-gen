'use client';

import { useState, useRef } from 'react';
import type { PosedSceneResult, SceneResult, StageKey } from '@/types/pipeline';
import { ALL_SCENES, NATURAL_HAND_VARIANTS } from '@/lib/scene-config';

interface Props {
  scenes: SceneResult[];
  posedScenes: PosedSceneResult[];
}

interface SequenceItem {
  frampackUrl: string;
  jobId: string;
  label: string;
  duration: number;
  sceneIndex: number;
  triggerWord?: string;
  level?: 1 | 2 | 3;
}

interface AnalysisMarker {
  start: number;
  end: number;
  word: string;
  sceneKey: string;
  isListIntro?: boolean;
}

type SceneKey = 'no-hand' | '1-hand' | '2-hand' | 'point-up';

const SCENE_KEY_MAP: Record<string, number> = {
  'no-hand': 0, '1-hand': 1, '2-hand': 2, 'point-up': 3,
};

const STAGE_LABELS: Record<StageKey, string> = { into: 'A', hold: 'B', out: 'C' };

// Natural-hand gesture variants — each one may appear at most this many times in a
// sequence, and repeats must be spaced apart so the video doesn't look like it's looping.
// C (fist, index 6) is intentionally rarer — max 2 uses vs 3 for A and B.
const VARIANT_MAX_USES = 3;
const VARIANT_C_IDX = 6;
const VARIANT_C_MAX = 2;
const VARIANT_MIN_GAP = 8; // seconds

// Preferred natural-hand variant (scene index) per trigger word.
// A (clap, 1)  → sequential / listing — marks each point in a list.
// B (press, 5) → transitions, results, contrasts — the all-round workhorse.
// C (fist, 6)  → no word preference — appears only when A/B are exhausted; max 2 uses.
const VARIANT_WORD_PREF: Record<string, number> = {
  'đầu tiên': 1, 'thứ nhất': 1, 'thứ hai': 1, 'thứ ba': 1, 'thứ tư': 1,
  'thứ năm': 1, 'thứ sáu': 1, 'thứ bảy': 1, 'cuối cùng': 1,
  'tiếp theo': 1, 'kế tiếp': 1,
  'kết quả là': 5, 'do đó': 5, 'vì vậy': 5, 'thay vì': 5,
  'hơn nữa': 5, 'ngoài ra': 5, 'bên cạnh đó': 5, 'song song đó': 5,
  'nhưng': 5, 'tuy nhiên': 5, 'thế nhưng': 5, 'vậy mà': 5, 'mặc dù': 5,
  'thậm chí': 5, 'quan trọng hơn': 5, 'đặc biệt là': 5,
};

// Linguistic priority — based on discourse weight, not gesture type.
const MARKER_PRIORITY: Record<string, number> = {
  'đầu tiên': 4, 'cuối cùng': 4,
  'thứ nhất': 4, 'thứ hai': 4, 'thứ ba': 4, 'thứ tư': 4, 'thứ năm': 4,
  'thứ sáu': 4, 'thứ bảy': 4,
  'nhưng': 3, 'tuy nhiên': 3, 'thế nhưng': 3, 'vậy mà': 3,
  'kết quả là': 3, 'thay vì': 3, 'mặc dù': 3, 'do đó': 3, 'vì vậy': 3,
  'tiếp theo': 2, 'kế tiếp': 2, 'hơn nữa': 2, 'ngoài ra': 2,
  'bên cạnh đó': 2, 'song song đó': 2, 'không chỉ vậy': 2, 'đồng thời': 2,
  'ví dụ như': 1, 'ví dụ': 1, 'chẳng hạn như': 1, 'chẳng hạn': 1,
  'thậm chí': 1, 'đặc biệt là': 1, 'nhất là': 1, 'quan trọng hơn': 1,
};

function getMarkerPriority(word: string): number {
  const key = word.toLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').trim();
  return MARKER_PRIORITY[key] ?? 2;
}

const MARKER_COLORS: Record<SceneKey, { bg: string; text: string; border: string }> = {
  'no-hand':  { bg: 'bg-gray-100',   text: 'text-gray-700',   border: 'border-gray-300' },
  '1-hand':   { bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-300' },
  '2-hand':   { bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300' },
  'point-up': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
};

function HighlightedTranscript({ text, markers }: { text: string; markers: AnalysisMarker[] }) {
  type Seg = { type: 'text'; content: string } | { type: 'marker'; content: string; sceneKey: SceneKey };
  const segs: Seg[] = [];
  let rest = text;
  for (const m of [...markers].sort((a, b) => a.start - b.start)) {
    const idx = rest.indexOf(m.word);
    if (idx === -1) continue;
    if (idx > 0) segs.push({ type: 'text', content: rest.slice(0, idx) });
    segs.push({ type: 'marker', content: m.word, sceneKey: m.sceneKey as SceneKey });
    rest = rest.slice(idx + m.word.length);
  }
  if (rest) segs.push({ type: 'text', content: rest });

  return (
    <>
      {segs.map((seg, i) => {
        if (seg.type === 'text') return <span key={i}>{seg.content}</span>;
        const c = MARKER_COLORS[seg.sceneKey] ?? MARKER_COLORS['2-hand'];
        return (
          <mark key={i} title={seg.sceneKey}
            className={`${c.bg} ${c.text} rounded px-0.5 font-semibold not-italic`}>
            {seg.content}
          </mark>
        );
      })}
    </>
  );
}

function fmt(s: number) { return s.toFixed(1) + 's'; }

export function VideoMerge({ scenes, posedScenes }: Props) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [sequence, setSequence] = useState<SequenceItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [markers, setMarkers] = useState<AnalysisMarker[]>([]);
  const [merging, setMerging] = useState(false);
  const [mergedUrl, setMergedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enabledVariants, setEnabledVariants] = useState<Set<number> | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const doneScenes = scenes.filter((s) => s.status === 'done' && s.jobId && s.frampackUrl);
  const doneVariants = doneScenes.filter((s) => NATURAL_HAND_VARIANTS.includes(s.index));
  // Default to "all available variants enabled" until the user toggles one off.
  const activeVariants = enabledVariants ?? new Set(doneVariants.map((s) => s.index));

  function toggleVariant(index: number) {
    setEnabledVariants((prev) => {
      const next = new Set(prev ?? doneVariants.map((s) => s.index));
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  function getClipDuration(sceneIndex: number) {
    return ALL_SCENES.find((s) => s.index === sceneIndex)?.duration ?? 2.5;
  }

  function getStageDuration(sceneIndex: number, stageKey: StageKey): number {
    const scene = ALL_SCENES.find((s) => s.index === sceneIndex);
    if (!scene?.poseConfig) return 2;
    return stageKey === 'into' ? scene.poseConfig.stageInto.duration
      : stageKey === 'hold' ? scene.poseConfig.stageHold.duration
      : scene.poseConfig.stageOut.duration;
  }

  function getGestureTotalDuration(sceneIndex: number): number {
    return getClipDuration(sceneIndex);
  }

  function getGestureLead(_key: SceneKey): number {
    return 0;
  }

  function sceneForIndex(index: number): SceneResult | undefined {
    return doneScenes.find((s) => s.index === index) ?? doneScenes[0];
  }

  function handleAudio(file: File) {
    setAudioFile(file);
    setAudioDuration(null);
    setMergedUrl(null);
    setTranscript(null);
    setMarkers([]);
    const audio = new Audio(URL.createObjectURL(file));
    audio.onloadedmetadata = () => setAudioDuration(audio.duration);
  }

  function addScene(scene: SceneResult, duration?: number) {
    setSequence((prev) => [...prev, {
      frampackUrl: scene.frampackUrl!,
      jobId: scene.jobId!,
      label: scene.label,
      duration: duration ?? getClipDuration(scene.index),
      sceneIndex: scene.index,
    }]);
  }

  function addPosedStage(ps: PosedSceneResult, stageKey: StageKey) {
    const stage = ps.stages.find((s) => s.key === stageKey && s.status === 'done');
    if (!stage?.jobId || !stage.frampackUrl) return;
    setSequence((prev) => [...prev, {
      frampackUrl: stage.frampackUrl!,
      jobId: stage.jobId!,
      label: `${ps.label} ${STAGE_LABELS[stageKey]}`,
      duration: getStageDuration(ps.sceneIndex, stageKey),
      sceneIndex: ps.sceneIndex,
    }]);
  }

  function addAllPosedStages(ps: PosedSceneResult) {
    const items: SequenceItem[] = [];
    const stageKeys = (ps.sceneIndex === 3 ? ['into', 'hold'] : ['into', 'hold', 'out']) as StageKey[];
    for (const key of stageKeys) {
      const stage = ps.stages.find((s) => s.key === key && s.status === 'done');
      if (!stage?.jobId || !stage.frampackUrl) continue;
      items.push({
        frampackUrl: stage.frampackUrl!,
        jobId: stage.jobId!,
        label: `${ps.label} ${STAGE_LABELS[key]}`,
        duration: getStageDuration(ps.sceneIndex, key),
        sceneIndex: ps.sceneIndex,
      });
    }
    setSequence((prev) => [...prev, ...items]);
  }

  function removeAt(pos: number) { setSequence((prev) => prev.filter((_, i) => i !== pos)); }
  function moveUp(pos: number) {
    if (pos === 0) return;
    setSequence((prev) => { const n = [...prev]; [n[pos - 1], n[pos]] = [n[pos], n[pos - 1]]; return n; });
  }
  function moveDown(pos: number) {
    setSequence((prev) => {
      if (pos >= prev.length - 1) return prev;
      const n = [...prev]; [n[pos], n[pos + 1]] = [n[pos + 1], n[pos]]; return n;
    });
  }

  function autoFill() {
    if (!audioDuration || doneScenes.length === 0) return;
    const items: SequenceItem[] = [];
    let total = 0; let i = 0;
    while (total < audioDuration) {
      const scene = doneScenes[i % doneScenes.length];
      const dur = getClipDuration(scene.index);
      items.push({ frampackUrl: scene.frampackUrl!, jobId: scene.jobId!, label: scene.label, duration: dur, sceneIndex: scene.index });
      total += dur; i++;
    }
    setSequence(items);
  }

  async function analyzeWithAI() {
    if (!audioFile || !audioDuration) return;
    setAnalyzing(true);
    setError(null);
    setTranscript(null);
    setMarkers([]);

    try {
      const form = new FormData();
      form.append('audio', audioFile);
      const res = await fetch('/api/merge-video/analyze', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed');

      const rawMarkers: AnalysisMarker[] = data.markers ?? [];
      const secondaryMarkersData: { start: number; end: number; word: string }[] = data.secondaryMarkers ?? [];
      const tertiaryMarkersData: { start: number; end: number; word: string }[] = data.tertiaryMarkers ?? [];
      setTranscript(data.transcript ?? '');
      setMarkers(rawMarkers);
      const totalAudioDur: number = data.audioDuration ?? audioDuration;
      const noHandClipDur = getClipDuration(0);
      const noHandPool = doneScenes.filter((s) => !(ALL_SCENES.find((a) => a.index === s.index)?.hasArm));
      const handFillerPool = doneScenes.filter((s) => {
        const sc = ALL_SCENES.find((a) => a.index === s.index);
        if (!sc?.hasArm || s.index === 3) return false;
        if (sc.variantGroup && !activeVariants.has(s.index)) return false;
        return true;
      });
      const naturalHandPool = doneScenes.filter((s) => NATURAL_HAND_VARIANTS.includes(s.index) && activeVariants.has(s.index));

      // Tracks how many times each natural-hand variant has been used and when its
      // last clip ends, so repeats stay capped and spaced apart (avoids looking like a loop).
      const variantUsage = new Map<number, { count: number; lastEnd: number }>();

      function recordVariantUsage(scene: SceneResult, clipStartTime: number) {
        if (!NATURAL_HAND_VARIANTS.includes(scene.index)) return;
        const prev = variantUsage.get(scene.index);
        variantUsage.set(scene.index, {
          count: (prev?.count ?? 0) + 1,
          lastEnd: clipStartTime + getClipDuration(scene.index),
        });
      }

      // Tracks recent natural-hand variant placements (capped at 5 entries) to detect XYX patterns.
      const variantHistory: number[] = [];

      // Returns true only when C (index 6) is the candidate AND C appeared 2 slots ago
      // (C→Y→C* pattern). Blocks C from repeating too closely; A and B can repeat freely.
      function isXYXBlocked(candidateIdx: number): boolean {
        if (candidateIdx !== VARIANT_C_IDX) return false;
        const n = variantHistory.length;
        if (n < 2) return false;
        return variantHistory[n - 2] === VARIANT_C_IDX && variantHistory[n - 1] !== VARIANT_C_IDX;
      }

      function commitVariant(scene: SceneResult, clipStartTime: number) {
        recordVariantUsage(scene, clipStartTime);
        variantHistory.push(scene.index);
        if (variantHistory.length > 5) variantHistory.shift();
      }

      // Preference-based picker for intentional variant placement.
      // Default order A(1)→B(5)→C(6): C is deprioritized and capped at 2 uses (A/B at 3).
      // Respects word preference, per-variant cap, gap constraint, and XYX blocking.
      // Falls back to least-recently-used non-XYX variant when all are at cap/gap.
      function pickVariant(triggerWord: string | undefined, clipStartTime: number): SceneResult | undefined {
        if (naturalHandPool.length === 0) return undefined;
        const wordKey = (triggerWord ?? '').toLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').trim();
        const preferredIdx = VARIANT_WORD_PREF[wordKey];
        const ABC_ORDER = [1, 5, 6]; // A, B, C — C tried last so it stays rare
        const candidateOrder = preferredIdx !== undefined
          ? [preferredIdx, ...ABC_ORDER.filter(i => i !== preferredIdx)]
          : ABC_ORDER;
        const order = candidateOrder.filter(idx => naturalHandPool.some(s => s.index === idx));
        for (const idx of order) {
          const scene = naturalHandPool.find(s => s.index === idx);
          if (!scene) continue;
          const u = variantUsage.get(idx);
          const maxUses = idx === VARIANT_C_IDX ? VARIANT_C_MAX : VARIANT_MAX_USES;
          const eligible = (!u || u.count < maxUses) && (!u || clipStartTime - u.lastEnd >= VARIANT_MIN_GAP);
          if (!eligible || isXYXBlocked(idx)) continue;
          commitVariant(scene, clipStartTime);
          return scene;
        }
        // Fallback: non-XYX-blocked variants first, then least-recently-used
        const ranked = naturalHandPool.slice().sort((a, b) => {
          const aBlock = isXYXBlocked(a.index) ? 1 : 0;
          const bBlock = isXYXBlocked(b.index) ? 1 : 0;
          const ua = variantUsage.get(a.index)?.lastEnd ?? -Infinity;
          const ub = variantUsage.get(b.index)?.lastEnd ?? -Infinity;
          return aBlock - bBlock || ua - ub;
        });
        const fallback = ranked[0];
        if (fallback) commitVariant(fallback, clipStartTime);
        return fallback;
      }

      // Round-robin pick that skips natural-hand variants which have hit their use cap
      // or haven't cooled down yet; falls back to the plain round-robin slot if none qualify.
      function pickClip(pool: SceneResult[], startIdx: number, clipStartTime: number): SceneResult {
        const n = pool.length;
        for (let k = 0; k < n; k++) {
          const cand = pool[(startIdx + k) % n];
          if (NATURAL_HAND_VARIANTS.includes(cand.index)) {
            const u = variantUsage.get(cand.index);
            const maxUses = cand.index === VARIANT_C_IDX ? VARIANT_C_MAX : VARIANT_MAX_USES;
            const eligible = (!u || u.count < maxUses) && (!u || clipStartTime - u.lastEnd >= VARIANT_MIN_GAP);
            if (!eligible) continue;
          }
          recordVariantUsage(cand, clipStartTime);
          return cand;
        }
        const fallback = pool[startIdx % n];
        recordVariantUsage(fallback, clipStartTime);
        return fallback;
      }

      // Step 1: Resolve back-to-back specials — keep higher linguistic priority, drop lower.
      // First marker anchors at position 0 (always starts with gesture).
      const resolvedMarkers = rawMarkers.reduce<AnalysisMarker[]>((acc, curr) => {
        if (!acc.length) return [curr];
        const prev = acc[acc.length - 1];
        const prevGestureDur = getGestureTotalDuration(SCENE_KEY_MAP[prev.sceneKey] ?? 2);
        const prevAnchor = acc.length === 1 ? 0 : prev.start;
        if (curr.start < prevAnchor + prevGestureDur) {
          // Priority: point-up > L1 (by tier) > lower tier
          const currIsPointUp = curr.sceneKey === 'point-up';
          const prevIsPointUp = prev.sceneKey === 'point-up';
          const currWins = curr.isListIntro && !prev.isListIntro ? true
            : !curr.isListIntro && prev.isListIntro ? false
            : currIsPointUp && !prevIsPointUp ? true
            : !currIsPointUp && prevIsPointUp ? false
            : getMarkerPriority(curr.word) > getMarkerPriority(prev.word);
          if (currWins) acc[acc.length - 1] = curr;
          return acc;
        }
        return [...acc, curr];
      }, []);

      // Step 2: Point-up rules — 1 per video max; list-intro markers keep point-up unconditionally.
      let pointUpUsed = false;
      const step2Markers = resolvedMarkers.map(m => {
        if (m.sceneKey !== 'point-up') return m;
        if (m.isListIntro) return m;
        if (!pointUpUsed) { pointUpUsed = true; return m; }
        return { ...m, sceneKey: '1-hand' };
      });

      // Step 2.5: Gesture variety — rotate to avoid repetition.
      // When natural-hand variants are available, no back-to-back 2-hand (streak > 1 triggers rotation).
      // Without natural-hand variants, keep the original 3-in-a-row limit.
      // 1-hand never rotates before 3-in-a-row (variants themselves provide variety).
      const finalMarkers = step2Markers.reduce<{ out: AnalysisMarker[]; streak: number; lastKey: string | null }>(
        (acc, m) => {
          const key = m.sceneKey;
          if (key === 'point-up' || key === 'no-hand') { acc.out.push(m); return acc; }
          const sameAsLast = key === acc.lastKey;
          const streak = sameAsLast ? acc.streak + 1 : 1;
          const streakLimit = (key === '2-hand' && naturalHandPool.length > 0) ? 1 : 2;
          if (streak > streakLimit) {
            const rotated = key === '1-hand' ? '2-hand' : '1-hand';
            acc.out.push({ ...m, sceneKey: rotated });
            acc.lastKey = rotated; acc.streak = 1;
          } else {
            acc.out.push(m);
            acc.lastKey = key; acc.streak = streak;
          }
          return acc;
        },
        { out: [], streak: 0, lastKey: null }
      ).out;

      // Step 3: Build sequence.
      // Gesture starts BEFORE the trigger word so the hand reaches position as the word is spoken.
      // Lead time is per-scene: posed scenes use their stageInto duration; 2-hand uses 0.7s.
      const out: SequenceItem[] = [];
      let cursor = 0;
      let noHandN = 0;

      function pushNoHand(duration: number) {
        if (noHandPool.length === 0 || duration < 0.5) return;
        const count = Math.max(1, Math.round(duration / noHandClipDur));
        const stretchedDur = parseFloat((duration / count).toFixed(3));
        for (let n = 0; n < count; n++) {
          const scene = noHandPool[(noHandN + n) % noHandPool.length];
          out.push({ frampackUrl: scene.frampackUrl!, jobId: scene.jobId!, label: scene.label, duration: stretchedDur, sceneIndex: scene.index });
        }
        noHandN += count;
      }

      // Fill a gap: insert 1-hand clips at secondary marker timestamps,
      // and as a fallback insert one at 1/3 point for any gap longer than 3s.
      const L3_INTERVAL = 5; // seconds between L3 gestures in a dead zone

      // Fill a sub-gap [subStart, subEnd) with L3 word-triggered gestures.
      // Uses tertiaryMarkersData word timestamps — only fires when words land in this zone.
      // Enforces L3_INTERVAL minimum spacing so dense words (like "và") don't cluster.
      function fillSubGapL3(subStart: number, subEnd: number) {
        const available = subEnd - subStart;
        if (available <= 0) return;
        if (handFillerPool.length === 0) { pushNoHand(available); return; }
        const inZone = tertiaryMarkersData.filter(m => m.start >= subStart && m.start < subEnd);
        if (inZone.length === 0) { pushNoHand(available); return; }
        let lpos = subStart;
        let lastGestureEnd = -Infinity;
        for (const tm of inZone) {
          if (tm.start - lastGestureEnd < L3_INTERVAL) continue; // enforce min spacing
          // Pool members share duration, so we can size the slot before knowing which one wins the pick.
          const handClipDur = getClipDuration(handFillerPool[noHandN % handFillerPool.length].index);
          const latestFit = subEnd - handClipDur;
          if (latestFit < lpos) break;
          const handStart = Math.min(Math.max(lpos, tm.start), latestFit);
          const scene = pickClip(handFillerPool, noHandN, handStart);
          if (handStart > lpos) pushNoHand(handStart - lpos);
          out.push({ frampackUrl: scene.frampackUrl!, jobId: scene.jobId!, label: scene.label, duration: handClipDur, sceneIndex: scene.index, triggerWord: tm.word, level: 3 });
          noHandN++;
          lpos = handStart + handClipDur;
          lastGestureEnd = lpos;
        }
        if (lpos < subEnd) pushNoHand(subEnd - lpos);
      }

      // idleAtEnd: reserve this many seconds at the end of the gap as no-hand (used before point-up)
      function fillGap(gapStartTime: number, gapDur: number, idleAtEnd = 0) {
        if (gapDur <= 0) return;
        if (handFillerPool.length === 0) { pushNoHand(gapDur); return; }
        const gapEnd = gapStartTime + gapDur;
        const handZoneEnd = gapEnd - idleAtEnd;
        const inGap = secondaryMarkersData.filter(m => m.start >= gapStartTime && m.start < Math.max(gapStartTime, handZoneEnd));

        if (inGap.length === 0) {
          // No L2 markers — fill entire hand-zone with L3, then idleAtEnd tail
          fillSubGapL3(gapStartTime, handZoneEnd);
          if (handZoneEnd < gapEnd) pushNoHand(gapEnd - handZoneEnd);
          return;
        }

        let pos = gapStartTime;
        for (const sm of inGap) {
          const handClipDur = getClipDuration(handFillerPool[noHandN % handFillerPool.length].index);
          const latestFit = handZoneEnd - handClipDur;
          if (latestFit < pos) continue;
          const handStart = Math.min(Math.max(pos, sm.start), latestFit);
          // Sub-gap before this L2 marker — use L3 if large enough, otherwise idle.
          // Filled BEFORE picking this clip so variant usage is recorded in chronological order.
          if (handStart > pos) fillSubGapL3(pos, handStart);
          const scene = pickClip(handFillerPool, noHandN, handStart);
          out.push({ frampackUrl: scene.frampackUrl!, jobId: scene.jobId!, label: scene.label, duration: handClipDur, sceneIndex: scene.index, triggerWord: sm.word, level: 2 });
          noHandN++;
          pos = handStart + handClipDur;
        }
        // Trailing sub-gap after last L2 — use L3 if large enough
        if (pos < handZoneEnd) fillSubGapL3(pos, handZoneEnd);
        if (handZoneEnd < gapEnd) pushNoHand(gapEnd - handZoneEnd);
      }

      function pushGestureClips(key: SceneKey, gestureStart: number, triggerWord?: string) {
        let scene: SceneResult | undefined;
        if (key === '1-hand' && naturalHandPool.length > 0) {
          scene = pickVariant(triggerWord, gestureStart);
          noHandN++;
        } else {
          scene = sceneForIndex(SCENE_KEY_MAP[key] ?? 2);
        }
        if (!scene) return;
        out.push({ frampackUrl: scene.frampackUrl!, jobId: scene.jobId!, label: scene.label, duration: getClipDuration(scene.index), sceneIndex: scene.index, triggerWord, level: 1 });
      }

      // Each xfade transition overlaps clips by FADE_DUR (0.12s in merge-video route).
      // With N clips before a gesture, the gesture appears N×0.12s earlier than intended.
      // Compensate by shifting gestureStart forward by out.length × FADE_DUR.
      const FADE_COMP = 0.12;

      for (let mi = 0; mi < finalMarkers.length; mi++) {
        const marker = finalMarkers[mi];
        const key = (marker.sceneKey in SCENE_KEY_MAP ? marker.sceneKey : '2-hand') as SceneKey;
        const gestureDur = getGestureTotalDuration(SCENE_KEY_MAP[key]);
        const gestureStart = mi === 0 ? 0 : Math.max(cursor, marker.start - getGestureLead(key) + out.length * FADE_COMP);

        if (mi > 0) {
          const gapDur = gestureStart - cursor;
          if (gapDur > 0) fillGap(cursor, gapDur, SCENE_KEY_MAP[key] === 3 ? noHandClipDur : 0);
        }

        pushGestureClips(key, gestureStart, marker.word);
        cursor = gestureStart + gestureDur;
      }

      // xfade removes (N-1)×0.12s from total video duration.
      // Compensate so the merged video always outlasts the audio by at least 1s.
      const xfadeCompensation = out.length * FADE_COMP;
      const remaining = totalAudioDur + 1.0 + xfadeCompensation - cursor;
      if (remaining > 0) fillGap(cursor, remaining);

      // Post-process 1: replace the second of any two consecutive 2-hand (sceneIndex 2) clips
      // with a natural-hand variant, chosen by word-preference + anti-repetition rules.
      // Computes cumulative time so the gap-check in pickVariant uses accurate start times.
      const TWOHAND_IDX = 2;
      let dedupCumul = 0;
      const deduped: SequenceItem[] = [];
      for (const item of out) {
        if (item.sceneIndex === TWOHAND_IDX && naturalHandPool.length > 0) {
          const prevHand = deduped.slice().reverse().find(x =>
            ALL_SCENES.find(s => s.index === x.sceneIndex)?.hasArm
          );
          if (prevHand?.sceneIndex === TWOHAND_IDX) {
            const varScene = pickVariant(item.triggerWord, dedupCumul);
            if (varScene) {
              const varDur = getClipDuration(varScene.index);
              deduped.push({ ...item, frampackUrl: varScene.frampackUrl!, jobId: varScene.jobId!, label: varScene.label, sceneIndex: varScene.index, duration: varDur });
              dedupCumul += varDur;
              continue;
            }
          }
        }
        deduped.push(item);
        dedupCumul += item.duration;
      }

      // Post-process 2: no same hand gesture 3 times in a row (across L1 + L2).
      // Point-up resets the streak. Short idle clips are transparent (don't reset).
      const HAND_CYCLE = [1, 2, 3]; // legacy rotation used when no sibling variant is available
      function pickAlternateIndex(currentIdx: number): number {
        if (NATURAL_HAND_VARIANTS.includes(currentIdx)) {
          const sibling = NATURAL_HAND_VARIANTS.find((i) => i !== currentIdx && activeVariants.has(i) && doneScenes.some((s) => s.index === i));
          if (sibling !== undefined) return sibling;
        }
        const i = HAND_CYCLE.indexOf(currentIdx);
        return i === -1 ? HAND_CYCLE[0] : HAND_CYCLE[(i + 1) % HAND_CYCLE.length];
      }

      let lastHandIdx: number | null = null;
      let handStreak = 0;
      const final: SequenceItem[] = [];
      for (const item of deduped) {
        const isHand = item.sceneIndex === 1 || item.sceneIndex === 2 || item.sceneIndex === 3
          || NATURAL_HAND_VARIANTS.includes(item.sceneIndex);
        if (!isHand) { final.push(item); continue; }
        if (item.sceneIndex === lastHandIdx) { handStreak++; } else { lastHandIdx = item.sceneIndex; handStreak = 1; }
        if (handStreak >= 3) {
          const altIdx = pickAlternateIndex(item.sceneIndex);
          const alt = doneScenes.find(s => s.index === altIdx);
          if (alt) {
            final.push({ ...item, frampackUrl: alt.frampackUrl!, jobId: alt.jobId!, label: alt.label, sceneIndex: alt.index, duration: getClipDuration(alt.index) });
            lastHandIdx = altIdx; handStreak = 1;
          } else { final.push(item); }
        } else { final.push(item); }
      }
      setSequence(final);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  const sequenceDuration = sequence.reduce((acc, s) => acc + s.duration, 0);
  const canMerge = !!audioDuration && sequence.length > 0 && !merging;

  async function handleMerge() {
    if (!audioDuration || !sequence.length) return;
    setMerging(true);
    setError(null);
    setMergedUrl(null);

    try {
      const form = new FormData();
      if (audioFile) form.append('audio', audioFile);
      form.append('duration', String(audioDuration));
      form.append('sequence', JSON.stringify(
        sequence.map(({ frampackUrl, jobId, label, duration }) => ({ frampackUrl, jobId, label, duration }))
      ));

      const res = await fetch('/api/merge-video', { method: 'POST', body: form });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Server error ${res.status}`);
      }
      setMergedUrl(URL.createObjectURL(await res.blob()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMerging(false);
    }
  }

  function download() {
    if (!mergedUrl) return;
    const a = document.createElement('a');
    a.href = mergedUrl;
    a.download = 'merged.mp4';
    a.click();
  }

  const hasDoneRegular = doneScenes.length > 0;
  const hasDonePosed = posedScenes.some((ps) => ps.stages.some((s) => s.status === 'done'));
  if (!hasDoneRegular && !hasDonePosed) return null;

  return (
    <div className="flex flex-col gap-4">

      {/* Audio */}
      <div>
        <label className="text-xs font-medium text-(--color-secondary) block mb-1.5">Audio file</label>
        <div
          onClick={() => audioInputRef.current?.click()}
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-(--color-border) hover:border-(--color-primary) cursor-pointer transition-all"
        >
          <span className="text-sm text-(--color-secondary) truncate">
            {audioFile ? audioFile.name : 'Click to upload audio'}
          </span>
          {audioDuration !== null && (
            <span className="text-xs font-semibold text-(--color-primary) shrink-0">{fmt(audioDuration)}</span>
          )}
        </div>
        <input ref={audioInputRef} type="file" accept="audio/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && handleAudio(e.target.files[0])} />
      </div>

      {/* AI analyze */}
      {audioFile && audioDuration && (
        <button onClick={analyzeWithAI} disabled={analyzing} className="btn-neumorphic w-full py-2.5 text-sm">
          {analyzing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-(--color-secondary) border-t-transparent rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
              Analyzing speech...
            </span>
          ) : '✦ Analyze with AI → auto-assign gestures'}
        </button>
      )}

      {/* Transcript + markers */}
      {transcript && (
        <div className="flex flex-col gap-2">
          <div className="px-3 py-2.5 rounded-xl bg-(--color-muted) text-[11px] text-(--color-secondary) leading-relaxed">
            <span className="font-medium text-(--color-foreground) block mb-1">Transcript</span>
            <HighlightedTranscript text={transcript} markers={markers} />
          </div>

          {markers.length > 0 && (
            <div className="px-3 py-2.5 rounded-xl border border-(--color-border) text-[11px]">
              <span className="font-medium text-(--color-foreground) block mb-2">
                Detected markers ({markers.length})
              </span>
              <div className="flex flex-col gap-1">
                {markers.map((m, i) => {
                  const c = MARKER_COLORS[m.sceneKey as SceneKey] ?? MARKER_COLORS['2-hand'];
                  return (
                    <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${c.bg} ${c.border}`}>
                      <span className={`font-semibold ${c.text} min-w-0 flex-1`}>"{m.word}"</span>
                      <span className="text-(--color-secondary) shrink-0">{m.start.toFixed(2)}s – {m.end.toFixed(2)}s</span>
                      <span className={`shrink-0 font-medium ${c.text}`}>{m.sceneKey}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-2 pt-2 border-t border-(--color-border)">
                {(['2-hand', '1-hand', 'point-up'] as SceneKey[]).map((k) => {
                  const c = MARKER_COLORS[k];
                  const label = k === '2-hand' ? '2 tay' : k === '1-hand' ? '1 tay' : 'Chỉ lên trời';
                  return <span key={k} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text}`}>{label}</span>;
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Natural-hand gesture variants — pick which ones the auto-sequencer is allowed to use */}
      {doneVariants.length > 1 && (
        <div>
          <label className="text-xs font-medium text-(--color-secondary) block mb-1.5">
            Biến thể &quot;tay tự nhiên&quot; dùng trong auto-sequence
          </label>
          <div className="flex flex-wrap gap-2">
            {doneVariants.map((scene) => {
              const checked = activeVariants.has(scene.index);
              return (
                <label key={scene.index}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${checked ? 'border-(--color-primary) bg-(--color-primary-light) text-(--color-foreground)' : 'border-(--color-border) text-(--color-secondary)'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleVariant(scene.index)} className="accent-(--color-primary)" />
                  {scene.label}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Manual clip chips */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-(--color-secondary)">Add clips manually</label>
          <button onClick={autoFill} disabled={!audioDuration || !hasDoneRegular}
            className="text-xs text-(--color-primary) hover:underline disabled:opacity-40 disabled:no-underline">
            Auto fill ↓
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {doneScenes.map((scene) => (
            <button key={scene.index} onClick={() => addScene(scene)}
              className="text-xs px-3 py-1.5 rounded-lg border border-(--color-border) hover:border-(--color-primary) hover:bg-(--color-primary-light) transition-all text-(--color-foreground)">
              + {scene.label} <span className="text-(--color-secondary)">({fmt(getClipDuration(scene.index))})</span>
            </button>
          ))}
          {posedScenes.map((ps) => {
            const hasAny = ps.stages.some((s) => s.status === 'done');
            if (!hasAny) return null;
            const expectedStages = ps.sceneIndex === 3 ? 2 : 3;
            const hasAll = ps.stages.filter((s) => s.status === 'done').length >= expectedStages;
            return (
              <div key={ps.sceneIndex} className="flex gap-1">
                {hasAll && (
                  <button onClick={() => addAllPosedStages(ps)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-(--color-primary) bg-(--color-primary-light) hover:bg-(--color-primary) hover:text-white transition-all text-(--color-foreground)">
                    + {ps.label} (A+B+C)
                  </button>
                )}
                {(ps.sceneIndex === 3 ? ['into', 'hold'] as StageKey[] : ['into', 'hold', 'out'] as StageKey[]).map((key) => {
                  const stage = ps.stages.find((s) => s.key === key && s.status === 'done');
                  if (!stage) return null;
                  return (
                    <button key={key} onClick={() => addPosedStage(ps, key)}
                      className="text-xs px-2 py-1.5 rounded-lg border border-(--color-border) hover:border-(--color-primary) hover:bg-(--color-primary-light) transition-all text-(--color-foreground)">
                      {ps.label} {STAGE_LABELS[key]}
                      <span className="text-(--color-secondary) ml-1">({fmt(getStageDuration(ps.sceneIndex, key))})</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sequence */}
      {sequence.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-(--color-secondary)">Sequence</label>
            <span className={`text-xs font-medium ${audioDuration && sequenceDuration >= audioDuration * 0.95 ? 'text-(--color-success)' : 'text-(--color-secondary)'}`}>
              {fmt(sequenceDuration)}{audioDuration ? ` / ${fmt(audioDuration)}` : ''}
            </span>
          </div>
          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
            {sequence.map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-(--color-border) bg-(--color-card)">
                <span className="text-xs text-(--color-secondary) w-4 text-right shrink-0">{i + 1}</span>
                <span className="text-sm text-(--color-foreground) flex-1 truncate">{item.label}</span>
                {item.level === 1 && item.triggerWord && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium shrink-0">L1 · "{item.triggerWord}"</span>
                )}
                {item.level === 2 && item.triggerWord && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium shrink-0">L2 · "{item.triggerWord}"</span>
                )}
                {item.level === 3 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium shrink-0">
                    {item.triggerWord ? `L3 · "${item.triggerWord}"` : 'L3'}
                  </span>
                )}
                <span className="text-xs text-(--color-secondary) shrink-0">{fmt(item.duration)}</span>
                <div className="flex gap-0.5 shrink-0">
                  <button onClick={() => moveUp(i)} disabled={i === 0} className="text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-(--color-muted) disabled:opacity-30">↑</button>
                  <button onClick={() => moveDown(i)} disabled={i === sequence.length - 1} className="text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-(--color-muted) disabled:opacity-30">↓</button>
                  <button onClick={() => removeAt(i)} className="text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-red-50 text-(--color-error)">×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl border border-(--color-error) bg-red-50 text-sm text-(--color-error)">{error}</div>
      )}

      <button onClick={handleMerge} disabled={!canMerge} className="btn-neumorphic btn-primary w-full py-3 text-sm">
        {merging ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
            Merging...
          </span>
        ) : 'Merge for Lipsync →'}
      </button>

      {mergedUrl && (
        <div className="flex flex-col gap-2">
          <video src={mergedUrl} controls loop className="w-full rounded-xl bg-black" style={{ maxHeight: '260px' }} />
          <button onClick={download} className="btn-neumorphic w-full py-2.5 text-sm">↓ Download merged.mp4</button>
        </div>
      )}
    </div>
  );
}
