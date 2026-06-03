import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

export const maxDuration = 600;

// sequence item: { sceneIndex: 0|1|2|3|4, duration: number }
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const sequence: { sceneIndex: number; duration: number }[] = JSON.parse(
    formData.get('sequence') as string
  );
  const totalDuration = parseFloat(formData.get('duration') as string);
  const audio = formData.get('audio') as File | null;

  if (!sequence?.length || !totalDuration) {
    return Response.json({ error: 'Missing sequence or duration' }, { status: 400 });
  }

  const tmpDir = join(tmpdir(), `devmerge-${randomUUID()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Save uploaded videos (0–4) to disk
    const videoPaths: (string | null)[] = [null, null, null, null, null];
    for (let i = 0; i < 5; i++) {
      const file = formData.get(`video_${i}`) as File | null;
      if (file) {
        const p = join(tmpDir, `source_${i}.mp4`);
        await fs.writeFile(p, Buffer.from(await file.arrayBuffer()));
        videoPaths[i] = p;
      }
    }

    // Drop clips too short to encode reliably (< 0.5s = fewer than ~15 frames)
    const MIN_CLIP_DUR = 0.5;
    const validSequence = sequence.filter(item => item.duration >= MIN_CLIP_DUR);
    if (!validSequence.length) {
      return Response.json({ error: 'All clips are too short to merge' }, { status: 400 });
    }

    // Build per-segment clips with deflicker applied to smooth AI-video temporal noise
    const segPaths: string[] = [];
    for (let i = 0; i < validSequence.length; i++) {
      const { sceneIndex, duration } = validSequence[i];
      const srcPath = videoPaths[sceneIndex];
      if (!srcPath) {
        return Response.json({ error: `No video uploaded for scene ${sceneIndex}` }, { status: 400 });
      }
      const segPath = join(tmpDir, `seg_${i}.mp4`);
      // deflicker smooths frame-to-frame brightness variance common in AI-generated video
      await execAsync(
        `ffmpeg -y -stream_loop -1 -i "${srcPath}" -t ${duration} -vf "deflicker=size=3:mode=am" -c:v libx264 -pix_fmt yuv420p -an "${segPath}"`,
        { timeout: 60_000 }
      );
      segPaths.push(segPath);
    }

    // Merge all segments with xfade crossfade between each pair of clips.
    // xfade blends the last FADE_DUR seconds of clip N into the first FADE_DUR seconds
    // of clip N+1, hiding both luminance jumps and pose discontinuities.
    // offset formula: cumulative sum of (each clip's duration - FADE_DUR).
    const FADE_DUR = 0.12; // ~3 frames at 25fps — long enough to hide the cut, short enough to not blur the gesture
    const videoPath = join(tmpDir, 'video.mp4');

    if (segPaths.length === 1) {
      await fs.copyFile(segPaths[0], videoPath);
    } else {
      const inputs = segPaths.map(p => `-i "${p}"`).join(' ');
      let filterComplex = '';
      let cumOffset = 0;
      for (let i = 0; i < segPaths.length - 1; i++) {
        // Guard: if a clip is too short for a fade, skip xfade for that cut
        const effectiveFade = Math.min(FADE_DUR, validSequence[i].duration / 2, validSequence[i + 1].duration / 2);
        cumOffset += validSequence[i].duration - effectiveFade;
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

    // Mux audio if provided
    const outputPath = join(tmpDir, 'merged.mp4');
    if (audio) {
      const ext = audio.name.split('.').pop() ?? 'mp3';
      const audioPath = join(tmpDir, `audio.${ext}`);
      await fs.writeFile(audioPath, Buffer.from(await audio.arrayBuffer()));
      await execAsync(
        `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest "${outputPath}"`,
        { timeout: 120_000 }
      );
    } else {
      await fs.copyFile(videoPath, outputPath);
    }

    const buf = await fs.readFile(outputPath);
    return new Response(buf, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="merged.mp4"',
        'Content-Length': String(buf.byteLength),
      },
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
