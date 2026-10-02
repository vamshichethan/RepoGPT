import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'https://repogpt-backend-shf2.onrender.com'
).replace(/\/+$/, '');

async function proxyRequest(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const targetPath = path.join('/');
  const search = request.nextUrl.search;
  const targetUrl = `${BACKEND_URL}/api/${targetPath}${search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    // Exclude host header to avoid SSL/SNI conflicts
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  });

  try {
    const body =
      ['GET', 'HEAD'].includes(request.method) ? undefined : await request.blob();

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      // @ts-ignore
      duplex: 'half',
    });

    // Check if the response is an SSE stream
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      responseHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error(`Proxy error connecting to ${targetUrl}:`, error);
    return NextResponse.json(
      {
        error: 'Backend communication error',
        detail: error?.message || 'Unable to reach backend service',
      },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
export const PATCH = proxyRequest;
export const dynamic = 'force-dynamic';
