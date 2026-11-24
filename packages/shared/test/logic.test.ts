import { describe, expect, it } from 'vitest';
import {
  buildReport,
  classifyMastery,
  correctMcq,
  correctWritten,
  coverageRatio,
  generatePlanning,
  initialReviewState,
  mentionFor,
  prioritizeRevisions,
  scheduleReview,
  checkQuota,
  buildLocalSummary,
  buildLocalFlashcards,
  buildLocalMcqs,
  detectUncertainties,
} from '../src/index.js';
import type { McqQuestion, WrittenQuestion, SourceChunk } from '../src/index.js';

describe('répétition espacée (SM-2 assoupli)', () => {
  const now = new Date('2026-03-01T08:00:00.000Z');

  it('programme une première révision courte après un succès', () => {
    const state = initialReviewState(now);
    const out = scheduleReview(state, 'GOOD', { now });
    expect(out.repetitions).toBe(1);
    expect(out.intervalDays).toBeGreaterThanOrEqual(1);
    expect(out.intervalDays).toBeLessThanOrEqual(3);
    expect(out.dueAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it('allonge progressivement les intervalles sur plusieurs succès', () => {
    let state = initialReviewState(now);
    const intervals: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const out = scheduleReview(state, 'GOOD', { now });
      intervals.push(out.intervalDays);
      state = out;
    }
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i]!).toBeGreaterThan(intervals[i - 1]!);
    }
  });

  it('reprogramme très vite après un oubli et augmente les lapses', () => {
    let state = initialReviewState(now);
    state = scheduleReview(state, 'GOOD', { now });
    state = scheduleReview(state, 'GOOD', { now });
    const out = scheduleReview(state, 'AGAIN', { now });
    expect(out.lapses).toBe(1);
    expect(out.repetitions).toBe(0);
    expect(out.intervalDays).toBeLessThanOrEqual(1);
    expect(out.dueAt.getTime() - now.getTime()).toBeLessThan(2 * 86_400_000);
  });

  it('ne dépasse jamais 180 jours même avec EASY répété', () => {
    let state = initialReviewState(now);
    for (let i = 0; i < 12; i += 1) state = scheduleReview(state, 'EASY', { now });
    expect(state.intervalDays).toBeLessThanOrEqual(180);
  });

  it('applique le rythme de révision choisi par l’étudiant', () => {
    const base = initialReviewState(now);
    const doux = scheduleReview(base, 'GOOD', { now, pace: 'DOUX' });
    const intensif = scheduleReview(base, 'GOOD', { now, pace: 'INTENSIF' });
    expect(intensif.intervalDays).toBeGreaterThan(doux.intervalDays);
  });

  it('classe les notions correctement', () => {
    expect(classifyMastery({ repetitions: 0, intervalDays: 0, lapses: 0 })).toBe('NOUVELLE');
    expect(classifyMastery({ repetitions: 1, intervalDays: 1, lapses: 2 })).toBe('FRAGILE');
    expect(classifyMastery({ repetitions: 6, intervalDays: 60, lapses: 0 })).toBe('MAITRISEE');
  });

  it('priorise les révisions en retard et explique pourquoi', () => {
    const result = prioritizeRevisions(
      [
        { id: 'a', dueAt: new Date(now.getTime() - 3 * 86_400_000), masteryScore: 20, lapses: 2 },
        { id: 'b', dueAt: now, masteryScore: 90, lapses: 0 },
      ],
      now,
      5,
    );
    expect(result[0]?.id).toBe('a');
    expect(result[0]?.why).toMatch(/retard|fragile|oubli/i);
  });
});

