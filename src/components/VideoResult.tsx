'use client';

import type { SceneResult } from '@/types/pipeline';

interface Props {
  scenes: SceneResult[];
}

export function VideoResult({ scenes }: Props) {
  const doneScenes = scenes.filter((s) => s.status === 'done' && s.jobId && s.frampackUrl);

  if (doneScenes.length === 0) return null;

  function videoUrl(scene: SceneResult) {
    return `/api/video?url=${encodeURIComponent(scene.frampackUrl!)}&jobId=${encodeURIComponent(scene.jobId!)}`;
  }

  function downloadScene(scene: SceneResult) {
    const a = document.createElement('a');
    a.href = videoUrl(scene);
    a.download = `${scene.label.replace(/\s+/g, '-').toLowerCase()}.mp4`;
    a.click();
  }

  function downloadAll() {
    doneScenes.forEach((s, i) => {
      setTimeout(() => downloadScene(s), i * 300);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-(--color-foreground)">
          {doneScenes.length} scene{doneScenes.length !== 1 ? 's' : ''} ready
        </h3>
        {doneScenes.length > 1 && (
          <button onClick={downloadAll} className="btn-neumorphic text-xs py-1.5 px-3">
            ↓ Download All
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {doneScenes.map((scene) => (
          <div key={scene.index} className="card p-3 flex flex-col gap-2">
            <video
              src={videoUrl(scene)}
              controls
              loop
              className="w-full rounded-lg bg-black"
              style={{ maxHeight: '200px' }}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-(--color-secondary) truncate">{scene.label}</span>
              <button
                onClick={() => downloadScene(scene)}
                className="btn-neumorphic text-xs py-1 px-2.5 shrink-0"
              >
                ↓ MP4
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
