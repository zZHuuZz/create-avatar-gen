import OpenAI, { toFile } from 'openai';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const maxDuration = 120;

interface WordToken { word: string; start: number; end: number; }

const SYSTEM_PROMPT = `Cho một đoạn văn bản tiếng Việt, liệt kê các từ nối và quan hệ từ có ý nghĩa chuyển tiếp xuất hiện trong đó.

PHẢI chọn nếu xuất hiện (đây là từ nối rõ ràng): nhưng, tuy nhiên, thế nhưng, vậy mà, ngược lại, vì vậy, do đó, cho nên, bởi vì, kết quả là, hơn nữa, ngoài ra, bên cạnh đó, thứ nhất, thứ hai, đầu tiên, tiếp theo, cuối cùng, ví dụ như, chẳng hạn, thậm chí, thay vì, mặc dù, tuy rằng, thật ra, thực ra.

KHÔNG chọn các hư từ quá phổ biến: và, hay, hoặc, để, mà, thì, là, rồi, cũng, vì (đứng một mình).

Trả về JSON: {"matches": ["từ nối 1", "từ nối 2"]}
- Mỗi phần tử là chuỗi CHÍNH XÁC xuất hiện trong văn bản (copy nguyên văn, đúng hoa thường)
- Mỗi từ nối chỉ liệt kê một lần dù xuất hiện nhiều lần

Chỉ trả về JSON, không có gì khác.`;

const ENUMERATION_RE = /^(thứ\s+(nhất|hai|ba|tư|năm|sáu|bảy|tám|chín|mười)|đầu tiên|cuối cùng|tiếp theo|kế tiếp|hơn nữa|ngoài ra|bên cạnh đó|không chỉ vậy|đồng thời|song song đó)$/i;
// Only words that genuinely INTRODUCE examples or a specific highlighted item → point-up
const EMPHASIS_RE = /^(ví dụ(?: như)?|chẳng hạn(?: như)?)$/i;

const strip = (s: string) => s.toLowerCase().replace(/[\p{P}\p{S}]+/gu, '').trim();

// "như" followed by these words is NOT a list intro (e.g. "như vậy", "như thế")
const NOT_LIST_AFTER_NHU = new Set(['vậy', 'thế', 'là', 'nhau', 'mọi', 'thường', 'cũ', 'mới', 'trước', 'sau', 'đó', 'kia', 'nào', 'tôi', 'bạn', 'mình', 'chúng', 'họ', 'ta', 'anh', 'chị', 'em']);

// Unambiguous từ nối — guaranteed code-level detection independent of LLM.
// Processed BEFORE LLM phrases so shorter canonical forms (e.g. "kế tiếp") win
// over longer LLM variants (e.g. "kế tiếp sau") for correct classification.
const GUARANTEED_TU_NOI = [
  // Transition / contrast / causal
  'nhưng', 'tuy nhiên', 'thế nhưng', 'vậy mà', 'ngược lại', 'trái lại', 'dù vậy',
  'vì vậy', 'do đó', 'cho nên', 'bởi vì', 'vì thế', 'kết quả là',
  'thay vì', 'mặc dù', 'tuy rằng', 'thật ra', 'thực ra', 'tức là', 'có nghĩa là',
  'nói cách khác', 'bao gồm', 'gồm có',
  // Causal connectors (result / thanks to)
  'nhờ đó', 'nhờ vậy', 'nhờ thế',
  // Sequence
  'sau đó', 'tiếp đó',
  // Enumeration (all map to 1-hand via ENUMERATION_RE)
  'đầu tiên', 'tiếp theo', 'kế tiếp', 'cuối cùng',
  'thứ nhất', 'thứ hai', 'thứ ba', 'thứ tư', 'thứ năm', 'thứ sáu', 'thứ bảy',
  'hơn nữa', 'ngoài ra', 'bên cạnh đó', 'không chỉ vậy', 'đồng thời', 'song song đó',
  // Emphasis (all map to point-up via EMPHASIS_RE)
  'ví dụ như', 'ví dụ', 'chẳng hạn như', 'chẳng hạn',
  'thậm chí', 'đặc biệt là', 'đặc biệt', 'nhất là', 'quan trọng hơn',
];

function classifyPhrase(phrase: string): string {
  const p = phrase.trim().replace(/[\p{P}\p{S}]+/gu, ' ').trim();
  if (ENUMERATION_RE.test(p)) return '1-hand';
  if (EMPHASIS_RE.test(p)) return 'point-up';
  // Prefix match: LLM may return longer variant e.g. "kế tiếp sau" → check "kế tiếp"
  const tokens = p.split(/\s+/);
  for (let len = tokens.length - 1; len >= 1; len--) {
    const prefix = tokens.slice(0, len).join(' ');
    if (ENUMERATION_RE.test(prefix)) return '1-hand';
    if (EMPHASIS_RE.test(prefix)) return 'point-up';
  }
  return '2-hand';
}

