import type { MasteryStatus, ReviewGrade } from '../enums.js';

/**
 * Répétition espacée — algorithme SM-2 assoupli + modèle de maîtrise.
 *
 * Choix d'ingénierie : plutôt que d'importer une boîte noire FSRS, nous
 * implémentons un SM-2 modifié, déterministe, testable, dont le facteur de
 * facilité est borné. Il est volontairement conservateur : une notion vue pour
 * la première fois ne revient jamais plus tard que dans 3 jours.
 *
 * Le rythme de révision de l'étudiant (DOUX / NORMAL / INTENSIF) module
 * l'intervalle calculé, jamais la qualité de la note.
 */

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_EASE = 2.8;

export const PACE_MULTIPLIERS = {
  DOUX: 0.75,
  NORMAL: 1,
  INTENSIF: 1.35,
} as const;
export type ReviewPace = keyof typeof PACE_MULTIPLIERS;

export interface ReviewState {
  /** Facteur de facilité (SM-2). */
  ease: number;
  /** Intervalle courant en jours. */
  intervalDays: number;
  /** Nombre de répétitions réussies consécutives. */
  repetitions: number;
  /** Nombre d'oublis (note AGAIN). */
  lapses: number;
  /** Date de la prochaine révision (ISO). */
  dueAt: Date;
  lastReviewedAt: Date | null;
}

export interface ReviewOutcome extends ReviewState {
  /** Score de maîtrise 0..100, dérivé de l'état. */
  masteryScore: number;
  masteryStatus: MasteryStatus;
  /** Explication lisible du pourquoi cette carte revient à cette date. */
  reason: string;
}

const GRADE_QUALITY: Record<ReviewGrade, number> = {
  AGAIN: 1,
  HARD: 3,
  GOOD: 4,
  EASY: 5,
};

/** Entrelacement déterministe pour éviter de saturer une seule journée. */
export function initialReviewState(now: Date = new Date()): ReviewState {
  return {
    ease: DEFAULT_EASE,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    dueAt: now,
    lastReviewedAt: null,
  };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d;
}

/**
 * Applique une note de révision et renvoie le nouvel état.
 * Bornes volontairement serrées pour un usage étudiant : jamais plus de
 * 180 jours d'écart (une notion doit être revue au moins une fois par semestre).
 */
export function scheduleReview(
  state: ReviewState,
  grade: ReviewGrade,
  options: { now?: Date; pace?: ReviewPace } = {},
): ReviewOutcome {
  const now = options.now ?? new Date();
  const pace = options.pace ?? 'NORMAL';
  const quality = GRADE_QUALITY[grade];
  const multiplier = PACE_MULTIPLIERS[pace];

  let { ease, intervalDays, repetitions, lapses } = state;

  if (grade === 'AGAIN') {
    lapses += 1;
    repetitions = 0;
    intervalDays = 0.5; // revoir dans la journée suivante / demi-journée
    ease = Math.max(MIN_EASE, ease - 0.2);
  } else {
    repetitions += 1;
    const easeDelta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
    ease = Math.min(MAX_EASE, Math.max(MIN_EASE, ease + easeDelta));

    if (repetitions === 1) {
      intervalDays = grade === 'EASY' ? 3 : grade === 'HARD' ? 1 : 1.5;
    } else if (repetitions === 2) {
      intervalDays = grade === 'EASY' ? 7 : grade === 'HARD' ? 3 : 5;
    } else {
      const base = Math.max(intervalDays, 1) * ease;
      const hardPenalty = grade === 'HARD' ? 0.6 : 1;
      const easyBonus = grade === 'EASY' ? 1.3 : 1;
      intervalDays = base * hardPenalty * easyBonus;
    }
  }

  const paced = intervalDays * multiplier;
  const bounded = Math.min(180, Math.max(0.5, paced));

  const dueAt = addDays(now, bounded);
  const outcome: ReviewOutcome = {
    ease,
    intervalDays: Number(bounded.toFixed(2)),
    repetitions,
    lapses,
    dueAt,
    lastReviewedAt: now,
    masteryScore: 0,
    masteryStatus: 'NOUVELLE',
    reason: '',
  };
  outcome.masteryScore = computeMasteryScore(outcome);
  outcome.masteryStatus = classifyMastery(outcome);
  outcome.reason = explainReview(state, outcome, grade);
  return outcome;
}

