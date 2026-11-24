import { describe, expect, it } from 'vitest';
import {
  buildLocalFlashcards,
  buildLocalMcqs,
  buildLocalWritten,
  cleanTerm,
  countCorrectChoices,
  extractDefinitions,
  isPlausibleAnswer,
  joinWrappedLines,
  type SourceChunk,
} from '../src/logic/local-engine';
import { generatePlanning, mergeAvailability, planningStart } from '../src/logic/planner';

/**
 * Qualité du moteur d'extraction local (mode démonstration).
 * Ces tests verrouillent les défauts observés en conditions réelles :
 * définitions tronquées par la mise en page, notions mal intitulées,
 * QCM à réponses partielles ou sans bonne réponse unique.
 */

const chunks: SourceChunk[] = [
  {
    page: 1,
    chapterId: 'chapitre-1',
    content: [
      'Chapitre 1 : La cellule et ses organites',
      'Le chloroplaste : organite cellulaire spécialisé dans lequel se déroule la',
      "photosynthèse. Il contient de la chlorophylle qui capte l'énergie lumineuse.",
      "L'équation bilan de la photosynthèse s'écrit : 6 CO2 + 6 H2O + lumière = C6H12O6 + 6 O2.",
      'La membrane plasmique est une bicouche lipidique qui contrôle les échanges',
      'entre la cellule et son milieu extérieur.',
    ].join('\n'),
  },
  {
    page: 2,
    chapterId: 'chapitre-1',
    content: [
      'La mitochondrie est un organite cellulaire responsable de la respiration',
      "et de la production d'ATP.",
      'Le noyau contient le matériel génétique de la cellule eucaryote.',
      'La paroi pectocellulosique est une enveloppe rigide présente chez les cellules végétales.',
    ].join('\n'),
  },
];

describe('recalage des lignes coupées par la mise en page', () => {
  it('recolle une phrase répartie sur deux lignes', () => {
    const text = 'Le chloroplaste : organite cellulaire spécialisé dans lequel se déroule la\nphotosynthèse. Il contient de la chlorophylle.';
    expect(joinWrappedLines(text)).toBe(
      'Le chloroplaste : organite cellulaire spécialisé dans lequel se déroule la photosynthèse. Il contient de la chlorophylle.',
    );
  });

  it('ne recolle pas deux paragraphes distincts', () => {
    const text = 'Premier paragraphe terminé.\nDeuxième paragraphe.';
    expect(joinWrappedLines(text)).toBe(text);
  });

  it('préserve les listes à puces et les titres numérotés', () => {
    const text = 'Introduction :\n- point un\n- point deux\n2. étape suivante\ncontient la suite.';
    const result = joinWrappedLines(text);
    expect(result).toContain('- point un');
    expect(result).toContain('2. étape suivante');
  });
});

describe('nettoyage des intitulés de notions', () => {
  it('retire le verbe de liaison résiduel', () => {
    expect(cleanTerm("L'équation bilan de la photosynthèse s'écrit")).toBe("L'équation bilan de la photosynthèse");
    expect(cleanTerm('  Le noyau :  ')).toBe('Le noyau');
    expect(cleanTerm('membrane plasmique')).toBe('Membrane plasmique');
  });
});

describe('définitions extraites', () => {
  it('renvoie des définitions complètes, jamais tronquées en fin de ligne', () => {
    const definitions = extractDefinitions(chunks, 20);
    expect(definitions.length).toBeGreaterThanOrEqual(3);
    for (const definition of definitions) {
      expect(isPlausibleAnswer(definition.definition)).toBe(true);
      expect(definition.definition).not.toMatch(/\s(?:le|la|les|de|des|qui|et)$/i);
    }
    const chloroplast = definitions.find((definition) => /chloroplaste/i.test(definition.term));
    expect(chloroplast?.definition).toContain('photosynthèse');
    expect(chloroplast?.definition).not.toBe('organite cellulaire spécialisé dans lequel se déroule la');
  });

  it('associe chaque définition à sa page source', () => {
    const definitions = extractDefinitions(chunks, 20);
    for (const definition of definitions) {
      expect([1, 2]).toContain(definition.page);
    }
  });

  it('écarte les définitions trop courtes pour constituer un corrigé', () => {
    expect(isPlausibleAnswer('La cellule')).toBe(false);
    expect(isPlausibleAnswer('voir schéma')).toBe(false);
    expect(isPlausibleAnswer('La cellule est la plus petite unité vivante capable de se reproduire.')).toBe(true);
  });
});

