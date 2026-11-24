import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-5 text-center">
      <p className="text-5xl" aria-hidden>🧭</p>
      <h1 className="text-2xl font-black tracking-tight">Page introuvable</h1>
      <p className="max-w-md text-sm text-muted">
        Cette page n&apos;existe pas ou ne vous appartient pas. Si vous cherchiez un cours, revenez à votre bibliothèque.
      </p>
      <Link href="/tableau-de-bord" className="mt-2 rounded-xl bg-memo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-memo-700">
        Retour au tableau de bord
      </Link>
    </main>
  );
}
