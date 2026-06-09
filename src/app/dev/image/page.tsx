'use client';

import { useState, useRef } from 'react';

export default function DevImagePage() {
  const [portrait, setPortrait] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      setPortrait(e.target?.result as string);
      setResult(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  async function generate() {
    if (!portrait) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dev-image-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: portrait }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setResult(data.image);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-(--color-screen) px-6 py-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-lg font-bold text-(--color-foreground)">Dev — Avatar Gen Test</h1>
          <p className="text-xs text-(--color-secondary) mt-1">
            Test the avatar generation step (normalizePose against reference.jpg) on its own.
          </p>
        </div>

        {/* Portrait upload */}
        <div
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-4 px-4 py-3 rounded-xl border border-(--color-border) hover:border-(--color-primary) cursor-pointer transition-all"
        >
          {portrait ? (
            <img src={portrait} alt="" className="w-16 h-20 object-cover rounded-lg" />
          ) : (
            <div className="w-16 h-20 rounded-lg bg-(--color-muted) flex items-center justify-center text-2xl">📷</div>
          )}
          <span className="text-sm text-(--color-secondary)">
            {portrait ? 'Click to change portrait' : 'Click to upload portrait'}
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {portrait && (
          <button
            onClick={generate}
            disabled={loading}
            className="btn-neumorphic btn-primary w-full py-2.5 text-sm disabled:opacity-40"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
                Generating...
              </span>
            ) : '▶ Generate avatar'}
          </button>
        )}

        {error && (
          <div className="text-xs text-(--color-error) bg-red-50 px-3 py-2 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-(--color-border) bg-(--color-card) p-4 flex flex-col gap-3">
          <span className="text-sm font-semibold text-(--color-foreground)">Avatar (reference.jpg)</span>
          {result ? (
            <img src={result} alt="" className="w-full rounded-lg object-contain max-h-96 bg-black/5" />
          ) : (
            <div className="h-48 rounded-lg bg-(--color-muted)/40 flex items-center justify-center text-xs text-(--color-secondary)">
              {loading ? 'Generating...' : 'Not generated yet'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
