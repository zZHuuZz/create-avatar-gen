'use client';

import { useState, useRef } from 'react';

const STEPS = [
  { key: 'avatar',  label: 'Avatar (reference.jpg)',         color: 'bg-purple-50 border-purple-200' },
  { key: 'pose-1',  label: '1 Tay (reference-onehand.jpg)',  color: 'bg-blue-50 border-blue-200' },
  { key: 'pose-3',  label: 'Chỉ lên trời (reference-pointup.jpg)', color: 'bg-yellow-50 border-yellow-200' },
] as const;

type Step = (typeof STEPS)[number]['key'];

export default function DevImagePage() {
  const [portrait, setPortrait] = useState<string | null>(null);
  const [results, setResults] = useState<Partial<Record<Step, string>>>({});
  const [loading, setLoading] = useState<Partial<Record<Step, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<Step, string>>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => setPortrait(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function runStep(step: Step) {
    if (!portrait) return;
    setLoading((p) => ({ ...p, [step]: true }));
    setErrors((p) => ({ ...p, [step]: undefined }));
    try {
      const res = await fetch('/api/dev-image-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: portrait, step }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setResults((p) => ({ ...p, [step]: data.image }));
    } catch (err) {
      setErrors((p) => ({ ...p, [step]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setLoading((p) => ({ ...p, [step]: false }));
    }
  }

  async function runAll() {
    if (!portrait) return;
    for (const { key } of STEPS) {
      await runStep(key);
    }
  }

  return (
    <div className="min-h-screen bg-(--color-screen) px-6 py-8">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-lg font-bold text-(--color-foreground)">Dev — Image Gen Test</h1>
          <p className="text-xs text-(--color-secondary) mt-1">Test each Gemini image generation step independently.</p>
        </div>

        {/* Portrait upload */}
        <div
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-4 px-4 py-3 rounded-xl border border-(--color-border) hover:border-(--color-primary) cursor-pointer transition-all"
        >
          {portrait ? (
            <img src={portrait} className="w-16 h-20 object-cover rounded-lg" />
          ) : (
            <div className="w-16 h-20 rounded-lg bg-(--color-muted) flex items-center justify-center text-2xl">📷</div>
          )}
          <span className="text-sm text-(--color-secondary)">{portrait ? 'Click to change portrait' : 'Click to upload portrait'}</span>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

        {portrait && (
          <button onClick={runAll} className="btn-neumorphic btn-primary w-full py-2.5 text-sm">
            ▶ Run all 3 steps
          </button>
        )}

        {/* Results grid */}
        <div className="grid grid-cols-1 gap-4">
          {STEPS.map(({ key, label, color }) => (
            <div key={key} className={`rounded-xl border p-4 flex flex-col gap-3 ${color}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{label}</span>
                <button
                  onClick={() => runStep(key)}
                  disabled={!portrait || !!loading[key]}
                  className="btn-neumorphic text-xs px-3 py-1.5 disabled:opacity-40"
                >
                  {loading[key] ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-(--color-secondary) border-t-transparent rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
                      Generating...
                    </span>
                  ) : '▶ Run'}
                </button>
              </div>

              {errors[key] && (
                <div className="text-xs text-(--color-error) bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                  {errors[key]}
                </div>
              )}

              {results[key] ? (
                <img src={results[key]} className="w-full rounded-lg object-contain max-h-80 bg-black/5" />
              ) : (
                <div className="h-32 rounded-lg bg-white/40 flex items-center justify-center text-xs text-(--color-secondary)">
                  {loading[key] ? 'Generating...' : 'Not generated yet'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
