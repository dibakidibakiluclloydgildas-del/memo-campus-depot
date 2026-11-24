import { redirect } from 'next/navigation';
import { apiFetchOptional } from '@/lib/api';
import { AppShell } from '@/components/shell';

interface Profile {
  id: string;
  displayName: string;
  email: string;
  role: string;
  planCode: string;
}

/**
 * Layout des espaces authentifiés : vérifie la session côté serveur avant tout
 * rendu. Aucune page protégée ne peut être affichée sans session valide.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await apiFetchOptional<Profile>('/auth/me');
  if (!profile) redirect('/connexion');

  const dashboard = await apiFetchOptional<{ memory?: { dueToday?: number }; subscription?: { plan?: { name?: string } } }>(
    '/dashboard',
  ).catch(() => null);

  return (
    <AppShell
      user={profile}
      dueToday={dashboard?.memory?.dueToday ?? 0}
      planName={dashboard?.subscription?.plan?.name}
    >
      {children}
    </AppShell>
  );
}
