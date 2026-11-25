import { cookies } from 'next/headers';

const API_BASE = (process.env.API_URL ?? process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000').trim().replace(/\/+$/, '');
export const SESSION_COOKIE = 'memo_session';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/**
 * Appel serveur vers l'API NestJS.
 * Le jeton de session reste dans un cookie httpOnly : il n'est jamais exposé
 * au JavaScript du navigateur (protection contre le vol de session par XSS).
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const store = await cookies();
  const token = init.token ?? store.get(SESSION_COOKIE)?.value ?? null;

  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    let body: { code?: string; message?: string; details?: unknown } = {};
    try {
      body = await response.json();
    } catch {
      body = { message: `Erreur ${response.status}` };
    }
    throw new ApiError(
      response.status,
      body.code ?? 'API_ERROR',
      body.message ?? 'Une erreur est survenue.',
      body.details,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Renvoie `null` au lieu de lever sur 401 : utilisé par le layout. */
export async function apiFetchOptional<T>(path: string): Promise<T | null> {
  try {
    return await apiFetch<T>(path);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
}

export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Africa/Douala',
  }).format(date);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function formatRelative(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = date.getTime() - Date.now();
  const minutes = Math.round(diff / 60_000);
  const formatter = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}
