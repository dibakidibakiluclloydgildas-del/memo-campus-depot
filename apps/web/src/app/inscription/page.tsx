'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

const RULES = [
  { label: '10 caractères minimum', test: (value: string) => value.length >= 10 },
  { label: 'Une majuscule', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'Une minuscule', test: (value: string) => /[a-z]/.test(value) },
  { label: 'Un chiffre', test: (value: string) => /[0-9]/.test(value) },
];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    institution: '',
    level: '',
    field: '',
    acceptTerms: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<{ field: string; message: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  const checks = useMemo(() => RULES.map((rule) => ({ ...rule, ok: rule.test(form.password) })), [form.password]);
  const strongEnough = checks.every((check) => check.ok);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDetails(null);
    if (!form.acceptTerms) {
      setError('Vous devez accepter les conditions d’utilisation pour créer un compte.');
      return;
    }
    if (!strongEnough) {
      setError('Le mot de passe ne respecte pas encore les critères de sécurité.');
      return;
    }

    setBusy(true);
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'register',
        payload: {
          email: form.email,
          password: form.password,
          displayName: form.displayName,
          institution: form.institution || undefined,
          level: form.level || undefined,
          field: form.field || undefined,
          acceptTerms: true,
        },
      }),
    });
    const body = (await response.json()) as {
      message?: string;
      details?: { field: string; message: string }[];
    };
    setBusy(false);

    if (!response.ok) {
      setError(body.message ?? 'La création du compte a échoué.');
      setDetails(body.details ?? null);
      return;
    }
    router.push('/tableau-de-bord');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="text-lg font-black tracking-tight">MÉMO CAMPUS</span>
        </Link>

        <div className="surface rounded-2xl p-6 sm:p-8">
          <h1 className="text-2xl font-black tracking-tight">Créer un compte</h1>
          <p className="mt-1 text-sm text-muted">
            Gratuit, sans carte bancaire. Vous gardez la propriété de vos documents.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom d’affichage" htmlFor="displayName" required>
                <input
                  id="displayName"
                  required
                  value={form.displayName}
                  onChange={(event) => update('displayName', event.target.value)}
                  className="input"
                  placeholder="Aïcha Nkomo"
                  autoComplete="name"
                />
              </Field>
              <Field label="Adresse e-mail" htmlFor="email" required>
                <input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(event) => update('email', event.target.value)}
                  className="input"
                  placeholder="prenom.nom@exemple.cm"
                  autoComplete="email"
                />
              </Field>
              <Field label="Établissement" htmlFor="institution">
                <input
                  id="institution"
                  value={form.institution}
                  onChange={(event) => update('institution', event.target.value)}
                  className="input"
                  placeholder="Université de Yaoundé I"
                />
              </Field>
              <Field label="Niveau" htmlFor="level">
                <input
                  id="level"
                  value={form.level}
                  onChange={(event) => update('level', event.target.value)}
                  className="input"
                  placeholder="Licence 2 / Terminale"
                />
              </Field>
            </div>

            <Field label="Filière ou spécialité" htmlFor="field">
              <input
                id="field"
                value={form.field}
                onChange={(event) => update('field', event.target.value)}
                className="input"
                placeholder="Sciences biologiques"
              />
            </Field>

            <Field label="Mot de passe" htmlFor="password" required>
              <input
                id="password"
                type="password"
                required
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
                className="input"
                placeholder="••••••••••"
                autoComplete="new-password"
                aria-describedby="password-rules"
              />
              <ul id="password-rules" className="mt-2 grid grid-cols-2 gap-1 text-xs">
                {checks.map((check) => (
                  <li key={check.label} className={check.ok ? 'text-progress-600' : 'text-muted'}>
                    {check.ok ? '✓' : '•'} {check.label}
                  </li>
                ))}
              </ul>
            </Field>

            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={form.acceptTerms}
                onChange={(event) => update('acceptTerms', event.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                J&apos;accepte les conditions d&apos;utilisation et la politique de confidentialité.
                Mes documents restent privés et ne servent pas à entraîner un modèle sans mon accord.
              </span>
            </label>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                <p>{error}</p>
                {details && details.length > 0 ? (
                  <ul className="mt-1 list-inside list-disc text-xs">
                    {details.map((detail) => (
                      <li key={`${detail.field}-${detail.message}`}>
                        {detail.field ? `${detail.field} : ` : ''}
                        {detail.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-memo-600 px-4 py-3 font-semibold text-white hover:bg-memo-700 disabled:opacity-60"
            >
              {busy ? 'Création…' : 'Créer mon compte'}
            </button>
          </form>

          <p className="mt-4 text-sm text-muted">
            Déjà inscrit ?{' '}
            <Link href="/connexion" className="font-semibold text-memo-600 hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--border-subtle);
          background: var(--surface);
          padding: 0.625rem 0.875rem;
          font-size: 0.95rem;
        }
        .input:focus { border-color: var(--color-memo-400); }
      `}</style>
    </main>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      {children}
    </div>
  );
}
