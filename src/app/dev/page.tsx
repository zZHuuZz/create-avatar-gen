'use client';

import { useState, useRef } from 'react';

// defaultDur = expected clip length from FramePack; overridden once actual video is uploaded
const SCENES = [
  { index: 0, key: 'no-hand',  label: 'Chỉ nói, không đưa tay', color: 'bg-gray-100',  defaultDur: 2.5 },
  { index: 1, key: '1-hand',   label: '1 tay',                  color: 'bg-blue-50',   defaultDur: 3.0 },
  { index: 2, key: '2-hand',   label: '2 tay',                  color: 'bg-green-50',  defaultDur: 2.5 },
  { index: 3, key: 'point-up', label: 'Chỉ lên trời',           color: 'bg-yellow-50', defaultDur: 2.0 },
] as const;

type SceneKey = (typeof SCENES)[number]['key'];

const SCENE_KEY_MAP: Record<SceneKey, number> = {
  'no-hand': 0, '1-hand': 1, '2-hand': 2, 'point-up': 3,
};

interface SequenceItem {
  sceneIndex: number;
  label: string;
  duration: number;
  key: SceneKey;
}

function fmt(s: number) { return s.toFixed(1) + 's'; }

// Round speech duration to the nearest whole number of clip loops
function snapToClip(speechDur: number, clipDur: number): number {
  const loops = Math.max(1, Math.round(speechDur / clipDur));
  return parseFloat((loops * clipDur).toFixed(3));
}

function getClipDur(sceneIndex: number, videoDurations: (number | null)[]): number {
  return videoDurations[sceneIndex] ?? SCENES.find((s) => s.index === sceneIndex)?.defaultDur ?? 2.5;
}

export default function DevPage() {
  const [videos, setVideos] = useState<(File | null)[]>([null, null, null, null]);
  const [videoDurations, setVideoDurations] = useState<(number | null)[]>([null, null, null, null]);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [sequence, setSequence] = useState<SequenceItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergedUrl, setMergedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      const markers: { start: number; end: number; word: string; sceneKey: SceneKey }[] = data.markers ?? [];
      const totalAudioDur: number = data.audioDuration ?? audioDuration;
      const noHandClipDur = getClipDur(0, videoDurations);

      const out: SequenceItem[] = [];
      let cursor = 0;

      for (const marker of markers) {
        // Fill gap before this marker with no-hand clips
        const gapDur = marker.start - cursor;
        if (gapDur > 0) {
          const count = Math.max(1, Math.round(gapDur / noHandClipDur));
          for (let i = 0; i < count; i++) {
            out.push({ sceneIndex: 0, label: SCENES[0].label, duration: noHandClipDur, key: 'no-hand' });
          }
        }
        // Insert exactly 1 gesture clip matched to the word type
        const key = (marker.sceneKey in SCENE_KEY_MAP ? marker.sceneKey : '2-hand') as SceneKey;
        const sceneIdx = SCENE_KEY_MAP[key];
        const scene = SCENES.find((s) => s.index === sceneIdx)!;
        const gestureClipDur = getClipDur(sceneIdx, videoDurations);
        out.push({ sceneIndex: sceneIdx, label: scene.label, duration: gestureClipDur, key });
        cursor = marker.start + gestureClipDur;
      }

      // Fill remaining audio with no-hand clips
      const remaining = totalAudioDur - cursor;
      if (remaining > 0) {
        const count = Math.max(1, Math.round(remaining / noHandClipDur));
        for (let i = 0; i < count; i++) {
          out.push({ sceneIndex: 0, label: SCENES[0].label, duration: noHandClipDur, key: 'no-hand' });
        }
      }
      setSequence(out);
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

        {/* 4 video uploaders */}
        <div className="grid grid-cols-2 gap-3">
          {SCENES.map((scene) => (
            <VideoSlot
              key={scene.index}
              scene={scene}
              file={videos[scene.index]}
              onFile={(f) => setVideo(scene.index, f)}
              onDuration={(d) => setVideoDuration(scene.index, d)}
            />
          ))}
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
              <div className="px-3 py-2.5 rounded-xl bg-(--color-muted) text-[11px] text-(--color-secondary) leading-relaxed">
                <span className="font-medium text-(--color-foreground) block mb-1">Transcript</span>
                {transcript}
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
