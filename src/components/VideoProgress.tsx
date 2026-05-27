'use client';

import type { SceneResult, SceneStatus } from '@/types/pipeline';

interface Props {
  scenes: SceneResult[];
}

const STATUS_BADGE: Record<SceneStatus, { label: string; color: string }> = {
  pending:    { label: 'Pending',     color: 'text-(--color-secondary) bg-(--color-muted)' },
  submitting: { label: 'Submitting',  color: 'text-blue-600 bg-blue-50' },
  generating: { label: 'Generating',  color: 'text-(--color-primary) bg-(--color-primary-light)' },
  done:       { label: 'Done',        color: 'text-(--color-success) bg-emerald-50' },
  error:      { label: 'Error',       color: 'text-(--color-error) bg-red-50' },
};

export function VideoProgress({ scenes }: Props) {
  const done = scenes.filter((s) => s.status === 'done').length;
  const total = scenes.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-(--color-secondary)">
          {done}/{total} scenes complete
        </span>
        <span className="text-sm font-medium text-(--color-foreground)">
          {total > 0 ? Math.round((done / total) * 100) : 0}%
        </span>
      </div>

      <div className="w-full h-1.5 bg-(--color-muted) rounded-full overflow-hidden">
        <div
          className="h-full bg-(--color-primary) rounded-full transition-all duration-500"
          style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
        />
      </div>

      <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
        {scenes.map((scene) => {
          const badge = STATUS_BADGE[scene.status];
          return (
            <div
              key={scene.index}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border border-(--color-border) bg-(--color-card)"
            >
              <span className="text-xs text-(--color-secondary) w-5 text-right shrink-0">
                {scene.index + 1}
              </span>
              <span className="text-sm text-(--color-foreground) flex-1 truncate">
                {scene.label}
              </span>

              {scene.status === 'generating' && (
                <div className="w-20 h-1.5 bg-(--color-muted) rounded-full overflow-hidden shrink-0">
                  <div
                    className="h-full bg-(--color-primary) rounded-full transition-all duration-300"
                    style={{ width: `${scene.progress}%` }}
                  />
                </div>
              )}

              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${badge.color}`}>
                {scene.status === 'generating' ? `${scene.progress}%` : badge.label}
              </span>

              {scene.status === 'error' && scene.error && (
                <span className="text-[11px] text-(--color-error) truncate max-w-32" title={scene.error}>
                  {scene.error}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
