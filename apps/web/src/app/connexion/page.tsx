'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', payload: { email, password } }),
    });
    const body = (await response.json()) as { message?: string };
    setBusy(false);
    if (!response.ok) {
      setError(body.message ?? 'E-mail ou mot de passe incorrect.');
      return;
    }
    router.push('/tableau-de-bord');
    router.refresh();
  }

  /**
   * Accès invité : connexion directe sur le compte de démonstration, sans
   * saisir d'identifiants. Pratique pour faire tester l'application à un ami.
   * Le serveur refuse cette action si ALLOW_DEMO_LOGIN est désactivé.
   */
  async function enterDemo() {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'demo' }),
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    setBusy(false);
    if (!response.ok) {
      setError(body.message ?? "L'accès invité n'est pas disponible sur cette instance.");
      return;
    }
    router.push('/tableau-de-bord');
    router.refresh();
  }

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword('MemoCampus2026!');
    setError(null);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="text-lg font-black tracking-tight">MÉMO CAMPUS</span>
        </Link>

        <div className="surface rounded-2xl p-6 sm:p-8">
          <h1 className="text-2xl font-black tracking-tight">Connexion</h1>
          <p className="mt-1 text-sm text-muted">Accédez à vos cours, vos fiches et votre planning.</p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
                Adresse e-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5"
                placeholder="prenom.nom@exemple.cm"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5"
                placeholder="••••••••••"
              />
            </div>

            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-memo-600 px-4 py-3 font-semibold text-white hover:bg-memo-700 disabled:opacity-60"
            >
              {busy ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>

          <p className="mt-4 text-sm text-muted">
            Pas encore de compte ?{' '}
            <Link href="/inscription" className="font-semibold text-memo-600 hover:underline">
              Créer un compte gratuit
            </Link>
          </p>

          <div className="mt-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
            <button
              type="button"
              onClick={enterDemo}
              disabled={busy}
              className="mb-3 w-full rounded-xl bg-memo-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-memo-700 disabled:opacity-60"
            >
              {busy ? 'Connexion…' : 'Entrer en mode démonstration (un clic)'}
            </button>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Comptes de démonstration</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                ['Étudiant Premium', 'etudiant@demo.memo-campus.cm'],
                ['Étudiant Free', 'etudiant.free@demo.memo-campus.cm'],
                ['Administrateur', 'admin@demo.memo-campus.cm'],
              ].map(([label, demoEmail]) => (
                <button
                  key={demoEmail}
                  type="button"
                  onClick={() => fillDemo(demoEmail)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs font-semibold hover:border-memo-300"
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Données de démonstration, séparées des données réelles.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