// Phrases that only function as từ nối when clause-initial.
// Reject matches where the preceding word has no punctuation — it's likely embedded in a phrase
// (e.g. "nhanh hơn nữa" = "even faster", not "furthermore").
// "vậy" mid-phrase = "như vậy" (like that), "đến vậy" (to that extent) — not connectors.
// Only clause-initial "Vậy..." (meaning "So...") qualifies.
const CLAUSE_INITIAL_ONLY = new Set(['hơn nữa', 'nhất là', 'vậy']);

function findAllOccurrences(phrase: string, words: WordToken[]): number[][] {
  const phraseTokens = phrase.trim().split(/\s+/).map(strip).filter(Boolean);
  if (!phraseTokens.length) return [];
  const normWords = words.map(w => strip(w.word));
  const clauseInitialOnly = CLAUSE_INITIAL_ONLY.has(phraseTokens.join(' '));
  const results: number[][] = [];
  for (let i = 0; i <= words.length - phraseTokens.length; i++) {
    if (phraseTokens.every((pt, j) => normWords[i + j] === pt)) {
      if (clauseInitialOnly && i > 0 && !/[\p{P}]/u.test(words[i - 1].word)) continue;
      results.push(Array.from({ length: phraseTokens.length }, (_, j) => i + j));
    }
  }
  return results;
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

  // 1. Whisper: transcribe with word-level timestamps
  let words: WordToken[];
  let fullText: string;
  let audioDuration: number;
  try {
    // Transcode to WAV via FFmpeg before sending to Whisper.
    // Files from TikTok downloaders (tiker.io etc.) are often AAC/M4A with a .mp3 extension
    // which Whisper's format detection rejects. FFmpeg normalises any container/codec.
    const tmpDir = join(tmpdir(), `whisper-${randomUUID()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    const inputPath = join(tmpDir, 'input.bin');
    const wavPath = join(tmpDir, 'audio.wav');
    await fs.writeFile(inputPath, Buffer.from(await audioFile.arrayBuffer()));
    await execAsync(
      `ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}"`,
      { timeout: 60_000 }
    );
    const wavBuf = await fs.readFile(wavPath);
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    const file = await toFile(wavBuf, 'audio.wav', { type: 'audio/wav' });
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

  // 2. LLM: receive plain text, return exact phrase strings (deduplicated)
  let phrases: string[] = [];
  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: fullText },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    if (!completion.choices.length) throw new Error('Empty choices from LLM');

    let parsed: unknown = {};
    try { parsed = JSON.parse(completion.choices[0].message.content ?? '{}'); } catch { /* keep {} */ }

    const LLM_BLACKLIST = new Set(['hay', 'và', 'hoặc', 'để', 'mà', 'thì', 'là', 'rồi', 'cũng', 'vì', 'khi']);
    phrases = ((parsed as any).matches ?? []).filter(
      (p: unknown): p is string =>
        typeof p === 'string' &&
        p.trim().length > 0 &&
        !LLM_BLACKLIST.has(strip(p))
    );
  } catch (err) {
    return Response.json({ error: `LLM failed: ${err instanceof Error ? err.message : err}` }, { status: 500 });
  }

  // 3. Code: map phrases → word token occurrences, deduplicate by start index.
  // Merge LLM results with GUARANTEED_TU_NOI to cover words LLM consistently misses.
  const allPhrases = [...new Set([...GUARANTEED_TU_NOI, ...phrases])];
  const seenStart = new Set<number>();
  const indexGroups: number[][] = [];
  for (const phrase of allPhrases) {
    for (const group of findAllOccurrences(phrase, words)) {
      if (!seenStart.has(group[0])) {
        seenStart.add(group[0]);
        indexGroups.push(group);
      }
    }
  }

  // 3b. Inline list scan: detect "như X, Y, Z" pattern (no colon, but comma-separated items).
  // "như" alone is too common to add to GUARANTEED, so scan separately.
  // Primary: check word tokens for comma. Fallback: check fullText (Whisper often omits
  // punctuation from word-level tokens even when it appears in the segment text).
  const listIntroStarts = new Set<number>();
  const lowerFullText = fullText.toLowerCase();

  for (let i = 0; i < words.length; i++) {
    if (strip(words[i].word) !== 'như' || seenStart.has(i)) continue;
    const nextIdx = i + 1;
    if (nextIdx >= words.length) continue;
    if (NOT_LIST_AFTER_NHU.has(strip(words[nextIdx].word))) continue;

    // Primary: word tokens — small window (4) to avoid catching commas from the next sentence.
    const hasCommaInTokens = words.slice(nextIdx, Math.min(nextIdx + 4, words.length))
      .some(w => w.word.includes(','));

    // Fallback: fullText — Whisper often omits punctuation from word-level tokens.
    // Skip "nhưng" and other compounds when counting "như" occurrences (indexOf matches substrings).
    let hasCommaInText = false;
    if (!hasCommaInTokens) {
      const priorNhuCount = words.slice(0, i).filter(w => strip(w.word) === 'như').length;
      let occ = 0, searchFrom = 0, fPos = -1;
      while (occ <= priorNhuCount) {
        const idx = lowerFullText.indexOf('như', searchFrom);
        if (idx === -1) { fPos = -1; break; }
        searchFrom = idx + 1;
        // Skip compounds like "nhưng" — "như" must be followed by a non-letter char
        if (/\p{L}/u.test(lowerFullText[idx + 3] ?? '')) continue;
        fPos = idx;
        occ++;
      }
      if (fPos !== -1) {
        // 20-char window: "như ammonia," → comma at ~9 chars ✓
        // "như nhiều người lầm " → 20 chars, no comma ✓
        hasCommaInText = fullText.slice(fPos, fPos + 20).includes(',');
      }
    }

    if (hasCommaInTokens || hasCommaInText) {
      seenStart.add(i);
      indexGroups.push([i]);
      listIntroStarts.add(i);
    }
  }

  // 4. Resolve → timestamps + classify → sceneKey.
  // List-intro: colon after phrase OR detected by inline list scan → force point-up.
  const markers = indexGroups.map((group) => {
    const phrase = group.map((i) => words[i].word).join(' ');
    const afterIdx = group[group.length - 1] + 1;
    const colonAfter = afterIdx < words.length && words[afterIdx].word.includes(':');
    const isListIntro = colonAfter || listIntroStarts.has(group[0]);
    return {
      start: words[group[0]].start,
      end: words[group[group.length - 1]].end,
      word: phrase,
      sceneKey: isListIntro ? 'point-up' : classifyPhrase(phrase),
      isListIntro,
    };
  }).sort((a, b) => a.start - b.start);

  // 5. Secondary emphasis words → hand filler clips placed at these timestamps within gaps.
  // Emphatic/contrastive Vietnamese patterns that signal a strong or interesting point.
  const SECONDARY_HAND_WORDS = [
    // Negation / correction
    'chứ không phải', 'chứ không', 'không phải là', 'không phải', 'không hề', 'không thể nào',
    // Passive emphasis (something happens to subject)
    'sẽ bị', 'đã bị', 'bị',
    // Strong assertion — "chính là" is one of the most common emphasis markers in Vietnamese
    'đây chính là', 'đó chính là', 'chính là',
    // Contrastive / reveal
    'mà là', 'mà thật ra', 'hóa ra là',
    // Strong assertion / possibility
    'hoàn toàn có thể', 'hoàn toàn', 'chắc chắn', 'nhất định',
    // Reality / clarity
    'thực chất', 'thực sự', 'thật sự',
    // Intensity / scale
    'cực kỳ', 'vô cùng', 'tuyệt đối', 'luôn luôn', 'khổng lồ', 'cực lớn', 'siêu nhỏ',
    // Speed / immediacy
    'lập tức', 'ngay lập tức', 'trong chớp mắt',
    // Ease / result
    'dễ dàng', 'một cách dễ dàng',
    // Approximation / scope
    'hầu như', 'gần như',
    // Engagement
    'tưởng tượng', 'hãy tưởng tượng',
    // Attention / surprise
    'chú ý', 'lưu ý', 'đặc biệt', 'thú vị', 'chưa hết',
  ];
  const seenSecondary = new Set<number>();
  const secondaryMarkers: { start: number; end: number; word: string; sceneKey: string }[] = [];
  for (const phrase of SECONDARY_HAND_WORDS) {
    for (const group of findAllOccurrences(phrase, words)) {
      const startIdx = group[0];
      if (!seenStart.has(startIdx) && !seenSecondary.has(startIdx)) {
        seenSecondary.add(startIdx);
        secondaryMarkers.push({
          start: words[startIdx].start,
          end: words[group[group.length - 1]].end,
          word: group.map(i => words[i].word).join(' '),
          sceneKey: '1-hand',
        });
      }
    }
  }
  secondaryMarkers.sort((a, b) => a.start - b.start);

  // 6. L3: very common clause-boundary words — only used to fill dead zones with no L1/L2.
  const L3_HAND_WORDS = ['và', 'thì', 'khi', 'nếu', 'để', 'cũng', 'vì', 'với'];
  const seenL3 = new Set<number>();
  const tertiaryMarkers: { start: number; end: number; word: string }[] = [];
  for (const phrase of L3_HAND_WORDS) {
    for (const group of findAllOccurrences(phrase, words)) {
      const startIdx = group[0];
      if (!seenStart.has(startIdx) && !seenSecondary.has(startIdx) && !seenL3.has(startIdx)) {
        seenL3.add(startIdx);
        tertiaryMarkers.push({
          start: words[startIdx].start,
          end: words[group[group.length - 1]].end,
          word: group.map(i => words[i].word).join(' '),
        });
      }
    }
  }
  tertiaryMarkers.sort((a, b) => a.start - b.start);

  return Response.json({ transcript: fullText, markers, secondaryMarkers, tertiaryMarkers, audioDuration });
}
