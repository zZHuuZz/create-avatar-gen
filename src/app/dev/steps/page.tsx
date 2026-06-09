'use client';

import { useState, useRef } from 'react';
import { ALL_SCENES } from '@/lib/scene-config';

const STEP_COUNTS = [12, 15, 20] as const;

type StepStatus = 'pending' | 'submitting' | 'generating' | 'done' | 'error';

interface StepResult {
  steps: number;
  status: StepStatus;
  progress: number;
  jobId?: string;
  frampackUrl?: string;
  elapsedMs?: number;
  error?: string;
}

function makeInitial(): StepResult[] {
  return STEP_COUNTS.map((steps) => ({ steps, status: 'pending', progress: 0 }));
}

function formatElapsed(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

const STATUS_LABEL: Record<StepStatus, string> = {
  pending: 'Pending',
  submitting: 'Submitting',
  generating: 'Generating',
  done: 'Done',
  error: 'Error',
};

export default function DevStepTestPage() {
  const [image, setImage] = useState<string | null>(null);
  const [sceneIndex, setSceneIndex] = useState(1);
  const [results, setResults] = useState<StepResult[]>(makeInitial());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => setImage(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function run() {
    if (!image) return;
    setRunning(true);
    setError(null);
    setResults(makeInitial());

    try {
      const res = await fetch('/api/dev-step-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: image, sceneIndex }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Error ${res.status}`);
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
          let event: Record<string, unknown>;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'error') {
            setError(String(event.message));
            continue;
          }

          const steps = Number(event.steps);
          setResults((prev) => {
            const i = prev.findIndex((r) => r.steps === steps);
            if (i < 0) return prev;
            const next = [...prev];
            if (event.type === 'step-start') {
              next[i] = { ...next[i], status: 'submitting', progress: 0, error: undefined };
            } else if (event.type === 'step-progress') {
              next[i] = { ...next[i], status: 'generating', progress: Number(event.pct ?? 0) };
            } else if (event.type === 'step-done') {
              next[i] = {
                ...next[i],
                status: 'done',
                progress: 100,
                jobId: String(event.jobId),
                frampackUrl: String(event.frampackUrl),
                elapsedMs: Number(event.elapsedMs),
              };
            } else if (event.type === 'step-error') {
              next[i] = { ...next[i], status: 'error', error: String(event.error) };
            }
            return next;
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const scene = ALL_SCENES.find((s) => s.index === sceneIndex) ?? ALL_SCENES[0];

  return (
    <div className="min-h-screen bg-(--color-screen) px-6 py-8">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-lg font-bold text-(--color-foreground)">Dev — Step Count Test</h1>
          <p className="text-xs text-(--color-secondary) mt-1">
            Generates the same prompt + image + seed at 12 → 15 → 20 steps, back to back, so quality
            and generation time can be compared side by side.
          </p>
        </div>

        {/* Avatar image upload */}
        <div
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-4 px-4 py-3 rounded-xl border border-(--color-border) hover:border-(--color-primary) cursor-pointer transition-all"
        >
          {image ? (
            <img src={image} className="w-16 h-20 object-cover rounded-lg" />
          ) : (
            <div className="w-16 h-20 rounded-lg bg-(--color-muted) flex items-center justify-center text-2xl">📷</div>
          )}
          <span className="text-sm text-(--color-secondary)">
            {image ? 'Click to change avatar image' : 'Click to upload avatar image'}
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {/* Scene / prompt picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-(--color-secondary)">Prompt to test (used unchanged across all 3 runs)</label>
          <select
            value={sceneIndex}
            onChange={(e) => setSceneIndex(Number(e.target.value))}
            disabled={running}
            className="px-3 py-2 rounded-lg border border-(--color-border) bg-(--color-card) text-sm disabled:opacity-50"
          >
            {ALL_SCENES.map((s) => (
              <option key={s.index} value={s.index}>{s.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-(--color-secondary) line-clamp-3">{scene.prompt}</p>
        </div>

        <button
          onClick={run}
          disabled={!image || running}
          className="btn-neumorphic btn-primary w-full py-2.5 text-sm disabled:opacity-40"
        >
          {running ? (
            <span className="flex items-center justify-center gap-1.5">
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
              Running test...
            </span>
          ) : '▶ Run 12 → 15 → 20 step test'}
        </button>

        {error && (
          <div className="text-xs text-(--color-error) bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</div>
        )}

        {/* Per-step results */}
        <div className="grid grid-cols-1 gap-4">
          {results.map((r) => (
            <div key={r.steps} className="rounded-xl border border-(--color-border) bg-(--color-card) p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-(--color-foreground)">{r.steps} steps</span>
                <div className="flex items-center gap-2">
                  {r.status === 'generating' && (
                    <div className="w-24 h-1.5 bg-(--color-muted) rounded-full overflow-hidden">
                      <div
                        className="h-full bg-(--color-primary) rounded-full transition-all duration-300"
                        style={{ width: `${r.progress}%` }}
                      />
                    </div>
                  )}
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-(--color-muted) text-(--color-secondary)">
                    {r.status === 'generating' ? `${r.progress}%` : STATUS_LABEL[r.status]}
                  </span>
                  {r.status === 'done' && r.elapsedMs != null && (
                    <span className="text-[11px] font-semibold text-(--color-success)">
                      {formatElapsed(r.elapsedMs)}
                    </span>
                  )}
                </div>
              </div>

              {r.error && (
                <div className="text-xs text-(--color-error) bg-red-50 px-3 py-2 rounded-lg border border-red-200">{r.error}</div>
              )}

              {r.status === 'done' && r.jobId && r.frampackUrl ? (
                <video
                  src={`/api/video?url=${encodeURIComponent(r.frampackUrl)}&jobId=${encodeURIComponent(r.jobId)}`}
                  controls
                  loop
                  className="w-full rounded-lg max-h-72 bg-black"
                />
              ) : (
                <div className="h-32 rounded-lg bg-(--color-muted)/40 flex items-center justify-center text-xs text-(--color-secondary)">
                  {r.status === 'pending' ? 'Not generated yet' : r.status === 'error' ? 'Failed' : 'Generating…'}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Timing comparison */}
        {results.some((r) => r.status === 'done') && (
          <div className="rounded-xl border border-(--color-border) bg-(--color-card) p-4">
            <h2 className="text-sm font-semibold text-(--color-foreground) mb-2">Timing comparison</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-(--color-secondary) text-left">
                  <th className="py-1 font-medium">Steps</th>
                  <th className="py-1 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.steps} className="border-t border-(--color-border)">
                    <td className="py-1.5 text-(--color-foreground)">{r.steps}</td>
                    <td className="py-1.5 text-(--color-foreground)">
                      {r.elapsedMs != null ? formatElapsed(r.elapsedMs) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
