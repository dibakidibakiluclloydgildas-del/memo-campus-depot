'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.docx';
const MAX_MB = 25;

interface Subject {
  id: string;
  name: string;
  color: string;
}

export function UploadForm({ subjects }: { subjects: Subject[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [language, setLanguage] = useState<'fr' | 'en'>('fr');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [success, setSuccess] = useState<{ id: string; title: string } | null>(null);

  function selectFile(selected: File | null) {
    setError(null);
    setSuccess(null);
    if (!selected) return;
    if (selected.size > MAX_MB * 1024 * 1024) {
      setError(`Fichier trop volumineux (${(selected.size / 1024 / 1024).toFixed(1)} Mo). Maximum ${MAX_MB} Mo.`);
      return;
    }
    setFile(selected);
    if (!title) setTitle(selected.name.replace(/\.[^.]+$/, ''));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError('Sélectionnez d’abord un fichier.');
      return;
    }
    setError(null);
    setProgress(10);

    const form = new FormData();
    form.append('file', file);
    form.append('title', title || file.name);
    if (subjectId) form.append('subjectId', subjectId);
    form.append('language', language);

    try {
      setProgress(35);
      const response = await fetch('/api/proxy/documents', { method: 'POST', body: form });
      setProgress(75);
      const body = (await response.json()) as { id?: string; message?: string; code?: string };
      if (!response.ok || !body.id) {
        setError(
          body.code === 'QUOTA_EXCEEDED'
            ? (body.message ?? 'Quota atteint pour votre offre.')
            : (body.message ?? "L'import a échoué."),
        );
        setProgress(null);
        return;
      }
      setProgress(100);
      setSuccess({ id: body.id, title });
      setFile(null);
      setTitle('');
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    } catch {
      setError('Connexion interrompue. Vérifiez votre réseau puis réessayez : le fichier reste sélectionné.');
      setProgress(null);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const dropped = event.dataTransfer.files?.[0];
          if (dropped) selectFile(dropped);
        }}
        className="rounded-2xl border-2 border-dashed border-[var(--border-subtle)] p-6 text-center"
      >
        <p className="text-3xl" aria-hidden>
          📄
        </p>
        <p className="mt-2 text-sm font-semibold">Déposez votre cours ici</p>
        <p className="mt-1 text-xs text-muted">PDF, JPG, PNG ou DOCX · 25 Mo maximum · français ou anglais</p>
        <input
          ref={inputRef}
          id="file"
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-3 rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold hover:border-memo-300"
        >
          Choisir un fichier
        </button>
        {file ? (
          <p className="mt-3 text-sm">
            <strong>{file.name}</strong> · {(file.size / 1024 / 1024).toFixed(2)} Mo
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="title" className="mb-1.5 block text-sm font-semibold">
            Titre du cours
          </label>
          <input
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Biologie cellulaire — Chapitre 3"
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="subject" className="mb-1.5 block text-sm font-semibold">
            Matière
          </label>
          <select
            id="subject"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5 text-sm"
          >
            <option value="">Sans matière</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="language" className="mb-1.5 block text-sm font-semibold">
            Langue du document
          </label>
          <select
            id="language"
            value={language}
            onChange={(event) => setLanguage(event.target.value as 'fr' | 'en')}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5 text-sm"
          >
            <option value="fr">Français</option>
            <option value="en">Anglais</option>
          </select>
        </div>
      </div>

      {progress !== null ? (
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-memo-600 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">Envoi du fichier… l&apos;analyse démarre ensuite côté serveur.</p>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          <p className="font-semibold">Cours reçu : « {success.title} »</p>
          <p className="mt-1">
            L&apos;analyse est en cours. Suivez sa progression réelle sur la page du cours :{' '}
            <a href={`/bibliotheque/${success.id}`} className="font-semibold underline">
              ouvrir le cours
            </a>
            .
          </p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={!file || progress !== null}
        className="w-full rounded-xl bg-memo-600 px-4 py-3 font-semibold text-white hover:bg-memo-700 disabled:opacity-50 sm:w-auto sm:px-6"
      >
        {progress !== null ? 'Import en cours…' : 'Importer et analyser'}
      </button>
    </form>
  );
}
