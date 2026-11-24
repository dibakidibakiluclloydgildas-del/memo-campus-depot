import { apiFetch, formatDate } from '@/lib/api';
import { Badge, Card, SectionTitle } from '@/components/ui';
import { PageHeader } from '@/components/shell';
import { ProfileForm, DangerZone } from '@/components/profile-form';

interface Profile {
  id: string;
  email: string;
  displayName: string;
  role: string;
  planCode: string;
  institution: string | null;
  level: string | null;
  field: string | null;
  specialty: string | null;
  goal: string | null;
  preferences: { theme?: string; dailyReviewLimit?: number; reviewPace?: string } | null;
  createdAt: string;
  subscription: { planCode: string; status: string; currentPeriodEnd: string } | null;
}

export default async function ProfilePage() {
  const [profile, sessions, subjects] = await Promise.all([
    apiFetch<Profile>('/auth/me'),
    apiFetch<{ items: { id: string; ip: string | null; userAgent: string | null; lastUsedAt: string; current: boolean }[] }>(
      '/auth/sessions',
    ),
    apiFetch<{ id: string; name: string; color: string; _count: { documents: number } }[]>('/subjects'),
  ]);

  return (
    <>
      <PageHeader title="Mon profil" subtitle="Vos informations, vos préférences d'apprentissage et la sécurité de votre compte." />

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle eyebrow="Identité" title="Informations personnelles" />
            <ProfileForm
              initial={{
                displayName: profile.displayName,
                institution: profile.institution ?? '',
                level: profile.level ?? '',
                field: profile.field ?? '',
                specialty: profile.specialty ?? '',
                goal: profile.goal ?? '',
                dailyReviewLimit: profile.preferences?.dailyReviewLimit ?? 20,
                reviewPace: profile.preferences?.reviewPace ?? 'NORMAL',
              }}
            />
          </Card>

          <Card className="p-5">
            <SectionTitle eyebrow="Matières" title="Votre organisation" />
            <ul className="space-y-1.5 text-sm">
              {subjects.map((subject) => (
                <li key={subject.id} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: subject.color }} />
                    {subject.name}
                  </span>
                  <span className="text-xs text-muted">{subject._count.documents} cours</span>
                </li>
              ))}
              {subjects.length === 0 ? <li className="text-muted">Aucune matière.</li> : null}
            </ul>
          </Card>

          <DangerZone />
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle eyebrow="Compte" title={profile.email} />
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-muted">Rôle</span>
                <Badge tone="brand">{profile.role}</Badge>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted">Offre</span>
                <Badge tone="success">{profile.subscription?.planCode ?? profile.planCode}</Badge>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted">Membre depuis</span>
                <span>{formatDate(profile.createdAt)}</span>
              </li>
              {profile.subscription ? (
                <li className="flex items-center justify-between">
                  <span className="text-muted">Échéance</span>
                  <span>{formatDate(profile.subscription.currentPeriodEnd)}</span>
                </li>
              ) : null}
            </ul>
          </Card>

          <Card className="p-5">
            <SectionTitle eyebrow="Sécurité" title="Sessions actives" />
            <ul className="space-y-2 text-sm">
              {sessions.items.map((session) => (
                <li key={session.id} className="rounded-xl border border-[var(--border-subtle)] p-2.5">
                  <p className="font-semibold">
                    {session.current ? 'Cet appareil' : 'Autre appareil'}
                    {session.current ? <Badge tone="success" className="ml-2">actuelle</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-muted">{session.userAgent ?? 'Client inconnu'}</p>
                  <p className="text-xs text-muted">
                    {session.ip ?? 'IP inconnue'} · dernière activité {formatDate(session.lastUsedAt, true)}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Un changement de mot de passe révoque immédiatement toutes vos sessions : reconnectez-vous avec votre
              nouveau mot de passe.
            </p>
          </Card>

          <Card className="p-5">
            <SectionTitle eyebrow="Données" title="Vos droits" />
            <p className="text-sm text-muted">
              Vous pouvez exporter l&apos;intégralité de vos données à tout moment, et demander la suppression définitive
              de votre compte.
            </p>
            <a
              href="/api/proxy/auth/export"
              className="mt-3 inline-block rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-semibold hover:border-memo-300"
            >
              Télécharger mes données (JSON)
            </a>
            <p className="mt-2 text-xs text-muted">
              Vos documents ne sont jamais utilisés pour entraîner un modèle sans base légale, information et consentement.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
