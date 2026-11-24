'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

interface Citation {
  index: number;
  documentTitle: string;
  page: number | null;
  extract: string;
}

interface Message {
  role: string;
  content: string;
  citations?: Citation[];
}

const MODES = [
  { key: 'TUTEUR', label: 'Tuteur', hint: 'Explique et propose des exercices' },
  { key: 'PROFESSEUR', label: 'Professeur', hint: 'Une question à la fois, indice progressif' },
  { key: 'EXAMEN_BLANC', label: 'Examen blanc', hint: 'Prépare un entraînement chronométré' },
] as const;

export function AssistantChat({
  subjects,
  conversations,
  conversationId,
  initialMessages,
}: {
  subjects: { id: string; name: string }[];
  conversations: { id: string; title: string }[];
  conversationId: string | null;
  initialMessages: Message[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<(typeof MODES)[number]['key']>('TUTEUR');
  const [subjectId, setSubjectId] = useState('');
  const [activeConversation, setActiveConversation] = useState(conversationId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setBusy(true);
    setError(null);
    setInput('');
    setMessages((current) => [...current, { role: 'user', content: text }]);

    try {
      const response = await fetch('/api/proxy/assistant/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          mode,
          documentIds: [],
          ...(subjectId ? { subjectId } : {}),
          ...(activeConversation ? { conversationId: activeConversation } : {}),
        }),
      });
      const body = (await response.json()) as {
        answer?: string;
        citations?: Citation[];
        message?: string;
        conversationId?: string;
        disclaimer?: string;
      };
      setBusy(false);

      if (!response.ok || !body.answer) {
        setError(body.message ?? "L'assistant n'a pas pu répondre.");
        return;
      }
      setActiveConversation(body.conversationId ?? null);
      setDisclaimer(body.disclaimer ?? null);
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: body.answer ?? '', citations: body.citations },
      ]);
      router.refresh();
      setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 50);
    } catch {
      setBusy(false);
      setError('Connexion interrompue. Votre question est conservée : appuyez à nouveau sur Envoyer.');
      setInput(text);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div className="surface flex h-[70vh] min-h-[480px] flex-col rounded-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] p-3">
          {MODES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setMode(option.key)}
              title={option.hint}
              aria-pressed={mode === option.key}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                mode === option.key
                  ? 'bg-memo-600 text-white'
                  : 'border border-[var(--border-subtle)] hover:border-memo-300'
              }`}
            >
              {option.label}
            </button>
          ))}
          <label htmlFor="assistant-subject" className="sr-only">
            Matière ciblée
          </label>
          <select
            id="assistant-subject"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            className="ml-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-1.5 text-xs"
          >
            <option value="">Toutes mes matières</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {messages.length === 0 ? (
            <div className="rounded-xl bg-[var(--surface-muted)] p-4 text-sm">
              <p className="font-semibold">Comment puis-je vous aider ?</p>
              <ul className="mt-2 space-y-1 text-muted">
                <li>« Explique-moi la différence entre photosynthèse et respiration. »</li>
                <li>« Interroge-moi sur le chapitre 2, une question à la fois. »</li>
                <li>« Prépare-moi un examen blanc de 10 questions sur ce cours. »</li>
              </ul>
            </div>
          ) : null}

          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm ${
                message.role === 'user'
                  ? 'ml-auto bg-memo-600 text-white'
                  : 'bg-[var(--surface-muted)]'
              }`}
            >
              <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
              {message.citations && message.citations.length > 0 ? (
                <div className="mt-2 space-y-1.5 border-t border-black/10 pt-2 dark:border-white/10">
                  <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">Sources</p>
                  {message.citations.map((citation) => (
                    <div key={`${citation.index}-${citation.documentTitle}`} className="rounded-lg bg-black/5 p-2 text-xs dark:bg-white/5">
                      <p className="font-semibold">
                        [{citation.index}] {citation.documentTitle}
                        {citation.page ? ` · p. ${citation.page}` : ''}
                      </p>
                      <p className="mt-0.5 opacity-80">{citation.extract.slice(0, 220)}…</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          {busy ? (
            <div className="max-w-[70%] rounded-2xl bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm" role="status">
              Recherche dans vos cours…
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="mx-3 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        <form onSubmit={send} className="flex gap-2 border-t border-[var(--border-subtle)] p-3">
          <label htmlFor="assistant-input" className="sr-only">
            Votre question
          </label>
          <input
            id="assistant-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Posez votre question…"
            maxLength={4000}
            className="min-w-0 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5 text-sm"
          />
          <button
            type="submit"
            disabled={busy || input.trim().length === 0}
            className="rounded-xl bg-memo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-memo-700 disabled:opacity-50"
          >
            Envoyer
          </button>
        </form>
      </div>

      <aside className="space-y-3">
        <div className="surface rounded-2xl p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Conversations</p>
          <ul className="mt-2 space-y-1">
            {conversations.length === 0 ? (
              <li className="text-xs text-muted">Aucune conversation enregistrée.</li>
            ) : (
              conversations.slice(0, 12).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveConversation(item.id);
                      router.push(`/assistant?conversation=${item.id}`);
                    }}
                    className={`w-full truncate rounded-lg px-2 py-1.5 text-left text-xs ${
                      activeConversation === item.id ? 'bg-memo-50 font-semibold text-memo-700 dark:bg-memo-500/10' : 'hover:bg-[var(--surface-muted)]'
                    }`}
                  >
                    {item.title}
                  </button>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            onClick={() => {
              setActiveConversation(null);
              setMessages([]);
              router.push('/assistant');
            }}
            className="mt-2 w-full rounded-lg border border-[var(--border-subtle)] px-2 py-1.5 text-xs font-semibold"
          >
            + Nouvelle conversation
          </button>
        </div>

        {disclaimer ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            {disclaimer}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--border-subtle)] p-3 text-xs text-muted">
            L&apos;assistant distingue toujours ce qui vient de vos cours (avec page) de ses connaissances générales. Une
            réponse sans source ne doit pas être apprise telle quelle.
          </div>
        )}
      </aside>
    </div>
  );
}
