'use client';

import { useState } from 'react';
import { ALL_SCENES } from '@/lib/scene-config';

interface Props {
  original: string;
  generated: string;
  generatedPoses?: Record<number, string>;
  onRegenerate: () => void;
  onRegenerateAvatar: () => void;
  onRegeneratePose: (sceneIndex: number) => void;
  onMakeVideo: () => void;
  generating: boolean;
  regeneratingAvatar: boolean;
  regeneratingPoses: Set<number>;
}

function Spinner() {
  return (
    <span
      className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full shrink-0"
      style={{ animation: 'spin 0.8s linear infinite' }}
    />
  );
}

function LightboxImage({
  src, alt, label, badge, onRegenerate, regenerating,
}: {
  src: string;
  alt: string;
  label: string;
  badge?: string;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-(--color-secondary) uppercase tracking-wide">{label}</span>
      <div className="relative group">
        <div className="cursor-zoom-in" onClick={() => !regenerating && setOpen(true)}>
          <img
            src={src}
            alt={alt}
            className={`w-full rounded-xl border border-(--color-border) object-contain bg-black/5 max-h-60 transition-opacity ${regenerating ? 'opacity-40' : ''}`}
          />
          {badge && !regenerating && (
            <div className="absolute top-2 right-2 badge">{badge}</div>
          )}
          {!regenerating && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
              <span className="bg-black/50 text-white text-xs px-2 py-1 rounded-lg">Full screen</span>
            </div>
          )}
        </div>

        {/* Per-image regenerate button */}
        {onRegenerate && (
          <button
            onClick={(e) => { e.stopPropagation(); onRegenerate(); }}
            disabled={regenerating}
            className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-xs font-medium backdrop-blur-sm hover:bg-black/80 transition-colors disabled:opacity-60"
            title="Regenerate this image"
          >
            {regenerating ? <><Spinner /> Generating…</> : '↺ Redo'}
          </button>
        )}

        {/* Full-screen spinner overlay */}
        {regenerating && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl">
            <span className="w-7 h-7 border-[3px] border-white/30 border-t-white rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}
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

export function GeneratedPreview({
  original, generated, generatedPoses,
  onRegenerate, onRegenerateAvatar, onRegeneratePose,
  onMakeVideo, generating, regeneratingAvatar, regeneratingPoses,
}: Props) {
  const poseEntries = generatedPoses
    ? ALL_SCENES.filter((s) => s.poseConfig && generatedPoses[s.index])
        .map((s) => ({ index: s.index, label: s.label, img: generatedPoses[s.index] }))
    : [];

  const anyRegenerating = generating || regeneratingAvatar || regeneratingPoses.size > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <LightboxImage src={original} alt="Original portrait" label="Original" />
        <LightboxImage
          src={generated}
          alt="Generated avatar"
          label="Generated"
          badge="✓ AI"
          onRegenerate={onRegenerateAvatar}
          regenerating={regeneratingAvatar}
        />
      </div>

      {poseEntries.length > 0 && (
        <div className={`grid gap-3 ${poseEntries.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {poseEntries.map(({ index, label, img }) => (
            <LightboxImage
              key={index}
              src={img}
              alt={label}
              label={label}
              badge="✓ Pose"
              onRegenerate={() => onRegeneratePose(index)}
              regenerating={regeneratingPoses.has(index)}
            />
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onRegenerate}
          disabled={anyRegenerating}
          className="btn-neumorphic flex-1 text-sm"
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner />
              Regenerating all…
            </span>
          ) : (
            '↺ Regenerate all'
          )}
        </button>
        <button
          onClick={onMakeVideo}
          disabled={anyRegenerating}
          className="btn-neumorphic btn-primary flex-1 text-sm"
        >
          Make Video →
        </button>
      </div>
    </div>
  );
}