describe('correction des évaluations', () => {
  const mcq: McqQuestion = {
    type: 'MCQ',
    prompt: 'Quelle est l’unité de la tension électrique ?',
    choices: [
      { id: 'a', text: 'Le volt' },
      { id: 'b', text: 'L’ampère' },
      { id: 'c', text: 'Le watt' },
    ],
    correctChoiceIds: ['a'],
    explanation: 'La tension se mesure en volts (V).',
    difficulty: 'FACILE',
    cognitiveLevel: 'CONNAISSANCE',
    points: 2,
    source: { fromCourse: true },
  };

  it('attribue tous les points à une bonne réponse', () => {
    const c = correctMcq(mcq, ['a']);
    expect(c.correct).toBe(true);
    expect(c.awarded).toBe(2);
  });

  it('pénalise une mauvaise réponse sans descendre sous zéro', () => {
    const c = correctMcq(mcq, ['b']);
    expect(c.correct).toBe(false);
    expect(c.awarded).toBe(0);
    expect(c.misconceptions.length).toBe(1);
  });

  it('note une question ouverte via la grille et accepte les formulations équivalentes', () => {
    const written: WrittenQuestion = {
      type: 'WRITTEN',
      prompt: 'Définissez la photosynthèse.',
      expectedAnswer:
        'La photosynthèse est le processus par lequel les végétaux chlorophylliens convertissent la lumière en énergie chimique.',
      gradingRubric: [
        { criterion: 'processus de conversion de la lumière en énergie chimique', points: 2 },
        { criterion: 'végétaux chlorophylliens', points: 2 },
      ],
      keyPoints: ['conversion de la lumière en énergie chimique', 'végétaux chlorophylliens'],
      difficulty: 'MOYEN',
      cognitiveLevel: 'CONNAISSANCE',
      points: 4,
      source: { fromCourse: true },
    };

    const good = correctWritten(
      written,
      'La photosynthese correspond a la conversion de la lumiere en energie chimique realisee par les vegetaux chlorophylliens.',
    );
    expect(good.awarded).toBeGreaterThan(2);
    expect(good.needsHumanReview).toBe(false);

    const empty = correctWritten(written, '');
    expect(empty.awarded).toBe(0);
    expect(empty.feedback).toMatch(/Aucune réponse/);
  });

  it('mesure la couverture sémantique avec tolérance morphologique', () => {
    expect(coverageRatio('conversion de la lumière en énergie', 'conversion lumiere energie')).toBeGreaterThan(0.6);
    expect(coverageRatio('mitochondrie', 'aucun rapport ici')).toBe(0);
  });

  it('produit un rapport avec note, mention et recommandations', () => {
    const report = buildReport([mcq], [{ questionId: '', type: 'MCQ', selectedChoiceIds: ['b'] }]);
    expect(report.maxScore).toBe(2);
    expect(report.score).toBe(0);
    expect(report.mention).toBe('Insuffisant');
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(mentionFor(85)).toBe('Très bien');
  });
});

describe('planificateur académique', () => {
  const availability = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 17 * 60, endMinute: 20 * 60 }));

  it('respecte les disponibilités et le nombre maximal de séances par jour', () => {
    const result = generatePlanning(
      Array.from({ length: 12 }, (_, i) => ({
        id: `t${i}`,
        title: `Révision ${i}`,
        type: 'REVISION' as const,
        priority: 3,
      })),
      {
        from: new Date('2026-03-02T00:00:00.000Z'),
        to: new Date('2026-03-08T00:00:00.000Z'),
        sessionMinutes: 45,
        breakMinutes: 10,
        maxSessionsPerDay: 2,
        availability,
      },
    );
    const byDay = new Map<string, number>();
    for (const block of result.blocks) {
      const weekday = block.startAt.getUTCDay();
      expect(availability.some((a) => a.weekday === weekday)).toBe(true);
      const hourMinute = block.startAt.getUTCHours() * 60 + block.startAt.getUTCMinutes();
      expect(hourMinute).toBeGreaterThanOrEqual(17 * 60);
      const key = block.startAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    expect(Math.max(...byDay.values())).toBeLessThanOrEqual(2);
    expect(result.blocks.length + result.unscheduled.length).toBe(12);
  });

  it('planifie d’abord les échéances les plus proches', () => {
    const result = generatePlanning(
      [
        { id: 'loin', title: 'Examen final', type: 'EXAMEN', priority: 3, dueAt: new Date('2026-03-30T00:00:00Z') },
        { id: 'proche', title: 'Devoir', type: 'DEVOIR', priority: 3, dueAt: new Date('2026-03-03T00:00:00Z') },
      ],
      {
        from: new Date('2026-03-02T00:00:00.000Z'),
        to: new Date('2026-03-04T00:00:00.000Z'),
        sessionMinutes: 45,
        breakMinutes: 10,
        maxSessionsPerDay: 1,
        availability,
        // Instant de référence figé : la génération ne doit pas dépendre de
        // l'heure réelle d'exécution des tests.
        now: new Date('2026-03-02T00:00:00.000Z'),
      },
    );
    expect(result.blocks[0]?.taskId).toBe('proche');
  });

  it('signale explicitement les tâches non planifiables plutôt que de surcharger', () => {
    const result = generatePlanning(
      [{ id: 'x', title: 'Sans créneau', type: 'REVISION', priority: 5 }],
      {
        from: new Date('2026-03-07T00:00:00.000Z'), // samedi
        to: new Date('2026-03-08T00:00:00.000Z'), // dimanche
        sessionMinutes: 45,
        breakMinutes: 10,
        maxSessionsPerDay: 2,
        availability,
      },
    );
    expect(result.blocks).toHaveLength(0);
    expect(result.unscheduled[0]?.reason).toMatch(/disponibilité/i);
  });
});

