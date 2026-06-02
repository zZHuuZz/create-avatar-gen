import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';

function stripDataUrl(base64: string): string {
  return base64.replace(/^data:[^,]+,/, '');
}

// Blur the top 30% of the reference image so Gemini cannot copy the reference person's face
// Keeps the full image composition intact so arm/hand positions stay in correct context
async function blurFaceInReference(buf: Buffer): Promise<Buffer> {
  const { width = 800, height = 1280 } = await sharp(buf).metadata();
  const faceHeight = Math.floor(height * 0.30);

  const blurredFace = await sharp(buf)
    .extract({ left: 0, top: 0, width, height: faceHeight })
    .blur(30)
    .toBuffer();

  return sharp(buf)
    .composite([{ input: blurredFace, left: 0, top: 0 }])
    .toBuffer();
}

const MODEL = 'gemini-2.5-flash-image';

export async function generatePoseImage(
  subjectBase64: string,
  posePrompt: string,
  apiKey: string,
  options: { size?: string } = {}
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } as any,
  });

  const result = await model.generateContent([
    { text: 'Portrait photo (the subject):' },
    { inlineData: { data: stripDataUrl(subjectBase64), mimeType: 'image/png' } },
    { text: posePrompt },
  ]);

  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!img?.inlineData?.data) throw new Error('Gemini returned no image data');
  return `data:${img.inlineData.mimeType};base64,${img.inlineData.data}`;
}

export async function normalizePose(
  subjectBase64: string,
  referenceImageBuffer: Buffer,
  apiKey: string,
  options: { size?: string; poseHint?: string; referenceFileName?: string } = {}
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } as any,
  });

  const subjectName = 'portrait.png';
  const refName = options.referenceFileName ?? 'reference.jpg';
  const hint = options.poseHint ? ` ${options.poseHint}` : '';
  const prompt =
    `Maintain the same background, clothing and facial features from ${subjectName}.\n` +
    `ONLY change the hand and arm pose to imitate that of ${refName}.\n` +
    `REQUIRED: Both arms and both hands must always be fully visible in the output. Never show only one arm.${hint}`;

  // Blur the face region of the reference so Gemini cannot copy it onto the subject
  const blurredRef = await blurFaceInReference(referenceImageBuffer);

  const result = await model.generateContent([
    { text: `${subjectName}:` },
    { inlineData: { data: stripDataUrl(subjectBase64), mimeType: 'image/png' } },
    { text: `${refName}:` },
    { inlineData: { data: blurredRef.toString('base64'), mimeType: 'image/jpeg' } },
    { text: prompt },
  ]);

  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!img?.inlineData?.data) throw new Error('Gemini returned no image data');
  return `data:${img.inlineData.mimeType};base64,${img.inlineData.data}`;
}
