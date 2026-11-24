import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Badge, Card, EmptyState, StatusBadge } from '@/components/ui';
import { PageHeader } from '@/components/shell';
import { FRENCH_LABELS, type DocumentStatus } from '@memo/shared';
import { formatDate, formatSize } from '@/lib/api';

interface LibraryItem {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  statusMessage: string | null;
  progress: number;
  pageCount: number | null;
  ocrUsed: boolean;
  createdAt: string;
  archived: boolean;
  subject: { id: string; name: string; color: string } | null;
  _count: { chapters: number; chunks: number; summaries: number };
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  const data = await apiFetch<{ items: LibraryItem[]; total: number }>(`/documents?${query.toString()}`);

  return (
    <>
      <PageHeader
        title="Bibliothèque"
        subtitle="Vos cours importés, leur état d'analyse réel et l'accès aux contenus produits."
        action={
          <Link
            href="/bibliotheque/importer"
            className="rounded-xl bg-memo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-memo-700"
          >
            + Importer un cours
          </Link>
        }
      />

      <form className="mb-5 flex flex-wrap gap-2" action="/bibliotheque" method="get">
        <label htmlFor="search" className="sr-only">
          Rechercher un cours
        </label>
        <input
          id="search"
          name="search"
          defaultValue={params.search ?? ''}
          placeholder="Rechercher un cours…"
          className="min-w-0 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm"
        />
        <label htmlFor="status" className="sr-only">
          Filtrer par état
        </label>
        <select
          id="status"
          name="status"
          defaultValue={params.status ?? ''}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm"
        >
          <option value="">Tous les états</option>
          {(['READY', 'PARTIAL', 'FAILED'] as const).map((status) => (
            <option key={status} value={status}>
              {FRENCH_LABELS.DOCUMENT_STATUSES[status]}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-semibold">
          Filtrer
        </button>
      </form>

      {data.items.length === 0 ? (
        <EmptyState
          title="Aucun cours trouvé"
          description="Importez un PDF natif, une photo lisible de vos notes ou un document Word. L'analyse détecte les chapitres et signale les passages illisibles."
          action={{ href: '/bibliotheque/importer', label: 'Importer un cours' }}
        />
      ) : (
        <ul className="space-y-3">
          {data.items.map((item) => (
            <Card as="li" key={item.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/bibliotheque/${item.id}`} className="text-base font-bold hover:text-memo-600">
                      {item.title}
                    </Link>
                    <StatusBadge
                      status={item.status}
                      label={FRENCH_LABELS.DOCUMENT_STATUSES[item.status as DocumentStatus] ?? item.status}
                    />
                    {item.ocrUsed ? <Badge tone="info">OCR</Badge> : null}
                    {item.archived ? <Badge tone="neutral">Archivé</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {item.subject ? (
                      <span className="mr-2 inline-flex items-center gap-1">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: item.subject.color }}
                          aria-hidden
                        />
                        {item.subject.name}
                      </span>
                    ) : null}
                    {item.pageCount ?? '—'} page(s) · {formatSize(item.sizeBytes)} ·{' '}
                    {item._count.chapters} chapitre(s) · {item._count.chunks} section(s) indexée(s) ·{' '}
                    {formatDate(item.createdAt)}
                  </p>
                  {item.statusMessage && item.status !== 'READY' ? (
                    <p className="mt-1.5 text-xs text-warn-600">{item.statusMessage}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/bibliotheque/${item.id}`}
                    className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold hover:border-memo-300"
                  >
                    Ouvrir
                  </Link>
                  <Link
                    href={`/bibliotheque/${item.id}/resume`}
                    className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold hover:border-memo-300"
                  >
                    Résumé
                  </Link>
                  <Link
                    href={`/bibliotheque/${item.id}/fiche`}
                    className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold hover:border-memo-300"
                  >
                    Fiche
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}
