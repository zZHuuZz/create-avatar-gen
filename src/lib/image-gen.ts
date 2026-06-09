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
    `TASK: Reproduce portrait.png with a new arm/hand pose, facing directly at the camera.\n\n` +
    `FACE DIRECTION (critical — always apply):\n` +
    `• The subject MUST face directly into the camera — eyes looking straight ahead, head pointing forward.\n` +
    `• If portrait.png shows the subject looking to the side or at an angle, rotate the head/face so they look straight at the camera in the output.\n` +
    `• This is the most important required change; do not skip it.\n\n` +
    `PRESERVE EXACTLY from portrait.png (do not change anything except what is listed under CHANGE):\n` +
    `• Face appearance — features, hair, skin tone (NOT the direction of gaze or head angle)\n` +
    `• Clothing — color, style, and every detail\n` +
    `• Background and environment\n` +
    `• Body proportions\n\n` +
    `CHANGE: BOTH arms' positions, shoulder angles, BOTH hands' placement, AND head/gaze direction (must face forward).\n\n` +
    `POSE GUIDE (pose-guide.jpg):\n` +
    `This is a grayscale blurred silhouette — it is NOT a person to copy from.\n` +
    `Use it ONLY to read where the arms and hands are positioned geometrically.\n` +
    `Copy NOTHING visual from it: no colors, no skin, no clothing, no face, no background.\n\n` +
    `HAND RULE (both hands always required — critical):\n` +
    `• The output MUST show BOTH arms and BOTH hands, always — even if portrait.png shows only one arm, one hand, or neither.\n` +
    `• For any hand visible in portrait.png: preserve its skin tone and proportions exactly in the output.\n` +
    `• For any hand NOT visible in portrait.png (hidden, tucked away, out of frame, or behind clothing): generate it to match the subject's skin tone and body proportions. Do NOT leave it missing or hidden — it must appear in the output.\n` +
    `• Never borrow hand color or style from the pose guide.\n\n` +
    `RESTING ARM RULE (critical — always apply unless Pose detail below overrides it):\n` +
    `• If "Pose detail" below explicitly describes where each hand should rest (placement, height, finger shape), follow THAT description exactly — it takes priority over every rule in this section.\n` +
    `• Otherwise, any arm/hand that is NOT explicitly described as raised, gesturing, or active must hang STRAIGHT DOWN at the person's side — naturally, like a person standing relaxed.\n` +
    `• Otherwise, a resting hand must be FULLY OPEN and LOOSE: fingers straight or very slightly curved, NO bent fingers, NO pinched fingers, NO sign language shapes, NO clawing, NO tension, NO deliberate hand pose of any kind.\n` +
    `• Otherwise, do NOT invent any gesture for a resting hand. Treat it as invisible — it just hangs there.\n\n` +
    `FRAMING (critical):\n` +
    `• Keep the same head size and portrait crop as portrait.png — waist-up, not full body.\n` +
    `• Do NOT zoom out to show the full body or show the person standing at a distance.\n` +
    `• Both arms and both hands required by the pose MUST be fully visible and unobstructed — never crop a hand, wrist, or forearm, and never let one hand hide behind the other, behind the torso, or behind clothing.\n` +
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
