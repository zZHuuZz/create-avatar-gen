'use client';

import { useState } from 'react';
import { ALL_SCENES } from '@/lib/scene-config';

interface Props {
  original: string;
  generated: string;
  generatedPoses?: Record<number, string>;
  onRegenerate: () => void;
  onMakeVideo: () => void;
  generating: boolean;
}

function LightboxImage({ src, alt, label, badge }: { src: string; alt: string; label: string; badge?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-(--color-secondary) uppercase tracking-wide">{label}</span>
      <div className="relative cursor-zoom-in" onClick={() => setOpen(true)}>
        <img
          src={src}
          alt={alt}
          className="w-full rounded-xl border border-(--color-border) object-contain bg-black/5 max-h-60"
        />
        {badge && (
          <div className="absolute top-2 right-2 badge">{badge}</div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <span className="bg-black/50 text-white text-xs px-2 py-1 rounded-lg">Full screen</span>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={alt}
            className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 text-white text-lg flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export function GeneratedPreview({ original, generated, generatedPoses, onRegenerate, onMakeVideo, generating }: Props) {
  const poseEntries = generatedPoses
    ? ALL_SCENES.filter((s) => s.poseConfig && generatedPoses[s.index])
        .map((s) => ({ index: s.index, label: s.label, img: generatedPoses[s.index] }))
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <LightboxImage src={original} alt="Original portrait" label="Original" />
        <LightboxImage src={generated} alt="Generated avatar" label="Generated" badge="✓ AI" />
      </div>

      {poseEntries.length > 0 && (
        <div className={`grid gap-3 ${poseEntries.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {poseEntries.map(({ index, label, img }) => (
            <LightboxImage key={index} src={img} alt={label} label={label} badge="✓ Pose" />
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onRegenerate}
          disabled={generating}
          className="btn-neumorphic flex-1 text-sm"
        >
          {generating ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-(--color-secondary) border-t-transparent rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
              Regenerating...
            </span>
          ) : (
            '↺ Regenerate'
          )}
        </button>
        <button
          onClick={onMakeVideo}
          disabled={generating}
          className="btn-neumorphic btn-primary flex-1 text-sm"
        >
          Make Video →
        </button>
      </div>
    </div>
  );
}
