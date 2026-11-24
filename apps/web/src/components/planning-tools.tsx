'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const DAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

interface Slot {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export function PlanningTools({
  subjects,
  hasAvailability,
}: {
  subjects: { id: string; name: string }[];
  hasAvailability: boolean;
}) {
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>([
    { weekday: 1, startMinute: 17 * 60, endMinute: 20 * 60 },
    { weekday: 3, startMinute: 17 * 60, endMinute: 20 * 60 },
    { weekday: 6, startMinute: 9 * 60, endMinute: 12 * 60 },
  ]);
  const [sessionMinutes, setSessionMinutes] = useState(45);
  const [maxSessionsPerDay, setMaxSessionsPerDay] = useState(2);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [type, setType] = useState('EXAMEN');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [subjectId, setSubjectId] = useState('');

  async function saveAvailability() {
    setBusy('availability');
    setError(null);
    setMessage(null);
    const response = await fetch('/api/proxy/planning/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots }),
    });
    const body = (await response.json()) as { message?: string };
    setBusy(null);
    if (!response.ok) {
      setError(body.message ?? "Enregistrement impossible.");
      return;
    }
    setMessage('Disponibilités enregistrées.');
    router.refresh();
  }

  async function generatePlan() {
    setBusy('plan');
    setError(null);
    setMessage(null);
    const from = new Date();
    const to = new Date(Date.now() + 14 * 86_400_000);
    const response = await fetch('/api/proxy/planning/auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from.toISOString(),
        to: to.toISOString(),
        sessionMinutes,
        breakMinutes: 10,
        maxSessionsPerDay,
        save: true,
      }),
    });
    const body = (await response.json()) as { message?: string; blocks?: unknown[]; unscheduled?: { reason: string }[] };
    setBusy(null);
    if (!response.ok) {
      setError(body.message ?? 'Génération du planning impossible.');
      return;
    }
    setMessage(
      `${body.message ?? ''}${body.unscheduled && body.unscheduled.length > 0 ? ` ${body.unscheduled.length} tâche(s) non planifiée(s) : ${body.unscheduled[0]?.reason ?? ''}` : ''}`,
    );
    router.refresh();
  }

  async function addDeadline(event: React.FormEvent) {
    event.preventDefault();
    setBusy('deadline');
    setError(null);
    setMessage(null);
    if (!date) {
      setError('Choisissez une date d’échéance.');
      setBusy(null);
      return;
    }
    const startAt = new Date(`${date}T${time}:00`);
    const endAt = new Date(startAt.getTime() + 2 * 3_600_000);
    const response = await fetch('/api/proxy/planning/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        type,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        priority: type === 'EXAMEN' ? 5 : 4,
        subjectId: subjectId || null,
      }),
    });
    const body = (await response.json()) as { message?: string };
    setBusy(null);
    if (!response.ok) {
      setError(body.message ?? 'Ajout impossible.');
      return;
    }
    setMessage('Échéance ajoutée à votre agenda.');
    setTitle('');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="surface rounded-2xl p-5">
        <h2 className="text-base font-bold">Mes disponibilités</h2>
        <p className="mt-1 text-xs text-muted">
          Le planning ne sera jamais construit au-delà de ces créneaux. Une marge de 10 minutes est conservée à la fin de
          chaque créneau.
        </p>

        <ul className="mt-3 space-y-2">
          {slots.map((slot, index) => (
            <li key={`${slot.weekday}-${index}`} className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`day-${index}`}>
                Jour
              </label>
              <select
                id={`day-${index}`}
                value={slot.weekday}
                onChange={(event) => {
                  const next = [...slots];
                  next[index] = { ...slot, weekday: Number(event.target.value) };
                  setSlots(next);
                }}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
              >
                {DAY_LABELS.map((label, weekday) => (
                  <option key={label} value={weekday}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="time"
                aria-label="Heure de début"
                value={toTime(slot.startMinute)}
                onChange={(event) => {
                  const next = [...slots];
                  next[index] = { ...slot, startMinute: fromTime(event.target.value) };
                  setSlots(next);
                }}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1.5 text-sm"
              />
              <span className="text-sm text-muted">→</span>
              <input
                type="time"
                aria-label="Heure de fin"
                value={toTime(slot.endMinute)}
                onChange={(event) => {
                  const next = [...slots];
                  next[index] = { ...slot, endMinute: fromTime(event.target.value) };
                  setSlots(next);
                }}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => setSlots(slots.filter((_, position) => position !== index))}
                className="rounded-lg border border-[var(--border-subtle)] px-2 py-1.5 text-xs"
                aria-label={`Supprimer le créneau ${index + 1}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSlots([...slots, { weekday: 2, startMinute: 17 * 60, endMinute: 19 * 60 }])}
            className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold"
          >
            + Créneau
          </button>
          <button
            type="button"
            disabled={busy !== null || slots.length === 0}
            onClick={saveAvailability}
            className="rounded-lg bg-memo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy === 'availability' ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <div className="surface rounded-2xl p-5">
        <h2 className="text-base font-bold">Proposer un planning</h2>
        <p className="mt-1 text-xs text-muted">
          Les séances sont priorisées selon vos échéances et vos notions fragiles, avec des pauses entre les séances.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="session" className="mb-1 block text-xs font-semibold">
              Durée d&apos;une séance (min)
            </label>
            <input
              id="session"
              type="number"
              min={15}
              max={120}
              value={sessionMinutes}
              onChange={(event) => setSessionMinutes(Number(event.target.value))}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="maxSessions" className="mb-1 block text-xs font-semibold">
              Séances maximum par jour
            </label>
            <input
              id="maxSessions"
              type="number"
              min={1}
              max={8}
              value={maxSessionsPerDay}
              onChange={(event) => setMaxSessionsPerDay(Number(event.target.value))}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={generatePlan}
          className="mt-3 rounded-lg bg-memo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === 'plan' ? 'Calcul…' : 'Générer sur 14 jours'}
        </button>
        {!hasAvailability ? (
          <p className="mt-2 text-xs text-warn-600">
            Enregistrez d&apos;abord vos disponibilités : le planning doit s&apos;adapter à votre vie réelle.
          </p>
        ) : null}
      </div>

      <div className="surface rounded-2xl p-5">
        <h2 className="text-base font-bold">Ajouter une échéance</h2>
        <form onSubmit={addDeadline} className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="deadline-title" className="mb-1 block text-xs font-semibold">
              Intitulé
            </label>
            <input
              id="deadline-title"
              required
              minLength={2}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Examen de biologie cellulaire"
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="deadline-type" className="mb-1 block text-xs font-semibold">
              Type
            </label>
            <select
              id="deadline-type"
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              <option value="EXAMEN">Examen</option>
              <option value="DEVOIR">Devoir</option>
              <option value="COURS">Cours</option>
              <option value="REVISION">Révision</option>
            </select>
          </div>
          <div>
            <label htmlFor="deadline-subject" className="mb-1 block text-xs font-semibold">
              Matière
            </label>
            <select
              id="deadline-subject"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              <option value="">Sans matière</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="deadline-date" className="mb-1 block text-xs font-semibold">
              Date
            </label>
            <input
              id="deadline-date"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="deadline-time" className="mb-1 block text-xs font-semibold">
              Heure
            </label>
            <input
              id="deadline-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy !== null}
              className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy === 'deadline' ? 'Ajout…' : 'Ajouter à l’agenda'}
            </button>
          </div>
        </form>
      </div>

      {message ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function fromTime(value: string): number {
  const [hours, mins] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
}
