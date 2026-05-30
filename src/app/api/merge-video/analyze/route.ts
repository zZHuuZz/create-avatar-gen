import OpenAI, { toFile } from 'openai';

export const maxDuration = 120;

interface WordToken {
  word: string;
  start: number;
  end: number;
}

const SYSTEM_PROMPT = `Cho một danh sách các từ đánh số, hãy tìm tất cả các từ nối và quan hệ từ trong văn bản.

Từ nối là các từ hoặc cụm từ dùng để liên kết, chuyển tiếp giữa các câu hoặc ý. Ví dụ: "tuy nhiên", "vì vậy", "nếu như", "mặc dù", "do đó", "bởi vì", "nhưng", "thế nhưng", "hơn nữa", "ngoài ra", "bên cạnh đó", "không chỉ vậy", "đầu tiên", "thứ nhất", "thứ hai", "cuối cùng", "tóm lại", "ví dụ như", "chẳng hạn", "đồng thời", "song song đó", "thậm chí".

Trả về JSON với "matches" là mảng các mảng chỉ số. Mỗi mảng con là chỉ số các từ tạo thành một cụm từ nối.

Ví dụ input: [{"i":0,"t":"Tôi"},{"i":1,"t":"giàu"},{"i":2,"t":"Vì"},{"i":3,"t":"vậy"},{"i":4,"t":"tôi"}]
Ví dụ output: {"matches":[[2,3]]}

Chỉ trả về JSON, không có gì khác.`;

const ENUMERATION_RE = /^(thứ\s+(nhất|hai|ba|tư|năm|sáu|bảy|tám|chín|mười)|đầu tiên|cuối cùng|tiếp theo|kế tiếp|hơn nữa|ngoài ra|bên cạnh đó|không chỉ vậy|đồng thời|song song đó)$/i;
const EMPHASIS_RE = /^(ví dụ(?: như)?|chẳng hạn(?: như)?|thậm chí|đặc biệt(?: là)?|nhất là|chính là|quan trọng(?: hơn)?)$/i;

function classifyPhrase(phrase: string): string {
  const p = phrase.trim().replace(/[\p{P}\p{S}]+$/u, '').trim();
  if (ENUMERATION_RE.test(p)) return '1-hand';
  if (EMPHASIS_RE.test(p)) return 'point-up';
  return '2-hand';
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
      (g: unknown) => Array.isArray(g) &&
        (g as number[]).every((idx) => typeof idx === 'number' && idx >= 0 && idx < words.length)
    );
  } catch (err) {
    return Response.json({ error: `LLM failed: ${err instanceof Error ? err.message : err}` }, { status: 500 });
  }

  const markers = matches.map((group) => {
    const phrase = group.map((i) => words[i].word).join(' ');
    return {
      start: words[group[0]].start,
      end: words[group[group.length - 1]].end,
      word: phrase,
      sceneKey: classifyPhrase(phrase),
    };
  }).sort((a, b) => a.start - b.start);

  return Response.json({ transcript: fullText, markers, audioDuration });
}
