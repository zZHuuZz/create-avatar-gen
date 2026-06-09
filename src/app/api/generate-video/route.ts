import { submitJob, pollJobSSE } from '@/lib/framepack';
import { ALL_SCENES, QUICK_SCENE } from '@/lib/scene-config';
import { getClipPath } from '@/lib/clip-cache';
import type { GenerateVideoRequest, SSEEvent } from '@/types/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 1800;

export async function POST(request: Request) {
  let body: GenerateVideoRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { imageBase64, frampackUrl: bodyFrampackUrl, scenes, baseSeed, sceneIndex } = body;
  const url = bodyFrampackUrl || process.env.FRAMEPACK_API_URL;

  if (!imageBase64 || !url) {
    return Response.json({ error: 'imageBase64 and frampackUrl are required' }, { status: 400 });
  }

  let scenesToRun = scenes === 'all' ? ALL_SCENES : [QUICK_SCENE];
  if (sceneIndex !== undefined) {
    const single = ALL_SCENES.find((s) => s.index === sceneIndex);
    if (single) scenesToRun = [single];
  }

  const seed = baseSeed ?? Math.floor(Math.random() * 1_000_000);
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  request.signal.addEventListener('abort', () => abortController.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      try {
        for (const scene of scenesToRun) {
          if (abortController.signal.aborted) break;

          send({ type: 'scene-start', sceneIndex: scene.index, label: scene.label });
          const startedAt = Date.now();

          let jobId: string;
          try {
            jobId = await submitJob(imageBase64, url, {
              prompt: scene.prompt,
              negativePrompt: scene.negativePrompt,
              duration: scene.duration,
              steps: 20,
              guidanceScale: scene.hasArm ? 15 : 10,
              seed: seed + scene.seedOffset,
              useTeacache: true,
              endImageBase64: scene.useEndImage ? imageBase64 : undefined,
            });
          } catch (err) {
            send({
              type: 'scene-error',
              sceneIndex: scene.index,
              error: err instanceof Error ? err.message : String(err),
            });
            continue;
          }

          try {
            await pollJobSSE(
              url,
              jobId,
              (pct) => send({ type: 'scene-progress', sceneIndex: scene.index, pct }),
              abortController.signal
            );
            // Cache clip immediately so it survives FramePack job expiry
            getClipPath(jobId, url).catch(() => {});
            send({ type: 'scene-done', sceneIndex: scene.index, jobId, frampackUrl: url, elapsedMs: Date.now() - startedAt });
          } catch (err) {
            if (abortController.signal.aborted) break;
            send({
              type: 'scene-error',
              sceneIndex: scene.index,
              error: err instanceof Error ? err.message : String(err),
            });
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
