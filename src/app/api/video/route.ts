import { getClipBuffer } from '@/lib/clip-cache';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const frampackUrl = searchParams.get('url');
  const jobId = searchParams.get('jobId');

  if (!frampackUrl || !jobId) {
    return new Response('Missing url or jobId', { status: 400 });
  }

  try {
    const buf = await getClipBuffer(jobId, frampackUrl);
    return new Response(buf.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="scene-${jobId}.mp4"`,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    return new Response(String(err), { status: 502 });
  }
}
