import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

export const maxDuration = 600;

// sequence item: { sceneIndex: 0|1|2|3, duration: number }
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
    // Save uploaded videos (0–3) to disk
    const videoPaths: (string | null)[] = [null, null, null, null];
    for (let i = 0; i < 4; i++) {
      const file = formData.get(`video_${i}`) as File | null;
      if (file) {
        const p = join(tmpDir, `source_${i}.mp4`);
        await fs.writeFile(p, Buffer.from(await file.arrayBuffer()));
        videoPaths[i] = p;
      }
    }

    // Build per-segment clips
    const segPaths: string[] = [];
    for (let i = 0; i < sequence.length; i++) {
      const { sceneIndex, duration } = sequence[i];
      const srcPath = videoPaths[sceneIndex];
      if (!srcPath) {
        return Response.json({ error: `No video uploaded for scene ${sceneIndex}` }, { status: 400 });
      }
      const segPath = join(tmpDir, `seg_${i}.mp4`);
      await execAsync(
        `ffmpeg -y -stream_loop -1 -i "${srcPath}" -t ${duration} -c:v libx264 -pix_fmt yuv420p -an "${segPath}"`,
        { timeout: 60_000 }
      );
      segPaths.push(segPath);
    }

    // Concat all segments
    const concatPath = join(tmpDir, 'concat.txt');
    await fs.writeFile(concatPath, segPaths.map(p => `file '${p}'`).join('\n'));

    const videoPath = join(tmpDir, 'video.mp4');
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${concatPath}" -c copy "${videoPath}"`,
      { timeout: 120_000 }
    );

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
