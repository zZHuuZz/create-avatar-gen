import fs from 'fs';
import path from 'path';
import { normalizePose } from '@/lib/image-gen';

export const maxDuration = 120;

// The pipeline now generates a single avatar image (normalizePose against reference.jpg) —
// the old per-pose ('pose-1' / 'pose-3') generation steps were removed when posed scenes
// were dropped from ALL_SCENES, so this route only tests that one remaining step.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.imageBase64) {
    return Response.json({ error: 'imageBase64 required' }, { status: 400 });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

  const refPath = path.join(process.cwd(), 'public/poses/reference.jpg');
  if (!fs.existsSync(refPath)) return Response.json({ error: 'reference.jpg not found' }, { status: 500 });
  const refBuf = fs.readFileSync(refPath);

  const img = await normalizePose(body.imageBase64, refBuf, key, {
    poseHint: 'Right hand gently holds left hand at waist level, fingers naturally interlocked — NOT a prayer or namaste pose. Both forearms visible from elbow to wrist. Output framed waist-up so no hand or forearm is cropped.',
  });

  return Response.json({ image: img });
}
