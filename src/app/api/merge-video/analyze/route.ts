import OpenAI, { toFile } from 'openai';

export const maxDuration = 120;

interface WordToken {
  word: string;
  start: number;
  end: number;
}

interface Segment {
  start: number;
  end: number;
  text: string;
  scene: 'no-hand' | '1-hand' | '2-hand' | 'point-up';
}

const SYSTEM_PROMPT = `You analyze speech transcripts to assign natural hand gestures to a speaking video.

You receive word-level timestamps from a transcription. Segment the speech into natural units (sentences or clauses) and assign one gesture per segment.

Available gestures:
- "no-hand": Normal speech, no gesture. Use for introductions, transitions, filler phrases, or when building up to a point.
- "1-hand": One hand rises briefly. Use for mild emphasis, making a subtle point, or mid-sentence stress on a single word/idea.
- "2-hand": Both hands open outward. Use for strong emphasis, presenting a big idea, opening statements, or key concepts.
- "point-up": Index finger points upward. Use for "number one", key takeaways, highlighting the single most important point in a section.

Guidelines:
- Start with "no-hand" for the first segment unless it's a strong opener.
- Gestures should feel earned — mostly "no-hand", with gestures appearing at natural emphasis moments.
- Prefer gestures at the END of sentences or clauses, not mid-word.
- Never use "point-up" more than once or twice in a full speech.
- Vary gestures — avoid repeating the same gesture more than 2 times in a row.

CRITICAL: Use ONLY the exact start/end timestamps from the word-level data provided. Do NOT invent or estimate timestamps. Each segment's "start" must equal the "start" of its first word, and "end" must equal the "end" of its last word. All segments combined must span the full audio duration given.

Return ONLY valid JSON in this exact shape:
{ "segments": [{ "start": 0.0, "end": 3.2, "text": "...", "scene": "no-hand" }] }`;

export async function POST(request: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const audioFile = formData.get('audio') as File | null;
  if (!audioFile) return Response.json({ error: 'audio file required' }, { status: 400 });

  const client = new OpenAI({ apiKey: key });

  let words: WordToken[];
  let fullText: string;
  try {
    const file = await toFile(
      Buffer.from(await audioFile.arrayBuffer()),
      audioFile.name,
      { type: audioFile.type || 'audio/mpeg' }
    );
    const transcription = await (client.audio.transcriptions as any).create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    });
    words = transcription.words ?? [];
    fullText = transcription.text ?? '';
  } catch (err) {
    return Response.json({ error: `Whisper failed: ${err instanceof Error ? err.message : err}` }, { status: 500 });
  }

  if (!words.length) {
    return Response.json({ error: 'No words detected in audio' }, { status: 400 });
  }

  // 2. LLM segmentation
  let segments: Segment[];
  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Total audio duration: ${words[words.length - 1].end.toFixed(2)}s\n\nTranscript: "${fullText}"\n\nWord timestamps (use these exact values for start/end):\n${JSON.stringify(words, null, 2)}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const parsed = JSON.parse(completion.choices[0].message.content ?? '{}');
    segments = parsed.segments ?? [];

    const audioEnd = words[words.length - 1].end;
    const maxEnd = Math.max(...segments.map((s) => s.end), 0);
    if (maxEnd > audioEnd * 1.05) {
      const scale = audioEnd / maxEnd;
      segments = segments.map((s) => ({
        ...s,
        start: parseFloat((s.start * scale).toFixed(2)),
        end: parseFloat((s.end * scale).toFixed(2)),
      }));
    }
    segments = segments.map((s) => ({
      ...s,
      start: Math.max(0, Math.min(s.start, audioEnd)),
      end: Math.max(0, Math.min(s.end, audioEnd)),
    }));
  } catch (err) {
    return Response.json({ error: `LLM failed: ${err instanceof Error ? err.message : err}` }, { status: 500 });
  }

  return Response.json({ transcript: fullText, segments });
}
