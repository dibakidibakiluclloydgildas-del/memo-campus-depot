import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/shell';
import { Alert, Card } from '@/components/ui';
import { UploadForm } from '@/components/upload-form';

export const metadata = { title: 'Importer un cours' };

export default async function ImportPage() {
  const subjects = await apiFetch<{ id: string; name: string; color: string }[]>('/subjects');

  return (
    <>
      <PageHeader
        title="Importer un cours"
        subtitle="Le document est analysé côté serveur : extraction du texte, OCR si nécessaire, détection des chapitres puis indexation."
      />

      <Card className="p-5 sm:p-6">
        <UploadForm subjects={subjects} />
      </Card>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Alert tone="info" title="Ce qui se passe ensuite">
          <ol className="mt-1 list-inside list-decimal space-y-1 text-sm">
            <li>Validation réelle du type de fichier (signature binaire, pas l&apos;extension).</li>
            <li>Extraction du texte page par page, avec OCR automatique si la page est une image.</li>
            <li>Détection des chapitres et des sections, découpage et indexation sémantique.</li>
            <li>Signalement explicite des pages illisibles ou manquantes — jamais d&apos;invention.</li>
          </ol>
        </Alert>
        <Alert tone="warning" title="Pour de meilleurs résultats">
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
            <li>Préférez le PDF d&apos;origine plutôt qu&apos;une photo d&apos;écran.</li>
            <li>Pour une photo : nette, droite, bien éclairée, sans ombre.</li>
            <li>Un document de 60 pages maximum par import garantit un OCR fiable.</li>
          </ul>
        </Alert>
      </div>
    </>
  );
}
