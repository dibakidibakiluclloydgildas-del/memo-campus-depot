import { apiFetch } from '@/lib/api';
import { Card, EmptyState, ProgressBar, SectionTitle, Stat } from '@/components/ui';
import { PageHeader } from '@/components/shell';

interface Stats {
  cards: { total: number; dueToday: number; byStatus: Record<string, number>; averageMastery: number };
  reviews: { last30Days: { date: string; reviews: number }[]; totalLast30Days: number };
  study: { totalFocusMinutes: number; sessions: number };
  assessments: {
    count: number;
    averageScore: number | null;
    recent: { title: string; percentage: number | null; submittedAt: string | null }[];
  };
}

const STATUS_LABELS: Record<string, string> = {
  NOUVELLE: 'Nouvelles',
  FRAGILE: 'Fragiles',
  EN_COURS: 'En cours',
  MAITRISEE: 'Maîtrisées',
};

export default async function StatsPage() {
  const stats = await apiFetch<Stats>('/learning/stats');
  const maxReviews = Math.max(1, ...stats.reviews.last30Days.map((day) => day.reviews));

  return (
    <>
      <PageHeader
        title="Statistiques"
        subtitle="Des chiffres réels, calculés à partir de vos révisions et de vos évaluations enregistrées."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cartes" value={stats.cards.total} hint={`${stats.cards.dueToday} à revoir`} />
        <Stat label="Maîtrise moyenne" value={`${stats.cards.averageMastery}/100`} />
        <Stat label="Révisions (30 j)" value={stats.reviews.totalLast30Days} />
        <Stat
          label="Moyenne évaluations"
          value={stats.assessments.averageScore === null ? '—' : `${stats.assessments.averageScore}%`}
          hint={`${stats.assessments.count} épreuve(s)`}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle eyebrow="Régularité" title="Révisions sur 30 jours" />
          <div className="flex h-32 items-end gap-1" role="img" aria-label="Nombre de révisions par jour sur trente jours">
            {stats.reviews.last30Days.map((day) => (
              <div key={day.date} className="flex-1" title={`${day.date} : ${day.reviews} révision(s)`}>
                <div
                  className="w-full rounded-t bg-memo-500"
                  style={{ height: `${Math.max(2, (day.reviews / maxReviews) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Chaque barre représente une journée. La régularité compte davantage que le volume.
          </p>
        </Card>

        <Card className="p-5">
          <SectionTitle eyebrow="Mémorisation" title="Niveau de maîtrise" />
          {stats.cards.total === 0 ? (
            <p className="text-sm text-muted">Aucune carte pour l&apos;instant.</p>
          ) : (
            <div className="space-y-3">
              {(['MAITRISEE', 'EN_COURS', 'FRAGILE', 'NOUVELLE'] as const).map((status) => {
                const count = stats.cards.byStatus[status] ?? 0;
                return (
                  <div key={status}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-semibold">{STATUS_LABELS[status]}</span>
                      <span className="text-muted">{count}</span>
                    </div>
                    <ProgressBar value={(count / stats.cards.total) * 100} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <SectionTitle eyebrow="Évaluations" title="Derniers résultats" />
          {stats.assessments.recent.length === 0 ? (
            <EmptyState
              title="Aucune évaluation terminée"
              description="Passez une épreuve pour suivre votre progression et recevoir des recommandations ciblées."
              action={{ href: '/evaluations/nouvelle', label: 'Créer une épreuve' }}
            />
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {stats.assessments.recent.map((assessment) => (
                <li key={`${assessment.title}-${assessment.submittedAt}`} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-semibold">{assessment.title}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-muted">
                      {assessment.submittedAt
                        ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(assessment.submittedAt))
                        : ''}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        (assessment.percentage ?? 0) >= 60 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {assessment.percentage ?? 0}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <SectionTitle eyebrow="Concentration" title="Temps d'étude enregistré" />
          <p className="text-sm">
            <strong>{stats.study.totalFocusMinutes} minutes</strong> de concentration sur {stats.study.sessions} session(s)
            Pomodoro terminée(s).
          </p>
          <p className="mt-1 text-xs text-muted">
            Seules les sessions démarrées puis clôturées sont comptabilisées : aucun temps n&apos;est estimé.
          </p>
        </Card>
      </div>
    </>
  );
}
