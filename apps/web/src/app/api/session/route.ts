import { NextResponse } from 'next/server';
import { ApiError, SESSION_COOKIE } from '@/lib/api';

const API_BASE = (process.env.API_URL ?? process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000').trim().replace(/\/+$/, '');

type Action = 'login' | 'register' | 'logout' | 'demo';

/**
 * Route serveur d'authentification : le jeton renvoyé par l'API est stocké dans
 * un cookie httpOnly, jamais renvoyé au JavaScript client.
 *
 * L'action `demo` permet à un testeur invité d'entrer en un clic sur le compte
 * de démonstration étudiant. Elle est conditionnée par ALLOW_DEMO_LOGIN=true
 * (activé par défaut en développement, désactivé en production) et par
 * l'existence réelle du compte — aucun compte n'est créé à la volée.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { action?: Action; [key: string]: unknown };
  const action = body.action;

  try {
    if (action === 'logout') {
      const token = request.headers.get('cookie')?.match(/memo_session=([^;]+)/)?.[1];
      if (token) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${decodeURIComponent(token)}` },
        }).catch(() => undefined);
      }
      const response = NextResponse.json({ success: true });
      response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
      return response;
    }

    let endpoint = action === 'register' ? 'register' : 'login';
    let payload = (body.payload ?? {}) as Record<string, unknown>;

    if (action === 'demo') {
      const allowed = (process.env.ALLOW_DEMO_LOGIN ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')) === 'true';
      if (!allowed) {
        return NextResponse.json(
          {
            message:
              "L'accès invité est désactivé sur cette instance. Créez votre compte (gratuit) pour tester l'application.",
          },
          { status: 403 },
        );
      }
      endpoint = 'login';
      payload = {
        email: process.env.DEMO_STUDENT_EMAIL ?? 'etudiant@demo.memo-campus.cm',
        password: process.env.DEMO_STUDENT_PASSWORD ?? 'MemoCampus2026!',
      };
    }

    const response = await fetch(`${API_BASE}/api/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as { token?: string; user?: unknown; message?: string; details?: unknown };
    if (!response.ok || !result.token) {
      return NextResponse.json(
        { message: result.message ?? 'Échec de la connexion.', details: result.details },
        { status: response.status },
      );
    }

    const next = NextResponse.json({ user: result.user });
    next.cookies.set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 86_400,
    });
    return next;
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Service momentanément indisponible.' },
      { status },
    );
  }
}
