export interface FramePackJobConfig {
  prompt: string;
  negativePrompt?: string;
  duration: number;
  steps: number;
  guidanceScale: number;
  seed: number;
  useTeacache: boolean;
  endImageBase64?: string;
}

function stripDataUrl(base64: string): string {
  return base64.replace(/^data:[^,]+,/, '');
}

export async function submitJob(
  imageBase64: string,
  apiUrl: string,
  config: FramePackJobConfig
): Promise<string> {
  const url = apiUrl.replace(/\/$/, '');
  const buf = Buffer.from(stripDataUrl(imageBase64), 'base64');

  const form = new FormData();
  form.append('image', new Blob([buf], { type: 'image/png' }), 'input.png');
  form.append('prompt', config.prompt);
  if (config.negativePrompt) form.append('negative_prompt', config.negativePrompt);
  form.append('duration', String(config.duration));
  form.append('steps', String(config.steps));
  form.append('guidance_scale', String(config.guidanceScale));
  form.append('seed', String(config.seed));
  form.append('use_teacache', config.useTeacache ? 'true' : 'false');

  if (config.endImageBase64) {
    const endBuf = Buffer.from(stripDataUrl(config.endImageBase64), 'base64');
    form.append('end_image', new Blob([endBuf], { type: 'image/png' }), 'end.png');
  }

  const res = await fetch(`${url}/api/inference`, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`FramePack submit failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.job_id as string;
}

export async function pollJobSSE(
  apiUrl: string,
  jobId: string,
  onProgress: (pct: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const url = `${apiUrl.replace(/\/$/, '')}/api/status/${jobId}`;

  while (true) {
    if (signal?.aborted) throw new Error('Aborted');

    try {
      const res = await fetch(url, { signal });
      if (!res.ok || !res.body) throw new Error(`Status ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) return;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (event.type === 'progress') {
            onProgress(Number(event.progress ?? 0));
          } else if (event.type === 'status') {
            if (event.status === 'done') return;
            throw new Error(`FramePack job failed: ${event.error ?? 'unknown error'}`);
          }
        }
      }
    } catch (err: unknown) {
      if (signal?.aborted) throw err;
      const msg = String(err);
      if (msg.includes('ChunkedEncoding') || msg.includes('network') || msg.includes('fetch')) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }
}

export async function checkHealth(apiUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}
