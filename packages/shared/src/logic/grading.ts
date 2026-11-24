import type { GeneratedQuestion, McqQuestion, WrittenQuestion } from '../schemas.js';

/**
 * Correction déterministe côté serveur.
 *
 * Principe : les QCM sont corrigés **ici**, sans IA, avec un barème explicite.
 * Les questions ouvertes utilisent une grille de critères : la correction
 * automatique fournit une note plancher déterministe (points attribuables sur
 * preuves observables), et une évaluation qualitative (IA ou enseignant) peut
 * l'affiner. On ne note jamais « au hasard » : sans preuve, 0 point + feedback.
 */

export interface McqCorrection {
  questionId: string;
  type: 'MCQ';
  points: number;
  awarded: number;
  correct: boolean;
  selectedChoiceIds: string[];
  correctChoiceIds: string[];
  explanation: string;
  /** Erreurs types identifiées par analyse des distracteurs choisis. */
  misconceptions: string[];
}

export interface WrittenCorrection {
  questionId: string;
  type: 'WRITTEN';
  points: number;
  awarded: number;
  correct: boolean;
  rubricBreakdown: { criterion: string; points: number; awarded: number; matched: boolean }[];
  keyPointsFound: string[];
  keyPointsMissed: string[];
  feedback: string;
  needsHumanReview: boolean;
}

export type Correction = McqCorrection | WrittenCorrection;

export interface AssessmentReport {
  score: number;
  maxScore: number;
  percentage: number;
  mention: string;
  corrections: Correction[];
  weakNotions: string[];
  recommendations: string[];
  masteredPercentage: number;
}

const STOPWORDS = new Set([
  'le','la','les','un','une','des','du','de','d','et','ou','à','au','aux','en','dans','pour','par',
  'sur','avec','sans','est','sont','être','avoir','a','ont','il','elle','ils','elles','on','ce',
  'cette','ces','son','sa','ses','qui','que','quoi','dont','où','ne','pas','plus','moins','comme',
  'the','of','and','to','in','is','are','that','this','it','for','with','as','be','by','an','on',
]);

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s%+\-*/=.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

const SYNONYMS: Record<string, string[]> = {
  tension: ['voltage', 'difference de potentiel', 'ddp'],
  intensite: ['courant', 'amperage'],
  derivee: ['derivation', 'taux de variation'],
  integrale: ['integration', 'primitive'],
  mitochondrie: ['mitochondries'],
  photosynthese: ['photosynthetique'],
  adn: ['acide desoxyribonucleique'],
  enzyme: ['enzymatique', 'catalyseur biologique'],
};

/** Recouvrement pondéré des notions clés, tolérant aux synonymes et à la racine. */
export function coverageRatio(expected: string, given: string): number {
  const expectedTokens = new Set(tokenize(expected));
  if (expectedTokens.size === 0) return 0;
  const givenTokens = new Set(tokenize(given));
  const givenNormalized = normalize(given);

  let found = 0;
  for (const raw of expectedTokens) {
    const candidates = [raw, ...(SYNONYMS[raw] ?? [])].map(normalize);
    const hit = candidates.some((candidate) => {
      if (givenTokens.has(candidate) || givenNormalized.includes(candidate)) return true;
      // tolérance morphologique : radical commun de 5 lettres minimum
      const stem = candidate.slice(0, Math.min(6, candidate.length));
      return stem.length >= 5 && [...givenTokens].some((t) => t.startsWith(stem));
    });
    if (hit) found += 1;
  }
  return found / expectedTokens.size;
}

export function correctMcq(question: McqQuestion, selected: string[]): McqCorrection {
  const correctSet = new Set(question.correctChoiceIds);
  const selectedSet = new Set(selected);
  const exact =
    selectedSet.size === correctSet.size && [...correctSet].every((id) => selectedSet.has(id));

  // Barème QCM : tout bon = tous les points ; sinon proportionnel aux bonnes
  // réponses cochées moins une pénalité pour les mauvaises (pas de négatif total).
  const hits = [...selectedSet].filter((id) => correctSet.has(id)).length;
  const misses = [...selectedSet].filter((id) => !correctSet.has(id)).length;
  const ratio = exact ? 1 : Math.max(0, (hits - misses * 0.5) / correctSet.size);
  const awarded = Number((question.points * ratio).toFixed(2));

  const misconceptions = question.choices
    .filter((c) => selectedSet.has(c.id) && !correctSet.has(c.id))
    .map((c) => `Confusion probable : vous avez retenu « ${c.text} ».`);

  return {
    questionId: (question as unknown as { id?: string }).id ?? '',
    type: 'MCQ',
    points: question.points,
    awarded,
    correct: exact,
    selectedChoiceIds: [...selectedSet],
    correctChoiceIds: [...correctSet],
    explanation: question.explanation,
    misconceptions,
  };
}

