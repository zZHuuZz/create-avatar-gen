import OpenAI, { toFile } from 'openai';

function stripDataUrl(base64: string): string {
  return base64.replace(/^data:[^,]+,/, '');
}

export async function normalizePose(
  subjectBase64: string,
  referenceImageBuffer: Buffer,
  apiKey: string,
  options: { size?: '1024x1024' | '1024x1536' | '1536x1024' } = {}
): Promise<string> {
  const client = new OpenAI({ apiKey });

  const prompt =
    `You are a photo editor. You will receive a portrait photo (the subject) and a reference pose photo. ` +
    `Your output must be a single realistic photo of the SAME PERSON from the subject photo, shown waist-up, with their arms and hands in the EXACT pose shown in the reference photo. ` +
    `\n\nRules:\n` +
    `- Face, hair, skin tone, glasses, clothing, and background must be preserved exactly from the subject photo. Do not change the person's identity or appearance in any way.\n` +
    `- Regardless of how the subject photo is framed (close-up, full body, half body, hands visible or not), always output a waist-up composition that clearly shows the arms and hands.\n` +
    `- If the subject photo does not show the arms or hands, reconstruct them to match the reference pose using the same clothing style visible in the subject photo.\n` +
    `- Copy the exact arm position, hand position, and gesture from the reference photo — do not guess or improvise the pose.\n` +
    `- Do NOT enhance, beautify, smooth skin, adjust lighting, or change image quality. Preserve the original photo's realistic look exactly.\n` +
    `- The output must look like a real unedited photo of this person, not AI-generated.`;

  const subjectBuffer = Buffer.from(stripDataUrl(subjectBase64), 'base64');
  const subjectFile = await toFile(subjectBuffer, 'subject.png', { type: 'image/png' });
  const refFile = await toFile(referenceImageBuffer, 'reference.jpg', { type: 'image/jpeg' });

  const response = await (client.images as any).edit({
    model: 'gpt-image-1',
    image: [subjectFile, refFile],
    prompt,
    size: options.size ?? '1024x1536',
    n: 1,
  });

  const b64 = response.data[0].b64_json;
  if (!b64) throw new Error('OpenAI returned no image data');
  return `data:image/png;base64,${b64}`;
}
