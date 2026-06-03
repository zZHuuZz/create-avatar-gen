'use client';

import { useState, useRef } from 'react';

const SCENES = [
  { index: 0, key: 'no-hand',    label: 'Chỉ nói, không đưa tay', color: 'bg-gray-100',   defaultDur: 2.0 },
  { index: 1, key: '1-hand',     label: '1 tay',                  color: 'bg-blue-50',    defaultDur: 2.0 },
  { index: 2, key: '2-hand',     label: '2 tay',                  color: 'bg-green-50',   defaultDur: 1.5 },
  { index: 3, key: 'point-up',   label: 'Chỉ lên trời',           color: 'bg-yellow-50',  defaultDur: 4.8 },
  { index: 4, key: 'talk-light', label: 'Nói nhẹ',                color: 'bg-purple-50',  defaultDur: 2.0 },
] as const;

type SceneKey = (typeof SCENES)[number]['key'];

const SCENE_KEY_MAP: Record<SceneKey, number> = {
  'no-hand': 0, '1-hand': 1, '2-hand': 2, 'point-up': 3, 'talk-light': 4,
};

const NO_HAND_KEYS = new Set<SceneKey>(['no-hand', 'talk-light']);

function getGestureLead(key: SceneKey): number {
  if (key === 'point-up') return -2.0; // fires 2s after trigger word
  return 0;
}

interface SequenceItem {
  sceneIndex: number;
  label: string;
  duration: number;
  key: SceneKey;
  triggerWord?: string;
  level?: 1 | 2;
}

interface Marker {
  start: number;
  end: number;
  word: string;
  sceneKey: SceneKey;
  isListIntro?: boolean;
}

