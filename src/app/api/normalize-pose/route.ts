import fs from 'fs';
import path from 'path';
import { normalizePose } from '@/lib/openai-image';
import { ALL_SCENES, POSED_SCENE_INDICES } from '@/lib/scene-config';

export const maxDuration = 180;

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

  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: 'GEMINI_API_KEY is not set' }, { status: 500 });

  if (!fs.existsSync(REFERENCE_IMAGE_PATH)) {
    return Response.json({ error: 'Reference image not found at public/poses/reference.jpg' }, { status: 500 });
  }
  const referenceImageBuffer = fs.readFileSync(REFERENCE_IMAGE_PATH);

  const posedScenes = ALL_SCENES.filter(
    (s) => POSED_SCENE_INDICES.has(s.index) && s.poseConfig?.referenceImageFile
  );

  try {
    // Step 1: generate main avatar — clasped hands pose from reference.jpg
    const generated = await normalizePose(imageBase64, referenceImageBuffer, key, { size });

    // Step 2: generate each pose from the ORIGINAL portrait (not the generated avatar)
    // so poses don't inherit the clasped-hands from step 1
    const poseEntries: ({ sceneIndex: number; img: string } | null)[] = [];
    for (const scene of posedScenes) {
      const refPath = path.join(process.cwd(), 'public', 'poses', scene.poseConfig!.referenceImageFile!);
      const refBuf = fs.readFileSync(refPath);
      try {
        const pose = await normalizePose(imageBase64, refBuf, key, {
          size,
          poseHint: scene.poseConfig!.posePrompt,
          referenceFileName: scene.poseConfig!.referenceImageFile,
        });
        poseEntries.push({ sceneIndex: scene.index, img: pose });
      } catch (err) {
        console.error(`Pose generation failed for scene ${scene.index}:`, err instanceof Error ? err.message : err);
        poseEntries.push(null);
      }
    }

    const generatedPoses: Record<number, string> = {};
    for (const entry of poseEntries) {
      if (entry) generatedPoses[entry.sceneIndex] = entry.img;
    }

    return Response.json({ generated, generatedPoses });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
