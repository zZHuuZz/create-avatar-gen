'use client';

import { useCallback, useState } from 'react';
import { ImageUpload } from '@/components/ImageUpload';
import { GeneratedPreview } from '@/components/GeneratedPreview';
import { VideoProgress } from '@/components/VideoProgress';
import { VideoResult } from '@/components/VideoResult';
import { VideoMerge } from '@/components/VideoMerge';
import { PosedSceneCard } from '@/components/PosedSceneCard';
import { ALL_SCENES, POSED_SCENE_INDICES } from '@/lib/scene-config';
import type {
  AppStep,
  PosedSceneResult,
  PosedSSEEvent,
  SceneResult,
  SSEEvent,
  StageKey,
} from '@/types/pipeline';

const STEPS = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Generate' },
  { id: 3, label: 'Video' },
];

const STAGE_LABELS: Record<StageKey, string> = {
  into: 'A · Vào tư thế',
  hold: 'B · Giữ',
  out: 'C · Ra tư thế',
};

function makePosedScene(sceneIndex: number): PosedSceneResult {
  const scene = ALL_SCENES.find((s) => s.index === sceneIndex)!;
  return {
    sceneIndex,
    label: scene.label,
    poseStatus: 'pending',
    stages: (['into', 'hold', 'out'] as StageKey[]).map((key) => ({
      key,
      label: STAGE_LABELS[key],
      status: 'pending',
      progress: 0,
    })),
    merging: false,
  };
}

