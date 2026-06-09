import fs from 'fs';
import path from 'path';
import { normalizePose, generatePoseImage } from '@/lib/image-gen';
import { submitJob, pollJobSSE } from '@/lib/framepack';
import { ALL_SCENES } from '@/lib/scene-config';
import { getClipPath } from '@/lib/clip-cache';
import type { GeneratePosedVideoRequest, PosedSSEEvent, StageKey } from '@/types/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 1800;

export async function POST(request: Request) {
  let body: GeneratePosedVideoRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { imageBase64, poseImageBase64: preGeneratedPose, frampackUrl: bodyFrampackUrl, baseSeed, sceneIndex, stageOnly } = body;
  const url = bodyFrampackUrl || process.env.FRAMEPACK_API_URL;
  const openaiKey = process.env.GEMINI_API_KEY;

  if (!imageBase64 || !url) {
    return Response.json({ error: 'imageBase64 and frampackUrl are required' }, { status: 400 });
  }
  if (!openaiKey) {
    return Response.json({ error: 'GEMINI_API_KEY is not set' }, { status: 500 });
  }

  const scene = ALL_SCENES.find((s) => s.index === sceneIndex);
  if (!scene?.poseConfig) {
    return Response.json({ error: `Scene ${sceneIndex} has no poseConfig` }, { status: 400 });
  }

  const { poseConfig } = scene;
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  request.signal.addEventListener('abort', () => abortController.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: PosedSSEEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      try {
        // 1. Use pre-generated pose image if available, otherwise call GPT
        let poseImageBase64: string;
        if (preGeneratedPose) {
          poseImageBase64 = preGeneratedPose;
          send({ type: 'pose-done', poseImageBase64 });
        } else {
          send({ type: 'pose-generating' });
          try {
            if (poseConfig.referenceImageFile) {
              const refPath = path.join(process.cwd(), 'public', 'poses', poseConfig.referenceImageFile);
              const refBuffer = fs.readFileSync(refPath);
              poseImageBase64 = await normalizePose(imageBase64, refBuffer, openaiKey, { poseHint: poseConfig.posePrompt });
            } else {
              poseImageBase64 = await generatePoseImage(imageBase64, poseConfig.posePrompt, openaiKey);
            }
            send({ type: 'pose-done', poseImageBase64 });
          } catch (err) {
            send({ type: 'pose-error', error: err instanceof Error ? err.message : String(err) });
            send({ type: 'all-done' });
            controller.close();
            return;
          }
        }

        const seed = baseSeed ?? Math.floor(Math.random() * 1_000_000);

        const allStages: Array<{ key: StageKey; startImage: string; endImage: string; config: typeof poseConfig.stageInto; guidanceScale: number; steps: number }> = [
          { key: 'into', startImage: imageBase64,      endImage: poseImageBase64, config: poseConfig.stageInto, guidanceScale: poseConfig.stageInto.guidanceScale ?? 7,  steps: 30 },
          { key: 'hold', startImage: poseImageBase64,  endImage: poseImageBase64, config: poseConfig.stageHold, guidanceScale: poseConfig.stageHold.guidanceScale ?? 7,  steps: 25 },
          { key: 'out',  startImage: poseImageBase64,  endImage: imageBase64,     config: poseConfig.stageOut,  guidanceScale: poseConfig.stageOut.guidanceScale  ?? 7,  steps: 20 },
        ];
        // Point-up cuts directly after hold — no stageOut generated
        const stages = stageOnly
          ? allStages.filter(s => s.key === stageOnly)
          : allStages.filter(s => !(sceneIndex === 3 && s.key === 'out'));

        for (const stage of stages) {
          if (abortController.signal.aborted) break;

          send({ type: 'stage-start', stage: stage.key });

          let jobId: string;
          try {
            jobId = await submitJob(stage.startImage, url, {
              prompt: stage.config.prompt,
              negativePrompt: stage.config.negativePrompt,
              duration: stage.config.duration,
              steps: stage.steps,
              guidanceScale: stage.guidanceScale,
              seed: seed + sceneIndex * 100 + (stage.key === 'into' ? 0 : stage.key === 'hold' ? 1 : 2),
              useTeacache: true,
              endImageBase64: stage.endImage,
            });
          } catch (err) {
            send({ type: 'stage-error', stage: stage.key, error: err instanceof Error ? err.message : String(err) });
            continue;
          }

          try {
            await pollJobSSE(
              url,
              jobId,
              (pct) => send({ type: 'stage-progress', stage: stage.key, pct }),
              abortController.signal
            );
            // Cache clip immediately so it survives FramePack job expiry
            getClipPath(jobId, url).catch(() => {});
            send({ type: 'stage-done', stage: stage.key, jobId, frampackUrl: url });
          } catch (err) {
            if (abortController.signal.aborted) break;
            send({ type: 'stage-error', stage: stage.key, error: err instanceof Error ? err.message : String(err) });
          }
        }

        send({ type: 'all-done' });
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
