'use client';

import { useEffect, useRef } from 'react';
import type { PosedSceneResult, StageKey } from '@/types/pipeline';

interface Props {
  result: PosedSceneResult;
  onMerge: (sceneIndex: number) => void;
  onRegenerate: (sceneIndex: number) => void;
  onRemerge: (sceneIndex: number) => void;
  onRegenerateStage: (sceneIndex: number, stageKey: StageKey) => void;
}

const STAGE_LABELS: Record<StageKey, string> = {
  into: 'A · Vào tư thế',
  hold: 'B · Giữ',
  out:  'C · Ra tư thế',
};

export function PosedSceneCard({ result, onMerge, onRegenerate, onRemerge, onRegenerateStage }: Props) {
  const mergeTriggered = useRef(false);

  const activeStages = (result.sceneIndex === 3 ? ['into', 'hold'] : ['into', 'hold', 'out']) as StageKey[];
  const allStagesDone = activeStages.every((k) => result.stages.find((s) => s.key === k)?.status === 'done');

  // Reset the guard whenever stages are no longer all done (retry resets stages to pending)
  useEffect(() => {
    if (!allStagesDone) mergeTriggered.current = false;
  }, [allStagesDone]);

  // Auto-trigger merge once all active stages are done
  useEffect(() => {
    if (allStagesDone && !mergeTriggered.current && !result.merging && !result.mergedVideoUrl) {
      mergeTriggered.current = true;
      onMerge(result.sceneIndex);
    }
  }, [allStagesDone, result.merging, result.mergedVideoUrl, result.sceneIndex, onMerge]);

  function videoUrl(jobId: string, frampackUrl: string) {
    return `/api/video?url=${encodeURIComponent(frampackUrl)}&jobId=${encodeURIComponent(jobId)}`;
  }

  function downloadMerged() {
    if (!result.mergedVideoUrl) return;
    const a = document.createElement('a');
    a.href = result.mergedVideoUrl;
    a.download = `${result.label.replace(/\s+/g, '-').toLowerCase()}.mp4`;
    a.click();
  }

  return (
    <div className="block-section">
      <div className="block-header">
        <span className="block-title">{result.label}</span>
        <div className="block-divider" />
        <button
          onClick={() => onRegenerate(result.sceneIndex)}
          className="btn-neumorphic text-xs py-1 px-2.5 shrink-0"
          title="Regenerate this pose"
        >
          ↺ Thử lại
        </button>
      </div>
      <div className="block-content flex flex-col gap-4">

        {/* Row: pose image + stages */}
        <div className="flex gap-3">

          {/* Pose image */}
          <div className="flex flex-col gap-1.5 w-28 shrink-0">
            <span className="text-[11px] font-medium text-(--color-secondary)">Pose image</span>
            <div className="w-28 h-36 rounded-xl border border-(--color-border) bg-(--color-muted) overflow-hidden flex items-center justify-center">
              {result.poseStatus === 'generating' && (
                <span className="flex flex-col items-center gap-1.5">
                  <span className="w-5 h-5 border-2 border-(--color-primary) border-t-transparent rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
                  <span className="text-[10px] text-(--color-secondary)">GPT...</span>
                </span>
              )}
              {result.poseStatus === 'error' && (
                <span className="text-[10px] text-(--color-error) text-center px-2">{result.poseError}</span>
              )}
              {result.poseStatus === 'done' && result.poseImageBase64 && (
                <img src={result.poseImageBase64} alt="target pose" className="w-full h-full object-cover" />
              )}
              {result.poseStatus === 'pending' && (
                <span className="text-[10px] text-(--color-secondary)">Chờ...</span>
              )}
            </div>
          </div>

          {/* Stages */}
          <div className="flex-1 flex flex-col gap-2 justify-center">
            {activeStages.map((key) => {
              const stage = result.stages.find((s) => s.key === key);
              const status = stage?.status ?? 'pending';
              return (
                <div key={key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-(--color-foreground) font-medium">{STAGE_LABELS[key]}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        status === 'done'       ? 'text-(--color-success) bg-emerald-50' :
                        status === 'generating' ? 'text-(--color-primary) bg-(--color-primary-light)' :
                        status === 'error'      ? 'text-(--color-error) bg-red-50' :
                        status === 'submitting' ? 'text-blue-600 bg-blue-50' :
                        'text-(--color-secondary) bg-(--color-muted)'
                      }`}>
                        {status === 'generating' ? `${stage?.progress ?? 0}%` :
                         status === 'done'       ? 'Done' :
                         status === 'error'      ? 'Error' :
                         status === 'submitting' ? 'Submitting' : 'Pending'}
                      </span>
                      {(status === 'done' || status === 'error') && (
                        <button
                          onClick={() => onRegenerateStage(result.sceneIndex, key)}
                          className="text-[11px] w-5 h-5 flex items-center justify-center rounded hover:bg-(--color-muted) text-(--color-secondary) hover:text-(--color-foreground) transition-colors"
                          title={`Redo ${STAGE_LABELS[key]}`}
                        >↺</button>
                      )}
                    </div>
                  </div>
                  {(status === 'generating' || status === 'done') && (
                    <div className="w-full h-1 bg-(--color-muted) rounded-full overflow-hidden">
                      <div
                        className="h-full bg-(--color-primary) rounded-full transition-all duration-300"
                        style={{ width: `${status === 'done' ? 100 : (stage?.progress ?? 0)}%` }}
                      />
                    </div>
                  )}
                  {status === 'error' && stage?.error && (
                    <span className="text-[10px] text-(--color-error) truncate">{stage.error}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Stage video previews */}
        {result.stages.some((s) => s.status === 'done') && (
          <div className={`grid gap-2 ${activeStages.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {activeStages.map((key) => {
              const stage = result.stages.find((s) => s.key === key && s.status === 'done');
              if (!stage?.jobId || !stage.frampackUrl) return (
                <div key={key} className="aspect-[9/16] rounded-lg bg-(--color-muted) flex items-center justify-center">
                  <span className="text-[10px] text-(--color-secondary)">{STAGE_LABELS[key].split(' · ')[0]}</span>
                </div>
              );
              return (
                <div key={key} className="flex flex-col gap-1">
                  <video
                    src={videoUrl(stage.jobId, stage.frampackUrl)}
                    controls
                    loop
                    className="w-full rounded-lg bg-black"
                    style={{ maxHeight: '160px' }}
                  />
                  <span className="text-[10px] text-center text-(--color-secondary)">{STAGE_LABELS[key]}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Merged video */}
        {result.merging && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-(--color-muted)">
            <span className="w-4 h-4 border-2 border-(--color-primary) border-t-transparent rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
            <span className="text-sm text-(--color-secondary)">Đang ghép {activeStages.map(k => STAGE_LABELS[k].split(' · ')[0]).join('+')}</span>
          </div>
        )}

        {result.mergeError && (
          <div className="px-4 py-3 rounded-xl border border-(--color-error) bg-red-50 text-sm text-(--color-error)">
            Merge error: {result.mergeError}
          </div>
        )}

        {result.mergedVideoUrl && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-(--color-secondary)">Merged ({activeStages.map(k => STAGE_LABELS[k].split(' · ')[0]).join('+')})</span>
            <video src={result.mergedVideoUrl} controls loop className="w-full rounded-xl bg-black" style={{ maxHeight: '240px' }} />
            <div className="flex gap-2">
              <button onClick={downloadMerged} className="btn-neumorphic flex-1 py-2 text-sm">
                ↓ Download {result.label}.mp4
              </button>
              <button onClick={() => onRemerge(result.sceneIndex)} className="btn-neumorphic py-2 px-3 text-sm shrink-0">
                ↺ Ghép lại
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
