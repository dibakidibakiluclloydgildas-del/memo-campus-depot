'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface ReviewItem {
  id: string;
  question: string;
  answer: string;
  hint: string | null;
  subject: { name: string; color: string } | null;
  masteryScore: number;
  masteryStatus: string;
  why: string;
}

const GRADES = [
  { key: 'AGAIN', label: 'Oublié', hint: 'Revoir très bientôt', tone: 'border-red-300 text-red-700 hover:bg-red-50' },
  { key: 'HARD', label: 'Difficile', hint: 'Intervalle réduit', tone: 'border-amber-300 text-amber-700 hover:bg-amber-50' },
  { key: 'GOOD', label: 'Bien', hint: 'Intervalle normal', tone: 'border-sky-300 text-sky-700 hover:bg-sky-50' },
  { key: 'EASY', label: 'Facile', hint: 'Intervalle allongé', tone: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50' },
] as const;

/**
 * Session de rappel actif.
 * L'étudiant doit d'abord restituer mentalement : la réponse n'apparaît
 * qu'après une action explicite (pas d'auto-révélation au bout de 3 s, qui
 * transformerait le rappel actif en simple relecture).
 */
export function ReviewSession({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const current = items[index];

  useEffect(() => {
    setStartedAt(Date.now());
    setRevealed(false);
    setHintShown(false);
    setFeedback(null);
    cardRef.current?.focus();
  }, [index]);

  if (!current) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <p className="text-2xl" aria-hidden>
          🎉
        </p>
        <p className="mt-2 font-bold">Session terminée</p>
        <p className="mt-1 text-sm text-muted">
          {done} carte(s) revue(s). Les prochaines révisions sont programmées automatiquement selon vos résultats.
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-4 rounded-xl bg-memo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-memo-700"
        >
          Actualiser mes révisions
        </button>
      </div>
    );
  }

  async function grade(value: (typeof GRADES)[number]['key']) {
    if (!current) return;
    setBusy(true);
    setError(null);
    const response = await fetch('/api/proxy/learning/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flashcardId: current.id,
        grade: value,
        durationMs: Date.now() - startedAt,
      }),
    });
    const body = (await response.json()) as { explanation?: string; message?: string };
    setBusy(false);
    if (!response.ok) {
      setError(body.message ?? "La révision n'a pas pu être enregistrée. Vos données sont intactes : réessayez.");
      return;
    }
    setFeedback(body.explanation ?? null);
    setDone((count) => count + 1);
    setTimeout(() => {
      setIndex((currentIndex) => currentIndex + 1);
    }, 900);
  }

  const progress = ((index + (revealed ? 0.5 : 0)) / items.length) * 100;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>
          Carte {index + 1} sur {items.length}
        </span>
        <span>Maîtrise : {current.masteryScore}/100</span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className="h-full rounded-full bg-memo-600 transition-[width]" style={{ width: `${progress}%` }} />
      </div>

      <div
        ref={cardRef}
        tabIndex={-1}
        className="surface rounded-2xl p-5 sm:p-7"
        aria-live="polite"
      >
        {current.subject ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: current.subject.color }}>
            {current.subject.name}
          </p>
        ) : null}

        <p className="text-lg font-bold leading-snug sm:text-xl">{current.question}</p>

        {!revealed ? (
          <>
            <p className="mt-3 text-sm text-muted">
              Restituez la réponse <strong>sans regarder votre cours</strong>, puis vérifiez.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="rounded-xl bg-memo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-memo-700"
              >
                Afficher la réponse
              </button>
              {current.hint ? (
                <button
                  type="button"
                  onClick={() => setHintShown(true)}
                  className="rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-semibold hover:border-memo-300"
                >
                  Indice
                </button>
              ) : null}
            </div>
            {hintShown && current.hint ? (
              <p className="mt-3 rounded-xl bg-[var(--surface-muted)] p-3 text-sm">💡 {current.hint}</p>
            ) : null}
          </>
        ) : (
          <>
            <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Réponse attendue</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{current.answer}</p>
            </div>

            <p className="mt-4 text-sm font-semibold">Comment cela s&apos;est-il passé ?</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADES.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  disabled={busy}
                  onClick={() => grade(option.key)}
                  className={`rounded-xl border bg-[var(--surface-raised)] px-3 py-2.5 text-sm font-semibold disabled:opacity-50 ${option.tone}`}
                >
                  {option.label}
                  <span className="mt-0.5 block text-[11px] font-normal opacity-80">{option.hint}</span>
                </button>
              ))}
            </div>

            {feedback ? (
              <p className="mt-3 rounded-xl bg-memo-50 p-3 text-sm text-memo-900 dark:bg-memo-500/10 dark:text-memo-100" role="status">
                {feedback}
              </p>
            ) : null}
            {error ? (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>

      <p className="mt-3 text-xs text-muted">
        <strong>Pourquoi cette carte ?</strong> {current.why}
      </p>
    </div>
  );
}
