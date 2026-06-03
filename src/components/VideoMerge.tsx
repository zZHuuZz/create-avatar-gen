'use client';

import { useState, useRef } from 'react';
import type { PosedSceneResult, SceneResult, StageKey } from '@/types/pipeline';
import { ALL_SCENES } from '@/lib/scene-config';

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
  level?: 1 | 2;
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
  const audioInputRef = useRef<HTMLInputElement>(null);

  const doneScenes = scenes.filter((s) => s.status === 'done' && s.jobId && s.frampackUrl);

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
    if (sceneIndex === 3) {
      // +2.0 for the talking delay before the gesture fires
      return 2.0 + getStageDuration(sceneIndex, 'into') + getStageDuration(sceneIndex, 'hold') + getStageDuration(sceneIndex, 'out');
    }
    return getClipDuration(sceneIndex);
  }

  function getGestureLead(key: SceneKey): number {
    if (SCENE_KEY_MAP[key] === 3) return -2.0; // fires 2s after trigger word
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
    for (const key of ['into', 'hold', 'out'] as StageKey[]) {
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
      setTranscript(data.transcript ?? '');
      setMarkers(rawMarkers);
      const totalAudioDur: number = data.audioDuration ?? audioDuration;
      const noHandClipDur = getClipDuration(0);
      const noHandPool = doneScenes.filter((s) => !(ALL_SCENES.find((a) => a.index === s.index)?.hasArm));
      const handFillerPool = doneScenes.filter((s) => { const sc = ALL_SCENES.find((a) => a.index === s.index); return sc?.hasArm && s.index !== 3; });

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

      // Step 2.5: Gesture variety — if the same gesture repeats more than 2× in a row,
      // rotate to the other main type (1-hand ↔ 2-hand). Keeps the video from feeling monotonous.
      const finalMarkers = step2Markers.reduce<{ out: AnalysisMarker[]; streak: number; lastKey: string | null }>(
        (acc, m) => {
          const key = m.sceneKey;
          if (key === 'point-up' || key === 'no-hand') { acc.out.push(m); return acc; }
          const sameAsLast = key === acc.lastKey;
          const streak = sameAsLast ? acc.streak + 1 : 1;
          if (streak > 2) {
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
      // idleAtEnd: reserve this many seconds at the end of the gap as no-hand (used before point-up)
      function fillGap(gapStartTime: number, gapDur: number, idleAtEnd = 0) {
        if (gapDur <= 0) return;
        if (handFillerPool.length === 0) { pushNoHand(gapDur); return; }
        const gapEnd = gapStartTime + gapDur;
        const handZoneEnd = gapEnd - idleAtEnd; // hand clips only allowed before this
        const inGap = secondaryMarkersData.filter(m => m.start >= gapStartTime && m.start < Math.max(gapStartTime, handZoneEnd));
        if (inGap.length === 0) { pushNoHand(gapDur); return; }

        let pos = gapStartTime;
        for (const sm of inGap) {
          const handClipDur = getClipDuration(handFillerPool[0].index);
          const latestFit = handZoneEnd - handClipDur; // latest start where clip still fits fully
          if (latestFit < pos) continue; // no room left even if shifted
          // Place as close to word as possible; shift left if word is too close to handZoneEnd
          const handStart = Math.min(Math.max(pos, sm.start), latestFit);
          if (handStart > pos) pushNoHand(handStart - pos);
          const scene = handFillerPool[noHandN % handFillerPool.length];
          out.push({ frampackUrl: scene.frampackUrl!, jobId: scene.jobId!, label: scene.label, duration: handClipDur, sceneIndex: scene.index, triggerWord: sm.word, level: 2 });
          noHandN++;
          pos = handStart + handClipDur;
        }
        if (pos < gapEnd) pushNoHand(gapEnd - pos);
      }

      function pushGestureClips(key: SceneKey, triggerWord?: string) {
        const sceneIndex = SCENE_KEY_MAP[key] ?? 2;
        if (sceneIndex === 3) {
          const ps = posedScenes.find(p => p.sceneIndex === sceneIndex);
          if (!ps) return;
          let first = true;
          for (const stageKey of ['into', 'hold', 'out'] as StageKey[]) {
            const stage = ps.stages.find(s => s.key === stageKey && s.status === 'done');
            if (!stage?.jobId || !stage.frampackUrl) continue;
            out.push({ frampackUrl: stage.frampackUrl!, jobId: stage.jobId!, label: `${ps.label} ${STAGE_LABELS[stageKey]}`, duration: getStageDuration(sceneIndex, stageKey), sceneIndex, ...(first ? { triggerWord, level: 1 as const } : {}) });
            first = false;
          }
        } else {
          const scene = sceneForIndex(sceneIndex);
          if (!scene) return;
          out.push({ frampackUrl: scene.frampackUrl!, jobId: scene.jobId!, label: scene.label, duration: getClipDuration(scene.index), sceneIndex: scene.index, triggerWord, level: 1 });
        }
      }

      for (let mi = 0; mi < finalMarkers.length; mi++) {
        const marker = finalMarkers[mi];
        const key = (marker.sceneKey in SCENE_KEY_MAP ? marker.sceneKey : '2-hand') as SceneKey;
        const gestureDur = getGestureTotalDuration(SCENE_KEY_MAP[key]);
        const gestureStart = mi === 0 ? 0 : Math.max(cursor, marker.start - getGestureLead(key));

        if (mi > 0) {
          const gapDur = gestureStart - cursor;
          if (gapDur > 0) fillGap(cursor, gapDur, SCENE_KEY_MAP[key] === 3 ? noHandClipDur : 0);
        }

        pushGestureClips(key, marker.word);
        cursor = gestureStart + gestureDur;
      }

      const remaining = totalAudioDur - cursor;
      if (remaining > 0) fillGap(cursor, remaining);

      // Post-process: no same hand gesture 3 times in a row (across L1 + L2).
      // Point-up resets the streak. Short idle clips are transparent (don't reset).
      let lastHandIdx: number | null = null;
      let handStreak = 0;
      const final: SequenceItem[] = [];
      for (const item of out) {
        if (item.sceneIndex === 3) { lastHandIdx = null; handStreak = 0; final.push(item); continue; }
        const isHand = item.sceneIndex === 1 || item.sceneIndex === 2;
        if (!isHand) { final.push(item); continue; }
        if (item.sceneIndex === lastHandIdx) { handStreak++; } else { lastHandIdx = item.sceneIndex; handStreak = 1; }
        if (handStreak >= 3) {
          const altIdx: number = item.sceneIndex === 1 ? 2 : 1;
          const alt = doneScenes.find(s => s.index === altIdx);
          if (alt) {
            final.push({ ...item, frampackUrl: alt.frampackUrl!, jobId: alt.jobId!, label: alt.label, sceneIndex: alt.index });
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
            const hasAll = ps.stages.filter((s) => s.status === 'done').length === 3;
            return (
              <div key={ps.sceneIndex} className="flex gap-1">
                {hasAll && (
                  <button onClick={() => addAllPosedStages(ps)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-(--color-primary) bg-(--color-primary-light) hover:bg-(--color-primary) hover:text-white transition-all text-(--color-foreground)">
                    + {ps.label} (A+B+C)
                  </button>
                )}
                {(['into', 'hold', 'out'] as StageKey[]).map((key) => {
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