// Linguistic priority — based on discourse weight, not gesture type.
// Tier 4: structural ordinals (main scaffolding)
// Tier 3: major discourse transitions
// Tier 2: flow connectors
// Tier 1: examples / emphasis
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
  'no-hand':    { bg: 'bg-gray-100',   text: 'text-gray-700',   border: 'border-gray-300' },
  '1-hand':     { bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-300' },
  '2-hand':     { bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300' },
  'point-up':   { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  'talk-light': { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
};

function HighlightedTranscript({ text, markers }: { text: string; markers: Marker[] }) {
  type Seg = { type: 'text'; content: string } | { type: 'marker'; content: string; sceneKey: SceneKey };
  const segs: Seg[] = [];
  let rest = text;
  for (const m of [...markers].sort((a, b) => a.start - b.start)) {
    const idx = rest.indexOf(m.word);
    if (idx === -1) continue;
    if (idx > 0) segs.push({ type: 'text', content: rest.slice(0, idx) });
    segs.push({ type: 'marker', content: m.word, sceneKey: m.sceneKey });
    rest = rest.slice(idx + m.word.length);
  }
  if (rest) segs.push({ type: 'text', content: rest });

  return (
    <>
      {segs.map((seg, i) => {
        if (seg.type === 'text') return <span key={i}>{seg.content}</span>;
        const c = MARKER_COLORS[seg.sceneKey];
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

function snapToClip(speechDur: number, clipDur: number): number {
  const loops = Math.max(1, Math.round(speechDur / clipDur));
  return parseFloat((loops * clipDur).toFixed(3));
}

function getClipDur(sceneIndex: number, videoDurations: (number | null)[]): number {
  return videoDurations[sceneIndex] ?? SCENES.find((s) => s.index === sceneIndex)?.defaultDur ?? 2.5;
}

export default function DevPage() {
  const [videos, setVideos] = useState<(File | null)[]>([null, null, null, null, null]);
  const [videoDurations, setVideoDurations] = useState<(number | null)[]>([null, null, null, null, null]);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [sequence, setSequence] = useState<SequenceItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergedUrl, setMergedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const audioRef = useRef<HTMLInputElement>(null);

  function setVideo(i: number, file: File) {
    setVideos((prev) => { const n = [...prev]; n[i] = file; return n; });
  }

  function setVideoDuration(i: number, dur: number) {
    setVideoDurations((prev) => { const n = [...prev]; n[i] = dur; return n; });
  }

  function handleAudio(file: File) {
    setAudioFile(file);
    setAudioDuration(null);
    setMergedUrl(null);
    setMarkers([]);
    setTranscript(null);
    const a = new Audio(URL.createObjectURL(file));
    a.onloadedmetadata = () => setAudioDuration(a.duration);
  }

  function addToSequence(scene: typeof SCENES[number], dur?: number) {
    setSequence((prev) => [...prev, {
      sceneIndex: scene.index,
      label: scene.label,
      duration: dur ?? getClipDur(scene.index, videoDurations),
      key: scene.key,
    }]);
  }

  function removeAt(i: number) { setSequence((p) => p.filter((_, j) => j !== i)); }
  function moveUp(i: number) {
    if (i === 0) return;
    setSequence((p) => { const n=[...p]; [n[i-1],n[i]]=[n[i],n[i-1]]; return n; });
  }
  function moveDown(i: number) {
    setSequence((p) => {
      if (i >= p.length-1) return p;
      const n=[...p]; [n[i],n[i+1]]=[n[i+1],n[i]]; return n;
    });
  }

  function autoFill() {
    if (!audioDuration) return;
    const avail = SCENES.filter((s) => videos[s.index]);
    if (!avail.length) return;
    const items: SequenceItem[] = [];
    let total = 0; let i = 0;
    while (total < audioDuration) {
      const s = avail[i % avail.length];
      const dur = getClipDur(s.index, videoDurations);
      items.push({ sceneIndex: s.index, label: s.label, duration: dur, key: s.key });
      total += dur; i++;
    }
    setSequence(items);
  }

  async function analyzeWithAI() {
    if (!audioFile || !audioDuration) return;
    setAnalyzing(true); setError(null); setTranscript(null);
    try {
      const form = new FormData();
      form.append('audio', audioFile);
      const res = await fetch('/api/merge-video/analyze', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed');

      setTranscript(data.transcript ?? '');
      const markers: Marker[] = data.markers ?? [];
      setMarkers(markers);
      const totalAudioDur: number = data.audioDuration ?? audioDuration;
      const secondaryMarkersData: { start: number; end: number; word: string }[] = data.secondaryMarkers ?? [];
      const noHandPool = SCENES.filter((s) => NO_HAND_KEYS.has(s.key) && videos[s.index]);
      const noHandClipDur = noHandPool.length > 0 ? getClipDur(noHandPool[0].index, videoDurations) : 2;
      const handFillerPool = SCENES.filter((s) => !NO_HAND_KEYS.has(s.key) && s.key !== 'point-up' && videos[s.index]);

      function pushNoHand(duration: number, startN: number): number {
        if (noHandPool.length === 0 || duration < 0.5) return startN;
        const count = Math.max(1, Math.round(duration / noHandClipDur));
        const stretchedDur = parseFloat((duration / count).toFixed(3));
        for (let n = 0; n < count; n++) {
          const scene = noHandPool[(startN + n) % noHandPool.length];
          out.push({ sceneIndex: scene.index, label: scene.label, duration: stretchedDur, key: scene.key });
        }
        return startN + count;
      }

      // idleAtEnd: reserve this many seconds at the end of the gap as no-hand (used before point-up)
      function fillGap(gapStartTime: number, gapDur: number, startN: number, idleAtEnd = 0): number {
        if (gapDur <= 0) return startN;
        if (handFillerPool.length === 0) return pushNoHand(gapDur, startN);
        const gapEnd = gapStartTime + gapDur;
        const handZoneEnd = gapEnd - idleAtEnd;
        const inGap = secondaryMarkersData.filter(m => m.start >= gapStartTime && m.start < Math.max(gapStartTime, handZoneEnd));
        if (inGap.length === 0) return pushNoHand(gapDur, startN);
        let n = startN;
        let pos = gapStartTime;
        for (const sm of inGap) {
          const handScene = handFillerPool[n % handFillerPool.length];
          const handClipDur = getClipDur(handScene.index, videoDurations);
          const latestFit = handZoneEnd - handClipDur;
          if (latestFit < pos) continue;
          const handStart = Math.min(Math.max(pos, sm.start), latestFit);
          if (handStart > pos) n = pushNoHand(handStart - pos, n);
          out.push({ sceneIndex: handScene.index, label: handScene.label, duration: handClipDur, key: handScene.key, triggerWord: sm.word, level: 2 });
          n++;
          pos = handStart + handClipDur;
        }
        if (pos < gapEnd) n = pushNoHand(gapEnd - pos, n);
        return n;
      }

      // Step 1: Resolve back-to-back specials — keep higher linguistic priority, drop lower.
      const resolvedMarkers = markers.reduce<Marker[]>((acc, curr) => {
        if (!acc.length) return [curr];
        const prev = acc[acc.length - 1];
        const prevGestureDur = getClipDur(SCENE_KEY_MAP[prev.sceneKey], videoDurations) + (prev.sceneKey === 'point-up' ? 2.0 : 0);
        const prevAnchor = acc.length === 1 ? 0 : prev.start;
        if (curr.start < prevAnchor + prevGestureDur) {
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

      // Step 2: Point-up rules.
      let pointUpUsed = false;
      const step2Markers: Marker[] = resolvedMarkers.map(m => {
        if (m.sceneKey !== 'point-up') return m;
        if (m.isListIntro) return m;
        if (!pointUpUsed) { pointUpUsed = true; return m; }
        return { ...m, sceneKey: '1-hand' as SceneKey };
      });

      // Step 2.5: Gesture variety — rotate 1-hand ↔ 2-hand if same gesture appears 2× in a row.
      const finalMarkers: Marker[] = step2Markers.reduce<{ out: Marker[]; streak: number; lastKey: string | null }>(
        (acc, m) => {
          const key = m.sceneKey;
          if (key === 'point-up' || NO_HAND_KEYS.has(key as SceneKey)) { acc.out.push(m); return acc; }
          const streak = key === acc.lastKey ? acc.streak + 1 : 1;
          if (streak > 2) {
            const rotated = (key === '1-hand' ? '2-hand' : '1-hand') as SceneKey;
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

      // Step 3: Build sequence with per-scene gesture lead.
      const out: SequenceItem[] = [];
      let cursor = 0;
      let noHandN = 0;

      for (let mi = 0; mi < finalMarkers.length; mi++) {
        const marker = finalMarkers[mi];
        const key = (marker.sceneKey in SCENE_KEY_MAP ? marker.sceneKey : '2-hand') as SceneKey;
        const sceneIdx = SCENE_KEY_MAP[key];
        const gestureClipDur = getClipDur(sceneIdx, videoDurations);
        const gestureStart = mi === 0 ? 0 : Math.max(cursor, marker.start - getGestureLead(key));

        if (mi > 0) {
          const gapDur = gestureStart - cursor;
          noHandN = fillGap(cursor, gapDur, noHandN, key === 'point-up' ? noHandClipDur : 0);
        }

        const scene = SCENES.find((s) => s.index === sceneIdx)!;
        out.push({ sceneIndex: sceneIdx, label: scene.label, duration: gestureClipDur, key, triggerWord: marker.word, level: 1 });
        cursor = gestureStart + gestureClipDur;
      }

      noHandN = fillGap(cursor, totalAudioDur - cursor, noHandN);
      // Post-process: no same hand gesture 3 times in a row (across L1 + L2).
      let lastHandIdx: number | null = null;
      let handStreak = 0;
      const final: SequenceItem[] = [];
      for (const item of out) {
        if (item.sceneIndex === 3) { lastHandIdx = null; handStreak = 0; final.push(item); continue; }
        const isHand = !NO_HAND_KEYS.has(item.key);
        if (!isHand) { final.push(item); continue; }
        if (item.sceneIndex === lastHandIdx) { handStreak++; } else { lastHandIdx = item.sceneIndex; handStreak = 1; }
        if (handStreak >= 3) {
          const altIdx: number = item.sceneIndex === 1 ? 2 : 1;
          if (videos[altIdx]) {
            const altScene = SCENES.find(s => s.index === altIdx)!;
            final.push({ ...item, sceneIndex: altIdx, label: altScene.label, key: altScene.key });
            lastHandIdx = altIdx; handStreak = 1;
          } else { final.push(item); }
        } else { final.push(item); }
      }
      setSequence(final);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setAnalyzing(false); }
  }

  async function handleMerge() {
    if (!audioDuration || !sequence.length) return;
    setMerging(true); setError(null); setMergedUrl(null);
    try {
      const form = new FormData();
      videos.forEach((v, i) => { if (v) form.append(`video_${i}`, v); });
      if (audioFile) form.append('audio', audioFile);
      form.append('duration', String(audioDuration));
      form.append('sequence', JSON.stringify(sequence.map(({ sceneIndex, duration }) => ({ sceneIndex, duration }))));

      const res = await fetch('/api/dev-merge', { method: 'POST', body: form });
      if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.error ?? `Error ${res.status}`); }
      setMergedUrl(URL.createObjectURL(await res.blob()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setMerging(false); }
  }

  const seqDuration = sequence.reduce((a, s) => a + s.duration, 0);
  const canMerge = !!audioDuration && sequence.length > 0 && videos.some(Boolean);

  return (
    <div className="min-h-screen bg-(--color-screen) px-6 py-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">

        <div>
          <h1 className="text-lg font-bold text-(--color-foreground)">Dev — Merge Test</h1>
          <p className="text-xs text-(--color-secondary) mt-1">Upload test videos for each scene case, then test analyze + merge without running the full pipeline.</p>
        </div>

        {/* Video uploaders — talking variants (0, 4) + gesture scenes (1, 2, 3) */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {SCENES.filter((s) => NO_HAND_KEYS.has(s.key)).map((scene) => (
              <VideoSlot key={scene.index} scene={scene} file={videos[scene.index]}
                onFile={(f) => setVideo(scene.index, f)} onDuration={(d) => setVideoDuration(scene.index, d)} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {SCENES.filter((s) => !NO_HAND_KEYS.has(s.key)).map((scene) => (
              <VideoSlot key={scene.index} scene={scene} file={videos[scene.index]}
                onFile={(f) => setVideo(scene.index, f)} onDuration={(d) => setVideoDuration(scene.index, d)} />
            ))}
          </div>
        </div>

        {/* Audio */}
        <div className="block-section">
          <div className="block-header"><span className="block-title">Audio</span><div className="block-divider" /></div>
          <div className="block-content flex flex-col gap-3">
            <div
              onClick={() => audioRef.current?.click()}
              className="flex items-center justify-between px-4 py-3 rounded-xl border border-(--color-border) hover:border-(--color-primary) cursor-pointer transition-all"
            >
              <span className="text-sm text-(--color-secondary) truncate">{audioFile ? audioFile.name : 'Click to upload audio'}</span>
              {audioDuration !== null && <span className="text-xs font-semibold text-(--color-primary) shrink-0">{fmt(audioDuration)}</span>}
            </div>
            <input ref={audioRef} type="file" accept="audio/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleAudio(e.target.files[0])} />

            {audioFile && audioDuration && (
              <button onClick={analyzeWithAI} disabled={analyzing} className="btn-neumorphic w-full py-2.5 text-sm">
                {analyzing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-(--color-secondary) border-t-transparent rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
                    Analyzing...
                  </span>
                ) : '✦ Analyze speech → auto-assign gestures'}
              </button>
            )}

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
                        const c = MARKER_COLORS[m.sceneKey];
                        return (
                          <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${c.bg} ${c.border}`}>
                            <span className={`font-semibold ${c.text} min-w-0 flex-1`}>"{m.word}"</span>
                            <span className="text-(--color-secondary) shrink-0">{m.start.toFixed(2)}s – {m.end.toFixed(2)}s</span>
                            <span className={`shrink-0 font-medium ${c.text}`}>{SCENES.find(s => s.key === m.sceneKey)?.label ?? m.sceneKey}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-3 mt-2 pt-2 border-t border-(--color-border)">
                      {(['2-hand','1-hand','point-up'] as const).map((k) => {
                        const c = MARKER_COLORS[k]; const sc = SCENES.find(s => s.key === k)!;
                        return <span key={k} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text}`}>{sc.label}</span>;
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sequence */}
        <div className="block-section">
          <div className="block-header"><span className="block-title">Sequence</span><div className="block-divider" /></div>
          <div className="block-content flex flex-col gap-3">

            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {SCENES.filter((s) => videos[s.index]).map((s) => (
                  <button key={s.index} onClick={() => addToSequence(s)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-(--color-border) hover:border-(--color-primary) hover:bg-(--color-primary-light) transition-all">
                    + {s.label}
                  </button>
                ))}
              </div>
              <button onClick={autoFill} disabled={!audioDuration} className="text-xs text-(--color-primary) hover:underline disabled:opacity-40 shrink-0 ml-3">
                Auto fill ↓
              </button>
            </div>

            {sequence.length > 0 && (
              <>
                <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                  {sequence.map((item, i) => {
                    const sc = SCENES.find((s) => s.index === item.sceneIndex);
                    return (
                      <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-(--color-border) ${sc?.color ?? ''}`}>
                        <span className="text-xs text-(--color-secondary) w-4 text-right">{i + 1}</span>
                        <span className="text-sm text-(--color-foreground) flex-1">{item.label}</span>
                        {item.level === 1 && item.triggerWord && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium shrink-0">L1 · "{item.triggerWord}"</span>
                        )}
                        {item.level === 2 && item.triggerWord && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium shrink-0">L2 · "{item.triggerWord}"</span>
                        )}
                        <span className="text-xs text-(--color-secondary)">{fmt(item.duration)}</span>
                        <div className="flex gap-0.5">
                          <button onClick={() => moveUp(i)} disabled={i === 0} className="text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-white/60 disabled:opacity-30">↑</button>
                          <button onClick={() => moveDown(i)} disabled={i === sequence.length - 1} className="text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-white/60 disabled:opacity-30">↓</button>
                          <button onClick={() => removeAt(i)} className="text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-red-100 text-(--color-error)">×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className={`text-xs text-right font-medium ${audioDuration && seqDuration >= audioDuration * 0.95 ? 'text-(--color-success)' : 'text-(--color-secondary)'}`}>
                  {fmt(seqDuration)}{audioDuration ? ` / ${fmt(audioDuration)}` : ''}
                </div>
              </>
            )}
          </div>
        </div>

        {error && <div className="px-4 py-3 rounded-xl border border-(--color-error) bg-red-50 text-sm text-(--color-error)">{error}</div>}

        <button onClick={handleMerge} disabled={!canMerge || merging} className="btn-neumorphic btn-primary w-full py-3 text-sm">
          {merging ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
              Merging...
            </span>
          ) : 'Merge & Download →'}
        </button>

        {mergedUrl && (
          <div className="flex flex-col gap-2">
            <video src={mergedUrl} controls loop className="w-full rounded-xl bg-black" />
            <button onClick={() => { const a=document.createElement('a'); a.href=mergedUrl; a.download='merged.mp4'; a.click(); }}
              className="btn-neumorphic w-full py-2.5 text-sm">↓ Download merged.mp4</button>
          </div>
        )}
      </div>
    </div>
  );
}

function VideoSlot({ scene, onFile, onDuration }: {
  scene: typeof SCENES[number];
  file: File | null;
  onFile: (f: File) => void;
  onDuration: (duration: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [clipDuration, setClipDuration] = useState<number | null>(null);

  function handleFile(f: File) {
    onFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      setClipDuration(v.duration);
      onDuration(v.duration);
    };
    v.src = url;
  }

  return (
    <div className="block-section">
      <div className="block-header">
        <span className="block-title">{scene.label}</span>
        {clipDuration !== null && <span className="text-xs text-(--color-secondary) ml-2">{clipDuration.toFixed(2)}s</span>}
        <div className="block-divider" />
      </div>
      <div className="block-content">
        {previewUrl ? (
          <div className="relative group">
            <video src={previewUrl} loop autoPlay muted playsInline
              className="w-full rounded-lg bg-black max-h-36 object-contain" />
            <button onClick={() => inputRef.current?.click()}
              className="absolute bottom-2 right-2 text-xs px-2 py-1 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
              Change
            </button>
          </div>
        ) : (
          <div onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-(--color-border) hover:border-(--color-primary) cursor-pointer transition-all">
            <span className="text-2xl">🎬</span>
            <span className="text-xs text-(--color-secondary)">Upload video</span>
          </div>
        )}
        <input ref={inputRef} type="file" accept="video/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>
    </div>
  );
}
