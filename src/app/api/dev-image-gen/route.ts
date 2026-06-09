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
    poseHint: 'TWO HANDS REQUIRED — even if the portrait only shows one hand, the output must show both. Both hands rest gently in front of the lower torso near the waist, close to each other but not touching and not overlapping — one resting slightly lower, the other just slightly higher and a touch to the side, fingers relaxed and naturally curled. Neither hand crosses the body or reaches up toward the chest or shoulder; they stay near each other at waist level with only a small height difference. CRITICAL: both hands AND both forearms (elbow to wrist) must be completely visible and unobstructed — neither hand may be hidden behind the other, behind the body, behind clothing, or cut off by the frame edge. Output framed waist-up so no hand or forearm is cropped.',
  });

  return Response.json({ image: img });
}
