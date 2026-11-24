import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Alert, Badge, Card, EmptyState, ProgressBar, SectionTitle, Stat, StatusBadge } from '@/components/ui';
import { DOCUMENT_STATUSES, FRENCH_LABELS, type DocumentStatus } from '@memo/shared';
import { PageHeader } from '@/components/shell';

interface Dashboard {
  greeting: string;
  library: {
    totalDocuments: number;
    readyDocuments: number;
    byStatus: { status: string; _count: { _all: number } }[];
  };
  subjects: { id: string; name: string; color: string; _count: { documents: number; flashcards: number } }[];
  memory: {
    statuses: Record<string, number>;
    totalCards: number;
    dueToday: number;
    reviewsLast7Days: number;
    successRateLast7Days: number | null;
  };
  assessments: {
    recent: { id: string; title: string; percentage: number | null; submittedAt: string | null }[];
    averageScore: number | null;
  };
  planning: {
    upcoming: { id: string; title: string; startAt: string; type: string; subject: { name: string; color: string } | null }[];
  };
  study: { focusMinutesLast7Days: number; sessionsLast7Days: number };
  notifications: { id: string; title: string; body: string; readAt: string | null; createdAt: string }[];
  subscription: {
    plan: { name: string; code: string };
    quotas: { key: string; allowed: boolean; used: number; limit: number; reason: string }[];
  };
}

const STATUS_LABELS: Record<string, string> = {
  NOUVELLE: 'Nouvelles',
  FRAGILE: 'Fragiles',
  EN_COURS: 'En cours',
  MAITRISEE: 'Maîtrisées',
};

