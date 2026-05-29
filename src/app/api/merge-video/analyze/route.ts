import OpenAI, { toFile } from 'openai';

export const maxDuration = 120;

interface WordToken {
  word: string;
  start: number;
  end: number;
}

interface Marker {
  start: number;
  end: number;
  word: string;
  type: 'transition' | 'emphasis';
}

const SYSTEM_PROMPT = `You analyze speech transcripts to identify specific linguistic elements for gesture timing in a speaking video.

Given word-level timestamps, find two types of words:

1. "transition" — Conjunctions and connecting words (quan hệ từ, từ nối) that link or contrast ideas between sentences. Vietnamese examples: "tuy nhiên", "vì vậy", "nếu như", "mặc dù", "do đó", "bởi vì", "nhưng", "nhưng mà", "thế nhưng", "hơn nữa", "ngoài ra", "bên cạnh đó", "không chỉ", "mà còn", "thứ nhất", "thứ hai", "thứ ba", "đầu tiên", "cuối cùng", "nói chung", "tóm lại", "ví dụ như", "chẳng hạn như", "đồng thời", "song song đó". English equivalents: "however", "therefore", "moreover", "furthermore", "in addition", "on the other hand", "for example", "finally", "as a result".

2. "emphasis" — Words that single out the most important point in a statement. Vietnamese examples: "đặc biệt", "quan trọng", "nhất là", "duy nhất", "chính là", "chỉ có", "thực ra", "thật ra", "rõ ràng", "đáng chú ý". English equivalents: "especially", "importantly", "above all", "in particular", "crucially".

Rules:
- Only mark words that clearly fit these categories — quality over quantity
- A long speech should have at most 1 transition or emphasis marker per 10–15 seconds
- Use the EXACT start/end timestamps from the word-level data provided
- Prefer marking the FIRST word of a multi-word phrase (e.g. "tuy" in "tuy nhiên")

Return ONLY valid JSON:
{ "markers": [{ "start": 1.2, "end": 1.8, "word": "tuy nhiên", "type": "transition" }] }

Return an empty markers array if no clear matches exist.`;

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

  // 1. Whisper STT with word timestamps
  let words: WordToken[];
  let fullText: string;
  let audioDuration: number;
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
    audioDuration = words.length ? words[words.length - 1].end : 0;
  } catch (err) {
    return Response.json({ error: `Whisper failed: ${err instanceof Error ? err.message : err}` }, { status: 500 });
  }

  if (!words.length) {
    return Response.json({ error: 'No words detected in audio' }, { status: 400 });
  }

  // 2. LLM: find linguistic trigger words
  let markers: Marker[] = [];
  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Total audio duration: ${audioDuration.toFixed(2)}s\n\nTranscript: "${fullText}"\n\nWord timestamps:\n${JSON.stringify(words, null, 2)}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const parsed = JSON.parse(completion.choices[0].message.content ?? '{}');
    markers = (parsed.markers ?? []).filter(
      (m: Marker) => typeof m.start === 'number' && typeof m.end === 'number' && m.start >= 0 && m.end <= audioDuration * 1.05
    );
  } catch (err) {
    return Response.json({ error: `LLM failed: ${err instanceof Error ? err.message : err}` }, { status: 500 });
  }

  return Response.json({ transcript: fullText, markers, audioDuration });
}
