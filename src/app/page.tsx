'use client';

import { useState } from 'react';
import { ImageUpload } from '@/components/ImageUpload';
import { PoseSelector } from '@/components/PoseSelector';
import { GeneratedPreview } from '@/components/GeneratedPreview';
import { VideoProgress } from '@/components/VideoProgress';
import { VideoResult } from '@/components/VideoResult';
import { ALL_SCENES, QUICK_SCENE } from '@/lib/scene-config';
import type { AppStep, PoseKey, SceneResult, SSEEvent } from '@/types/pipeline';

const STEPS = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Generate' },
  { id: 3, label: 'Video' },
];

export default function Home() {
  const [step, setStep] = useState<AppStep>(1);

  // Step 1 state
  const [portrait, setPortrait] = useState<string | null>(null);
  const [pose, setPose] = useState<PoseKey>('hands-clasped');
  const [customRef, setCustomRef] = useState<string | null>(null);

  // Step 2 state
  const [generated, setGenerated] = useState<string | null>(null);
  const [normalizing, setNormalizing] = useState(false);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);
  const [sceneMode, setSceneMode] = useState<'quick' | 'all'>('quick');

  // Step 3 state
  const [scenes, setScenes] = useState<SceneResult[]>([]);
  const [generating, setGenerating] = useState(false);

  async function handleNormalize() {
    if (!portrait) return;
    setNormalizing(true);
    setNormalizeError(null);

    try {
      const res = await fetch('/api/normalize-pose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: portrait,
          poseKey: pose,
          customReferenceBase64: customRef ?? undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate image');

      setGenerated(data.generated);
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
        body: JSON.stringify({
          imageBase64: portrait,
          poseKey: pose,
          customReferenceBase64: customRef ?? undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate image');
      setGenerated(data.generated);
    } catch (err) {
      setNormalizeError(err instanceof Error ? err.message : String(err));
    } finally {
      setNormalizing(false);
    }
  }

  async function handleGenerateVideo() {
    if (!generated) return;

    const scenesToRun = sceneMode === 'all' ? ALL_SCENES : [QUICK_SCENE];
    const initialScenes: SceneResult[] = scenesToRun.map((s) => ({
      index: s.index,
      label: s.label,
      status: 'pending',
      progress: 0,
    }));
    setScenes(initialScenes);
    setGenerating(true);
    setStep(3);

    const baseSeed = Math.floor(Math.random() * 1_000_000);

    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: generated,
          scenes: sceneMode,
          baseSeed,
        }),
      });

      if (!res.ok || !res.body) throw new Error('Failed to start generation');

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
      console.error('Generate video error:', err);
    } finally {
      setGenerating(false);
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
        if (i >= 0) next[i] = { ...next[i], status: 'done', progress: 100, jobId: event.jobId, frampackUrl: event.frampackUrl };
      } else if (event.type === 'scene-error') {
        const i = next.findIndex((s) => s.index === event.sceneIndex);
        if (i >= 0) next[i] = { ...next[i], status: 'error', error: event.error };
      }

      return next;
    });
  }

  function reset() {
    setStep(1);
    setGenerated(null);
    setNormalizeError(null);
    setScenes([]);
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

      {/* Step indicator */}
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

          {/* ── STEP 1: Input ── */}
          {step === 1 && (
            <>
              <Section title="Portrait">
                <ImageUpload value={portrait} onChange={setPortrait} />
              </Section>

              <Section title="Target Pose">
                <PoseSelector
                  value={pose}
                  customReferenceBase64={customRef}
                  onChange={setPose}
                  onCustomReference={setCustomRef}
                />
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
                ) : (
                  'Generate Image →'
                )}
              </button>
            </>
          )}

          {/* ── STEP 2: Preview ── */}
          {step === 2 && portrait && generated && (
            <>
              <Section title="Generated Image">
                <GeneratedPreview
                  original={portrait}
                  generated={generated}
                  onRegenerate={handleRegenerate}
                  onMakeVideo={handleGenerateVideo}
                  generating={normalizing}
                />
              </Section>

              {normalizeError && (
                <div className="px-4 py-3 rounded-xl border border-(--color-error) bg-red-50 text-sm text-(--color-error)">
                  {normalizeError}
                </div>
              )}

              <Section title="Video Settings">
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs font-medium text-(--color-secondary) block mb-2">Scenes</label>
                    <div className="flex gap-2">
                      {([['quick', 'Quick test', '1 scene (no hands)'], ['all', 'Tất cả', '4 scenes']] as const).map(([key, label, sub]) => (
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
                  </div>
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

          {/* ── STEP 3: Video ── */}
          {step === 3 && (
            <>
              <Section title="Generating Scenes">
                <VideoProgress scenes={scenes} />
              </Section>

              {scenes.some((s) => s.status === 'done') && (
                <Section title="Results">
                  <VideoResult scenes={scenes} />
                </Section>
              )}

              {!generating && scenes.length > 0 && (
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