export default async function DashboardPage() {
  const data = await apiFetch<Dashboard>('/dashboard');
  const quotaWarnings = data.subscription.quotas.filter((quota) => !quota.allowed);

  return (
    <>
      <PageHeader
        title={`${data.greeting}`}
        subtitle="Voici l'état réel de votre progression, calculé à partir de vos cours et de vos révisions."
        action={
          <Link
            href="/bibliotheque/importer"
            className="rounded-xl bg-memo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-memo-700"
          >
            + Importer un cours
          </Link>
        }
      />

      {quotaWarnings.length > 0 ? (
        <div className="mb-5 space-y-2">
          {quotaWarnings.slice(0, 2).map((quota) => (
            <Alert key={quota.key} tone="warning" title="Quota atteint">
              {quota.reason}{' '}
              <Link href="/abonnement" className="font-semibold underline">
                Voir les offres
              </Link>
            </Alert>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cours prêts" value={data.library.readyDocuments} hint={`${data.library.totalDocuments} au total`} />
        <Stat
          label="Cartes à revoir"
          value={data.memory.dueToday}
          hint={`${data.memory.totalCards} cartes au total`}
          tone={data.memory.dueToday > 0 ? 'text-warn-600' : ''}
        />
        <Stat
          label="Taux de réussite 7 j"
          value={data.memory.successRateLast7Days === null ? '—' : `${data.memory.successRateLast7Days}%`}
          hint={`${data.memory.reviewsLast7Days} révisions`}
        />
        <Stat
          label="Concentration 7 j"
          value={`${data.study.focusMinutesLast7Days} min`}
          hint={`${data.study.sessionsLast7Days} session(s) Pomodoro`}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle
              eyebrow="Mémorisation"
              title="État de vos connaissances"
              action={
                <Link href="/revisions" className="text-sm font-semibold text-memo-600 hover:underline">
                  Réviser →
                </Link>
              }
            />
            {data.memory.totalCards === 0 ? (
              <EmptyState
                title="Aucune carte mémoire pour l'instant"
                description="Importez un cours puis générez des cartes : le rappel actif et la répétition espacée démarrent automatiquement."
                action={{ href: '/bibliotheque/importer', label: 'Importer un cours' }}
              />
            ) : (
              <div className="space-y-3">
                {(['MAITRISEE', 'EN_COURS', 'FRAGILE', 'NOUVELLE'] as const).map((status) => {
                  const count = data.memory.statuses[status] ?? 0;
                  const percentage = data.memory.totalCards > 0 ? (count / data.memory.totalCards) * 100 : 0;
                  return (
                    <div key={status}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-semibold">{STATUS_LABELS[status]}</span>
                        <span className="text-muted">
                          {count} carte{count > 1 ? 's' : ''}
                        </span>
                      </div>
                      <ProgressBar value={percentage} />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle
              eyebrow="Bibliothèque"
              title="Cours récents"
              action={
                <Link href="/bibliotheque" className="text-sm font-semibold text-memo-600 hover:underline">
                  Tout voir →
                </Link>
              }
            />
            {data.library.totalDocuments === 0 ? (
              <EmptyState
                title="Votre bibliothèque est vide"
                description="Importez un PDF, une photo de cours ou un document Word pour démarrer l'analyse."
                action={{ href: '/bibliotheque/importer', label: 'Importer mon premier cours' }}
              />
            ) : (
              <ul className="space-y-2">
                {data.library.byStatus.map((entry) => (
                  <li
                    key={entry.status}
                    className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] px-3 py-2.5 text-sm"
                  >
                    <StatusBadge
                      status={entry.status}
                      label={FRENCH_LABELS.DOCUMENT_STATUSES[entry.status as DocumentStatus] ?? entry.status}
                    />
                    <span className="font-semibold">{entry._count._all}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle eyebrow="Progression" title="Dernières évaluations" />
            {data.assessments.recent.length === 0 ? (
              <p className="text-sm text-muted">
                Aucune évaluation terminée. Générez une épreuve depuis un cours analysé pour mesurer vos acquis.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Dernières évaluations corrigées</caption>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted">
                      <th scope="col" className="pb-2">Épreuve</th>
                      <th scope="col" className="pb-2">Note</th>
                      <th scope="col" className="pb-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.assessments.recent.map((assessment) => (
                      <tr key={assessment.id} className="border-t border-[var(--border-subtle)]">
                        <td className="py-2">
                          <Link href={`/evaluations/${assessment.id}`} className="font-semibold hover:text-memo-600">
                            {assessment.title}
                          </Link>
                        </td>
                        <td className="py-2">
                          <Badge tone={(assessment.percentage ?? 0) >= 60 ? 'success' : 'danger'}>
                            {assessment.percentage ?? 0}%
                          </Badge>
                        </td>
                        <td className="py-2 text-muted">
                          {assessment.submittedAt
                            ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(assessment.submittedAt))
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle eyebrow="Organisation" title="À venir" />
            {data.planning.upcoming.length === 0 ? (
              <p className="text-sm text-muted">
                Aucune séance planifiée.{' '}
                <Link href="/planning" className="font-semibold text-memo-600 hover:underline">
                  Créer un planning
                </Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {data.planning.upcoming.map((block) => (
                  <li key={block.id} className="rounded-xl border border-[var(--border-subtle)] p-3">
                    <p className="text-sm font-semibold">{block.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {new Intl.DateTimeFormat('fr-FR', {
                        weekday: 'short',
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Africa/Douala',
                      }).format(new Date(block.startAt))}
                      {block.subject ? ` · ${block.subject.name}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle eyebrow="Matières" title="Répartition" />
            {data.subjects.length === 0 ? (
              <p className="text-sm text-muted">Créez une matière pour organiser vos cours.</p>
            ) : (
              <ul className="space-y-2">
                {data.subjects.map((subject) => (
                  <li key={subject.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: subject.color }}
                        aria-hidden
                      />
                      {subject.name}
                    </span>
                    <span className="text-xs text-muted">
                      {subject._count.documents} cours · {subject._count.flashcards} cartes
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle eyebrow="Compte" title={`Offre ${data.subscription.plan.name}`} />
            <ul className="space-y-2 text-sm">
              {data.subscription.quotas.slice(0, 4).map((quota) => (
                <li key={quota.key}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-muted">{quotaLabel(quota.key)}</span>
                    <span className="font-semibold">
                      {quota.used}
                      {quota.limit === -1 ? ' / ∞' : ` / ${quota.limit}`}
                    </span>
                  </div>
                  <ProgressBar value={quota.limit === -1 ? 0 : (quota.used / Math.max(1, quota.limit)) * 100} />
                </li>
              ))}
            </ul>
            <Link
              href="/abonnement"
              className="mt-3 inline-block text-sm font-semibold text-memo-600 hover:underline"
            >
              Gérer mon offre →
            </Link>
          </Card>

          {data.notifications.length > 0 ? (
            <Card className="p-5">
              <SectionTitle eyebrow="Notifications" title="Récent" />
              <ul className="space-y-2 text-sm">
                {data.notifications.map((notification) => (
                  <li key={notification.id} className="rounded-xl border border-[var(--border-subtle)] p-3">
                    <p className="font-semibold">{notification.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{notification.body}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      <p className="mt-6 text-xs text-muted">
        Statuts disponibles : {DOCUMENT_STATUSES.length} étapes de traitement suivies. Toutes les données
        affichées proviennent de votre compte.
      </p>
    </>
  );
}

function quotaLabel(key: string): string {
  const labels: Record<string, string> = {
    documents_total: 'Cours',
    documents_per_month: 'Imports ce mois',
    ai_generations_per_month: 'Générations IA',
    assessments_per_month: 'Évaluations',
    assistant_messages_per_day: "Messages aujourd'hui",
    storage_mb: 'Stockage (Mo)',
    ocr_pages_per_month: 'Pages OCR',
  };
  return labels[key] ?? key;
}
