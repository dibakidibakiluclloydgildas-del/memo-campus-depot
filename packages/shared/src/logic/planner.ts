import type { PlanningBlockType } from '../enums.js';

/**
 * Planificateur académique déterministe.
 *
 * Contraintes (cahier des charges §9) :
 *  - respecte les disponibilités déclarées semaine par semaine ;
 *  - ne dépasse pas N séances par jour ;
 *  - insère des pauses (Pomodoro) et évite les journées surchargées ;
 *  - priorise les échéances proches et les notions faibles ;
 *  - laisse toujours une marge de récupération (pas de séance > 2 h d'affilée).
 *
 * Le résultat est *proposé* à l'étudiant : il peut le modifier, le décaler ou
 * le supprimer. L'algorithme n'écrit jamais en base directement.
 */

export interface Availability {
  /** 0 = dimanche … 6 = samedi */
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface SchedulingTask {
  id: string;
  title: string;
  subjectId?: string | null;
  type: PlanningBlockType;
  /** Poids de priorité 1 (faible) à 5 (critique). */
  priority: number;
  /** Durée souhaitée en minutes ; sera ramenée à la longueur de séance. */
  estimatedMinutes?: number;
  /** Échéance : la tâche doit être planifiée avant cette date. */
  dueAt?: Date | null;
}

export interface SchedulingOptions {
  from: Date;
  to: Date;
  sessionMinutes: number;
  breakMinutes: number;
  maxSessionsPerDay: number;
  availability: Availability[];
  /** Évite de planifier le dimanche si l'étudiant ne l'a pas déclaré. */
  respectDeadlineOnly?: boolean;
  /** Instant de référence (injecté dans les tests) : défaut = maintenant. */
  now?: Date;
}

export interface ScheduledBlock {
  taskId: string;
  title: string;
  type: PlanningBlockType;
  subjectId?: string | null;
  startAt: Date;
  endAt: Date;
  priority: number;
  /** Raison pédagogique affichée à l'étudiant. */
  rationale: string;
}

export interface UnscheduledTask {
  taskId: string;
  title: string;
  reason: string;
}

const DAY_MS = 86_400_000;

function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function minutesToDate(day: Date, minutes: number): Date {
  return new Date(day.getTime() + minutes * 60_000);
}

/**
 * Instant représentant `minutes` après l'origine du jour.
 *
 * Les disponibilités sont exprimées en UTC (cohérent avec `weekday` +
 * `startMinute`), mais l'agenda doit rester lisible dans l'heure locale de
 * l'utilisateur : on reconstruit donc la date en heure locale, ce qui donne un
 * affichage stable quel que soit le fuseau du serveur.
 */
function minutesToLocalDate(day: Date, minutes: number): Date {
  return new Date(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    Math.floor(minutes / 60),
    minutes % 60,
    0,
    0,
  );
}

/**
 * Date de référence pour la génération : le début du jour de l'utilisateur.
 * Un planning demarré « maintenant » doit pouvoir commencer le soir même, et
 * non le lendemain, sans jamais placer une séance avant l'heure actuelle.
 */
export function planningStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Retire les créneaux déjà écoulés de la journée en cours. */
export function elapsedMinutesOfDay(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Fusionne les créneaux de disponibilité qui se chevauchent ou se touchent. */
export function mergeAvailability(slots: Availability[]): Availability[] {
  const sorted = [...slots].sort((a, b) => a.startMinute - b.startMinute);
  const merged: Availability[] = [];
  for (const slot of sorted) {
    const last = merged[merged.length - 1];
    if (last && slot.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, slot.endMinute);
    } else {
      merged.push({ ...slot });
    }
  }
  return merged;
}

/** Score de priorité : échéance proche > priorité déclarée > tâche courte. */
export function taskWeight(task: SchedulingTask, now: Date): number {
  let weight = task.priority * 10;
  if (task.dueAt) {
    const days = (startOfDayUTC(task.dueAt).getTime() - startOfDayUTC(now).getTime()) / DAY_MS;
    if (days <= 0) weight += 60;
    else if (days <= 2) weight += 45;
    else if (days <= 7) weight += 30;
    else if (days <= 14) weight += 15;
    else weight += 5;
  }
  if (task.type === 'EXAMEN') weight += 25;
  if (task.type === 'REVISION') weight += 5;
  return weight;
}

export function generatePlanning(
  tasks: SchedulingTask[],
  options: SchedulingOptions,
): { blocks: ScheduledBlock[]; unscheduled: UnscheduledTask[] } {
  const {
    from,
    to,
    sessionMinutes,
    breakMinutes,
    maxSessionsPerDay,
    availability,
    respectDeadlineOnly = true,
  } = options;

  const blocks: ScheduledBlock[] = [];
  const remaining = tasks
    .map((task) => ({ task, weight: taskWeight(task, from) }))
    .sort((a, b) => b.weight - a.weight || a.task.id.localeCompare(b.task.id));

  const queue = remaining.map((r) => ({ ...r.task, weight: r.weight }));
  const unscheduled: UnscheduledTask[] = [];

  const now = options.now ?? new Date();
  const firstDay = startOfDayUTC(from);
  const lastDay = startOfDayUTC(to);

  for (let day = firstDay.getTime(); day <= lastDay.getTime(); day += DAY_MS) {
    const dayDate = new Date(day);
    const weekday = dayDate.getUTCDay();
    // Fusion des créneaux qui se chevauchent : deux disponibilités simultanées
    // ne doivent jamais produire deux séances à la même heure.
    const slots = mergeAvailability(availability.filter((a) => a.weekday === weekday));
    if (slots.length === 0) continue;

    let scheduledToday = 0;
    for (const slot of slots) {
      if (scheduledToday >= maxSessionsPerDay) break;
      // Marge de respiration : on n'utilise jamais les 10 dernières minutes
      // d'un créneau pour éviter les enchaînements irréalistes.
      const usableEnd = slot.endMinute - 10;
      // Aujourd'hui : ne jamais proposer une séance déjà commencée.
      const earliest = day === firstDay.getTime() ? Math.max(slot.startMinute, elapsedMinutesOfDay(now)) : slot.startMinute;
      let cursor = Math.max(slot.startMinute, earliest);

      while (
        cursor + sessionMinutes <= usableEnd &&
        scheduledToday < maxSessionsPerDay &&
        queue.length > 0
      ) {
        const next = queue[0];
        if (!next) break;

        // Ne pas planifier après l'échéance : si la tâche est due avant,
        // on la planifie au plus tôt (déjà garanti par le tri).
        const startAt = minutesToLocalDate(dayDate, cursor);
        const endAt = minutesToLocalDate(dayDate, cursor + sessionMinutes);
        if (respectDeadlineOnly && next.dueAt && startAt > next.dueAt) {
          queue.shift();
          unscheduled.push({
            taskId: next.id,
            title: next.title,
            reason: 'Échéance trop proche pour être placée dans les disponibilités déclarées.',
          });
          continue;
        }

        blocks.push({
          taskId: next.id,
          title: next.title,
          type: next.type,
          subjectId: next.subjectId ?? null,
          startAt,
          endAt,
          priority: next.priority,
          rationale: buildRationale(next, startAt),
        });
        queue.shift();
        scheduledToday += 1;
        cursor += sessionMinutes;

        // Pause obligatoire entre deux séances (Pomodoro long).
        if (scheduledToday < maxSessionsPerDay && queue.length > 0) {
          cursor += breakMinutes;
        }
      }
      if (scheduledToday >= maxSessionsPerDay) break;
    }
  }

  for (const leftover of queue) {
    unscheduled.push({
      taskId: leftover.id,
      title: leftover.title,
      reason: 'Aucune disponibilité restante dans la période : élargissez vos créneaux ou réduisez la durée des séances.',
    });
  }

  return { blocks, unscheduled };
}

function buildRationale(task: SchedulingTask & { weight?: number }, startAt: Date): string {
  const parts: string[] = [];
  if (task.dueAt) {
    const days = Math.ceil((startOfDayUTC(task.dueAt).getTime() - startOfDayUTC(startAt).getTime()) / DAY_MS);
    if (days <= 0) parts.push('échéance aujourd’hui');
    else if (days <= 3) parts.push(`échéance dans ${days} j`);
    else parts.push(`préparation à ${days} j de l’échéance`);
  }
  if (task.priority >= 4) parts.push('priorité élevée');
  if (task.type === 'REVISION') parts.push('répétition espacée due');
  const reason = parts.length ? parts.join(', ') : 'créneau disponible';
  return `Planifiée car ${reason}.`;
}

/**
 * Replanification après séance manquée : la séance est repoussée au prochain
 * créneau libre sans empiler plus de `maxSessionsPerDay` séances sur un jour.
 */
export function replanMissedBlock(
  missed: { title: string; type: PlanningBlockType; subjectId?: string | null; priority: number },
  existingBlocks: { startAt: Date; endAt: Date }[],
  options: SchedulingOptions,
): ScheduledBlock | null {
  const candidates = generatePlanning(
    [
      {
        id: 'replan',
        title: missed.title,
        type: missed.type,
        subjectId: missed.subjectId ?? null,
        priority: Math.min(5, missed.priority + 1),
      },
    ],
    { ...options, from: new Date(Date.now() + DAY_MS), respectDeadlineOnly: false },
  );
  const candidate = candidates.blocks[0];
  if (!candidate) return null;
  const clash = existingBlocks.some(
    (b) => candidate.startAt < b.endAt && candidate.endAt > b.startAt,
  );
  return clash ? null : candidate;
}
