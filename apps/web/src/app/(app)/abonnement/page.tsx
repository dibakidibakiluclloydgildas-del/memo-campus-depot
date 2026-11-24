import { apiFetch, formatDate } from '@/lib/api';
import { Alert, Badge, Card, ProgressBar, SectionTitle } from '@/components/ui';
import { PageHeader } from '@/components/shell';
import { CheckoutPanel } from '@/components/checkout-panel';

interface SubscriptionOverview {
  plan: { code: string; name: string; quotas: Record<string, number>; features: string[]; priceXafMonthly: number; priceXafYearly: number };
  usage: Record<string, number>;
  quotas: { key: string; allowed: boolean; limit: number; used: number; remaining: number; reason: string }[];
}

interface PlansResponse {
  plans: { code: string; name: string; description: string; priceXafMonthly: number; priceXafYearly: number; features: string[]; quotas: Record<string, number> }[];
  providers: { code: string; label: string; active: boolean; note: string }[];
  paymentNote: string;
}

export default async function SubscriptionPage() {
  const [overview, plans, payments] = await Promise.all([
    apiFetch<SubscriptionOverview>('/billing/subscription'),
    apiFetch<PlansResponse>('/billing/plans'),
    apiFetch<{ id: string; provider: string; planCode: string; amountXaf: number; status: string; createdAt: string; paidAt: string | null }[]>(
      '/billing/payments',
    ),
  ]);

  return (
    <>
      <PageHeader
        title="Mon offre"
        subtitle="Quotas appliqués côté serveur, prix administrés et paiements vérifiés par webhook signé."
      />

      <Card className="p-5">
        <SectionTitle eyebrow="Abonnement actuel" title={`Offre ${overview.plan.name}`} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {overview.quotas.map((quota) => (
            <div key={quota.key} className="rounded-xl border border-[var(--border-subtle)] p-3">
              <p className="mb-1 flex items-center justify-between text-xs font-semibold">
                <span>{quotaLabel(quota.key)}</span>
                <span className={quota.allowed ? 'text-muted' : 'text-red-600'}>
                  {quota.used} / {quota.limit === -1 ? '∞' : quota.limit}
                </span>
              </p>
              <ProgressBar value={quota.limit === -1 ? 0 : (quota.used / Math.max(1, quota.limit)) * 100} />
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {plans.plans.map((plan) => (
          <Card key={plan.code} className={`p-5 ${plan.code === overview.plan.code ? 'ring-2 ring-memo-500' : ''}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{plan.name}</h2>
              {plan.code === overview.plan.code ? <Badge tone="success">Offre actuelle</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted">{plan.description}</p>
            <p className="mt-3 text-2xl font-black">
              {plan.priceXafMonthly === 0 ? 'Gratuit' : `${plan.priceXafMonthly.toLocaleString('fr-FR')} FCFA`}
              {plan.priceXafMonthly > 0 ? <span className="text-sm font-normal text-muted"> / mois</span> : null}
            </p>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-1.5">
                  <span className="text-progress-600">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <div className="mt-5">
        <h2 className="mb-2 text-lg font-bold">Paiement</h2>
        <CheckoutPanel providers={plans.providers} currentPlan={overview.plan.code} />
        <p className="mt-3 text-xs text-muted">{plans.paymentNote}</p>
      </div>

      <Card className="mt-5 p-5">
        <SectionTitle eyebrow="Historique" title="Mes paiements" />
        {payments.length === 0 ? (
          <p className="text-sm text-muted">Aucun paiement enregistré sur ce compte.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)] text-sm">
            {payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-semibold">
                  {payment.planCode} · {payment.amountXaf.toLocaleString('fr-FR')} FCFA
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {payment.provider}
                  <Badge tone={payment.status === 'PAID' ? 'success' : 'warning'}>{payment.status}</Badge>
                  {formatDate(payment.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-4">
        <Alert tone="info" title="Transparence sur l'état des paiements">
          Les intégrations Mobile Money et carte bancaire nécessitent des clés prestataire et une validation en
          environnement sandbox. Tant qu&apos;elles ne sont pas configurées, <strong>aucune somme n&apos;est débitée</strong> et
          votre offre n&apos;est pas modifiée — l&apos;écran vous l&apos;indique explicitement.
        </Alert>
      </div>
    </>
  );
}

function quotaLabel(key: string): string {
  const labels: Record<string, string> = {
    documents_total: 'Cours',
    documents_per_month: 'Imports / mois',
    ai_generations_per_month: 'Générations IA',
    assessments_per_month: 'Évaluations',
    assistant_messages_per_day: "Messages / jour",
    storage_mb: 'Stockage (Mo)',
    ocr_pages_per_month: 'Pages OCR',
  };
  return labels[key] ?? key;
}
