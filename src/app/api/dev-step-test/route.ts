import { submitJob, pollJobSSE } from '@/lib/framepack';
import { ALL_SCENES } from '@/lib/scene-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 1800;

// Step counts to compare, in order — same image, prompt, and seed for each, so the
// only variable is `steps`. Lets us see exactly how much quality/time changes per step.
const STEP_COUNTS = [12, 15, 20] as const;

interface StepTestRequest {
  imageBase64: string;
  sceneIndex: number;
  frampackUrl?: string;
  baseSeed?: number;
}

export async function POST(request: Request) {
  let body: StepTestRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { imageBase64, sceneIndex, baseSeed } = body;
  const url = body.frampackUrl || process.env.FRAMEPACK_API_URL;
  const scene = ALL_SCENES.find((s) => s.index === sceneIndex);

  if (!imageBase64 || !url) {
    return Response.json({ error: 'imageBase64 and frampackUrl are required' }, { status: 400 });
  }
  if (!scene) {
    return Response.json({ error: `Unknown sceneIndex: ${sceneIndex}` }, { status: 400 });
  }

  const seed = baseSeed ?? Math.floor(Math.random() * 1_000_000);
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  request.signal.addEventListener('abort', () => abortController.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      try {
        for (const steps of STEP_COUNTS) {
          if (abortController.signal.aborted) break;

          send({ type: 'step-start', steps });
          const startedAt = Date.now();

          let jobId: string;
          try {
            jobId = await submitJob(imageBase64, url, {
              prompt: scene.prompt,
              negativePrompt: scene.negativePrompt,
              duration: scene.duration,
              steps,
              guidanceScale: scene.hasArm ? 15 : 10,
              seed,
              useTeacache: true,
              endImageBase64: scene.useEndImage ? imageBase64 : undefined,
            });
          } catch (err) {
            send({ type: 'step-error', steps, error: err instanceof Error ? err.message : String(err) });
            continue;
          }

          try {
            await pollJobSSE(
              url,
              jobId,
              (pct) => send({ type: 'step-progress', steps, pct }),
              abortController.signal
            );
            send({ type: 'step-done', steps, jobId, frampackUrl: url, elapsedMs: Date.now() - startedAt });
          } catch (err) {
            if (abortController.signal.aborted) break;
            send({ type: 'step-error', steps, error: err instanceof Error ? err.message : String(err) });
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
