import { redirect } from 'next/navigation';
import { apiFetch, apiFetchOptional, formatDate } from '@/lib/api';
import { Badge, Card, SectionTitle, Stat } from '@/components/ui';
import { PageHeader } from '@/components/shell';

interface Overview {
  users: { total: number; activeLast7Days: number; byPlan: { planCode: string; _count: { _all: number } }[] };
  content: { documents: number; assessments: number; flashcards: number };
  ai: { callsThisMonth: number; promptTokens: number; outputTokens: number; estimatedCostUsdCents: number };
  revenue: { paidThisMonthXaf: number; transactions: number };
  health: { failedDocuments: number; openReports: number };
  recentAudit: { id: string; action: string; resource: string; createdAt: string; userId: string | null }[];
}

/**
 * Espace administrateur : uniquement des métadonnées agrégées.
 * Les documents privés des étudiants ne sont JAMAIS consultables ici.
 */
export default async function AdminPage() {
  const profile = await apiFetchOptional<{ role: string }>('/auth/me');
  if (profile?.role !== 'ADMIN') redirect('/tableau-de-bord');

  const [overview, plans, institutions, payments] = await Promise.all([
    apiFetch<Overview>('/admin/overview'),
    apiFetch<{ code: string; name: string; priceXafMonthly: number; quotas: Record<string, number>; isActive: boolean }[]>(
      '/admin/plans',
    ),
    apiFetch<{ id: string; name: string; city: string | null; seats: number; _count: { members: number; groups: number } }[]>(
      '/admin/institutions',
    ),
    apiFetch<{ id: string; provider: string; amountXaf: number; status: string; createdAt: string }[]>('/admin/payments'),
  ]);

  return (
    <>
      <PageHeader
        title="Administration"
        subtitle="Indicateurs d'usage, coûts IA, offres, établissements et journal d'audit. Accès réservé au rôle administrateur, vérifié côté serveur."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Utilisateurs" value={overview.users.total} hint={`${overview.users.activeLast7Days} actifs (7 j)`} />
        <Stat label="Cours importés" value={overview.content.documents} hint={`${overview.content.assessments} évaluations`} />
        <Stat label="Appels IA (mois)" value={overview.ai.callsThisMonth} hint={`≈ ${(overview.ai.estimatedCostUsdCents / 100).toFixed(2)} USD`} />
        <Stat
          label="Encaissé (mois)"
          value={`${overview.revenue.paidThisMonthXaf.toLocaleString('fr-FR')} FCFA`}
          hint={`${overview.revenue.transactions} transaction(s)`}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle eyebrow="Commercial" title="Offres configurées" />
          <ul className="space-y-2 text-sm">
            {plans.map((plan) => (
              <li key={plan.code} className="rounded-xl border border-[var(--border-subtle)] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{plan.name}</span>
                  <Badge tone={plan.isActive ? 'success' : 'neutral'}>
                    {plan.priceXafMonthly === 0 ? 'Gratuit' : `${plan.priceXafMonthly.toLocaleString('fr-FR')} FCFA`}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Cours : {plan.quotas.documents_total === -1 ? 'illimités' : plan.quotas.documents_total} · Générations IA :{' '}
                  {plan.quotas.ai_generations_per_month ?? '—'} · Stockage : {plan.quotas.storage_mb} Mo
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Les prix et quotas sont en base : aucune modification de code n&apos;est nécessaire pour les changer.
          </p>
        </Card>

        <Card className="p-5">
          <SectionTitle eyebrow="Institution" title="Établissements" />
          {institutions.length === 0 ? (
            <p className="text-sm text-muted">Aucun établissement enregistré.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {institutions.map((institution) => (
                <li key={institution.id} className="flex items-center justify-between">
                  <span>
                    <span className="font-semibold">{institution.name}</span>
                    <span className="ml-1.5 text-xs text-muted">{institution.city ?? ''}</span>
                  </span>
                  <span className="text-xs text-muted">
                    {institution._count.members}/{institution.seats} sièges
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle eyebrow="Risques" title="Santé de la plateforme" />
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span>Documents en échec d&apos;analyse</span>
              <Badge tone={overview.health.failedDocuments > 0 ? 'warning' : 'success'}>
                {overview.health.failedDocuments}
              </Badge>
            </li>
            <li className="flex items-center justify-between">
              <span>Signalements ouverts</span>
              <Badge tone={overview.health.openReports > 0 ? 'warning' : 'success'}>{overview.health.openReports}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span>Répartition des offres</span>
              <span className="text-xs text-muted">
                {overview.users.byPlan.map((entry) => `${entry.planCode}: ${entry._count._all}`).join(' · ')}
              </span>
            </li>
          </ul>
        </Card>

        <Card className="p-5">
          <SectionTitle eyebrow="Traçabilité" title="Journal d'audit" />
          <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs">
            {overview.recentAudit.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-muted)] px-2 py-1.5">
                <span className="font-semibold">{entry.action}</span>
                <span className="text-muted">{formatDate(entry.createdAt, true)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <SectionTitle eyebrow="Finances" title="Paiements récents" />
          {payments.length === 0 ? (
            <p className="text-sm text-muted">Aucun paiement enregistré.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Derniers paiements</caption>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th scope="col" className="pb-2">Date</th>
                    <th scope="col" className="pb-2">Prestataire</th>
                    <th scope="col" className="pb-2">Montant</th>
                    <th scope="col" className="pb-2">État</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.slice(0, 15).map((payment) => (
                    <tr key={payment.id} className="border-t border-[var(--border-subtle)]">
                      <td className="py-1.5">{formatDate(payment.createdAt)}</td>
                      <td className="py-1.5">{payment.provider}</td>
                      <td className="py-1.5">{payment.amountXaf.toLocaleString('fr-FR')} FCFA</td>
                      <td className="py-1.5">
                        <Badge tone={payment.status === 'PAID' ? 'success' : 'warning'}>{payment.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <p className="mt-5 text-xs text-muted">
        Aucun contenu privé d&apos;étudiant n&apos;est accessible depuis cet espace : seules des métadonnées agrégées et
        des journaux d&apos;audit sont exposés.
      </p>
    </>
  );
}
