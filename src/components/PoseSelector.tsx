'use client';

import type { PoseKey } from '@/types/pipeline';
import { ImageUpload } from './ImageUpload';

const POSES = [
  {
    key: 'hands-clasped' as PoseKey,
    label: 'Hands Clasped',
    emoji: '🤲',
    desc: 'Hands together at waist',
  },
  {
    key: 'arms-at-sides' as PoseKey,
    label: 'Arms at Sides',
    emoji: '🧍',
    desc: 'Relaxed natural stance',
  },
  {
    key: 'arms-crossed' as PoseKey,
    label: 'Arms Crossed',
    emoji: '💪',
    desc: 'Confident crossed arms',
  },
  {
    key: 'custom' as PoseKey,
    label: 'Custom Reference',
    emoji: '📷',
    desc: 'Upload your own pose photo',
  },
];

interface Props {
  value: PoseKey;
  customReferenceBase64: string | null;
  onChange: (key: PoseKey) => void;
  onCustomReference: (base64: string) => void;
}

export function PoseSelector({ value, customReferenceBase64, onChange, onCustomReference }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {POSES.map((pose) => (
          <button
            key={pose.key}
            onClick={() => onChange(pose.key)}
            className={`
              flex flex-col items-center gap-2 p-3 rounded-xl border transition-all text-center
              ${value === pose.key
                ? 'border-(--color-primary) bg-(--color-primary-light) text-(--color-primary)'
                : 'border-(--color-border) hover:border-(--color-primary) hover:bg-(--color-muted) text-(--color-secondary)'}
            `}
          >
            <span className="text-2xl">{pose.emoji}</span>
            <span className="text-xs font-medium leading-tight text-(--color-foreground)">{pose.label}</span>
            <span className="text-[11px] text-(--color-secondary) leading-tight">{pose.desc}</span>
          </button>
        ))}
      </div>

      {value === 'custom' && (
        <div className="mt-1">
          <p className="text-xs text-(--color-secondary) mb-2">Upload a reference photo showing the target pose:</p>
          <ImageUpload
            value={customReferenceBase64}
            onChange={onCustomReference}
            label="Reference Pose"
            compact
          />
        </div>
      )}
    </div>
  );
}