export default function Home() {
  const [step, setStep] = useState<AppStep>(1);

  const [portrait, setPortrait] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string | null>(null);
  const [generatedPoses, setGeneratedPoses] = useState<Record<number, string>>({});
  const [normalizing, setNormalizing] = useState(false);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);
  const [regeneratingAvatar, setRegeneratingAvatar] = useState(false);
  const [regeneratingPoses, setRegeneratingPoses] = useState<Set<number>>(new Set());
  const [sceneMode, setSceneMode] = useState<'quick' | 'all'>('quick');

  const [scenes, setScenes] = useState<SceneResult[]>([]);
  const [posedScenes, setPosedScenes] = useState<PosedSceneResult[]>([]);
  const [generating, setGenerating] = useState(false);

  async function handleNormalize() {
    if (!portrait) return;
    setNormalizing(true);
    setNormalizeError(null);
    try {
      const res = await fetch('/api/normalize-pose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: portrait }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate image');
      setGenerated(data.generated);
      setGeneratedPoses(data.generatedPoses ?? {});
      setStep(2);
    } catch (err) {
      setNormalizeError(err instanceof Error ? err.message : String(err));
    } finally {
      setNormalizing(false);
    }
  }

  async function handleRegenerate() {
    if (!portrait) return;
    setNormalizing(true);
    setNormalizeError(null);
    try {
      const res = await fetch('/api/normalize-pose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: portrait }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate image');
      setGenerated(data.generated);
      setGeneratedPoses(data.generatedPoses ?? {});
    } catch (err) {
      setNormalizeError(err instanceof Error ? err.message : String(err));
    } finally {
      setNormalizing(false);
    }
  }

  async function handleRegenerateAvatar() {
    if (!portrait) return;
    setRegeneratingAvatar(true);
    try {
      const res = await fetch('/api/dev-image-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: portrait, step: 'avatar' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setGenerated(data.image);
    } catch (err) {
      setNormalizeError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegeneratingAvatar(false);
    }
  }

  async function handleRegeneratePose(sceneIndex: number) {
    if (!portrait) return;
    const step = sceneIndex === 3 ? 'pose-3' : null;
    if (!step) return;
    setRegeneratingPoses((prev) => new Set([...prev, sceneIndex]));
    try {
      const res = await fetch('/api/dev-image-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: portrait, step }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setGeneratedPoses((prev) => ({ ...prev, [sceneIndex]: data.image }));
    } catch (err) {
      setNormalizeError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegeneratingPoses((prev) => { const next = new Set(prev); next.delete(sceneIndex); return next; });
    }
  }

  function handleSSEEvent(event: SSEEvent) {
    setScenes((prev) => {
      const next = [...prev];
      if (event.type === 'scene-start') {
        const i = next.findIndex((s) => s.index === event.sceneIndex);
        if (i >= 0) next[i] = { ...next[i], status: 'submitting', progress: 0 };
      } else if (event.type === 'scene-progress') {
        const i = next.findIndex((s) => s.index === event.sceneIndex);
        if (i >= 0) next[i] = { ...next[i], status: 'generating', progress: event.pct };
      } else if (event.type === 'scene-done') {
        const i = next.findIndex((s) => s.index === event.sceneIndex);
        if (i >= 0) next[i] = { ...next[i], status: 'done', progress: 100, jobId: event.jobId, frampackUrl: event.frampackUrl, elapsedMs: event.elapsedMs };
      } else if (event.type === 'scene-error') {
        const i = next.findIndex((s) => s.index === event.sceneIndex);
        if (i >= 0) next[i] = { ...next[i], status: 'error', error: event.error };
      }
      return next;
    });
  }

  function handlePosedSSEEvent(sceneIndex: number, event: PosedSSEEvent) {
    setPosedScenes((prev) =>
      prev.map((ps) => {
        if (ps.sceneIndex !== sceneIndex) return ps;
        if (event.type === 'pose-generating') {
          return { ...ps, poseStatus: 'generating' };
        }
        if (event.type === 'pose-done') {
          return { ...ps, poseStatus: 'done', poseImageBase64: event.poseImageBase64 };
        }
        if (event.type === 'pose-error') {
          return { ...ps, poseStatus: 'error', poseError: event.error };
        }
        if (event.type === 'stage-start') {
          return {
            ...ps,
            stages: ps.stages.map((s) =>
              s.key === event.stage ? { ...s, status: 'submitting', progress: 0 } : s
            ),
          };
        }
        if (event.type === 'stage-progress') {
          return {
            ...ps,
            stages: ps.stages.map((s) =>
              s.key === event.stage ? { ...s, status: 'generating', progress: event.pct } : s
            ),
          };
        }
        if (event.type === 'stage-done') {
          return {
            ...ps,
            stages: ps.stages.map((s) =>
              s.key === event.stage
                ? { ...s, status: 'done', progress: 100, jobId: event.jobId, frampackUrl: event.frampackUrl }
                : s
            ),
          };
        }
        if (event.type === 'stage-error') {
          return {
            ...ps,
            stages: ps.stages.map((s) =>
              s.key === event.stage ? { ...s, status: 'error', error: event.error } : s
            ),
          };
        }
        return ps;
      })
    );
  }

  async function streamPosedScene(sceneIndex: number, imageBase64: string, baseSeed: number, stageOnly?: StageKey) {
    const poseImageBase64 = posedScenes.find(ps => ps.sceneIndex === sceneIndex)?.poseImageBase64
      ?? generatedPoses[sceneIndex]
      ?? null;
    const res = await fetch('/api/generate-posed-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64,
        portraitBase64: portrait,
        poseImageBase64,
        baseSeed,
        sceneIndex,
        ...(stageOnly ? { stageOnly } : {}),
      }),
    });

    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event: PosedSSEEvent;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }
        handlePosedSSEEvent(sceneIndex, event);
      }
    }
  }

  async function handleGenerateVideo() {
    if (!generated) return;

    const baseSeed = Math.floor(Math.random() * 1_000_000);
    const scenesToRun = sceneMode === 'all' ? ALL_SCENES : [ALL_SCENES[0]];

    const regularScenes = scenesToRun.filter((s) => !POSED_SCENE_INDICES.has(s.index));
    const posedSceneList = sceneMode === 'all'
      ? ALL_SCENES.filter((s) => POSED_SCENE_INDICES.has(s.index))
      : [];

    const initialScenes: SceneResult[] = regularScenes.map((s) => ({
      index: s.index,
      label: s.label,
      status: 'pending',
      progress: 0,
    }));
    setScenes(initialScenes);
    setPosedScenes(posedSceneList.map((s) => makePosedScene(s.index)));
    setGenerating(true);
    setStep(3);

    const promises: Promise<void>[] = [];

    // Stream regular scenes
    if (regularScenes.length > 0) {
      const p = (async () => {
        const res = await fetch('/api/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: generated,
            scenes: sceneMode,
            baseSeed,
          }),
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            let event: SSEEvent;
            try { event = JSON.parse(line.slice(6)); } catch { continue; }
            // Only handle events for regular scene indices
            if ('sceneIndex' in event && POSED_SCENE_INDICES.has((event as any).sceneIndex)) continue;
            handleSSEEvent(event);
          }
        }
      })();
      promises.push(p);
    }

    // Stream posed scenes in parallel
    for (const ps of posedSceneList) {
      const p = streamPosedScene(ps.index, generated, baseSeed).catch((err) => {
        setPosedScenes((prev) =>
          prev.map((r) =>
            r.sceneIndex === ps.index
              ? { ...r, poseStatus: 'error', poseError: String(err) }
              : r
          )
        );
      });
      promises.push(p);
    }

    await Promise.all(promises).catch(console.error);
    setGenerating(false);
  }

  async function handleRegenerateScene(sceneIndex: number) {
    if (!generated) return;
    const baseSeed = Math.floor(Math.random() * 1_000_000);

    if (POSED_SCENE_INDICES.has(sceneIndex)) {
      setPosedScenes((prev) =>
        prev.map((ps) =>
          ps.sceneIndex === sceneIndex ? makePosedScene(sceneIndex) : ps
        )
      );
      await streamPosedScene(sceneIndex, generated, baseSeed).catch((err) => {
        setPosedScenes((prev) =>
          prev.map((r) =>
            r.sceneIndex === sceneIndex
              ? { ...r, poseStatus: 'error', poseError: String(err) }
              : r
          )
        );
      });
      return;
    }

    setScenes((prev) =>
      prev.map((s) => s.index === sceneIndex ? { ...s, status: 'submitting', progress: 0 } : s)
    );

    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: generated, scenes: sceneMode, baseSeed, sceneIndex }),
      });
      if (!res.ok || !res.body) throw new Error('Failed to start regeneration');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: SSEEvent;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          handleSSEEvent(event);
        }
      }
    } catch (err) {
      setScenes((prev) =>
        prev.map((s) => s.index === sceneIndex ? { ...s, status: 'error', error: String(err) } : s)
      );
    }
  }

  async function handleRegenerateStage(sceneIndex: number, stageKey: StageKey) {
    if (!generated) return;
    const baseSeed = Math.floor(Math.random() * 1_000_000);

    setPosedScenes((prev) =>
      prev.map((ps) => {
        if (ps.sceneIndex !== sceneIndex) return ps;
        return {
          ...ps,
          mergedVideoUrl: undefined,
          mergeError: undefined,
          stages: ps.stages.map((s) =>
            s.key === stageKey ? { ...s, status: 'pending', progress: 0, jobId: undefined, frampackUrl: undefined } : s
          ),
        };
      })
    );

    await streamPosedScene(sceneIndex, generated, baseSeed, stageKey).catch((err) => {
      setPosedScenes((prev) =>
        prev.map((ps) =>
          ps.sceneIndex !== sceneIndex ? ps : {
            ...ps,
            stages: ps.stages.map((s) =>
              s.key === stageKey ? { ...s, status: 'error', error: String(err) } : s
            ),
          }
        )
      );
    });
  }

  async function handleRemergePosedScene(sceneIndex: number) {
    setPosedScenes((prev) =>
      prev.map((r) =>
        r.sceneIndex === sceneIndex ? { ...r, mergedVideoUrl: undefined, mergeError: undefined } : r
      )
    );
    await handleMergePosedScene(sceneIndex);
  }

  const handleMergePosedScene = useCallback(async (sceneIndex: number) => {
    const ps = posedScenes.find((r) => r.sceneIndex === sceneIndex);
    if (!ps) return;
    const ORDER = (sceneIndex === 3 ? ['into', 'hold'] : ['into', 'hold', 'out']) as StageKey[];
    const donestages = ORDER
      .map((key) => ps.stages.find((s) => s.key === key))
      .filter((s): s is NonNullable<typeof s> => !!s && s.status === 'done' && !!s.jobId && !!s.frampackUrl);
    if (donestages.length !== ORDER.length) return;

    setPosedScenes((prev) =>
      prev.map((r) => r.sceneIndex === sceneIndex ? { ...r, merging: true, mergeError: undefined } : r)
    );

    try {
      const form = new FormData();
      const totalDuration = donestages.reduce((acc, s) => {
        const scene = ALL_SCENES.find((sc) => sc.index === sceneIndex);
        if (!scene?.poseConfig) return acc;
        const dur = s.key === 'into' ? scene.poseConfig.stageInto.duration
          : s.key === 'hold' ? scene.poseConfig.stageHold.duration
          : scene.poseConfig.stageOut.duration;
        return acc + dur;
      }, 0);
      form.append('duration', String(totalDuration));
      form.append('concat', 'true');
      form.append(
        'sequence',
        JSON.stringify(
          donestages.map((s) => ({
            frampackUrl: s.frampackUrl!,
            jobId: s.jobId!,
            label: s.label,
            duration: (() => {
              const scene = ALL_SCENES.find((sc) => sc.index === sceneIndex);
              if (!scene?.poseConfig) return 2;
              return s.key === 'into' ? scene.poseConfig.stageInto.duration
                : s.key === 'hold' ? scene.poseConfig.stageHold.duration
                : scene.poseConfig.stageOut.duration;
            })(),
          }))
        )
      );

      const res = await fetch('/api/merge-video', { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPosedScenes((prev) =>
        prev.map((r) =>
          r.sceneIndex === sceneIndex ? { ...r, merging: false, mergedVideoUrl: url } : r
        )
      );
    } catch (err) {
      setPosedScenes((prev) =>
        prev.map((r) =>
          r.sceneIndex === sceneIndex
            ? { ...r, merging: false, mergeError: String(err) }
            : r
        )
      );
    }
  }, [posedScenes]);

  function reset() {
    setStep(1);
    setGenerated(null);
    setGeneratedPoses({});
    setNormalizeError(null);
    setScenes([]);
    setPosedScenes([]);
    setGenerating(false);
  }

  const canGenerate = !!portrait;
  const canMakeVideo = !!generated;

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-(--color-screen)">
      <header className="border-b border-(--color-border) bg-(--color-background) px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold text-(--color-foreground)">Avatar Creator</h1>
          {step > 1 && (
            <button onClick={reset} className="text-sm text-(--color-secondary) hover:text-(--color-foreground) transition-colors">
              ← Start over
            </button>
          )}
        </div>
      </header>

      <div className="border-b border-(--color-border) bg-(--color-background) px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`
                flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-all
                ${step === s.id ? 'bg-(--color-primary) text-white' : step > s.id ? 'bg-(--color-success) text-white' : 'bg-(--color-muted) text-(--color-secondary)'}
              `}>
                {step > s.id ? '✓' : s.id}
              </div>
              <span className={`text-sm ${step === s.id ? 'font-semibold text-(--color-foreground)' : 'text-(--color-secondary)'}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-(--color-border) mx-1" />}
            </div>
          ))}
        </div>
      </div>

      <main className="flex-1 px-6 py-8">
        <div className="max-w-2xl mx-auto flex flex-col gap-6">

          {/* STEP 1 */}
          {step === 1 && (
            <>
              <Section title="Portrait">
                <ImageUpload value={portrait} onChange={setPortrait} />
              </Section>
              {normalizeError && (
                <div className="px-4 py-3 rounded-xl border border-(--color-error) bg-red-50 text-sm text-(--color-error)">
                  {normalizeError}
                </div>
              )}
              <button
                onClick={handleNormalize}
                disabled={!canGenerate || normalizing}
                className="btn-neumorphic btn-primary w-full py-3 text-sm"
              >
                {normalizing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
                    Generating image...
                  </span>
                ) : 'Generate Image →'}
              </button>
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && portrait && generated && (
            <>
              <Section title="Generated Image">
                <GeneratedPreview
                  original={portrait}
                  generated={generated}
                  generatedPoses={generatedPoses}
                  onRegenerate={handleRegenerate}
                  onRegenerateAvatar={handleRegenerateAvatar}
                  onRegeneratePose={handleRegeneratePose}
                  onMakeVideo={handleGenerateVideo}
                  generating={normalizing}
                  regeneratingAvatar={regeneratingAvatar}
                  regeneratingPoses={regeneratingPoses}
                />
              </Section>
              {normalizeError && (
                <div className="px-4 py-3 rounded-xl border border-(--color-error) bg-red-50 text-sm text-(--color-error)">
                  {normalizeError}
                </div>
              )}
              <Section title="Video Settings">
                <div className="flex gap-2">
                  {([['quick', 'Quick test', '1 scene (no hands)'], ['all', 'Tất cả', '5 scenes']] as const).map(([key, label, sub]) => (
                    <button
                      key={key}
                      onClick={() => setSceneMode(key)}
                      className={`flex-1 p-3 rounded-xl border text-left transition-all ${sceneMode === key ? 'border-(--color-primary) bg-(--color-primary-light)' : 'border-(--color-border) hover:border-(--color-primary)'}`}
                    >
                      <div className="text-sm font-medium text-(--color-foreground)">{label}</div>
                      <div className="text-[11px] text-(--color-secondary) mt-0.5">{sub}</div>
                    </button>
                  ))}
                </div>
              </Section>
              <button
                onClick={handleGenerateVideo}
                disabled={!canMakeVideo}
                className="btn-neumorphic btn-primary w-full py-3 text-sm"
              >
                Generate Video →
              </button>
            </>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <>
              {/* Regular scenes */}
              {scenes.length > 0 && (
                <Section title="Generating Scenes">
                  <VideoProgress scenes={scenes} />
                </Section>
              )}

              {scenes.some((s) => s.status === 'done') && (
                <Section title="Results">
                  <VideoResult scenes={scenes} onRegenerate={handleRegenerateScene} />
                </Section>
              )}

              {/* Posed scenes (1 tay + Chỉ lên trời) */}
              {posedScenes.map((ps) => (
                <PosedSceneCard
                  key={ps.sceneIndex}
                  result={ps}
                  onMerge={handleMergePosedScene}
                  onRegenerate={handleRegenerateScene}
                  onRemerge={handleRemergePosedScene}
                  onRegenerateStage={handleRegenerateStage}
                />
              ))}

              {/* Merge for lipsync */}
              {(scenes.some((s) => s.status === 'done') || posedScenes.some((ps) => ps.mergedVideoUrl)) && (
                <Section title="Merge for Lipsync">
                  <VideoMerge scenes={scenes} posedScenes={posedScenes} />
                </Section>
              )}

              {!generating && (scenes.length > 0 || posedScenes.length > 0) && (
                <button onClick={reset} className="btn-neumorphic w-full py-3 text-sm">
                  ← Create another
                </button>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="block-section">
      <div className="block-header">
        <span className="block-title">{title}</span>
        <div className="block-divider" />
      </div>
      <div className="block-content">{children}</div>
    </div>
  );
}
