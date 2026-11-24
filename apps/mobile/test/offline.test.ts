import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests de la couche hors connexion : stockage local, file d'attente de
 * révisions et synchronisation. AsyncStorage, SecureStore et fetch sont simulés
 * en mémoire — mais la logique testée est celle réellement embarquée dans l'APK.
 */

const memory = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => memory.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: async (key: string) => {
      memory.delete(key);
    },
    getAllKeys: async () => [...memory.keys()],
    multiGet: async (keys: string[]) => keys.map((key) => [key, memory.get(key) ?? null]),
  },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => memory.get(`secure:${key}`) ?? null,
  setItemAsync: async (key: string, value: string) => {
    memory.set(`secure:${key}`, value);
  },
  deleteItemAsync: async (key: string) => {
    memory.delete(`secure:${key}`);
  },
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { apiUrl: 'http://api.test' } } },
}));

type FetchHandler = (url: string, init?: RequestInit) => { status: number; body: unknown } | 'network-error';
let handler: FetchHandler = () => ({ status: 200, body: {} });

globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const result = handler(String(url), init);
  if (result === 'network-error') throw new Error('Network request failed');
  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    json: async () => result.body,
  } as Response;
}) as typeof fetch;

const {
  cacheLibrary,
  cacheReviews,
  downloadDocument,
  flushQueue,
  getOfflineDocument,
  hasOfflineDocument,
  listOfflineDocuments,
  queueReview,
  readCachedLibrary,
  readCachedReviews,
  readQueue,
  removeOfflineDocument,
} = await import('../src/lib/offline');
const { api, OfflineError, setToken } = await import('../src/lib/api');

beforeEach(() => {
  memory.clear();
  handler = () => ({ status: 200, body: {} });
});

describe('stockage local des cours', () => {
  it('met en cache la bibliothèque et la relit', async () => {
    const items = [
      { id: 'd1', title: 'Biologie', status: 'READY', progress: 100, pageCount: 2, subject: null, _count: { chapters: 3, chunks: 3, summaries: 1 } },
    ];
    await cacheLibrary(items as never);
    const cached = await readCachedLibrary();
    expect(cached?.items).toHaveLength(1);
    expect(cached?.items[0]?.title).toBe('Biologie');
    expect(cached?.at).toBeGreaterThan(0);
  });

  it('télécharge un cours pour consultation hors connexion', async () => {
    await downloadDocument('d1', { title: 'Biologie', summary: { generalSummary: 'Texte' }, revisionSheet: null });
    expect(await hasOfflineDocument('d1')).toBe(true);
    const doc = await getOfflineDocument('d1');
    expect(doc?.title).toBe('Biologie');
    expect((doc?.summary as { generalSummary: string }).generalSummary).toBe('Texte');
  });

  it('liste et supprime les téléchargements', async () => {
    await downloadDocument('d1', { title: 'A', summary: {}, revisionSheet: null });
    await downloadDocument('d2', { title: 'B', summary: {}, revisionSheet: null });
    expect(await listOfflineDocuments()).toHaveLength(2);
    await removeOfflineDocument('d1');
    expect(await hasOfflineDocument('d1')).toBe(false);
    expect(await listOfflineDocuments()).toHaveLength(1);
  });

  it('met en cache les révisions du jour', async () => {
    await cacheReviews([
      { id: 'c1', question: 'Q ?', answer: 'R', hint: null, subject: null, masteryScore: 20, masteryStatus: 'FRAGILE', why: 'en retard' },
    ]);
    const cached = await readCachedReviews();
    expect(cached?.items[0]?.question).toBe('Q ?');
  });
});

