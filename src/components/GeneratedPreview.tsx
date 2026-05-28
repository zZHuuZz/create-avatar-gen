'use client';

import { useState } from 'react';

interface Props {
  original: string;
  generated: string;
  onRegenerate: () => void;
  onMakeVideo: () => void;
  generating: boolean;
}

function LightboxImage({ src, alt, className, style }: { src: string; alt: string; className?: string; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`${className} cursor-zoom-in`}
        style={style}
        onClick={() => setOpen(true)}
      />
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
    </>
  );
}

export function GeneratedPreview({ original, generated, onRegenerate, onMakeVideo, generating }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-(--color-secondary) uppercase tracking-wide">Original</span>
          <LightboxImage
            src={original}
            alt="Original portrait"
            className="w-full rounded-xl border border-(--color-border) object-contain bg-black/5 max-h-72"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-(--color-secondary) uppercase tracking-wide">Generated</span>
          <div className="relative">
            <LightboxImage
              src={generated}
              alt="Generated portrait"
              className="w-full rounded-xl border border-(--color-primary) object-contain bg-black/5 max-h-72"
            />
            <div className="absolute top-2 right-2 badge">
              ✓ AI
            </div>
          </div>
        </div>
      </div>

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