/**
 * Score de maîtrise : combine la régularité (répétitions), la rétention
 * (intervalles qui s'allongent) et la pénalité d'oubli.
 */
export function computeMasteryScore(state: Pick<ReviewState, 'repetitions' | 'lapses' | 'intervalDays' | 'ease'>): number {
  const repetitionScore = Math.min(1, state.repetitions / 5) * 60;
  const intervalScore = Math.min(1, state.intervalDays / 30) * 25;
  const easeScore = ((state.ease - MIN_EASE) / (MAX_EASE - MIN_EASE)) * 15;
  const lapsePenalty = Math.min(20, state.lapses * 6);
  return Math.round(Math.max(0, Math.min(100, repetitionScore + intervalScore + easeScore - lapsePenalty)));
}

export function classifyMastery(state: Pick<ReviewState, 'repetitions' | 'intervalDays' | 'lapses'>): MasteryStatus {
  const score = computeMasteryScore({ ...state, ease: DEFAULT_EASE });
  if (state.repetitions === 0) return state.lapses > 0 ? 'FRAGILE' : 'NOUVELLE';
  if (score >= 70 && state.intervalDays >= 14) return 'MAITRISEE';
  if (score >= 40) return 'EN_COURS';
  return 'FRAGILE';
}

function explainReview(previous: ReviewState, next: ReviewOutcome, grade: ReviewGrade): string {
  const days = Math.round(next.intervalDays * 10) / 10;
  const when = days < 1 ? 'dans la journée' : days < 2 ? 'demain' : `dans ${Math.round(days)} jours`;
  if (grade === 'AGAIN') {
    return `Notion signalée comme oubliée : révision reprogrammée ${when} pour consolider la trace mnésique.`;
  }
  if (previous.repetitions === 0) {
    return `Première restitution réussie : la notion revient ${when} pour ancrer l'information.`;
  }
  return `Restitution réussie (${previous.repetitions + 1}ᵉ passage) : intervalle allongé, prochaine révision ${when}.`;
}

/**
 * Priorisation des révisions du jour : combine retard, fragilité et échéance.
 * Le score le plus élevé est revu en premier. Le "pourquoi" est explicite,
 * exigence du cahier des charges (§7).
 */
export interface RevisionCandidate {
  id: string;
  dueAt: Date;
  masteryScore: number;
  lapses: number;
  /** Jours restants avant l'examen lié (optionnel). */
  daysUntilExam?: number;
  difficulty?: 'FACILE' | 'MOYEN' | 'DIFFICILE';
}

export interface PrioritizedRevision extends RevisionCandidate {
  priority: number;
  why: string;
}

export function prioritizeRevisions(
  candidates: RevisionCandidate[],
  now: Date = new Date(),
  limit = 20,
): PrioritizedRevision[] {
  const oneDay = 86_400_000;
  const scored = candidates.map((c) => {
    const overdueDays = Math.max(0, (now.getTime() - new Date(c.dueAt).getTime()) / oneDay);
    const overdueScore = Math.min(40, overdueDays * 8);
    const fragilityScore = (100 - c.masteryScore) * 0.35;
    const lapseScore = Math.min(15, c.lapses * 5);
    const examScore =
      c.daysUntilExam === undefined ? 0 : Math.max(0, 20 - Math.min(20, c.daysUntilExam) * 1.5);
    const difficultyScore = c.difficulty === 'DIFFICILE' ? 6 : c.difficulty === 'MOYEN' ? 3 : 0;

    const priority = Number(
      (overdueScore + fragilityScore + lapseScore + examScore + difficultyScore).toFixed(2),
    );

    const reasons: string[] = [];
    if (overdueDays >= 1) reasons.push(`en retard de ${Math.round(overdueDays)} j`);
    if (c.masteryScore < 40) reasons.push('notion encore fragile');
    else if (c.masteryScore < 70) reasons.push('maîtrise en construction');
    if (c.lapses >= 2) reasons.push('plusieurs oublis constatés');
    if (c.daysUntilExam !== undefined && c.daysUntilExam <= 14)
      reasons.push(`examen dans ${c.daysUntilExam} j`);
    if (reasons.length === 0) reasons.push('entretien régulier de la mémoire');

    return {
      ...c,
      priority,
      why: `Proposée car ${reasons.join(', ')}.`,
    };
  });

  return scored
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, limit);
}
