import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, OfflineError, type DocumentSummaryItem, type PendingReview, type ReviewItem } from './api';

/**
 * Couche de stockage local et synchronisation.
 *
 * Ce qui est réellement consultable hors connexion (et pas seulement annoncé) :
 *  - la bibliothèque (liste des cours déjà synchronisés) ;
 *  - les résumés et fiches déjà téléchargés explicitement par l'étudiant ;
 *  - les cartes de révision dues, avec file d'attente de réponses.
 *
 * Ce qui NÉCESSITE Internet, indiqué dans l'interface : génération IA,
 * import de documents, correction d'évaluation, assistant. Aucun écran ne
 * prétend faire fonctionner une IA distante hors ligne.
 */

const KEYS = {
  library: 'memo.offline.library',
  documents: (id: string) => `memo.offline.document.${id}`,
  reviews: 'memo.offline.reviews',
  queue: 'memo.offline.reviewQueue',
  lastSync: 'memo.offline.lastSync',
};

export interface OfflineDocument {
  id: string;
  title: string;
  summary: unknown;
  revisionSheet: unknown;
  downloadedAt: number;
}

export async function cacheLibrary(items: DocumentSummaryItem[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.library, JSON.stringify({ items, at: Date.now() }));
}

export async function readCachedLibrary(): Promise<{ items: DocumentSummaryItem[]; at: number } | null> {
  const raw = await AsyncStorage.getItem(KEYS.library);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { items: DocumentSummaryItem[]; at: number };
  } catch {
    return null;
  }
}

export async function downloadDocument(
  id: string,
  payload: { title: string; summary: unknown; revisionSheet: unknown },
): Promise<OfflineDocument> {
  const record: OfflineDocument = { id, ...payload, downloadedAt: Date.now() };
  await AsyncStorage.setItem(KEYS.documents(id), JSON.stringify(record));
  return record;
}

export async function hasOfflineDocument(id: string): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.documents(id))) !== null;
}

export async function getOfflineDocument(id: string): Promise<OfflineDocument | null> {
  const raw = await AsyncStorage.getItem(KEYS.documents(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OfflineDocument;
  } catch {
    return null;
  }
}

export async function removeOfflineDocument(id: string): Promise<void> {
  await AsyncStorage.removeItem(KEYS.documents(id));
}

export async function listOfflineDocuments(): Promise<OfflineDocument[]> {
  const keys = await AsyncStorage.getAllKeys();
  const relevant = keys.filter((key) => key.startsWith('memo.offline.document.'));
  const entries = await AsyncStorage.multiGet(relevant);
  return entries
    .map(([, value]) => {
      if (!value) return null;
      try {
        return JSON.parse(value) as OfflineDocument;
      } catch {
        return null;
      }
    })
    .filter((value): value is OfflineDocument => value !== null);
}

export async function cacheReviews(items: ReviewItem[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.reviews, JSON.stringify({ items, at: Date.now() }));
}

export async function readCachedReviews(): Promise<{ items: ReviewItem[]; at: number } | null> {
  const raw = await AsyncStorage.getItem(KEYS.reviews);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { items: ReviewItem[]; at: number };
  } catch {
    return null;
  }
}

export async function queueReview(review: Omit<PendingReview, 'localId' | 'createdAt'>): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.queue);
  const queue: PendingReview[] = raw ? (JSON.parse(raw) as PendingReview[]) : [];
  const pending: PendingReview = {
    ...review,
    localId: `${review.flashcardId}-${Date.now()}`,
    createdAt: Date.now(),
  };
  queue.push(pending);
  await AsyncStorage.setItem(KEYS.queue, JSON.stringify(queue));
}

export async function readQueue(): Promise<PendingReview[]> {
  const raw = await AsyncStorage.getItem(KEYS.queue);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingReview[];
  } catch {
    return [];
  }
}

/**
 * Synchronisation : envoie les révisions en attente. Chaque réponse réussie est
 * retirée de la file ; en cas d'échec réseau, la file est conservée telle quelle
 * (aucune perte, aucun doublon côté serveur car l'API est idempotente par carte).
 */
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  const queue = await readQueue();
  if (queue.length === 0) return { sent: 0, remaining: 0 };

  const remaining: PendingReview[] = [];
  let sent = 0;

  for (const item of queue) {
    try {
      await api('/learning/reviews', {
        method: 'POST',
        body: JSON.stringify({ flashcardId: item.flashcardId, grade: item.grade, durationMs: item.durationMs }),
      });
      sent += 1;
    } catch (error) {
      if (error instanceof OfflineError) {
        remaining.push(item);
      } else {
        // Erreur métier (carte supprimée…) : on abandonne cet élément pour ne
        // pas bloquer la file indéfiniment, en journalisant côté client.
        console.warn(`Révision abandonnée (${item.flashcardId}) :`, (error as Error).message);
      }
    }
  }

  await AsyncStorage.setItem(KEYS.queue, JSON.stringify(remaining));
  await AsyncStorage.setItem(KEYS.lastSync, String(Date.now()));
  return { sent, remaining: remaining.length };
}

export async function lastSyncAt(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(KEYS.lastSync);
  return raw ? Number(raw) : null;
}

/* -------------------------------------------------------------------------- */
/*  File d'attente des imports (mode hors connexion)                          */
/* -------------------------------------------------------------------------- */

export interface PendingUpload {
  localId: string;
  name: string;
  uri: string;
  mimeType: string;
  /** Contenu encodé, uniquement si le système ne garantit pas la persistance de l'URI. */
  base64?: string;
  createdAt: number;
}

const UPLOAD_QUEUE_KEY = 'memo.offline.uploadQueue';

/**
 * Met un import en attente. Le fichier choisi reste dans le cache de
 * l'application : on conserve son URI, jamais son contenu binaire en clair
 * dans le stockage local.
 */
export async function enqueueUpload(input: Omit<PendingUpload, 'localId' | 'createdAt'>): Promise<PendingUpload> {
  const queue = await readUploadQueue();
  const entry: PendingUpload = {
    ...input,
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  await AsyncStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify([...queue, entry]));
  return entry;
}

export async function readUploadQueue(): Promise<PendingUpload[]> {
  try {
    const raw = await AsyncStorage.getItem(UPLOAD_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as PendingUpload[]) : [];
  } catch {
    return [];
  }
}

export async function removeUpload(localId: string): Promise<void> {
  const queue = await readUploadQueue();
  await AsyncStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify(queue.filter((entry) => entry.localId !== localId)));
}
