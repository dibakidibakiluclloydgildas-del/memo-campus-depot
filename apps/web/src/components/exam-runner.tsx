'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

interface Question {
  id: string;
  orderIndex: number;
  type: 'MCQ' | 'WRITTEN';
  prompt: string;
  choices: { id: string; text: string }[];
  points: number;
  difficulty: string;
  sourceRef: { page?: number; sectionTitle?: string } | null;
}

interface CorrectionDetail {
  questionId: string;
  type: 'MCQ' | 'WRITTEN';
  points: number;
  awarded: number;
  correct: boolean;
  selectedChoiceIds?: string[];
  correctChoiceIds?: string[];
  explanation?: string;
  misconceptions?: string[];
  rubricBreakdown?: { criterion: string; points: number; awarded: number; matched: boolean }[];
  keyPointsMissed?: string[];
  feedback?: string;
  needsHumanReview?: boolean;
}

interface Result {
  score: number;
  maxScore: number;
  percentage: number;
  mention: string;
  corrections: CorrectionDetail[];
  weakNotions: string[];
  recommendations: string[];
}

const DRAFT_KEY = 'memo-exam-draft';

export function ExamRunner({
  assessmentId,
  title,
  questions,
  durationMinutes,
  subjectName,
}: {
  assessmentId: string;
  title: string;
  questions: Question[];
  durationMinutes: number;
  subjectName: string | null;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string[] | string>>({});
  const [current, setCurrent] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(durationMinutes * 60);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const startedRef = useRef(false);

  // Démarrage côté serveur (le chrono de référence est celui du serveur).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const response = await fetch(`/api/proxy/assessments/${assessmentId}/start`, { method: 'POST' });
      if (response.ok) {
        const body = (await response.json()) as { endsAt?: string };
        if (body.endsAt) setDeadline(new Date(body.endsAt).getTime());
      }
    })();
  }, [assessmentId]);

  // Reprise d'un brouillon (sauvegarde automatique locale).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${DRAFT_KEY}:${assessmentId}`);
      if (raw) {
        const draft = JSON.parse(raw) as { answers: Record<string, string[] | string> };
        setAnswers(draft.answers ?? {});
        setSavedAt(new Date());
      }
    } catch {
      /* brouillon illisible : on repart de zéro sans bloquer */
    }
  }, [assessmentId]);

  // Sauvegarde automatique (débat : locale et non serveur, pour ne jamais
  // envoyer de réponse avant la soumission — le corrigé reste côté serveur).
  useEffect(() => {
    if (Object.keys(answers).length === 0) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(`${DRAFT_KEY}:${assessmentId}`, JSON.stringify({ answers, at: Date.now() }));
        setSavedAt(new Date());
      } catch {
        /* stockage plein : la session continue en mémoire */
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [answers, assessmentId]);

  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const seconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0 && !result && !busy) void submit(true);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, result, busy]);

  const answeredCount = useMemo(
    () => questions.filter((question) => {
      const answer = answers[question.id];
      return Array.isArray(answer) ? answer.length > 0 : typeof answer === 'string' && answer.trim().length > 0;
    }).length,
    [answers, questions],
  );

  function setMcq(questionId: string, choiceId: string) {
    setAnswers((current) => ({ ...current, [questionId]: [choiceId] }));
  }

  function setWritten(questionId: string, text: string) {
    setAnswers((current) => ({ ...current, [questionId]: text }));
  }

  async function submit(auto = false) {
    setBusy(true);
    setError(null);
    const payload = {
      autoSubmitted: auto,
      answers: questions.map((question) => {
        const answer = answers[question.id];
        if (question.type === 'MCQ') {
          return { questionId: question.id, type: 'MCQ' as const, selectedChoiceIds: Array.isArray(answer) ? answer : [] };
        }
        return { questionId: question.id, type: 'WRITTEN' as const, text: typeof answer === 'string' ? answer : '' };
      }),
    };

    try {
      const response = await fetch(`/api/proxy/assessments/${assessmentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as Result & { message?: string };
      setBusy(false);
      if (!response.ok) {
        setError(body.message ?? 'La soumission a échoué. Vos réponses restent enregistrées localement.');
        return;
      }
      setResult(body);
      setConfirming(false);
      localStorage.removeItem(`${DRAFT_KEY}:${assessmentId}`);
      router.refresh();
    } catch {
      setBusy(false);
      setError('Connexion interrompue : vos réponses sont conservées sur cet appareil, réessayez la soumission.');
    }
  }

  if (result) {
    return <ExamReport title={title} result={result} questions={questions} subjectName={subjectName} />;
  }

  const question = questions[current];
  if (!question) return null;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const urgent = remaining <= 60;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            Question {current + 1} / {questions.length} · {question.points} pt
          </p>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-lg px-2.5 py-1 font-mono text-sm font-bold ${urgent ? 'bg-red-100 text-red-700' : 'bg-[var(--surface-muted)]'}`}
              aria-live="off"
            >
              ⏱ {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
            <span className="text-xs text-muted">
              {savedAt ? `Brouillon enregistré à ${savedAt.toLocaleTimeString('fr-FR')}` : 'Sauvegarde auto activée'}
            </span>
          </div>
        </div>

        <div className="surface rounded-2xl p-5">
          <p className="text-base font-semibold leading-snug">{question.prompt}</p>
          {question.sourceRef?.page ? (
            <p className="mt-1 text-xs text-muted">Source : page {question.sourceRef.page}</p>
          ) : null}

          <div className="mt-4 space-y-2">
            {question.type === 'MCQ' ? (
              question.choices.map((choice) => {
                const selected = Array.isArray(answers[question.id]) && (answers[question.id] as string[]).includes(choice.id);
                return (
                  <label
                    key={choice.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${
                      selected
                        ? 'border-memo-500 bg-memo-50 dark:bg-memo-500/10'
                        : 'border-[var(--border-subtle)] hover:border-memo-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      checked={selected}
                      onChange={() => setMcq(question.id, choice.id)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span>
                      <span className="mr-1.5 font-bold uppercase">{choice.id}.</span>
                      {choice.text}
                    </span>
                  </label>
                );
              })
            ) : (
              <>
                <label htmlFor={`written-${question.id}`} className="sr-only">
                  Votre réponse
                </label>
                <textarea
                  id={`written-${question.id}`}
                  rows={8}
                  value={(answers[question.id] as string) ?? ''}
                  onChange={(event) => setWritten(question.id, event.target.value)}
                  placeholder="Rédigez votre réponse : définition, raisonnement, exemple…"
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3 text-sm leading-relaxed"
                />
                <p className="text-xs text-muted">
                  Une grille de correction explicite sera appliquée : les réponses équivalentes correctement justifiées
                  sont acceptées, et des points partiels sont attribués.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={current === 0}
              onClick={() => setCurrent((index) => Math.max(0, index - 1))}
              className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              ← Précédente
            </button>
            <button
              type="button"
              disabled={current === questions.length - 1}
              onClick={() => setCurrent((index) => Math.min(questions.length - 1, index + 1))}
              className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              Suivante →
            </button>
          </div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-xl bg-memo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-memo-700"
          >
            Soumettre l&apos;épreuve
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        {confirming ? (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10" role="dialog" aria-label="Confirmation de soumission">
            <p className="font-semibold">Confirmer la soumission ?</p>
            <p className="mt-1">
              {answeredCount} question(s) sur {questions.length} ont une réponse. Une fois soumise, l&apos;épreuve est
              corrigée et ne peut plus être modifiée.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => submit(false)}
                className="rounded-lg bg-memo-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Correction…' : 'Oui, soumettre'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 font-semibold"
              >
                Continuer l&apos;épreuve
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="surface h-fit rounded-2xl p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Navigation</p>
        <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
          {questions.map((item, index) => {
            const answer = answers[item.id];
            const answered = Array.isArray(answer) ? answer.length > 0 : typeof answer === 'string' && answer.trim().length > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrent(index)}
                aria-label={`Question ${index + 1}${answered ? ' (répondue)' : ''}`}
                aria-current={index === current ? 'true' : undefined}
                className={`h-8 rounded-lg text-xs font-bold ${
                  index === current
                    ? 'bg-memo-600 text-white'
                    : answered
                      ? 'bg-progress-500/15 text-progress-600'
                      : 'bg-[var(--surface-muted)]'
                }`}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">
          {answeredCount}/{questions.length} répondues
        </p>
      </aside>
    </div>
  );
}

function ExamReport({
  title,
  result,
  questions,
  subjectName,
}: {
  title: string;
  result: Result;
  questions: Question[];
  subjectName: string | null;
}) {
  const byId = new Map(questions.map((question) => [question.id, question]));

  return (
    <div className="space-y-5">
      <div className="surface rounded-2xl p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Résultat</p>
        <h2 className="text-xl font-black tracking-tight">{title}</h2>
        <p className="text-xs text-muted">{subjectName ?? 'Sans matière'}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[var(--surface-muted)] p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Note</p>
            <p className="text-2xl font-black">
              {result.score} / {result.maxScore}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--surface-muted)] p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Pourcentage</p>
            <p className="text-2xl font-black">{result.percentage}%</p>
          </div>
          <div className="rounded-xl bg-[var(--surface-muted)] p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Appréciation</p>
            <p className="text-2xl font-black">{result.mention}</p>
          </div>
        </div>
      </div>

      {result.recommendations.length > 0 ? (
        <div className="rounded-2xl border border-memo-200 bg-memo-50 p-4 text-sm text-memo-900 dark:border-memo-500/30 dark:bg-memo-500/10 dark:text-memo-100">
          <p className="font-bold">Recommandations</p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            {result.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-3">
        <h3 className="text-lg font-bold">Correction détaillée</h3>
        {result.corrections.map((correction, index) => {
          const question = byId.get(correction.questionId);
          const ratio = correction.points > 0 ? correction.awarded / correction.points : 0;
          return (
            <div key={correction.questionId} className="surface rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold">
                  {index + 1}. {question?.prompt}
                </p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    ratio >= 0.5 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {correction.awarded} / {correction.points}
                </span>
              </div>

              {correction.type === 'MCQ' && question ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {question.choices.map((choice) => {
                    const isCorrect = correction.correctChoiceIds?.includes(choice.id);
                    const isChosen = correction.selectedChoiceIds?.includes(choice.id);
                    return (
                      <li
                        key={choice.id}
                        className={`rounded-lg px-2.5 py-1.5 ${
                          isCorrect
                            ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200'
                            : isChosen
                              ? 'bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-200'
                              : ''
                        }`}
                      >
                        <span className="mr-1.5 font-bold uppercase">{choice.id}.</span>
                        {choice.text}
                        {isCorrect ? <span className="ml-1.5 text-xs font-bold">✓ attendue</span> : null}
                        {isChosen && !isCorrect ? <span className="ml-1.5 text-xs font-bold">✗ cochée</span> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {correction.type === 'WRITTEN' ? (
                <div className="mt-2 space-y-2 text-sm">
                  {correction.rubricBreakdown ? (
                    <table className="w-full text-xs">
                      <caption className="sr-only">Grille de correction appliquée</caption>
                      <thead>
                        <tr className="text-left text-muted">
                          <th scope="col">Critère</th>
                          <th scope="col">Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {correction.rubricBreakdown.map((row) => (
                          <tr key={row.criterion} className="border-t border-[var(--border-subtle)]">
                            <td className="py-1">
                              {row.matched ? '✓' : '✗'} {row.criterion}
                            </td>
                            <td className="py-1">
                              {row.awarded} / {row.points}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  {correction.feedback ? <p className="text-muted">{correction.feedback}</p> : null}
                  {correction.needsHumanReview ? (
                    <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                      Réponse proche du seuil : une révision par un enseignant peut affiner cette note.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {correction.explanation ? (
                <p className="mt-2 rounded-lg bg-[var(--surface-muted)] p-2.5 text-sm">
                  <strong>Explication :</strong> {correction.explanation}
                </p>
              ) : null}
              {correction.misconceptions && correction.misconceptions.length > 0 ? (
                <ul className="mt-1.5 list-inside list-disc text-xs text-amber-700 dark:text-amber-300">
                  {correction.misconceptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>

      {result.weakNotions.length > 0 ? (
        <div className="rounded-2xl border border-[var(--border-subtle)] p-4">
          <p className="font-bold">Notions à retravailler</p>
          <ul className="mt-1 list-inside list-disc text-sm text-muted">
            {result.weakNotions.map((notion) => (
              <li key={notion}>{notion}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
