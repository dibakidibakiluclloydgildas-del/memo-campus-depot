import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetchOptional } from '@/lib/api';
import { Logo } from '@/components/logo';

const FEATURES = [
  {
    icon: '📄',
    title: 'Vos cours, compris et structurés',
    text: "Importez un PDF, une photo ou un Word : MÉMO CAMPUS extrait le texte, détecte les chapitres et signale les passages illisibles — sans rien inventer.",
  },
  {
    icon: '🧠',
    title: 'Mémorisation durable',
    text: 'Cartes mémoire, rappel actif et répétition espacée. Chaque jour, les révisions prioritaires sont proposées avec la raison de leur choix.',
  },
  {
    icon: '📝',
    title: 'Évaluations corrigées',
    text: 'QCM et questions écrites générés depuis vos cours, corrigés avec barème, points partiels et recommandations concrètes.',
  },
  {
    icon: '🗓️',
    title: 'Planning réaliste',
    text: 'Vos disponibilités, vos échéances, vos lacunes : un planning qui prévoit des pauses au lieu de surcharger vos journées.',
  },
  {
    icon: '💬',
    title: 'Assistant tuteur',
    text: "Un professeur particulier qui s'appuie sur vos documents et cite ses sources. Rien de vérifiable ? Il le dit.",
  },
  {
    icon: '📱',
    title: 'Web et Android',
    text: 'Les mêmes comptes et les mêmes données sur ordinateur et téléphone, avec consultation hors connexion des fiches déjà téléchargées.',
  },
];

export default async function LandingPage() {
  const profile = await apiFetchOptional<{ id: string }>('/auth/me');
  if (profile) redirect('/tableau-de-bord');

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-lg font-black tracking-tight">MÉMO CAMPUS</span>
        </div>
        <nav className="flex items-center gap-2 text-sm font-semibold">
          <Link href="/connexion" className="rounded-xl px-3 py-2 hover:bg-[var(--surface-raised)]">
            Se connecter
          </Link>
          <Link
            href="/inscription"
            className="rounded-xl bg-memo-600 px-4 py-2 text-white shadow-sm hover:bg-memo-700"
          >
            Créer un compte
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-14 pt-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-memo-200 bg-memo-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-memo-700 dark:border-memo-500/30 dark:bg-memo-500/10 dark:text-memo-200">
            Plateforme EdTech · Cameroun
          </p>
          <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">
            Comprendre, mémoriser,
            <span className="text-memo-600"> réussir.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            MÉMO CAMPUS transforme vos supports de cours en résumés clairs, fiches de révision,
            évaluations corrigées et planning de travail réaliste. Un compagnon académique qui
            s&apos;appuie <strong>uniquement sur vos documents</strong>.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/inscription"
              className="rounded-xl bg-memo-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-memo-700"
            >
              Commencer gratuitement
            </Link>
            <Link
              href="/connexion"
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-3 font-semibold hover:border-memo-300"
            >
              J&apos;ai déjà un compte
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">
            Offre découverte : 5 cours, 10 générations IA par mois. Aucune carte bancaire requise.
          </p>
        </div>

        <div className="relative">
          <div className="surface rounded-3xl p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-bold">Révisions du jour</p>
              <span className="rounded-full bg-progress-500/10 px-2.5 py-0.5 text-xs font-bold text-progress-600">
                6 cartes
              </span>
            </div>
            <div className="space-y-3">
              {[
                ['Où se déroule la photosynthèse ?', 'Chloroplaste · p. 1', 'Fragile'],
                ['Rôle de la mitochondrie', 'Production d’ATP · p. 2', 'En cours'],
                ['Différence ATP / glucose', 'Énergie vs réserve · p. 3', 'Maîtrisée'],
              ].map(([question, source, status]) => (
                <div key={question} className="rounded-xl border border-[var(--border-subtle)] p-3">
                  <p className="text-sm font-semibold">{question}</p>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                    <span>{source}</span>
                    <span>{status}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-[var(--surface-muted)] p-3 text-xs text-muted">
              <strong className="text-[var(--text-strong)]">Pourquoi ces cartes ?</strong> Proposées car
              en retard de 2 jours et encore fragiles.
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="mb-6 text-2xl font-black tracking-tight">Un produit, deux plateformes</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="surface rounded-2xl p-5">
              <div className="mb-2 text-2xl" aria-hidden>
                {feature.icon}
              </div>
              <h3 className="font-bold">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{feature.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { name: 'Découverte', price: 'Gratuit', items: ['5 cours', '10 générations IA / mois', 'Révisions espacées'] },
            { name: 'Premium', price: '3 500 FCFA / mois', items: ['Cours illimités', 'Assistant IA', 'Statistiques avancées'], highlight: true },
            { name: 'Institution', price: '45 000 FCFA / mois', items: ['Espaces établissement', 'Comptes enseignants', 'Tableaux de bord agrégés'] },
          ].map((plan) => (
            <div
              key={plan.name}
              className={`surface rounded-2xl p-6 ${plan.highlight ? 'ring-2 ring-memo-500' : ''}`}
            >
              {plan.highlight ? (
                <span className="mb-2 inline-block rounded-full bg-memo-600 px-2.5 py-0.5 text-xs font-bold text-white">
                  Recommandé
                </span>
              ) : null}
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <p className="mt-1 text-2xl font-black">{plan.price}</p>
              <ul className="mt-3 space-y-1.5 text-sm text-muted">
                {plan.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-progress-600" aria-hidden>
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Tarifs indicatifs d&apos;affichage. Les prix et quotas réels sont administrés depuis la
          plateforme et confirmés avant tout paiement. Paiements Mobile Money et carte en cours
          d&apos;activation.
        </p>
      </section>

      <footer className="border-t border-[var(--border-subtle)] px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} MÉMO CAMPUS — Yaoundé, Cameroun.</p>
          <p>Vos documents restent privés : aucune utilisation pour entraîner un modèle sans votre accord.</p>
        </div>
      </footer>
    </main>
  );
}