describe('file d’attente et synchronisation', () => {
  it('conserve les révisions effectuées hors connexion', async () => {
    await queueReview({ flashcardId: 'c1', grade: 'GOOD', durationMs: 5000 });
    await queueReview({ flashcardId: 'c2', grade: 'AGAIN', durationMs: 2000 });
    const queue = await readQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0]?.localId).toBeTruthy();
  });

  it('envoie la file à la reconnexion et la vide', async () => {
    await queueReview({ flashcardId: 'c1', grade: 'GOOD', durationMs: 5000 });
    const sent: string[] = [];
    handler = (url, init) => {
      sent.push(`${url} ${init?.method ?? 'GET'}`);
      return { status: 201, body: { flashcard: { id: 'c1' } } };
    };
    const result = await flushQueue();
    expect(result.sent).toBe(1);
    expect(result.remaining).toBe(0);
    expect(await readQueue()).toHaveLength(0);
    expect(sent[0]).toContain('/learning/reviews');
  });

  it('ne perd rien si le réseau est encore indisponible', async () => {
    await queueReview({ flashcardId: 'c1', grade: 'GOOD', durationMs: 5000 });
    handler = () => 'network-error';
    const result = await flushQueue();
    expect(result.sent).toBe(0);
    expect(result.remaining).toBe(1);
    expect(await readQueue()).toHaveLength(1);
  });

  it('abandonne proprement une révision refusée par le serveur', async () => {
    await queueReview({ flashcardId: 'supprimee', grade: 'GOOD', durationMs: 1000 });
    handler = () => ({ status: 404, body: { code: 'CARD_NOT_FOUND', message: 'Carte introuvable.' } });
    const result = await flushQueue();
    expect(result.sent).toBe(0);
    expect(result.remaining).toBe(0);
    expect(await readQueue()).toHaveLength(0);
  });
});

describe('client API et stockage sécurisé du jeton', () => {
  it('stocke le jeton dans le Keystore sécurisé et l’envoie en en-tête', async () => {
    await setToken('jeton-test');
    let receivedHeader: string | undefined;
    handler = (_url, init) => {
      receivedHeader = (init?.headers as Headers)?.get('Authorization') ?? undefined;
      return { status: 200, body: { id: 'u1' } };
    };
    await api('/auth/me');
    expect(receivedHeader).toBe('Bearer jeton-test');
    expect(memory.get('secure:memo.session.token')).toBe('jeton-test');
  });

  it('lève OfflineError quand le réseau est absent', async () => {
    handler = () => 'network-error';
    await expect(api('/auth/me')).rejects.toBeInstanceOf(OfflineError);
  });

  it('lève ApiError avec le message serveur en cas de refus', async () => {
    handler = () => ({ status: 401, body: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou mot de passe incorrect.' } });
    await expect(api('/auth/login', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'E-mail ou mot de passe incorrect.',
    });
  });
});

describe('import de cours et file d’attente hors connexion', () => {
  it('met un import en attente puis le retire après envoi', async () => {
    const { enqueueUpload, readUploadQueue, removeUpload } = await import('../src/lib/offline');
    const entry = await enqueueUpload({
      name: 'cours.pdf',
      uri: 'file:///cache/cours.pdf',
      mimeType: 'application/pdf',
    });
    expect(entry.localId).toBeTruthy();
    const queue = await readUploadQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.name).toBe('cours.pdf');
    await removeUpload(entry.localId);
    expect(await readUploadQueue()).toHaveLength(0);
  });

  it('conserve plusieurs imports dans l’ordre de sélection', async () => {
    const { enqueueUpload, readUploadQueue } = await import('../src/lib/offline');
    await enqueueUpload({ name: 'a.pdf', uri: 'file:///a.pdf', mimeType: 'application/pdf' });
    await enqueueUpload({ name: 'b.png', uri: 'file:///b.png', mimeType: 'image/png' });
    const queue = await readUploadQueue();
    expect(queue.map((entry) => entry.name)).toEqual(['a.pdf', 'b.png']);
    // Le contenu binaire n'est jamais stocké en clair.
    expect(JSON.stringify(queue)).not.toContain('base64,');
  });
});
