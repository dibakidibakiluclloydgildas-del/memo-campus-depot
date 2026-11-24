import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

/**
 * Client API de l'application Android.
 *
 * Sécurité : le jeton de session est stocké dans le Keystore Android via
 * expo-secure-store (jamais dans AsyncStorage, qui est en clair). Aucune clé
 * d'IA ni secret d'API n'est présent dans le bundle : tout passe par l'API.
 */

const TOKEN_KEY = 'memo.session.token';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://10.0.2.2:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Erreur spécifique au mode hors connexion : l'UI propose les données locales. */
export class OfflineError extends Error {
  constructor() {
    super('Vous êtes hors connexion. Les contenus déjà téléchargés restent consultables.');
    this.name = 'OfflineError';
  }
}

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, { ...init, headers });
  } catch {
    throw new OfflineError();
  }

  if (!response.ok) {
    let body: { code?: string; message?: string } = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    throw new ApiError(response.status, body.code ?? 'API_ERROR', body.message ?? 'Une erreur est survenue.');
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/* -------------------------------------------------------------------------- */
/*  Types de réponse (alignés sur les contrats de l'API)                       */
/* -------------------------------------------------------------------------- */

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  role: string;
  planCode: string;
  institution: string | null;
  level: string | null;
}

export interface DocumentSummaryItem {
  id: string;
  title: string;
  status: string;
  progress: number;
  pageCount: number | null;
  subject: { name: string; color: string } | null;
  _count: { chapters: number; chunks: number; summaries: number };
}

export interface ReviewItem {
  id: string;
  question: string;
  answer: string;
  hint: string | null;
  subject: { name: string; color: string } | null;
  masteryScore: number;
  masteryStatus: string;
  why: string;
}

export const auth = {
  async login(email: string, password: string): Promise<Profile> {
    const result = await api<{ token: string; user: Profile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    await setToken(result.token);
    return result.user;
  },
  async register(input: {
    email: string;
    password: string;
    displayName: string;
    institution?: string;
    level?: string;
    acceptTerms: true;
  }): Promise<Profile> {
    const result = await api<{ token: string; user: Profile }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await setToken(result.token);
    return result.user;
  },
  async me(): Promise<Profile> {
    return api<Profile>('/auth/me');
  },
  async logout(): Promise<void> {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await setToken(null);
  },
};

/**
 * File d'attente hors connexion : les actions d'apprentissage (révisions) sont
 * conservées localement puis envoyées à la reconnexion, sans doublon.
 */
export interface PendingReview {
  flashcardId: string;
  grade: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
  durationMs: number;
  localId: string;
  createdAt: number;
}
