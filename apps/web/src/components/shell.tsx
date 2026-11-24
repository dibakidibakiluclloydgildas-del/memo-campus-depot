'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from './logo';

type NavItem = { href: string; label: string; icon: string; badge?: number };

const MAIN_NAV: NavItem[] = [
  { href: '/tableau-de-bord', label: 'Tableau de bord', icon: '🏠' },
  { href: '/bibliotheque', label: 'Bibliothèque', icon: '📚' },
  { href: '/revisions', label: 'Révisions', icon: '🧠' },
  { href: '/evaluations', label: 'Évaluations', icon: '📝' },
  { href: '/planning', label: 'Planning', icon: '🗓️' },
  { href: '/assistant', label: 'Assistant', icon: '💬' },
  { href: '/statistiques', label: 'Statistiques', icon: '📈' },
];

const SECONDARY_NAV: NavItem[] = [
  { href: '/profil', label: 'Profil', icon: '👤' },
  { href: '/abonnement', label: 'Mon offre', icon: '⭐' },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    const stored = (localStorage.getItem('memo-theme') as 'light' | 'dark' | 'system' | null) ?? 'system';
    setTheme(stored);
  }, []);

  function apply(next: 'light' | 'dark' | 'system') {
    setTheme(next);
    localStorage.setItem('memo-theme', next);
    const dark =
      next === 'dark' || (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const label = theme === 'light' ? 'Clair' : theme === 'dark' ? 'Sombre' : 'Système';

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs font-semibold hover:border-memo-300"
      aria-label={`Thème : ${label}. Cliquer pour changer.`}
      title={`Thème : ${label}`}
    >
      {theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🖥️'} {label}
    </button>
  );
}

export function AppShell({
  children,
  user,
  dueToday = 0,
  planName,
}: {
  children: React.ReactNode;
  user: { displayName: string; email: string; role: string; planCode: string };
  dueToday?: number;
  planName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function logout() {
    setBusy(true);
    await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    router.push('/connexion');
    router.refresh();
  }

  const nav = [...MAIN_NAV, ...(user.role === 'ADMIN' ? [{ href: '/admin', label: 'Administration', icon: '🛠️' }] : []), ...SECONDARY_NAV];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-memo-600 focus:px-3 focus:py-2 focus:text-white"
      >
        Aller au contenu
      </a>

      {/* Barre mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 lg:hidden">
        <Link href="/tableau-de-bord" className="flex items-center gap-2">
          <Logo size={30} />
          <span className="text-sm font-black tracking-tight">MÉMO CAMPUS</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-sm font-semibold"
            aria-expanded={mobileOpen}
            aria-controls="navigation-principale"
          >
            ☰
          </button>
        </div>
      </header>

      {/* Navigation latérale */}
      <aside
        id="navigation-principale"
        className={`${mobileOpen ? 'block' : 'hidden'} border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r`}
      >
        <div className="hidden items-center gap-2.5 px-5 py-5 lg:flex">
          <Logo />
          <div>
            <p className="text-sm font-black leading-tight tracking-tight">MÉMO CAMPUS</p>
            <p className="text-[11px] text-muted">{planName ?? 'Mon espace'}</p>
          </div>
        </div>

        <nav className="px-3 pb-4" aria-label="Navigation principale">
          <ul className="space-y-1">
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      active
                        ? 'bg-memo-50 text-memo-700 dark:bg-memo-500/15 dark:text-memo-200'
                        : 'hover:bg-[var(--surface-muted)]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span aria-hidden>{item.icon}</span>
                      {item.label}
                    </span>
                    {item.href === '/revisions' && dueToday > 0 ? (
                      <span className="rounded-full bg-memo-600 px-2 py-0.5 text-[11px] font-bold text-white">
                        {dueToday}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mx-3 mb-4 rounded-xl border border-[var(--border-subtle)] p-3">
          <p className="truncate text-sm font-bold">{user.displayName}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
          <div className="mt-2 flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              disabled={busy}
              className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs font-semibold hover:border-red-300 hover:text-red-600 disabled:opacity-50"
            >
              {busy ? '…' : 'Déconnexion'}
            </button>
          </div>
        </div>
      </aside>

      <main id="contenu" className="min-w-0 px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
