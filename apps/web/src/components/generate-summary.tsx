'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function GenerateSummaryPanel({
  documentId,
  hasSummary,
  compact = false,
}: {
  documentId: string;
  hasSummary: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [level, setLevel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string[]>([]);

  async function generate(regenerate: boolean) {
    setBusy(true);
    setError(null);
    setWarning([]);
    try {
      const response = await fetch(`/api/proxy/documents/${documentId}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: level || undefined, regenerate, save: true }),
      });
      const body = (await response.json()) as { message?: string; code?: string; warnings?: string[] };
      if (!response.ok) {
        setError(
          body.code === 'QUOTA_EXCEEDED'
            ? (body.message ?? 'Quota de générations atteint pour votre offre.')
            : (body.message ?? 'La génération a échoué.'),
        );
        setBusy(false);
        return;
      }
      setWarning(body.warnings ?? []);
      router.refresh();
      setBusy(false);
    } catch {
      setError('Connexion interrompue. Réessayez : aucune donnée n’a été perdue.');
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => generate(true)}
        disabled={busy}
        className="rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-semibold hover:border-memo-300 disabled:opacity-50"
      >
        {busy ? 'Régénération…' : hasSummary ? 'Régénérer le résumé' : 'Générer le résumé'}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="level" className="mb-1.5 block text-sm font-semibold">
            Niveau de l&apos;étudiant (facultatif)
          </label>
          <input
            id="level"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            placeholder="Licence 2, Terminale C…"
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => generate(hasSummary)}
          disabled={busy}
          className="rounded-xl bg-memo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-memo-700 disabled:opacity-50"
        >
          {busy ? 'Génération…' : hasSummary ? 'Régénérer' : 'Générer le résumé'}
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {warning.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          {warning.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