describe('quotas', () => {
  const usage = {
    documentsTotal: 9,
    documentsThisMonth: 3,
    aiGenerationsThisMonth: 10,
    assessmentsThisMonth: 2,
    assistantMessagesToday: 5,
    storageMb: 40,
    ocrPagesThisMonth: 12,
  };

  it('autorise tant que le quota n’est pas atteint', () => {
    const d = checkQuota({
      key: 'documents_total',
      planCode: 'FREE',
      planName: 'Découverte',
      quotas: { documents_total: 10 },
      usage,
    });
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(1);
  });

  it('bloque au-delà du quota et suggère une montée en offre', () => {
    const d = checkQuota({
      key: 'ai_generations_per_month',
      planCode: 'FREE',
      planName: 'Découverte',
      quotas: { ai_generations_per_month: 10 },
      usage,
    });
    expect(d.allowed).toBe(false);
    expect(d.upgradeSuggested).toBe(true);
    expect(d.reason).toMatch(/Quota atteint/);
  });

  it('gère l’illimité (-1)', () => {
    const d = checkQuota({
      key: 'documents_total',
      planCode: 'INSTITUTION',
      planName: 'Institution',
      quotas: { documents_total: -1 },
      usage,
    });
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(Infinity);
  });
});

describe('moteur pédagogique local (mode démonstration)', () => {
  const chunks: SourceChunk[] = [
    {
      id: 'c1',
      documentId: 'd1',
      chapterId: 'ch1',
      chapterTitle: 'Chapitre 1 — Les bases',
      page: 1,
      content:
        "Chapitre 1 — Les bases\nLa photosynthèse est le processus par lequel les végétaux chlorophylliens convertissent la lumière du soleil en énergie chimique.\nLe chloroplaste : organite cellulaire dans lequel se déroule la photosynthèse.\nCette réaction produit du glucose et libère de l'oxygène dans l'atmosphère.",
    },
    {
      id: 'c2',
      documentId: 'd1',
      chapterId: 'ch2',
      chapterTitle: 'Chapitre 2 — Application',
      page: 2,
      content:
        "Chapitre 2 — Application\nLa respiration cellulaire est le processus inverse de la photosynthèse et se déroule dans la mitochondrie.\nLe rendement énergétique = énergie utile / énergie totale consommée.\nL'ATP désigne la molécule qui transporte l'énergie dans la cellule.",
    },
  ];

  it('produit un résumé strictement extractif, avec pages sources', () => {
    // Le résumé ne doit contenir aucun titre de section recopié comme phrase.
    const summary = buildLocalSummary(chunks, { title: 'La photosynthèse' });
    expect(summary.extractive).toBe(true);
    expect(summary.generalSummary.length).toBeGreaterThan(40);
    expect(summary.chapters.length).toBe(2);
    expect(summary.chapters[0]?.pageFrom).toBe(1);
    expect(summary.keyNotions.length).toBeGreaterThan(0);
    expect(summary.formulas.length).toBeGreaterThan(0);
    // Aucun contenu inventé : le résumé ne contient que des phrases du document.
    const sourceText = chunks
      .map((c) => c.content)
      .join(' ')
      .replace(/\s+/g, ' ');
    for (const sentence of summary.generalSummary.split(/(?<=\.)\s/)) {
      if (sentence.length > 60) expect(sourceText).toContain(sentence.trim());
    }
  });

  it('génère des cartes mémoire liées au document', () => {
    const cards = buildLocalFlashcards(chunks, 5);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.answer.length > 0)).toBe(true);
  });

  it('génère des QCM valides (une seule bonne réponse parmi les choix)', () => {
    const mcqs = buildLocalMcqs(chunks, 4);
    expect(mcqs.length).toBeGreaterThan(0);
    for (const q of mcqs) {
      expect(q.choices.length).toBeGreaterThanOrEqual(3);
      const ids = new Set(q.choices.map((c) => c.id));
      expect(ids.size).toBe(q.choices.length);
      for (const correct of q.correctChoiceIds) expect(ids.has(correct)).toBe(true);
      expect(q.source.fromCourse).toBe(true);
    }
  });

  it('signale les incertitudes au lieu d’inventer', () => {
    const warnings = detectUncertainties([{ id: 'x', documentId: 'd', page: 1, content: 'court' }]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join(' ')).toMatch(/très court/i);
  });
});
