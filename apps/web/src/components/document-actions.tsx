'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DocumentActions({ documentId, archived }: { documentId: string; archived: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function call(path: string, method: string, body?: unknown, label = '') {
    setBusy(label);
    setMessage(null);
    const response = await fetch(`/api/proxy${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    setBusy(null);
    if (!response.ok) {
      setMessage(payload.message ?? 'Action impossible.');
      return false;
    }
    return true;
  }

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] p-4">
      <p className="text-sm font-semibold">Gestion du cours</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            if (await call(`/documents/${documentId}/reprocess`, 'POST', undefined, 'reprocess')) {
              setMessage('Nouvelle analyse lancée. La progression est visible sur cette page.');
              router.refresh();
            }
          }}
          className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold hover:border-memo-300 disabled:opacity-50"
        >
          {busy === 'reprocess' ? 'Lancement…' : "Relancer l'analyse"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            if (await call(`/documents/${documentId}/archive`, 'PATCH', { archived: !archived }, 'archive')) {
              setMessage(archived ? 'Cours restauré.' : 'Cours archivé.');
              router.refresh();
            }
          }}
          className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold hover:border-memo-300 disabled:opacity-50"
        >
          {archived ? 'Restaurer' : 'Archiver'}
        </button>

        {confirming ? (
          <span className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                if (await call(`/documents/${documentId}`, 'DELETE', undefined, 'delete')) {
                  router.push('/bibliotheque');
                  router.refresh();
                }
              }}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirmer la suppression
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold"
            >
              Annuler
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Supprimer
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        La suppression efface définitivement le fichier original, les pages extraites, les chapitres et les contenus
        associés.
      </p>
      {message ? (
        <p className="mt-2 rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-xs" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
