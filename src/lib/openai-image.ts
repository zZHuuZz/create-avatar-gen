import OpenAI, { toFile } from 'openai';
import type { PoseKey } from '@/types/pipeline';

const POSE_PROMPTS: Record<PoseKey, string> = {
  'hands-clasped':
    'standing upright facing the camera, hands clasped together at waist level, professional portrait pose',
  'arms-at-sides':
    'standing naturally facing the camera with arms relaxed at sides, clean professional stance',
  'arms-crossed':
    'standing facing the camera with arms crossed at chest level, confident professional pose',
  custom: 'pose as shown in the reference image',
};

function stripDataUrl(base64: string): string {
  return base64.replace(/^data:[^,]+,/, '');
}

export async function normalizePose(
  subjectBase64: string,
  poseKey: PoseKey,
  apiKey: string,
  options: {
    customReferenceBase64?: string;
    size?: '1024x1024' | '1024x1536' | '1536x1024';
  } = {}
): Promise<string> {
  const client = new OpenAI({ apiKey });

  const poseDescription = POSE_PROMPTS[poseKey];
  const prompt =
    `Generate a new portrait of the exact same person. ` +
    `Keep: identical face, same skin tone, same hair, same clothing and outfit, same background environment. ` +
    `Change only: the body pose to ${poseDescription}. ` +
    `Professional portrait photography quality. Preserve all personal features exactly.`;

  const subjectBuffer = Buffer.from(stripDataUrl(subjectBase64), 'base64');
  const subjectFile = await toFile(subjectBuffer, 'subject.png', { type: 'image/png' });

  const images: Awaited<ReturnType<typeof toFile>>[] = [subjectFile];

  if (poseKey === 'custom' && options.customReferenceBase64) {
    const refBuffer = Buffer.from(stripDataUrl(options.customReferenceBase64), 'base64');
    const refFile = await toFile(refBuffer, 'reference.jpg', { type: 'image/jpeg' });
    images.push(refFile);
  }

  const response = await (client.images as any).edit({
    model: 'gpt-image-1',
    image: images.length === 1 ? images[0] : images,
    prompt,
    size: options.size ?? '1024x1024',
    n: 1,
  });

  const b64 = response.data[0].b64_json;
  if (!b64) throw new Error('OpenAI returned no image data');
  return `data:image/png;base64,${b64}`;
}
