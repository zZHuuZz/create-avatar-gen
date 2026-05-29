'use client';

import { useState, useRef } from 'react';
import type { SceneResult } from '@/types/pipeline';
import { ALL_SCENES } from '@/lib/scene-config';

interface Props {
  scenes: SceneResult[];
}

interface SequenceItem {
  frampackUrl: string;
  jobId: string;
  label: string;
  duration: number;
  sceneIndex: number;
}

interface AnalysisMarker {
  start: number;
  end: number;
  word: string;
  type: 'transition' | 'emphasis';
}

const SCENE_KEY_MAP: Record<string, number> = {
  'no-hand': 0,
  '1-hand': 1,
  '2-hand': 2,
  'point-up': 3,
};

const SCENE_LABELS: Record<string, string> = {
  'no-hand': 'Chỉ nói',
  '1-hand': '1 tay',
  '2-hand': '2 tay',
  'point-up': 'Chỉ lên trời',
};

function fmt(s: number) {
  return s.toFixed(1) + 's';
}

export function VideoMerge({ scenes }: Props) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [sequence, setSequence] = useState<SequenceItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergedUrl, setMergedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const doneScenes = scenes.filter((s) => s.status === 'done' && s.jobId && s.frampackUrl);

  function getClipDuration(sceneIndex: number) {
    return ALL_SCENES.find((s) => s.index === sceneIndex)?.duration ?? 2.5;
  }

  function sceneForIndex(index: number): SceneResult | undefined {
    return doneScenes.find((s) => s.index === index) ?? doneScenes[0];
  }

  function handleAudio(file: File) {
    setAudioFile(file);
    setAudioDuration(null);
    setMergedUrl(null);
    setTranscript(null);
    const audio = new Audio(URL.createObjectURL(file));
    audio.onloadedmetadata = () => setAudioDuration(audio.duration);
  }

  function addScene(scene: SceneResult, duration?: number) {
    setSequence((prev) => [
      ...prev,
      {
        frampackUrl: scene.frampackUrl!,
        jobId: scene.jobId!,
        label: scene.label,
        duration: duration ?? getClipDuration(scene.index),
        sceneIndex: scene.index,
      },
    ]);
  }

  function removeAt(pos: number) {
    setSequence((prev) => prev.filter((_, i) => i !== pos));
  }

  function moveUp(pos: number) {
    if (pos === 0) return;
    setSequence((prev) => {
      const next = [...prev];
      [next[pos - 1], next[pos]] = [next[pos], next[pos - 1]];
      return next;
    });
  }

  function moveDown(pos: number) {
    setSequence((prev) => {
      if (pos >= prev.length - 1) return prev;
      const next = [...prev];
      [next[pos], next[pos + 1]] = [next[pos + 1], next[pos]];
      return next;
    });
  }

  function autoFill() {
    if (!audioDuration || doneScenes.length === 0) return;
    const items: SequenceItem[] = [];
    let total = 0;
    let i = 0;
    while (total < audioDuration) {
      const scene = doneScenes[i % doneScenes.length];
      const dur = getClipDuration(scene.index);
      items.push({ frampackUrl: scene.frampackUrl!, jobId: scene.jobId!, label: scene.label, duration: dur, sceneIndex: scene.index });
      total += dur;
      i++;
    }
    setSequence(items);
  }

  async function analyzeWithAI() {
    if (!audioFile || !audioDuration) return;
    setAnalyzing(true);
    setError(null);
    setTranscript(null);

    try {
      const form = new FormData();
      form.append('audio', audioFile);
      const res = await fetch('/api/merge-video/analyze', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed');

      const markers: AnalysisMarker[] = data.markers ?? [];
      setTranscript(data.transcript ?? '');
      const totalAudioDur: number = data.audioDuration ?? audioDuration;

      const noHandScene = sceneForIndex(0);
      const noHandClipDur = getClipDuration(0);

      const items: SequenceItem[] = [];
      let cursor = 0;

      for (const marker of markers) {
        // Fill gap before this marker with no-hand clips
        const gapDur = marker.start - cursor;
        if (gapDur > 0 && noHandScene) {
          const count = Math.max(1, Math.round(gapDur / noHandClipDur));
          for (let i = 0; i < count; i++) {
            items.push({ frampackUrl: noHandScene.frampackUrl!, jobId: noHandScene.jobId!, label: noHandScene.label, duration: noHandClipDur, sceneIndex: 0 });
          }
        }
        // Insert exactly 1 gesture clip
        const sceneIdx = marker.type === 'transition' ? SCENE_KEY_MAP['2-hand'] : SCENE_KEY_MAP['1-hand'];
        const scene = sceneForIndex(sceneIdx);
        if (scene) {
          const clipDur = getClipDuration(scene.index);
          items.push({ frampackUrl: scene.frampackUrl!, jobId: scene.jobId!, label: scene.label, duration: clipDur, sceneIndex: scene.index });
          cursor = marker.start + clipDur;
        }
      }

      // Fill remaining with no-hand
      const remaining = totalAudioDur - cursor;
      if (remaining > 0 && noHandScene) {
        const count = Math.max(1, Math.round(remaining / noHandClipDur));
        for (let i = 0; i < count; i++) {
          items.push({ frampackUrl: noHandScene.frampackUrl!, jobId: noHandScene.jobId!, label: noHandScene.label, duration: noHandClipDur, sceneIndex: 0 });
        }
      }
      setSequence(items);
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
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      const blob = await res.blob();
      setMergedUrl(URL.createObjectURL(blob));
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

  if (doneScenes.length === 0) return null;

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
        <button
          onClick={analyzeWithAI}
          disabled={analyzing}
          className="btn-neumorphic w-full py-2.5 text-sm"
        >
          {analyzing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-(--color-secondary) border-t-transparent rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
              Analyzing speech...
            </span>
          ) : (
            '✦ Analyze with AI → auto-assign gestures'
          )}
        </button>
      )}

      {transcript && (
        <div className="px-3 py-2.5 rounded-xl bg-(--color-muted) text-[11px] text-(--color-secondary) leading-relaxed">
          <span className="font-medium text-(--color-foreground) block mb-1">Transcript</span>
          {transcript}
        </div>
      )}

      {/* Manual scene chips */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-(--color-secondary)">Add scenes manually</label>
          <button onClick={autoFill} disabled={!audioDuration || doneScenes.length === 0}
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
        ) : (
          'Merge for Lipsync →'
        )}
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
