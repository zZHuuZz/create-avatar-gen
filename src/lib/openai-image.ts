import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';

function stripDataUrl(base64: string): string {
  return base64.replace(/^data:[^,]+,/, '');
}

// All images sent to Gemini are resized to this fixed canvas so output dimensions are always consistent.
const STANDARD_W = 512;
const STANDARD_H = 768;

async function toStandardSize(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize(STANDARD_W, STANDARD_H, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer();
}

// Strip ALL appearance info from the reference image so Gemini cannot copy anything visual.
// Grayscale removes all color (clothing, skin tone). Heavy blur removes fine detail (face, textures).
// What remains: only gross body geometry — where limbs are, arm angles, hand positions.
async function prepareReferenceForPose(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize(STANDARD_W, STANDARD_H, { fit: 'cover', position: 'top' })
    .grayscale()
    .blur(15)
    .jpeg({ quality: 85 })
    .toBuffer();
}

const MODEL = 'gemini-2.5-flash-image';

export async function generatePoseImage(
  subjectBase64: string,
  posePrompt: string,
  apiKey: string,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } as any,
  });

  const subjectBuf = await toStandardSize(Buffer.from(stripDataUrl(subjectBase64), 'base64'));

  const result = await model.generateContent([
    { text: 'Portrait photo (the subject):' },
    { inlineData: { data: subjectBuf.toString('base64'), mimeType: 'image/png' } },
    { text: posePrompt },
  ]);

  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!img?.inlineData?.data) throw new Error('Gemini returned no image data');
  const normalized = await toStandardSize(Buffer.from(img.inlineData.data, 'base64'));
  return `data:image/png;base64,${normalized.toString('base64')}`;
}

export async function normalizePose(
  subjectBase64: string,
  referenceImageBuffer: Buffer,
  apiKey: string,
  options: { poseHint?: string } = {}
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } as any,
  });

  const hint = options.poseHint ? `\nPose detail: ${options.poseHint}` : '';

  // Standardize subject to fixed canvas so output size is always consistent
  const subjectBuf = await toStandardSize(Buffer.from(stripDataUrl(subjectBase64), 'base64'));
  // Strip all appearance info from reference — result can only convey body geometry
  const poseGuide = await prepareReferenceForPose(referenceImageBuffer);

  const prompt =
    `TASK: Reproduce portrait.png with a new arm/hand pose.\n\n` +
    `PRESERVE EXACTLY from portrait.png (do not change anything):\n` +
    `• Face, hair, and all facial features\n` +
    `• Clothing — color, style, and every detail\n` +
    `• Background and environment\n` +
    `• Skin tone and body proportions\n\n` +
    `CHANGE ONLY: arm positions, shoulder angles, and hand placement.\n\n` +
    `POSE GUIDE (pose-guide.jpg):\n` +
    `This is a grayscale blurred silhouette — it is NOT a person to copy from.\n` +
    `Use it ONLY to read where the arms and hands are positioned geometrically.\n` +
    `Copy NOTHING visual from it: no colors, no skin, no clothing, no face, no background.\n\n` +
    `HAND RULE:\n` +
    `• If portrait.png shows the subject's hands: preserve their skin tone and proportions exactly.\n` +
    `• If portrait.png does NOT show hands: generate hands that match the subject's visible skin tone and body proportions — never borrow hand color or style from the pose guide.\n\n` +
    `RESTING ARM RULE (critical — always apply):\n` +
    `• Any arm/hand that is NOT explicitly described as raised, gesturing, or active must hang STRAIGHT DOWN at the person's side — naturally, like a person standing relaxed.\n` +
    `• A resting hand must be FULLY OPEN and LOOSE: fingers straight or very slightly curved, NO bent fingers, NO pinched fingers, NO sign language shapes, NO clawing, NO tension, NO deliberate hand pose of any kind.\n` +
    `• Do NOT invent any gesture for a resting hand. Treat it as invisible — it just hangs there.\n\n` +
    `FRAMING (critical):\n` +
    `• Keep the same head size and portrait crop as portrait.png — waist-up, not full body.\n` +
    `• Do NOT zoom out to show the full body or show the person standing at a distance.\n` +
    `• Both arms and both hands required by the pose MUST be fully visible — never crop a hand, wrist, or forearm.\n` +
    `• You may widen or slightly adjust the frame ONLY as much as needed to show both arms; never more.` +
    hint;

  const result = await model.generateContent([
    { text: 'portrait.png — this person\'s complete appearance must be preserved:' },
    { inlineData: { data: subjectBuf.toString('base64'), mimeType: 'image/png' } },
    { text: 'pose-guide.jpg — use ONLY for arm/hand position geometry, copy nothing visual:' },
    { inlineData: { data: poseGuide.toString('base64'), mimeType: 'image/jpeg' } },
    { text: prompt },
  ]);

  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!img?.inlineData?.data) throw new Error('Gemini returned no image data');
  const normalized = await toStandardSize(Buffer.from(img.inlineData.data, 'base64'));
  return `data:image/png;base64,${normalized.toString('base64')}`;
}
