import Link from 'next/link';
import { apiFetch, formatDate } from '@/lib/api';
import { Badge, Card, EmptyState, ModeNotice } from '@/components/ui';
import { PageHeader } from '@/components/shell';
import { ASSESSMENT_TYPES, FRENCH_LABELS, type AssessmentType } from '@memo/shared';

interface AssessmentRow {
  id: string;
  title: string;
  type: string;
  difficulty: string;
  status: string;
  mode: string;
  maxScore: number;
  score: number | null;
  percentage: number | null;
  durationMinutes: number;
  createdAt: string;
  submittedAt: string | null;
  subject: { name: string; color: string } | null;
  _count: { questions: number };
}

export default async function AssessmentsPage() {
  const items = await apiFetch<AssessmentRow[]>('/assessments');

  return (
    <>
      <PageHeader
        title="Évaluations"
        subtitle="QCM, questions écrites et épreuves mixtes, générés depuis vos cours et corrigés avec barème."
        action={
          <Link
            href="/evaluations/nouvelle"
            className="rounded-xl bg-memo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-memo-700"
          >
            + Nouvelle épreuve
          </Link>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Aucune évaluation pour le moment"
          description="Créez une épreuve à partir d'un cours analysé : questions fidèles au contenu, difficulté réglable, correction détaillée."
          action={{ href: '/evaluations/nouvelle', label: 'Créer ma première épreuve' }}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <Card as="li" key={item.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/evaluations/${item.id}`} className="font-bold hover:text-memo-600">
                      {item.title}
                    </Link>
                    <Badge tone="brand">
                      {FRENCH_LABELS.ASSESSMENT_TYPES[item.type as AssessmentType] ?? item.type}
                    </Badge>
                    <Badge tone="neutral">{item._count.questions} question(s)</Badge>
                    {item.submittedAt ? (
                      <Badge tone={(item.percentage ?? 0) >= 60 ? 'success' : 'danger'}>
                        {item.percentage ?? 0}%
                      </Badge>
                    ) : (
                      <Badge tone="info">À passer</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {item.subject?.name ?? 'Sans matière'} · {item.durationMinutes} min · créée le{' '}
                    {formatDate(item.createdAt)}
                    {item.submittedAt ? ` · terminée le ${formatDate(item.submittedAt)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ModeNotice mode={item.mode === 'live' ? 'live' : 'demo'} />
                  <Link
                    href={`/evaluations/${item.id}`}
                    className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold hover:border-memo-300"
                  >
                    {item.submittedAt ? 'Voir la correction' : 'Passer l’épreuve'}
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}

      <p className="mt-5 text-xs text-muted">
        Types disponibles :{' '}
        {ASSESSMENT_TYPES.map((type) => FRENCH_LABELS.ASSESSMENT_TYPES[type]).join(' · ')}.
      </p>
    </>
  );
}
