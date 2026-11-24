'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Initial {
  displayName: string;
  institution: string;
  level: string;
  field: string;
  specialty: string;
  goal: string;
  dailyReviewLimit: number;
  reviewPace: string;
}

export function ProfileForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '' });
  const [passwordStatus, setPasswordStatus] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    const response = await fetch('/api/proxy/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: form.displayName,
        institution: form.institution || null,
        level: form.level || null,
        field: form.field || null,
        specialty: form.specialty || null,
        goal: form.goal || null,
        preferences: { dailyReviewLimit: form.dailyReviewLimit, reviewPace: form.reviewPace },
      }),
    });
    const body = (await response.json()) as { message?: string };
    setBusy(false);
    setStatus(
      response.ok
        ? { tone: 'ok', message: 'Profil mis à jour.' }
        : { tone: 'error', message: body.message ?? 'La mise à jour a échoué.' },
    );
    if (response.ok) router.refresh();
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordStatus(null);
    const response = await fetch('/api/proxy/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(password),
    });
    const body = (await response.json()) as { message?: string };
    if (response.ok) {
      setPassword({ currentPassword: '', newPassword: '' });
      setPasswordStatus({ tone: 'ok', message: 'Mot de passe modifié. Les autres sessions ont été déconnectées.' });
    } else {
      setPasswordStatus({ tone: 'error', message: body.message ?? 'Modification impossible.' });
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom d’affichage" htmlFor="displayName">
            <input
              id="displayName"
              value={form.displayName}
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
              className="input"
            />
          </Field>
          <Field label="Établissement" htmlFor="institution">
            <input
              id="institution"
              value={form.institution}
              onChange={(event) => setForm({ ...form, institution: event.target.value })}
              className="input"
            />
          </Field>
          <Field label="Niveau" htmlFor="level">
            <input
              id="level"
              value={form.level}
              onChange={(event) => setForm({ ...form, level: event.target.value })}
              className="input"
            />
          </Field>
          <Field label="Filière" htmlFor="field">
            <input
              id="field"
              value={form.field}
              onChange={(event) => setForm({ ...form, field: event.target.value })}
              className="input"
            />
          </Field>
          <Field label="Spécialité" htmlFor="specialty">
            <input
              id="specialty"
              value={form.specialty}
              onChange={(event) => setForm({ ...form, specialty: event.target.value })}
              className="input"
            />
          </Field>
          <Field label="Objectif personnel" htmlFor="goal">
            <input
              id="goal"
              value={form.goal}
              onChange={(event) => setForm({ ...form, goal: event.target.value })}
              className="input"
              placeholder="Valider mon semestre avec mention"
            />
          </Field>
          <Field label="Rythme de révision" htmlFor="pace">
            <select
              id="pace"
              value={form.reviewPace}
              onChange={(event) => setForm({ ...form, reviewPace: event.target.value })}
              className="input"
            >
              <option value="DOUX">Doux — intervalles plus courts</option>
              <option value="NORMAL">Normal</option>
              <option value="INTENSIF">Intensif — intervalles plus longs</option>
            </select>
          </Field>
          <Field label="Révisions quotidiennes maximum" htmlFor="limit">
            <input
              id="limit"
              type="number"
              min={5}
              max={200}
              value={form.dailyReviewLimit}
              onChange={(event) => setForm({ ...form, dailyReviewLimit: Number(event.target.value) })}
              className="input"
            />
          </Field>
        </div>

        {status ? (
          <p
            className={`rounded-xl px-3 py-2 text-sm ${
              status.tone === 'ok'
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border border-red-200 bg-red-50 text-red-800'
            }`}
            role="status"
          >
            {status.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-memo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-memo-700 disabled:opacity-50"
        >
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>

      <div className="border-t border-[var(--border-subtle)] pt-4">
        <h3 className="text-sm font-bold">Changer de mot de passe</h3>
        <form onSubmit={changePassword} className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Mot de passe actuel" htmlFor="currentPassword">
            <input
              id="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              value={password.currentPassword}
              onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })}
              className="input"
            />
          </Field>
          <Field label="Nouveau mot de passe" htmlFor="newPassword">
            <input
              id="newPassword"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={password.newPassword}
              onChange={(event) => setPassword({ ...password, newPassword: event.target.value })}
              className="input"
            />
          </Field>
          <div className="sm:col-span-2">
            {passwordStatus ? (
              <p
                className={`mb-2 rounded-xl px-3 py-2 text-sm ${
                  passwordStatus.tone === 'ok'
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border border-red-200 bg-red-50 text-red-800'
                }`}
                role="status"
              >
                {passwordStatus.message}
              </p>
            ) : null}
            <button
              type="submit"
              className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold hover:border-memo-300"
            >
              Modifier le mot de passe
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--border-subtle);
          background: var(--surface);
          padding: 0.5rem 0.85rem;
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}

export function DangerZone() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const response = await fetch('/api/proxy/auth/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, confirmation: word }),
    });
    const body = (await response.json()) as { message?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(body.message ?? 'Suppression impossible.');
      return;
    }
    await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    router.push('/');
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-red-200 p-5 dark:border-red-500/30">
      <h2 className="text-sm font-bold text-red-700 dark:text-red-300">Zone de suppression</h2>
      <p className="mt-1 text-sm text-muted">
        La suppression est définitive : cours, fiches, évaluations, planning et conversations sont effacés. Les traces de
        facturation sont conservées de façon anonymisée conformément aux obligations légales.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:text-red-300"
        >
          Supprimer mon compte
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <Field label="Mot de passe" htmlFor="danger-password">
            <input
              id="danger-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input"
              style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border-subtle)', padding: '0.5rem 0.85rem', background: 'var(--surface)' }}
            />
          </Field>
          <Field label="Tapez SUPPRIMER pour confirmer" htmlFor="danger-word">
            <input
              id="danger-word"
              value={word}
              onChange={(event) => setWord(event.target.value.toUpperCase())}
              className="input"
              style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border-subtle)', padding: '0.5rem 0.85rem', background: 'var(--surface)' }}
            />
          </Field>
          {message ? (
            <p className="text-sm text-red-700" role="alert">
              {message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || word !== 'SUPPRIMER' || password.length === 0}
              onClick={remove}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Suppression…' : 'Confirmer la suppression'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}
