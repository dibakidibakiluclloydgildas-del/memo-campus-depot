'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function FlashcardGenerator({ documentId, label = 'Générer des cartes mémoire' }: { documentId: string; label?: string }) {
  const router = useRouter();
  const [count, setCount] = useState(12);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/proxy/documents/${documentId}/flashcards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count, save: true }),
    });
    const body = (await response.json()) as { cards?: unknown[]; message?: string; warnings?: string[] };
    setBusy(false);
    if (!response.ok) {
      setError(body.message ?? 'Génération impossible.');
      return;
    }
    setMessage(`${body.cards?.length ?? 0} carte(s) créée(s). ${(body.warnings ?? []).join(' ')}`);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="count" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            Nombre de cartes
          </label>
          <input
            id="count"
            type="number"
            min={1}
            max={40}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="w-24 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="rounded-xl bg-memo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-memo-700 disabled:opacity-50"
        >
          {busy ? 'Génération…' : label}
        </button>
      </div>
      {message ? (
        <p className="mt-2 text-xs text-progress-600" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