export function correctWritten(question: WrittenQuestion, answer: string): WrittenCorrection {
  const text = answer.trim();
  const keyPoints = question.keyPoints.length
    ? question.keyPoints
    : question.gradingRubric.map((c) => c.criterion);

  const rubricBreakdown = question.gradingRubric.map((criterion, index) => {
    // Répartition : la couverture de la grille est évaluée sur le texte de
    // l'apprenant ; les critères structurels (introduction, conclusion,
    // démarche) sont valorisés par des marqueurs explicites.
    const structural = index === 0 && text.length > 80;
    const ratio = coverageRatio(criterion.criterion, text);
    const matched = ratio >= 0.5 || (structural && ratio >= 0.25);
    return {
      criterion: criterion.criterion,
      points: criterion.points,
      awarded: matched ? Number((criterion.points * Math.min(1, Math.max(0.5, ratio))).toFixed(2)) : 0,
      matched,
    };
  });

  const found: string[] = [];
  const missed: string[] = [];
  for (const point of keyPoints) {
    if (coverageRatio(point, text) >= 0.5) found.push(point);
    else missed.push(point);
  }

  const rubricTotal = question.gradingRubric.reduce((s, c) => s + c.points, 0);
  const raw = rubricBreakdown.reduce((s, c) => s + c.awarded, 0);
  const scale = rubricTotal > 0 ? question.points / rubricTotal : 1;
  const awarded = Number(Math.min(question.points, raw * scale).toFixed(2));

  const needsHumanReview = text.length === 0 || (awarded > 0 && awarded < question.points * 0.6);

  const feedback = text.length === 0
    ? 'Aucune réponse fournie : 0 point. Une restitution, même incomplète, permet d’identifier vos acquis.'
    : awarded >= question.points * 0.85
      ? 'Réponse solide : les notions attendues sont présentes et correctement reliées.'
      : awarded >= question.points * 0.5
        ? `Réponse partielle. À compléter : ${missed.slice(0, 3).join(' ; ') || 'précisez les exemples et la démarche'}.`
        : `Réponse insuffisante au regard de la grille. Points attendus : ${missed.slice(0, 4).join(' ; ') || 'reprenez le cours source'}.`;

  return {
    questionId: (question as unknown as { id?: string }).id ?? '',
    type: 'WRITTEN',
    points: question.points,
    awarded,
    correct: awarded >= question.points * 0.5,
    rubricBreakdown,
    keyPointsFound: found,
    keyPointsMissed: missed,
    feedback,
    needsHumanReview,
  };
}

export function mentionFor(percentage: number): string {
  if (percentage >= 90) return 'Excellent';
  if (percentage >= 80) return 'Très bien';
  if (percentage >= 70) return 'Bien';
  if (percentage >= 60) return 'Assez bien';
  if (percentage >= 50) return 'Passable';
  return 'Insuffisant';
}

export function buildReport(
  questions: GeneratedQuestion[],
  answers: { questionId: string; type: 'MCQ' | 'WRITTEN'; selectedChoiceIds?: string[]; text?: string }[],
): AssessmentReport {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  const corrections: Correction[] = [];

  for (const question of questions) {
    const id = (question as unknown as { id?: string }).id ?? '';
    const answer = byId.get(id);
    if (question.type === 'MCQ') {
      corrections.push(correctMcq(question, answer?.selectedChoiceIds ?? []));
    } else {
      corrections.push(correctWritten(question, answer?.text ?? ''));
    }
  }

  const maxScore = questions.reduce((s, q) => s + q.points, 0);
  const score = Number(corrections.reduce((s, c) => s + c.awarded, 0).toFixed(2));
  const percentage = maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(1)) : 0;

  const weak: string[] = [];
  for (const [index, correction] of corrections.entries()) {
    const question = questions[index];
    if (!question) continue;
    if (correction.awarded / correction.points < 0.5) {
      const label =
        question.type === 'MCQ'
          ? question.choices.find((c) => c.id === question.correctChoiceIds[0])?.text ?? question.prompt
          : question.keyPoints[0] ?? question.prompt;
      weak.push(label.slice(0, 120));
    }
  }

  const recommendations: string[] = [];
  if (percentage < 50) {
    recommendations.push('Reprenez le résumé du chapitre puis refaites cette épreuve sous 48 h.');
  } else if (percentage < 75) {
    recommendations.push('Concentrez vos révisions sur les notions listées comme fragiles.');
  } else {
    recommendations.push('Bonne maîtrise : passez à des questions d’analyse et de raisonnement.');
  }
  const mcqWrong = corrections.filter((c) => c.type === 'MCQ' && !c.correct).length;
  if (mcqWrong > 0) recommendations.push(`Retravaillez ${mcqWrong} QCM échoué(s) en mode « professeur ».`);
  const writtenWeak = corrections.filter((c) => c.type === 'WRITTEN' && c.awarded < c.points * 0.5).length;
  if (writtenWeak > 0) recommendations.push('Entraînez-vous aux questions rédigées avec la grille de correction affichée.');

  return {
    score,
    maxScore,
    percentage,
    mention: mentionFor(percentage),
    corrections,
    weakNotions: [...new Set(weak)].slice(0, 10),
    recommendations,
    masteredPercentage: maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(1)) : 0,
  };
}

/** Résumé compact d'un rapport, destiné à être stocké et affiché en liste. */
export function summarizeReport(report: AssessmentReport): {
  score: number;
  maxScore: number;
  percentage: number;
  mention: string;
  weakNotions: string[];
  recommendations: string[];
  correctionCount: number;
} {
  return {
    score: report.score,
    maxScore: report.maxScore,
    percentage: report.percentage,
    mention: report.mention,
    weakNotions: report.weakNotions,
    recommendations: report.recommendations,
    correctionCount: report.corrections.length,
  };
}
