import Link from 'next/link';
import { ApiError, apiFetch, formatDate } from '@/lib/api';
import { Alert, Badge, Card, EmptyState, ModeNotice, SectionTitle } from '@/components/ui';
import { PageHeader } from '@/components/shell';
import { GenerateSummaryPanel } from '@/components/generate-summary';

interface SummaryRecord {
  id: string;
  payload: {
    title?: string;
    generalSummary?: string;
    objectives?: string[];
    keyNotions?: { term: string; definition: string; source?: { page?: number; sectionTitle?: string } }[];
    formulas?: { expression: string; meaning: string }[];
    chapters?: { title: string; summary: string; pageFrom?: number; pageTo?: number }[];
    uncertainties?: string[];
    complementaryNotes?: string[];
  };
  mode: string;
  createdAt: string;
  cached?: boolean;
}

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await apiFetch<{ id: string; title: string; status: string }>(`/documents/${id}`);

  let summary: SummaryRecord | null = null;
  try {
    summary = await apiFetch<SummaryRecord>(`/documents/${id}/summary`);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }

  const payload = summary?.payload ?? {};

  return (
    <>
      <PageHeader
        title="Résumé du cours"
        subtitle={document.title}
        action={
          <div className="flex gap-2">
            <Link
              href={`/bibliotheque/${id}`}
              className="rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-semibold hover:border-memo-300"
            >
              ← Cours
            </Link>
            <Link
              href={`/bibliotheque/${id}/fiche`}
              className="rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-semibold hover:border-memo-300"
            >
              Fiche de révision
            </Link>
          </div>
        }
      />

      {document.status !== 'READY' && document.status !== 'PARTIAL' ? (
        <div className="mb-4">
          <Alert tone="warning" title="Analyse non terminée">
            Le cours est encore en cours de traitement ({document.status}). Le résumé sera fiable une fois l&apos;analyse
            terminée.
          </Alert>
        </div>
      ) : null}

      {!summary ? (
        <Card className="p-5">
          <EmptyState
            title="Aucun résumé pour ce cours"
            description="Générez un résumé structuré : objectifs pédagogiques, notions essentielles, formules et synthèse par chapitre, avec les pages sources."
          />
          <div className="mt-4">
            <GenerateSummaryPanel documentId={id} hasSummary={false} />
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <ModeNotice mode={summary.mode === 'live' ? 'live' : 'demo'} />
            <Badge tone="neutral">Généré le {formatDate(summary.createdAt, true)}</Badge>
            {summary.cached ? <Badge tone="neutral">Enregistré</Badge> : null}
          </div>

          <Card className="p-5 sm:p-6">
            <SectionTitle eyebrow="Synthèse" title={payload.title ?? document.title} />
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{payload.generalSummary}</p>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {payload.objectives && payload.objectives.length > 0 ? (
              <Card className="p-5">
                <SectionTitle eyebrow="Pédagogie" title="Objectifs d'apprentissage" />
                <ul className="space-y-2 text-sm">
                  {payload.objectives.map((objective) => (
                    <li key={objective} className="flex gap-2">
                      <span className="text-memo-600" aria-hidden>
                        ▸
                      </span>
                      {objective}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {payload.keyNotions && payload.keyNotions.length > 0 ? (
              <Card className="p-5">
                <SectionTitle eyebrow="Vocabulaire" title="Notions essentielles" />
                <dl className="space-y-3 text-sm">
                  {payload.keyNotions.slice(0, 14).map((notion) => (
                    <div key={notion.term}>
                      <dt className="font-semibold">{notion.term}</dt>
                      <dd className="text-muted">
                        {notion.definition}
                        {notion.source?.page ? (
                          <span className="ml-1 text-xs font-semibold text-memo-600">(p. {notion.source.page})</span>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            ) : null}
          </div>

          {payload.chapters && payload.chapters.length > 0 ? (
            <Card className="p-5">
              <SectionTitle eyebrow="Chapitre par chapitre" title="Résumés détaillés" />
              <div className="space-y-4">
                {payload.chapters.map((chapter) => (
                  <div key={chapter.title} className="rounded-xl border border-[var(--border-subtle)] p-4">
                    <p className="font-semibold">{chapter.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {chapter.pageFrom ? `Pages ${chapter.pageFrom}${chapter.pageTo ? `–${chapter.pageTo}` : ''}` : ''}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{chapter.summary}</p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {payload.formulas && payload.formulas.length > 0 ? (
            <Card className="p-5">
              <SectionTitle eyebrow="Formules" title="Relations à retenir" />
              <ul className="space-y-2 text-sm">
                {payload.formulas.map((formula) => (
                  <li key={formula.expression} className="rounded-xl bg-[var(--surface-muted)] p-3">
                    <code className="font-mono text-sm">{formula.expression}</code>
                    <p className="mt-1 text-xs text-muted">{formula.meaning}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {payload.uncertainties && payload.uncertainties.length > 0 ? (
            <Alert tone="warning" title="Incertitudes signalées (à vérifier sur le document)">
              <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
                {payload.uncertainties.map((uncertainty) => (
                  <li key={uncertainty}>{uncertainty}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {payload.complementaryNotes && payload.complementaryNotes.length > 0 ? (
            <Alert tone="info" title="Compléments (hors contenu du cours)">
              <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
                {payload.complementaryNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          <Card className="p-5">
            <SectionTitle eyebrow="Actions" title="Aller plus loin" />
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/bibliotheque/${id}/fiche`}
                className="rounded-xl bg-memo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-memo-700"
              >
                Créer mes cartes mémoire
              </Link>
              <Link
                href={`/evaluations/nouvelle?documentId=${id}`}
                className="rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-semibold hover:border-memo-300"
              >
                Générer une évaluation
              </Link>
              <GenerateSummaryPanel documentId={id} hasSummary compact />
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
