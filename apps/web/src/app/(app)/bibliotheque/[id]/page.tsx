import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch, formatDate, formatSize } from '@/lib/api';
import { Alert, Badge, Card, ProgressBar, SectionTitle, StatusBadge } from '@/components/ui';
import { PageHeader } from '@/components/shell';
import { FRENCH_LABELS, type DocumentStatus } from '@memo/shared';
import { DocumentActions } from '@/components/document-actions';

interface DocumentDetail {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  status: string;
  statusMessage: string | null;
  progress: number;
  ocrUsed: boolean;
  ocrPages: number;
  createdAt: string;
  processedAt: string | null;
  subject: { id: string; name: string; color: string } | null;
  chapters: { id: string; title: string; pageFrom: number | null; pageTo: number | null; orderIndex: number }[];
  pages: { pageNumber: number; charCount: number; usedOcr: boolean; confidence: number | null }[];
  summaries: { id: string; title: string; payload: unknown; mode: string; createdAt: string }[];
  warnings: string[];
  fileUrl: string;
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let document: DocumentDetail;
  try {
    document = await apiFetch<DocumentDetail>(`/documents/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const pages = await apiFetch<{ pageNumber: number; text: string; usedOcr: boolean }[]>(
    `/documents/${id}/pages`,
  ).catch(() => []);
  const totalChars = pages.reduce((sum, page) => sum + page.text.length, 0);

  return (
    <>
      <PageHeader
        title={document.title}
        subtitle={`${document.subject?.name ?? 'Sans matière'} · ${document.pageCount ?? '—'} page(s) · ${formatSize(document.sizeBytes)} · importé le ${formatDate(document.createdAt)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/bibliotheque/${document.id}/resume`}
              className="rounded-xl bg-memo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-memo-700"
            >
              Résumé
            </Link>
            <Link
              href={`/bibliotheque/${document.id}/fiche`}
              className="rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-semibold hover:border-memo-300"
            >
              Fiche de révision
            </Link>
            <a
              href={`/api/proxy${document.fileUrl}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-semibold hover:border-memo-300"
            >
              Document original
            </a>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge
          status={document.status}
          label={FRENCH_LABELS.DOCUMENT_STATUSES[document.status as DocumentStatus] ?? document.status}
        />
        {document.ocrUsed ? <Badge tone="info">OCR utilisé ({document.ocrPages} page(s))</Badge> : null}
        {document.subject ? (
          <Badge tone="brand">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: document.subject.color }} />
            {document.subject.name}
          </Badge>
        ) : null}
        <Badge tone="neutral">{document.chapters.length} chapitre(s)</Badge>
        <Badge tone="neutral">{totalChars.toLocaleString('fr-FR')} caractères extraits</Badge>
      </div>

      {document.status !== 'READY' && document.status !== 'PARTIAL' ? (
        <Card className="mb-5 p-5">
          <SectionTitle eyebrow="Traitement" title="Analyse en cours" />
          <ProgressBar value={document.progress} label={document.statusMessage ?? 'Traitement…'} />
          <p className="mt-3 text-sm text-muted">
            Cette page se rafraîchit automatiquement. Vous pouvez quitter : le traitement continue côté serveur et
            reste relançable en cas d&apos;erreur.
          </p>
          <meta httpEquiv="refresh" content="4" />
        </Card>
      ) : null}

      {document.warnings.length > 0 ? (
        <div className="mb-5 space-y-2">
          <Alert tone="warning" title="Points d'attention signalés par l'analyse">
            <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
              {document.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="p-5">
          <SectionTitle eyebrow="Structure détectée" title="Chapitres et sections" />
          {document.chapters.length === 0 ? (
            <p className="text-sm text-muted">
              Aucun chapitre détecté : le document est traité comme un bloc unique. Vous pouvez tout de même générer un
              résumé et des fiches.
            </p>
          ) : (
            <ol className="space-y-2">
              {document.chapters.map((chapter, index) => (
                <li key={chapter.id} className="rounded-xl border border-[var(--border-subtle)] px-3 py-2.5">
                  <p className="text-sm font-semibold">
                    {index + 1}. {chapter.title}
                  </p>
                  <p className="text-xs text-muted">
                    {chapter.pageFrom && chapter.pageTo
                      ? chapter.pageFrom === chapter.pageTo
                        ? `Page ${chapter.pageFrom}`
                        : `Pages ${chapter.pageFrom} à ${chapter.pageTo}`
                      : 'Référence de page non disponible'}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle eyebrow="Source" title="Texte extrait (vérifiable)" />
          {pages.length === 0 ? (
            <p className="text-sm text-muted">Aucun texte page par page n&apos;est encore disponible.</p>
          ) : (
            <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {pages.map((page) => (
                <div key={page.pageNumber} className="rounded-xl border border-[var(--border-subtle)] p-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-memo-600">
                    Page {page.pageNumber} {page.usedOcr ? '· OCR' : ''}
                  </p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted">
                    {page.text.trim().length > 0
                      ? page.text.slice(0, 900)
                      : "Aucun texte exploitable sur cette page : elle ne sera pas utilisée comme source."}
                    {page.text.length > 900 ? '…' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <DocumentActions documentId={document.id} archived={false} />
      </div>
    </>
  );
}
