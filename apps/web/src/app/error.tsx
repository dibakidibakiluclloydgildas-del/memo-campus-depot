'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-5 text-center">
      <p className="text-5xl" aria-hidden>⚠️</p>
      <h1 className="text-2xl font-black tracking-tight">Une erreur est survenue</h1>
      <p className="max-w-md text-sm text-muted">
        Vos données sont intactes. Vous pouvez réessayer ; si le problème persiste, l&apos;API est peut-être momentanément
        indisponible.
      </p>
      {error.digest ? <code className="text-xs text-muted">Référence : {error.digest}</code> : null}
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-xl bg-memo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-memo-700"
      >
        Réessayer
      </button>
    </main>
  );
}
