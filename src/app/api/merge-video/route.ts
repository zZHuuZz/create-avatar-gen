import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

export const maxDuration = 600;

interface SequenceItem {
  frampackUrl: string;
  jobId: string;
  label: string;
  duration: number; // desired output duration for this segment in seconds
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const audio = formData.get('audio') as File | null;
  const totalDuration = parseFloat(formData.get('duration') as string);
  const sequence: SequenceItem[] = JSON.parse(formData.get('sequence') as string);

  if (!sequence?.length || !totalDuration) {
    return Response.json({ error: 'Missing sequence or duration' }, { status: 400 });
  }

  const tmpDir = join(tmpdir(), `merge-${randomUUID()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // 1. Fetch each unique clip once
    const clipPaths = new Map<string, string>();
    const uniqueJobs = [...new Map(sequence.map(s => [s.jobId, s])).values()];

    await Promise.all(uniqueJobs.map(async (item, i) => {
      const upstream = `${item.frampackUrl.replace(/\/$/, '')}/api/download/${item.jobId}`;
      const res = await fetch(upstream, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`Failed to fetch clip "${item.label}": HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const p = join(tmpDir, `source_${i}.mp4`);
      await fs.writeFile(p, Buffer.from(buf));
      clipPaths.set(item.jobId, p);
    }));

    // 2. For each segment, loop the source clip to exactly fill the segment duration.
    // deflicker smooths frame-to-frame brightness variance common in AI-generated video.
    const segPaths: string[] = [];
    for (let i = 0; i < sequence.length; i++) {
      const item = sequence[i];
      const srcPath = clipPaths.get(item.jobId)!;
      const segPath = join(tmpDir, `seg_${i}.mp4`);
      await execAsync(
        `ffmpeg -y -stream_loop -1 -i "${srcPath}" -t ${item.duration} -vf "deflicker=size=3:mode=am" -c:v libx264 -pix_fmt yuv420p -an "${segPath}"`,
        { timeout: 60_000 }
      );
      segPaths.push(segPath);
    }

    // 3. Merge all segments with xfade crossfade between each pair of clips.
    // xfade blends the last FADE_DUR seconds of clip N into the first FADE_DUR seconds
    // of clip N+1, hiding both luminance jumps and pose discontinuities.
    // offset formula: cumulative sum of (each clip's duration - FADE_DUR).
    const FADE_DUR = 0.12;
    const videoPath = join(tmpDir, 'video.mp4');

    if (segPaths.length === 1) {
      await fs.copyFile(segPaths[0], videoPath);
    } else {
      const inputs = segPaths.map(p => `-i "${p}"`).join(' ');
      let filterComplex = '';
      let cumOffset = 0;
      for (let i = 0; i < segPaths.length - 1; i++) {
        const effectiveFade = Math.min(FADE_DUR, sequence[i].duration / 2, sequence[i + 1].duration / 2);
        cumOffset += sequence[i].duration - effectiveFade;
        const inLabel = i === 0 ? '[0:v]' : `[v${i}]`;
        const outLabel = i === segPaths.length - 2 ? '[out]' : `[v${i + 1}]`;
        filterComplex += `${inLabel}[${i + 1}:v]xfade=transition=fade:duration=${effectiveFade.toFixed(3)}:offset=${cumOffset.toFixed(3)}${outLabel}`;
        if (i < segPaths.length - 2) filterComplex += ';';
      }
      await execAsync(
        `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[out]" -c:v libx264 -pix_fmt yuv420p -an "${videoPath}"`,
        { timeout: 120_000 }
      );
    }

    // 4. Optionally mux audio
    let audioPath: string | null = null;
    if (audio) {
      const ext = audio.name.split('.').pop() ?? 'mp3';
      audioPath = join(tmpDir, `audio.${ext}`);
      await fs.writeFile(audioPath, Buffer.from(await audio.arrayBuffer()));
    }

    const outputPath = join(tmpDir, 'merged.mp4');
    if (audioPath) {
      await execAsync(
        `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest "${outputPath}"`,
        { timeout: 120_000 }
      );
    } else {
      await fs.copyFile(videoPath, outputPath);
    }

    const outputBuf = await fs.readFile(outputPath);
    return new Response(outputBuf, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="merged.mp4"',
        'Content-Length': String(outputBuf.byteLength),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
