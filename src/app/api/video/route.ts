export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const frampackUrl = searchParams.get('url');
  const jobId = searchParams.get('jobId');

  if (!frampackUrl || !jobId) {
    return new Response('Missing url or jobId', { status: 400 });
  }

  const upstream = `${frampackUrl.replace(/\/$/, '')}/api/download/${jobId}`;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, { signal: AbortSignal.timeout(120_000) });
  } catch (err) {
    return new Response(`Failed to fetch from FramePack: ${err}`, { status: 502 });
  }

  if (!upstreamRes.ok) {
    return new Response(`FramePack returned ${upstreamRes.status}`, { status: 502 });
  }

  return new Response(upstreamRes.body, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="scene-${jobId}.mp4"`,
      'Cache-Control': 'no-store',
    },
  });
}
