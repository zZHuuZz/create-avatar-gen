import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const CACHE_DIR = join(tmpdir(), 'framepack-clip-cache');

async function ensureDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

export async function getClipPath(jobId: string, frampackUrl: string): Promise<string> {
  await ensureDir();
  const cached = join(CACHE_DIR, `${jobId}.mp4`);
  try {
    await fs.access(cached);
    return cached;
  } catch {
    const upstream = `${frampackUrl.replace(/\/$/, '')}/api/download/${jobId}`;
    const res = await fetch(upstream, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`FramePack returned ${res.status} for job "${jobId}" — regenerate this scene and try again`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(cached, buf);
    return cached;
  }
}

export async function getClipBuffer(jobId: string, frampackUrl: string): Promise<Buffer> {
  const p = await getClipPath(jobId, frampackUrl);
  return fs.readFile(p);
}
