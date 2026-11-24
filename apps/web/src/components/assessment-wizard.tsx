'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface DocumentOption {
  id: string;
  title: string;
  status: string;
}

export function AssessmentWizard({
  documents,
  subjects,
  preselectedDocumentId,
}: {
  documents: DocumentOption[];
  subjects: { id: string; name: string }[];
  preselectedDocumentId: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('Épreuve de révision');
  const [type, setType] = useState<'MCQ' | 'WRITTEN' | 'MIXED'>('MIXED');
  const [difficulty, setDifficulty] = useState<'FACILE' | 'MOYEN' | 'DIFFICILE'>('MOYEN');
  const [mcqCount, setMcqCount] = useState(8);
  const [writtenCount, setWrittenCount] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [subjectId, setSubjectId] = useState('');
  const [documentIds, setDocumentIds] = useState<string[]>(
    preselectedDocumentId ? [preselectedDocumentId] : documents.slice(0, 1).map((doc) => doc.id),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  function toggleDocument(id: string) {
    setDocumentIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setWarnings([]);

    const payload = {
      title,
      type,
      difficulty,
      mcqCount: type === 'WRITTEN' ? 0 : mcqCount,
      writtenCount: type === 'MCQ' ? 0 : writtenCount,
      durationMinutes,
      documentIds,
      ...(subjectId ? { subjectId } : {}),
    };

    try {
      const response = await fetch('/api/proxy/assessments/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        assessmentId?: string;
        message?: string;
        code?: string;
        warnings?: string[];
        questionCount?: number;
      };
      if (!response.ok || !body.assessmentId) {
        setError(
          body.code === 'QUOTA_EXCEEDED'
            ? (body.message ?? 'Quota atteint pour votre offre.')
            : (body.message ?? 'La génération a échoué.'),
        );
        setBusy(false);
        return;
      }
      setWarnings(body.warnings ?? []);
      router.push(`/evaluations/${body.assessmentId}`);
    } catch {
      setError('Connexion interrompue. Réessayez, aucune donnée n’a été perdue.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="title" className="mb-1.5 block text-sm font-semibold">
            Titre de l&apos;épreuve
          </label>
          <input
            id="title"
            required
            minLength={3}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor="type" className="mb-1.5 block text-sm font-semibold">
            Type d&apos;épreuve
          </label>
          <select
            id="type"
            value={type}
            onChange={(event) => setType(event.target.value as typeof type)}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5 text-sm"
          >
            <option value="MCQ">QCM uniquement</option>
            <option value="WRITTEN">Questions écrites</option>
            <option value="MIXED">Épreuve mixte</option>
          </select>
        </div>

        <div>
          <label htmlFor="difficulty" className="mb-1.5 block text-sm font-semibold">
            Difficulté
          </label>
          <select
            id="difficulty"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5 text-sm"
          >
            <option value="FACILE">Facile</option>
            <option value="MOYEN">Moyen</option>
            <option value="DIFFICILE">Difficile</option>
          </select>
        </div>

        {type !== 'WRITTEN' ? (
          <div>
            <label htmlFor="mcq" className="mb-1.5 block text-sm font-semibold">
              Nombre de QCM
            </label>
            <input
              id="mcq"
              type="number"
              min={1}
              max={40}
              value={mcqCount}
              onChange={(event) => setMcqCount(Number(event.target.value))}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5 text-sm"
            />
          </div>
        ) : null}

        {type !== 'MCQ' ? (
          <div>
            <label htmlFor="written" className="mb-1.5 block text-sm font-semibold">
              Nombre de questions écrites
            </label>
            <input
              id="written"
              type="number"
              min={1}
              max={20}
              value={writtenCount}
              onChange={(event) => setWrittenCount(Number(event.target.value))}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5 text-sm"
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="duration" className="mb-1.5 block text-sm font-semibold">
            Durée (minutes)
          </label>
          <input
            id="duration"
            type="number"
            min={5}
            max={240}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor="subject" className="mb-1.5 block text-sm font-semibold">
            Matière (facultatif)
          </label>
          <select
            id="subject"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5 text-sm"
          >
            <option value="">Toutes matières</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Cours sources (au moins un)</legend>
        <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-[var(--border-subtle)] p-2">
          {documents.map((document) => (
            <li key={document.id}>
              <label className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-muted)]">
                <input
                  type="checkbox"
                  checked={documentIds.includes(document.id)}
                  onChange={() => toggleDocument(document.id)}
                  className="h-4 w-4"
                />
                <span className="flex-1">{document.title}</span>
                {document.status === 'PARTIAL' ? (
                  <span className="text-xs text-warn-600">analyse partielle</span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
        {documentIds.length === 0 ? (
          <p className="mt-1 text-xs text-red-600">Sélectionnez au moins un cours source.</p>
        ) : null}
      </fieldset>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={busy || documentIds.length === 0}
        className="rounded-xl bg-memo-600 px-6 py-3 font-semibold text-white hover:bg-memo-700 disabled:opacity-50"
      >
        {busy ? 'Génération en cours…' : "Générer l'épreuve"}
      </button>
    </form>
  );
}
