import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';
const SESSION_COOKIE = 'memo_session';

/**
 * Passerelle navigateur → API.
 *
 * Le navigateur n'appelle jamais l'API directement : il passe par cette route
 * de même origine. Avantages :
 *  - le jeton httpOnly est ajouté côté serveur (aucun secret dans le bundle JS) ;
 *  - pas de CORS en production ;
 *  - la fonctionne aussi dans l'aperçu sandboxé (même origine).
 */
async function handler(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const target = `${API_BASE}/api/${path.join('/')}${request.nextUrl.search}`;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');

  const method = request.method;
  let body: ArrayBuffer | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(target, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      cache: 'no-store',
    });

    const payload = await response.arrayBuffer();
    const responseHeaders = new Headers();
    const responseType = response.headers.get('content-type') ?? 'application/json';
    responseHeaders.set('Content-Type', responseType);
    if (!responseType.includes('application/json')) {
      responseHeaders.set('Content-Disposition', response.headers.get('content-disposition') ?? 'inline');
    }
    return new NextResponse(payload, { status: response.status, headers: responseHeaders });
  } catch {
    return NextResponse.json(
      { code: 'API_UNREACHABLE', message: "Le service MÉMO CAMPUS est momentanément indisponible. Réessayez dans un instant." },
      { status: 503 },
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
