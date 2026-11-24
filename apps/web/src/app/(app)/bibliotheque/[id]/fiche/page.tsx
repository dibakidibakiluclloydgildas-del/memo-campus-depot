import Link from 'next/link';
import { ApiError, apiFetch, formatDate } from '@/lib/api';
import { Alert, Badge, Card, EmptyState, ModeNotice, SectionTitle } from '@/components/ui';
import { PageHeader } from '@/components/shell';
import { FlashcardGenerator } from '@/components/flashcard-generator';

interface RevisionSheet {
  title: string;
  subject: string | null;
  pageCount: number | null;
  generatedAt: string;
  mode: string;
  objectives: string[];
  keyNotions: { term: string; definition: string; source?: { page?: number } }[];
  formulas: { expression: string; meaning: string }[];
  uncertainties: string[];
  flashcards: { question: string; answer: string; masteryStatus: string }[];
}

export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let sheet: RevisionSheet | null = null;
  let reason: string | null = null;
  try {
    sheet = await apiFetch<RevisionSheet>(`/documents/${id}/revision-sheet`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 400 || error.status === 404)) {
      reason = error.message;
    } else {
      throw error;
    }
  }

  return (
    <>
      <PageHeader
        title="Fiche de révision"
        subtitle="Synthèse imprimable : objectifs, notions, formules et cartes de rappel actif."
        action={
          <div className="flex gap-2">
            <Link
              href={`/bibliotheque/${id}`}
              className="rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-semibold hover:border-memo-300"
            >
              ← Cours
            </Link>
            <Link
              href={`/bibliotheque/${id}/resume`}
              className="rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-semibold hover:border-memo-300"
            >
              Résumé
            </Link>
          </div>
        }
      />

      {!sheet ? (
        <Card className="p-5">
          <EmptyState
            title="Fiche indisponible"
            description={
              reason ??
              "Générez d'abord le résumé du cours : la fiche de révision s'appuie dessus pour garantir la cohérence."
            }
            action={{ href: `/bibliotheque/${id}/resume`, label: 'Générer le résumé' }}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <ModeNotice mode={sheet.mode === 'live' ? 'live' : 'demo'} />
            <Badge tone="neutral">
              {sheet.subject ?? 'Sans matière'} · {sheet.pageCount ?? '—'} pages
            </Badge>
            <Badge tone="neutral">Générée le {formatDate(sheet.generatedAt)}</Badge>
          </div>

          <Card className="p-5 sm:p-6">
            <h2 className="text-xl font-black tracking-tight">{sheet.title}</h2>
            <p className="mt-1 text-xs text-muted">
              Fiche imprimable — utilisez Ctrl/Cmd + P pour enregistrer en PDF.
            </p>

            {sheet.objectives.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-sm font-bold uppercase tracking-wide text-memo-600">Objectifs</h3>
                <ul className="mt-1.5 space-y-1 text-sm">
                  {sheet.objectives.map((objective) => (
                    <li key={objective} className="flex gap-2">
                      <span aria-hidden>▸</span>
                      {objective}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {sheet.keyNotions.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-sm font-bold uppercase tracking-wide text-memo-600">Notions essentielles</h3>
                <dl className="mt-1.5 space-y-2 text-sm">
                  {sheet.keyNotions.map((notion) => (
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
              </div>
            ) : null}

            {sheet.formulas.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-sm font-bold uppercase tracking-wide text-memo-600">Formules</h3>
                <ul className="mt-1.5 space-y-1.5 text-sm">
                  {sheet.formulas.map((formula) => (
                    <li key={formula.expression} className="rounded-lg bg-[var(--surface-muted)] p-2.5">
                      <code className="font-mono">{formula.expression}</code>
                      <p className="text-xs text-muted">{formula.meaning}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {sheet.uncertainties.length > 0 ? (
              <div className="mt-4">
                <Alert tone="warning" title="À vérifier sur le document">
                  <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
                    {sheet.uncertainties.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Alert>
              </div>
            ) : null}
          </Card>

          <Card className="p-5">
            <SectionTitle
              eyebrow="Rappel actif"
              title={`Cartes mémoire (${sheet.flashcards.length})`}
              action={
                <Link href="/revisions" className="text-sm font-semibold text-memo-600 hover:underline">
                  Réviser →
                </Link>
              }
            />
            {sheet.flashcards.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Aucune carte pour ce cours. Générez des cartes de rappel actif : elles alimentent la répétition
                  espacée et les révisions du jour.
                </p>
                <FlashcardGenerator documentId={id} />
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {sheet.flashcards.map((card) => (
                    <li key={card.question} className="rounded-xl border border-[var(--border-subtle)] p-3">
                      <p className="text-sm font-semibold">{card.question}</p>
                      <p className="mt-1 text-sm text-muted">{card.answer}</p>
                      <p className="mt-1 text-xs text-memo-600">{card.masteryStatus}</p>
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <FlashcardGenerator documentId={id} label="Générer d'autres cartes" />
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
