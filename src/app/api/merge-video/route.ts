import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { getClipPath } from '@/lib/clip-cache';

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
  const useConcat = formData.get('concat') === 'true';
  const customFade = parseFloat((formData.get('crossfadeDuration') as string) ?? '');
  const FADE_DUR = !isNaN(customFade) ? Math.min(customFade, 0.5) : 0.12;

  if (!sequence?.length || !totalDuration) {
    return Response.json({ error: 'Missing sequence or duration' }, { status: 400 });
  }

  const tmpDir = join(tmpdir(), `merge-${randomUUID()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // 1. Resolve each unique clip from local cache (downloading from FramePack only if not
    // already cached). This prevents 404s when FramePack expires old job results.
    const clipPaths = new Map<string, string>();
    const clipActualDurations = new Map<string, number>();
    const uniqueJobs = [...new Map(sequence.map(s => [s.jobId, s])).values()];

    await Promise.all(uniqueJobs.map(async (item) => {
      const p = await getClipPath(item.jobId, item.frampackUrl);
      clipPaths.set(item.jobId, p);
      try {
        const { stdout } = await execAsync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${p}"`,
          { timeout: 10_000 }
        );
        const d = parseFloat(stdout.trim());
        if (!isNaN(d)) clipActualDurations.set(item.jobId, d);
      } catch { /* fall back to config duration */ }
    }));

    // 2. For each segment, trim/loop the source to the desired duration.
    // Only use stream_loop when the source is shorter than requested (e.g. idle clips
    // stretched to fill a gap). For posed clips (A/B/C), FramePack generates at ~8fps so
    // the source duration already matches the config — no loop needed, no seam created.
    const segPaths: string[] = [];
    for (let i = 0; i < sequence.length; i++) {
      const item = sequence[i];
      const srcPath = clipPaths.get(item.jobId)!;
      const segPath = join(tmpDir, `seg_${i}.mp4`);
      const srcActualDur = clipActualDurations.get(item.jobId) ?? 0;
      // In concat mode (posed A+B+C) never loop — use source as-is to avoid
      // replaying frame 0 when the clip is a few ms short of the config duration.
      const needsLoop = !useConcat && srcActualDur > 0 && item.duration > srcActualDur + 0.02;
      const loopFlag = needsLoop ? '-stream_loop -1' : '';
      await execAsync(
        `ffmpeg -y ${loopFlag} -i "${srcPath}" -t ${item.duration} -vf "deflicker=size=3:mode=am" -c:v libx264 -pix_fmt yuv420p -an "${segPath}"`,
        { timeout: 60_000 }
      );
      segPaths.push(segPath);
    }

    // Probe actual encoded duration of each segment.
    // AI video generators (FramePack) output at a fixed FPS (e.g. 8fps), so a 0.8s request
    // produces 6 frames = 0.75s actual. Using config duration in xfade offsets would push
    // the transition past the real clip end, causing FFmpeg to read the stream_loop seam
    // (which replays frame 0 — the starting pose), creating a visible snap-back jump.
    const segDurations = await Promise.all(
      segPaths.map(async (p, i) => {
        try {
          const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${p}"`,
            { timeout: 10_000 }
          );
          const d = parseFloat(stdout.trim());
          return isNaN(d) ? sequence[i].duration : d;
        } catch {
          return sequence[i].duration;
        }
      })
    );

    // 3. Merge segments — either hard concat or xfade crossfade.
    const videoPath = join(tmpDir, 'video.mp4');

    if (segPaths.length === 1) {
      await fs.copyFile(segPaths[0], videoPath);
    } else if (useConcat) {
      // Hard concat: join clips with no blending (used for A+B+C posed scene merges).
      const inputs = segPaths.map(p => `-i "${p}"`).join(' ');
      const filterInputs = segPaths.map((_, i) => `[${i}:v]`).join('');
      await execAsync(
        `ffmpeg -y ${inputs} -filter_complex "${filterInputs}concat=n=${segPaths.length}:v=1:a=0[out]" -map "[out]" -c:v libx264 -pix_fmt yuv420p -an "${videoPath}"`,
        { timeout: 120_000 }
      );
    } else {
      // xfade crossfade between each pair of clips.
      // offset formula: cumulative sum of (each clip's ACTUAL duration - FADE_DUR).
      const inputs = segPaths.map(p => `-i "${p}"`).join(' ');
      let filterComplex = '';
      let cumOffset = 0;
      for (let i = 0; i < segPaths.length - 1; i++) {
        const effectiveFade = Math.min(FADE_DUR, segDurations[i] / 2, segDurations[i + 1] / 2);
        cumOffset += segDurations[i] - effectiveFade;
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
