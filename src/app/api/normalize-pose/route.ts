import fs from 'fs';
import path from 'path';
import { normalizePose } from '@/lib/openai-image';

export const maxDuration = 60;

const REFERENCE_IMAGE_PATH = path.join(process.cwd(), 'public/poses/reference.jpg');

export async function POST(request: Request) {
  let body: { imageBase64: string; size?: '1024x1024' | '1024x1536' | '1536x1024' };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { imageBase64, size } = body;
  if (!imageBase64) return Response.json({ error: 'imageBase64 is required' }, { status: 400 });

  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: 'OPENAI_API_KEY is not set' }, { status: 500 });

  if (!fs.existsSync(REFERENCE_IMAGE_PATH)) {
    return Response.json({ error: 'Reference image not found at public/poses/reference.jpg' }, { status: 500 });
  }
  const referenceImageBuffer = fs.readFileSync(REFERENCE_IMAGE_PATH);

  try {
    const generated = await normalizePose(imageBase64, referenceImageBuffer, key, { size });
    return Response.json({ generated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
