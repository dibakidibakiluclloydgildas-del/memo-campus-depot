'use client';

import { useEffect, useRef, useState } from 'react';

type Phase = 'focus' | 'break' | 'idle';

/**
 * Minuteur Pomodoro réellement fonctionnel : la session est enregistrée côté
 * serveur au démarrage et à la clôture, ce qui permet des statistiques de temps
 * d'étude fiables (et non des chiffres inventés).
 */
export function PomodoroTimer() {
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [phase, setPhase] = useState<Phase>('idle');
  const [remaining, setRemaining] = useState(25 * 60);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cyclesDone, setCyclesDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase === 'idle') setRemaining(focusMinutes * 60);
  }, [focusMinutes, phase]);

  useEffect(() => {
    if (phase === 'idle') return;
    intervalRef.current = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          if (phase === 'focus') {
            setPhase('break');
            setCyclesDone((count) => count + 1);
            return breakMinutes * 60;
          }
          setPhase('focus');
          return focusMinutes * 60;
        }
        return value - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase, focusMinutes, breakMinutes]);

  async function start() {
    setError(null);
    const response = await fetch('/api/proxy/planning/pomodoro/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ focusMinutes, breakMinutes, cycles: cyclesDone + 1 }),
    });
    const body = (await response.json()) as { id?: string; message?: string };
    if (!response.ok || !body.id) {
      setError(body.message ?? 'Impossible de démarrer la session.');
      return;
    }
    setSessionId(body.id);
    setPhase('focus');
    setRemaining(focusMinutes * 60);
  }

  async function stop() {
    setPhase('idle');
    setRemaining(focusMinutes * 60);
    if (sessionId) {
      await fetch(`/api/proxy/planning/pomodoro/${sessionId}/complete`, { method: 'POST' }).catch(() => undefined);
      setSessionId(null);
    }
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const percentage = phase === 'focus' ? 1 - remaining / (focusMinutes * 60) : 1 - remaining / (breakMinutes * 60);

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Minuteur Pomodoro</h2>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          {phase === 'focus' ? 'Concentration' : phase === 'break' ? 'Pause' : 'Prêt'}
        </span>
      </div>

      <p className="mt-3 text-center font-mono text-4xl font-black tabular-nums">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full ${phase === 'break' ? 'bg-progress-500' : 'bg-memo-600'}`}
          style={{ width: `${Math.max(0, Math.min(100, percentage * 100))}%` }}
        />
      </div>

      {phase === 'idle' ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="focus" className="mb-1 block text-xs font-semibold">
              Concentration (min)
            </label>
            <input
              id="focus"
              type="number"
              min={5}
              max={90}
              value={focusMinutes}
              onChange={(event) => setFocusMinutes(Number(event.target.value))}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="pause" className="mb-1 block text-xs font-semibold">
              Pause (min)
            </label>
            <input
              id="pause"
              type="number"
              min={3}
              max={30}
              value={breakMinutes}
              onChange={(event) => setBreakMinutes(Number(event.target.value))}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
            />
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        {phase === 'idle' ? (
          <button
            type="button"
            onClick={start}
            className="flex-1 rounded-xl bg-memo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-memo-700"
          >
            Démarrer une session
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="flex-1 rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-semibold"
          >
            Terminer la session
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">
        Cycles terminés aujourd&apos;hui : {cyclesDone}. Les pauses sont obligatoires : un planning sans repos est un
        planning irréaliste.
      </p>
      {error ? (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
