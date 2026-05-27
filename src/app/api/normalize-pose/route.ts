import { normalizePose } from '@/lib/openai-image';
import type { NormalizePoseRequest } from '@/types/pipeline';

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: NormalizePoseRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { imageBase64, poseKey, customReferenceBase64, apiKey, size } = body;

  if (!imageBase64) return Response.json({ error: 'imageBase64 is required' }, { status: 400 });
  if (!poseKey) return Response.json({ error: 'poseKey is required' }, { status: 400 });

  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: 'OpenAI API key is required' }, { status: 400 });

  try {
    const generated = await normalizePose(imageBase64, poseKey, key, {
      customReferenceBase64,
      size,
    });
    return Response.json({ generated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
