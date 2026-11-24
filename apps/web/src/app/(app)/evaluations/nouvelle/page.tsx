import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/shell';
import { Alert, Card } from '@/components/ui';
import { AssessmentWizard } from '@/components/assessment-wizard';

export const metadata = { title: 'Nouvelle épreuve' };

export default async function NewAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string }>;
}) {
  const { documentId } = await searchParams;
  const [documents, subjects] = await Promise.all([
    apiFetch<{ items: { id: string; title: string; status: string }[] }>('/documents?pageSize=100'),
    apiFetch<{ id: string; name: string; color: string }[]>('/subjects'),
  ]);
  const ready = documents.items.filter((doc) => doc.status === 'READY' || doc.status === 'PARTIAL');

  return (
    <>
      <PageHeader
        title="Nouvelle épreuve"
        subtitle="Choisissez la matière, les cours sources, le type d'épreuve et le barème. Les questions sont générées à partir du contenu réel de vos documents."
      />

      {ready.length === 0 ? (
        <Alert tone="warning" title="Aucun cours analysé disponible">
          Importez d&apos;abord un cours et attendez la fin de l&apos;analyse : une épreuve ne peut pas être générée sans
          contenu source vérifiable.
        </Alert>
      ) : (
        <Card className="p-5 sm:p-6">
          <AssessmentWizard documents={ready} subjects={subjects} preselectedDocumentId={documentId ?? null} />
        </Card>
      )}
    </>
  );
}
