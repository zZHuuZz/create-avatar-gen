import fs from 'fs';
import path from 'path';
import { normalizePose } from '@/lib/openai-image';
import { ALL_SCENES } from '@/lib/scene-config';

export const maxDuration = 120;

// step: 'avatar' | 'pose-1' | 'pose-3'
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.imageBase64 || !body?.step) {
    return Response.json({ error: 'imageBase64 and step required' }, { status: 400 });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

  const { imageBase64, step } = body;

  if (step === 'avatar') {
    const refPath = path.join(process.cwd(), 'public/poses/reference.jpg');
    if (!fs.existsSync(refPath)) return Response.json({ error: 'reference.jpg not found' }, { status: 500 });
    const refBuf = fs.readFileSync(refPath);
    const img = await normalizePose(imageBase64, refBuf, key, {
      poseHint: 'Right hand gently holds left hand at waist level, fingers naturally interlocked — NOT a prayer or namaste pose. Both forearms visible from elbow to wrist. Output framed waist-up so no hand or forearm is cropped.',
    });
    return Response.json({ image: img, step });
  }

  const sceneIndex = step === 'pose-1' ? 1 : step === 'pose-3' ? 3 : null;
  if (sceneIndex === null) return Response.json({ error: `Unknown step: ${step}` }, { status: 400 });

  const scene = ALL_SCENES.find((s) => s.index === sceneIndex);
  if (!scene?.poseConfig?.referenceImageFile) {
    return Response.json({ error: `Scene ${sceneIndex} has no poseConfig` }, { status: 400 });
  }

  const refPath = path.join(process.cwd(), 'public/poses', scene.poseConfig.referenceImageFile);
  if (!fs.existsSync(refPath)) return Response.json({ error: `${scene.poseConfig.referenceImageFile} not found` }, { status: 500 });
  const refBuf = fs.readFileSync(refPath);

  const img = await normalizePose(imageBase64, refBuf, key, {
    poseHint: scene.poseConfig.posePrompt,
  });

  return Response.json({ image: img, step });
}
