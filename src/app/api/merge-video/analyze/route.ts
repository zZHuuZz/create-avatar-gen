import OpenAI, { toFile } from 'openai';

export const maxDuration = 120;

interface WordToken {
  word: string;
  start: number;
  end: number;
}

// LLM only does one job: find connecting words (từ nối) in plain text.
// No mention of videos, gestures, or any domain context.
const SYSTEM_PROMPT = `Cho một danh sách các từ đánh số, hãy tìm tất cả các từ nối và quan hệ từ trong văn bản.

Từ nối là các từ hoặc cụm từ dùng để liên kết, chuyển tiếp giữa các câu hoặc ý. Ví dụ: "tuy nhiên", "vì vậy", "nếu như", "mặc dù", "do đó", "bởi vì", "nhưng", "thế nhưng", "hơn nữa", "ngoài ra", "bên cạnh đó", "không chỉ vậy", "đầu tiên", "thứ nhất", "thứ hai", "cuối cùng", "tóm lại", "ví dụ như", "chẳng hạn", "đồng thời", "song song đó", "thậm chí".

Trả về JSON với "matches" là mảng các mảng chỉ số. Mỗi mảng con là chỉ số các từ tạo thành một cụm từ nối.

Ví dụ input: [{"i":0,"t":"Tôi"},{"i":1,"t":"giàu"},{"i":2,"t":"Vì"},{"i":3,"t":"vậy"},{"i":4,"t":"tôi"}]
Ví dụ output: {"matches":[[2,3]]}

Chỉ trả về JSON, không có gì khác.`;

// Keyword lookup: determine scene key from the matched phrase text.
// Classification is done in code — LLM only finds the words.
const ENUMERATION_WORDS = new Set([
  'thứ nhất', 'thứ hai', 'thứ ba', 'thứ tư', 'thứ năm',
  'đầu tiên', 'cuối cùng', 'tiếp theo', 'kế tiếp',
  'hơn nữa', 'ngoài ra', 'bên cạnh đó', 'không chỉ vậy',
  'đồng thời', 'song song đó',
]);

const EMPHASIS_WORDS = new Set([
  'ví dụ như', 'chẳng hạn', 'chẳng hạn như',
  'thậm chí', 'đặc biệt', 'quan trọng', 'nhất là', 'chính là',
]);

function sceneKeyForPhrase(phrase: string): string {
  const normalized = phrase.toLowerCase().trim();
  if (ENUMERATION_WORDS.has(normalized)) return '1-hand';
  if (EMPHASIS_WORDS.has(normalized)) return 'point-up';
  return '2-hand'; // default: transition
}

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

  // 2. LLM: find connecting words. Only receives compact word list, returns index arrays.
  const wordList = words.map((w, i) => ({ i, t: w.word }));

  let matches: number[][] = [];
  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(wordList) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    const parsed = JSON.parse(completion.choices[0].message.content ?? '{}');
    matches = (parsed.matches ?? []).filter(
      (g: unknown) => Array.isArray(g) && (g as number[]).every((idx) => typeof idx === 'number' && idx >= 0 && idx < words.length)
    );
  } catch (err) {
    return Response.json({ error: `LLM failed: ${err instanceof Error ? err.message : err}` }, { status: 500 });
  }

  // 3. Map index groups → timestamps + scene key in code (LLM never touches either)
  const markers = matches.map((group) => {
    const phrase = group.map((i) => words[i].word).join(' ');
    return {
      start: words[group[0]].start,
      end: words[group[group.length - 1]].end,
      word: phrase,
      sceneKey: sceneKeyForPhrase(phrase),
    };
  }).sort((a, b) => a.start - b.start);

  return Response.json({ transcript: fullText, markers, audioDuration });
}
