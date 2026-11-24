'use client';

import { useState } from 'react';

interface Provider {
  code: string;
  label: string;
  active: boolean;
  note: string;
}

export function CheckoutPanel({ providers, currentPlan }: { providers: Provider[]; currentPlan: string }) {
  const [planCode, setPlanCode] = useState<'PREMIUM' | 'INSTITUTION'>(
    currentPlan === 'PREMIUM' ? 'INSTITUTION' : 'PREMIUM',
  );
  const [provider, setProvider] = useState(providers[0]?.code ?? 'CAMPAY');
  const [phone, setPhone] = useState('');
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message: string; activated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = providers.find((item) => item.code === provider);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    const response = await fetch('/api/proxy/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planCode,
        provider,
        months,
        ...(phone ? { phoneNumber: phone } : {}),
      }),
    });
    const body = (await response.json()) as { message?: string; activated?: boolean };
    setBusy(false);
    if (!response.ok) {
      setError(body.message ?? 'La demande de paiement a échoué.');
      return;
    }
    setResult({ message: body.message ?? '', activated: body.activated ?? false });
  }

  return (
    <form onSubmit={submit} className="surface rounded-2xl p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="plan" className="mb-1 block text-sm font-semibold">
            Offre souhaitée
          </label>
          <select
            id="plan"
            value={planCode}
            onChange={(event) => setPlanCode(event.target.value as 'PREMIUM' | 'INSTITUTION')}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm"
          >
            <option value="PREMIUM">Premium</option>
            <option value="INSTITUTION">Institution</option>
          </select>
        </div>
        <div>
          <label htmlFor="months" className="mb-1 block text-sm font-semibold">
            Durée
          </label>
          <select
            id="months"
            value={months}
            onChange={(event) => setMonths(Number(event.target.value))}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm"
          >
            <option value={1}>1 mois</option>
            <option value={12}>12 mois</option>
          </select>
        </div>
        <div>
          <label htmlFor="provider" className="mb-1 block text-sm font-semibold">
            Moyen de paiement
          </label>
          <select
            id="provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm"
          >
            {providers.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label} {item.active ? '' : '· non activé'}
              </option>
            ))}
          </select>
          {selected ? <p className="mt-1 text-xs text-muted">{selected.note}</p> : null}
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-semibold">
            Numéro Mobile Money (facultatif)
          </label>
          <input
            id="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+237 6xx xx xx xx"
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-sm ${
            result.activated
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border border-amber-200 bg-amber-50 text-amber-900'
          }`}
          role="status"
        >
          {result.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-xl bg-memo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-memo-700 disabled:opacity-50"
      >
        {busy ? 'Envoi…' : 'Demander l’activation'}
      </button>
      <p className="mt-2 text-xs text-muted">
        Un abonnement n&apos;est jamais activé sans confirmation signée du prestataire (webhook vérifié et idempotent).
      </p>
    </form>
  );
}
