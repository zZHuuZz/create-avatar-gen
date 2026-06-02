import { GoogleGenerativeAI } from '@google/generative-ai';

function stripDataUrl(base64: string): string {
  return base64.replace(/^data:[^,]+,/, '');
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
  const hint = options.poseHint ? ` The target pose: ${options.poseHint}` : '';
  const prompt =
    `${subjectName} is the person to edit. ${refName} is the arm/hand pose to copy.\n` +
    `Maintain the same background, clothing and facial features from ${subjectName}.\n` +
    `ONLY change the hand and arm pose to imitate that of ${refName}.${hint}`;

  const result = await model.generateContent([
    { text: `${subjectName}:` },
    { inlineData: { data: stripDataUrl(subjectBase64), mimeType: 'image/png' } },
    { text: `${refName}:` },
    { inlineData: { data: referenceImageBuffer.toString('base64'), mimeType: 'image/jpeg' } },
    { text: prompt },
  ]);

  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!img?.inlineData?.data) throw new Error('Gemini returned no image data');
  return `data:${img.inlineData.mimeType};base64,${img.inlineData.data}`;
}