describe('QCM générés en mode démonstration', () => {
  const questions = buildLocalMcqs(chunks, 6);

  it('produit des questions à choix multiples exploitables', () => {
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      expect(question.type).toBe('MCQ');
      expect(question.choices.length).toBeGreaterThanOrEqual(3);
      expect(new Set(question.choices.map((choice) => choice.id)).size).toBe(question.choices.length);
    }
  });

  it('comporte exactement une bonne réponse par question', () => {
    for (const question of questions) {
      const correct = question.choices.filter((choice) => question.correctChoiceIds.includes(choice.id));
      expect(correct).toHaveLength(1);
      expect(countCorrectChoices(question.choices.map((choice) => ({ ...choice, correct: question.correctChoiceIds.includes(choice.id) })))).toBe(1);
    }
  });

  it('cite systématiquement la page et un extrait du cours', () => {
    for (const question of questions) {
      expect(question.source.fromCourse).toBe(true);
      expect(question.source.page === undefined || typeof question.source.page === 'number').toBe(true);
      expect(question.source.quote?.length).toBeGreaterThan(10);
      expect(question.explanation.length).toBeGreaterThan(10);
    }
  });

  it('ne propose jamais deux fois le même texte de réponse', () => {
    for (const question of questions) {
      const texts = question.choices.map((choice) => choice.text.toLowerCase());
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it('garde un ordre stable pour une même entrée (reproductibilité)', () => {
    const again = buildLocalMcqs(chunks, 6);
    expect(again.map((question) => question.prompt)).toEqual(questions.map((question) => question.prompt));
  });
});

describe('questions écrites et cartes', () => {
  it('associe une grille de correction explicite à chaque question ouverte', () => {
    const written = buildLocalWritten(chunks, 3);
    expect(written.length).toBeGreaterThan(0);
    for (const question of written) {
      expect(question.gradingRubric.length).toBeGreaterThanOrEqual(2);
      const total = question.gradingRubric.reduce((sum, criterion) => sum + criterion.points, 0);
      expect(total).toBeCloseTo(question.points, 5);
      expect(question.expectedAnswer.length).toBeGreaterThan(25);
      expect(question.keyPoints.length).toBeGreaterThan(0);
    }
  });

  it('génère des cartes dont la réponse n’est jamais vide ni tronquée', () => {
    const cards = buildLocalFlashcards(chunks, 10);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.question.length).toBeGreaterThan(10);
      expect(card.answer.trim().length).toBeGreaterThan(1);
      expect(card.answer).not.toMatch(/\s(?:le|la|les|de|des)$/i);
    }
  });
});

describe('planificateur : cohérence horaire et anti-surcharge', () => {
  const availability = [
    { weekday: 1, startMinute: 18 * 60, endMinute: 21 * 60 },
    { weekday: 1, startMinute: 20 * 60, endMinute: 22 * 60 }, // chevauchement volontaire
    { weekday: 2, startMinute: 18 * 60, endMinute: 21 * 60 },
  ];

  it('fusionne les créneaux qui se chevauchent', () => {
    const merged = mergeAvailability(availability);
    // Les deux créneaux du lundi sont fusionnés en un seul de 18 h à 22 h.
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({ weekday: 1, startMinute: 18 * 60, endMinute: 22 * 60 });
  });

  it('ne place jamais une séance avant l’heure actuelle aujourd’hui', () => {
    const now = new Date(2026, 2, 2, 19, 30); // lundi 19 h 30, heure locale
    const result = generatePlanning(
      [{ id: 't1', title: 'Révision', type: 'REVISION', priority: 3 }],
      {
        from: planningStart(now),
        to: new Date(2026, 2, 3),
        sessionMinutes: 45,
        breakMinutes: 10,
        maxSessionsPerDay: 2,
        availability,
        now,
      },
    );
    expect(result.blocks.length).toBeGreaterThan(0);
    const first = result.blocks[0]!;
    expect(first.startAt.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });

  it('date les séances en heure locale (affichage cohérent pour l’étudiant)', () => {
    const now = new Date(2026, 2, 2, 8, 0); // lundi matin
    const result = generatePlanning(
      [{ id: 't1', title: 'Révision', type: 'REVISION', priority: 3 }],
      {
        from: planningStart(now),
        to: new Date(2026, 2, 3),
        sessionMinutes: 45,
        breakMinutes: 10,
        maxSessionsPerDay: 2,
        availability,
        now,
      },
    );
    const block = result.blocks[0]!;
    expect(block.startAt.getHours()).toBe(18);
    expect(block.startAt.getMinutes()).toBe(0);
    expect(block.endAt.getTime() - block.startAt.getTime()).toBe(45 * 60_000);
  });

  it('respecte le nombre maximal de séances par jour', () => {
    const tasks = Array.from({ length: 8 }, (_, index) => ({
      id: `t${index}`,
      title: `Tâche ${index}`,
      type: 'REVISION' as const,
      priority: 2,
    }));
    const now = new Date(2026, 2, 2, 8, 0);
    const result = generatePlanning(tasks, {
      from: planningStart(now),
      to: new Date(2026, 2, 6),
      sessionMinutes: 45,
      breakMinutes: 10,
      maxSessionsPerDay: 2,
      availability,
      now,
    });
    const perDay = new Map<string, number>();
    for (const block of result.blocks) {
      const key = block.startAt.toDateString();
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    for (const count of perDay.values()) expect(count).toBeLessThanOrEqual(2);
    // Les tâches non placées sont signalées, jamais entassées de force.
    expect(result.blocks.length + result.unscheduled.length).toBe(8);
  });
});
