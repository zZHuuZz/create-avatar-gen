'use client';

interface Props {
  original: string;
  generated: string;
  onRegenerate: () => void;
  onMakeVideo: () => void;
  generating: boolean;
}

export function GeneratedPreview({ original, generated, onRegenerate, onMakeVideo, generating }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-(--color-secondary) uppercase tracking-wide">Original</span>
          <img
            src={original}
            alt="Original portrait"
            className="w-full rounded-xl border border-(--color-border) object-cover max-h-72"
            style={{ objectPosition: 'top' }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-(--color-secondary) uppercase tracking-wide">Generated</span>
          <div className="relative">
            <img
              src={generated}
              alt="Generated portrait"
              className="w-full rounded-xl border border-(--color-primary) object-cover max-h-72"
              style={{ objectPosition: 'top' }}
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
