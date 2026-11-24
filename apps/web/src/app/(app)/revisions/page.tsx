import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Alert, Badge, Card, EmptyState, SectionTitle } from '@/components/ui';
import { PageHeader } from '@/components/shell';
import { ReviewSession } from '@/components/review-session';

interface TodayResponse {
  totalDue: number;
  pace: string;
  items: {
    id: string;
    question: string;
    answer: string;
    hint: string | null;
    subject: { name: string; color: string } | null;
    masteryScore: number;
    masteryStatus: string;
    why: string;
  }[];
}

interface Stats {
  cards: { total: number; dueToday: number; byStatus: Record<string, number>; averageMastery: number };
  reviews: { totalLast30Days: number; last30Days: { date: string; reviews: number }[] };
}

export default async function ReviewsPage() {
  const [today, stats] = await Promise.all([
    apiFetch<TodayResponse>('/learning/reviews/today'),
    apiFetch<Stats>('/learning/stats'),
  ]);

  return (
    <>
      <PageHeader
        title="Révisions du jour"
        subtitle="Rappel actif et répétition espacée : les cartes sont choisies selon votre maîtrise réelle et vos échéances."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">À revoir</p>
          <p className="mt-1 text-2xl font-bold">{today.totalDue}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Maîtrise moyenne</p>
          <p className="mt-1 text-2xl font-bold">{stats.cards.averageMastery}/100</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Révisions (30 j)</p>
          <p className="mt-1 text-2xl font-bold">{stats.reviews.totalLast30Days}</p>
        </Card>
      </div>

      {today.items.length === 0 ? (
        <EmptyState
          title="Aucune révision due pour le moment"
          description="Vos cartes sont à jour. Générez des cartes depuis un cours analysé pour continuer à progresser."
          action={{ href: '/bibliotheque', label: 'Aller à la bibliothèque' }}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <ReviewSession items={today.items} />

          <div className="space-y-4">
            <Card className="p-4">
              <SectionTitle eyebrow="Rythme" title={`Mode ${today.pace.toLowerCase()}`} />
              <p className="text-sm text-muted">
                Votre rythme de révision module les intervalles sans jamais modifier la qualité de votre travail. Vous
                pouvez le changer dans votre profil.
              </p>
              <Link href="/profil" className="mt-2 inline-block text-sm font-semibold text-memo-600 hover:underline">
                Modifier mon rythme →
              </Link>
            </Card>

            <Card className="p-4">
              <SectionTitle eyebrow="État" title="Répartition des cartes" />
              <ul className="space-y-1.5 text-sm">
                {Object.entries(stats.cards.byStatus).map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between">
                    <span className="text-muted">{status}</span>
                    <Badge tone="neutral">{count}</Badge>
                  </li>
                ))}
                {Object.keys(stats.cards.byStatus).length === 0 ? (
                  <li className="text-muted">Aucune carte enregistrée.</li>
                ) : null}
              </ul>
            </Card>

            <Alert tone="info" title="Comment réviser efficacement">
              Ne regardez pas la réponse avant d&apos;avoir essayé de la formuler : c&apos;est l&apos;effort de
              restitution qui fait mémoriser. Notez honnêtement votre difficulté — le système s&apos;adapte, sans vous
              juger.
            </Alert>
          </div>
        </div>
      )}
    </>
  );
}
