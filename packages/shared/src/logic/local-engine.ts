/**
 * Moteur pédagogique local (« mode démonstration »).
 *
 * Rôle : produire des contenus **strictement extractifs** à partir du texte du
 * cours, sans aucun modèle distant. Il sert de :
 *   1. repli quand aucune clé API n'est configurée (l'interface affiche
 *      alors clairement « Mode démonstration ») ;
 *   2. garde-fou anti-hallucination : tout ce qui est produit ici est
 *      traçable jusqu'à une phrase et une page du document source.
 *
 * Ce module n'invente jamais de contenu : chaque phrase générée provient du
 * document. C'est ce qui le rend honnête à afficher.
 */

export interface SourceChunk {
  id: string;
  documentId: string;
  chapterId?: string | null;
  chapterTitle?: string | null;
  page?: number | null;
  content: string;
}

export interface LocalSummary {
  title: string;
  generalSummary: string;
  objectives: string[];
  keyNotions: { term: string; definition: string; page?: number }[];
  formulas: { expression: string; meaning: string }[];
  chapters: { title: string; summary: string; pageFrom?: number; pageTo?: number }[];
  uncertainties: string[];
  complementaryNotes: string[];
  extractive: true;
}

export interface LocalFlashcard {
  question: string;
  answer: string;
  page?: number;
  chapterId?: string | null;
}

export interface LocalMcq {
  type: 'MCQ';
  prompt: string;
  choices: { id: string; text: string }[];
  correctChoiceIds: string[];
  explanation: string;
  difficulty: 'FACILE' | 'MOYEN' | 'DIFFICILE';
  cognitiveLevel: 'CONNAISSANCE' | 'COMPREHENSION' | 'APPLICATION' | 'ANALYSE' | 'RAISONNEMENT';
  points: number;
  source: { page?: number; chapterId?: string | null; quote: string; fromCourse: true };
}

export interface LocalWritten {
  type: 'WRITTEN';
  prompt: string;
  expectedAnswer: string;
  gradingRubric: { criterion: string; points: number }[];
  keyPoints: string[];
  difficulty: 'FACILE' | 'MOYEN' | 'DIFFICILE';
  cognitiveLevel: 'CONNAISSANCE' | 'COMPREHENSION' | 'APPLICATION' | 'ANALYSE' | 'RAISONNEMENT';
  points: number;
  source: { page?: number; chapterId?: string | null; quote: string; fromCourse: true };
}

const STOPWORDS = new Set(
  `le la les un une des du de d et ou à au aux en dans pour par sur avec sans est sont être avoir a ont
   il elle ils elles on ce cette ces son sa ses qui que quoi dont où ne pas plus moins comme donc alors
   ainsi mais si tout tous toute toutes même aussi entre chez vers lors dont cela celui celle très bien
   peut peuvent doit doivent fait faire cette autre autres chaque plusieurs selon afin être été avait
   nous vous je tu se sa leur leurs y n c l s qu lorsqu cependant toutefois the of and to in is are
   that this it for with as be by an on at from or was were has have had not but they we you`
    .split(/\s+/)
    .filter(Boolean),
);

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s%+\-*/=.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ0-9«"(])/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 600);
}

export function keywords(text: string, limit = 20): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const raw of normalize(text).split(' ')) {
    if (raw.length < 4 || STOPWORDS.has(raw) || /^\d+$/.test(raw)) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

/** Score de centralité d'une phrase : densité de mots-clés + position. */
function scoreSentence(sentence: string, keywordSet: Map<string, number>, position: number): number {
  const tokens = normalize(sentence).split(' ');
  let score = 0;
  for (const token of tokens) score += keywordSet.get(token) ?? 0;
  const density = score / Math.max(1, tokens.length);
  const positionBonus = position === 0 ? 0.6 : position === 1 ? 0.3 : 0;
  const lengthPenalty = sentence.length > 400 ? 0.5 : 0;
  return density * 10 + positionBonus - lengthPenalty;
}

/**
 * Retire les lignes de titre (courtes, sans ponctuation finale, souvent
 * « Chapitre N », « 1. Section ») avant l'analyse de phrases : un résumé ne doit
 * pas commencer par un intitulé, et un titre ne constitue pas une phrase.
 */
export function stripHeadings(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => {
      const text = line.trim();
      if (text.length === 0) return true;
      const isHeadingLike =
        text.length <= 80 &&
        (!/[.;:!?]$/.test(text) || /^(chapitre|partie|section|module|unité|unite)\b/i.test(text)) &&
        /^(chapitre|partie|section|module|unité|unite|[0-9]{1,2}\.|[IVXLC]{1,5}\.|[A-ZÀ-Ý0-9][^.]{3,70})$/.test(text);
      return !isHeadingLike;
    })
    .join('\n');
}

function firstSentence(text: string): string {
  const sentences = splitSentences(text);
  return sentences[0] ?? text.slice(0, 200).trim();
}

/** Détecte les passages douteux : OCR bruité, texte trop court, caractères cassés. */
export function detectUncertainties(chunks: SourceChunk[]): string[] {
  const out: string[] = [];
  const total = chunks.reduce((s, c) => s + c.content.length, 0);
  if (total < 400) {
    out.push(
      'Le texte extrait est très court : le document est peut-être une image peu lisible ou une page de garde.',
    );
  }
  for (const chunk of chunks) {
    const weird = (chunk.content.match(/[^\p{L}\p{N}\s.,;:!?'"()\-–—%°+=/\\[\]{}<>|_*&@#€$]/gu) ?? []).length;
    const ratio = weird / Math.max(1, chunk.content.length);
    if (ratio > 0.08) {
      out.push(
        `Passage possiblement illisible (page ${chunk.page ?? '?'}) : caractères non reconnus, vérifiez l'original.`,
      );
      break;
    }
    if (/\b(illisible|flou|tache|ratur)/i.test(chunk.content)) {
      out.push(`Le document mentionne lui-même un passage peu lisible (page ${chunk.page ?? '?'}).`);
    }
  }
  const pages = new Set(chunks.map((c) => c.page).filter((p): p is number => typeof p === 'number'));
  if (pages.size > 1) {
    const max = Math.max(...pages);
    const missing: number[] = [];
    for (let p = 1; p <= max; p += 1) if (!pages.has(p)) missing.push(p);
    if (missing.length > 0 && missing.length <= 8) {
      out.push(`Pages sans texte exploitable détectées : ${missing.join(', ')}.`);
    }
  }
  return out;
}

/**
 * Recolle les lignes coupées par la mise en page du document.
 *
 * Dans un PDF ou une photo, une phrase est souvent répartie sur plusieurs
 * lignes. Sans ce recalage, les notions extraites se terminaient au milieu
 * d'une phrase (« … = 6 O2. Le »), ce qui produisait des fiches tronquées et
 * des QCM dont la bonne réponse était incomplète — un défaut pédagogique grave.
 */
export function joinWrappedLines(text: string): string {
  const out: string[] = [];
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line) {
      out.push('');
      continue;
    }
    const previous = out.length > 0 ? out[out.length - 1] ?? '' : '';
    const continuesSentence =
      previous !== '' &&
      !/[.!?:;»]$/.test(previous) &&
      /^[a-zà-ÿœæ('’«]/.test(line) &&
      !/^[-–•\d]/.test(line);
    if (continuesSentence) {
      out[out.length - 1] = `${previous} ${line}`;
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

/** Nettoie un intitulé de notion (verbe de liaison résiduel, espaces, casse). */
export function cleanTerm(raw: string): string {
  let term = raw.replace(/\s+/g, ' ').trim();
  term = term.replace(/\s*[:\-–]$/, '');
  // « L'équation bilan de la photosynthèse s'écrit » -> « L'équation bilan de la photosynthèse »
  term = term.replace(
    /\s+(?:s['’]écrit|s['’]exprime|se lit|est|sont|désigne|signifie|correspond|consiste|présente|permet|contient|joue)\s*$/i,
    '',
  );
  term = term.replace(/\s*[:\-–]$/, '').trim();
  if (!term) return '';
  return term.charAt(0).toUpperCase() + term.slice(1);
}

/** Extrait les couples « Terme : définition » ou « Le terme X désigne … ». */
export function extractDefinitions(
  chunks: SourceChunk[],
  limit = 18,
): { term: string; definition: string; page?: number; chapterId?: string | null }[] {
  const results: { term: string; definition: string; page?: number; chapterId?: string | null }[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const lines = joinWrappedLines(chunk.content).split(/\n+/);
    for (const line of lines) {
      if (results.length >= limit) return results;
      const colonMatch = /^\s*([A-ZÀ-Ý][\p{L}\p{N}\s'’\-()]{2,60})\s*[:\-–]\s*(.{20,400})$/u.exec(line);
      if (colonMatch?.[1] && colonMatch[2]) {
        const term = cleanTerm(colonMatch[1]);
        if (term.length >= 3 && isPlausibleAnswer(colonMatch[2]) && !seen.has(term.toLowerCase())) {
          seen.add(term.toLowerCase());
          results.push({
            term,
            definition: colonMatch[2].trim(),
            page: chunk.page ?? undefined,
            chapterId: chunk.chapterId ?? null,
          });
        }
        continue;
      }
      const verbMatch =
        /\b(?:le|la|les|l['’]|un|une)?\s*([\p{L}\-’ ]{3,40})\s+(?:est|sont|désigne|signifie|correspond à|se définit comme|consiste à)\s+([^.!?]{20,320})[.!?]/iu.exec(
          line,
        );
      if (verbMatch?.[1] && verbMatch[2]) {
        const term = cleanTerm(verbMatch[1]);
        const key = term.toLowerCase();
        if (term.length >= 3 && term.split(' ').length <= 5 && isPlausibleAnswer(verbMatch[2]) && !seen.has(key)) {
          seen.add(key);
          results.push({
            term,
            definition: verbMatch[2].trim(),
            page: chunk.page ?? undefined,
            chapterId: chunk.chapterId ?? null,
          });
        }
      }
    }
  }
  return results;
}

export function extractFormulas(chunks: SourceChunk[]): { expression: string; meaning: string }[] {
  const formulas: { expression: string; meaning: string }[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    for (const sentence of splitSentences(chunk.content)) {
      if (/[=≈≠≤≥]/.test(sentence) && /\d|[a-zA-Z]\s*[=]/.test(sentence)) {
        const expression = sentence.slice(0, 220);
        if (!seen.has(expression)) {
          seen.add(expression);
          formulas.push({ expression, meaning: 'Formule citée telle quelle dans le cours (voir page source).' });
        }
      }
      if (formulas.length >= 12) return formulas;
    }
  }
  return formulas;
}

export function buildLocalSummary(
  chunks: SourceChunk[],
  input: { title: string; level?: string } = { title: 'Cours' },
): LocalSummary {
  const keywordList = keywords(chunks.map((c) => c.content).join('\n'), 30);
  const keywordSet = new Map(keywordList.map((k) => [k.word, k.count]));

  const byChapter = new Map<string, SourceChunk[]>();
  for (const chunk of chunks) {
    const key = chunk.chapterTitle ?? chunk.chapterId ?? 'Général';
    const list = byChapter.get(key) ?? [];
    list.push(chunk);
    byChapter.set(key, list);
  }

  const scoredSentences = chunks
    .flatMap((chunk, chunkIndex) =>
      splitSentences(stripHeadings(chunk.content)).map((sentence, index) => ({
        sentence,
        page: chunk.page ?? undefined,
        score: scoreSentence(sentence, keywordSet, index),
        order: chunkIndex * 1000 + index,
      })),
    );

  // Sélection par pertinence, puis restitution dans l'ordre du document :
  // le résumé se lit comme un texte, pas comme un classement.
  const selected = [...scoredSentences]
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)
    .sort((a, b) => a.order - b.order);

  const generalSummary = [...new Set(selected.map((s) => s.sentence))].join(' ').slice(0, 2800);

  const objectives = keywordList
    .slice(0, 6)
    .map((k) => `Maîtriser la notion de « ${k.word} » et savoir l'expliquer avec vos propres mots.`);

  const chapters = [...byChapter.entries()].slice(0, 25).map(([title, chapterChunks]) => {
    const pages = chapterChunks.map((c) => c.page).filter((p): p is number => typeof p === 'number');
    const sentences = chapterChunks
      .flatMap((c, chunkIndex) =>
        splitSentences(stripHeadings(c.content)).map((sentence, index) => ({
          sentence,
          score: scoreSentence(sentence, keywordSet, index),
          order: chunkIndex * 1000 + index,
        })),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .sort((a, b) => a.order - b.order)
      .map((s) => s.sentence);
    return {
      title,
      summary: sentences.join(' ') || firstSentence(chapterChunks[0]?.content ?? ''),
      pageFrom: pages.length ? Math.min(...pages) : undefined,
      pageTo: pages.length ? Math.max(...pages) : undefined,
    };
  });

  const definitions = extractDefinitions(chunks);

  return {
    title: input.title,
    generalSummary:
      generalSummary ||
      'Le document ne contient pas assez de texte exploitable pour produire un résumé fiable.',
    objectives: objectives.length ? objectives : ['Identifier les notions principales du document.'],
    keyNotions: definitions.map((d) => ({ term: d.term, definition: d.definition, page: d.page })),
    formulas: extractFormulas(chunks),
    chapters,
    uncertainties: detectUncertainties(chunks),
    complementaryNotes: [
      'Contenu produit en mode démonstration : uniquement à partir des phrases de votre document, sans modèle distant.',
    ],
    extractive: true,
  };
}

export function buildLocalFlashcards(chunks: SourceChunk[], limit = 20): LocalFlashcard[] {
  const cards: LocalFlashcard[] = [];
  const seen = new Set<string>();

  for (const definition of extractDefinitions(chunks, limit * 2)) {
    const key = definition.term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({
      question: `Que désigne « ${definition.term} » dans ce cours ?`,
      answer: definition.definition,
      page: definition.page,
      chapterId: definition.chapterId ?? null,
    });
    if (cards.length >= limit) return cards;
  }

  // Compléments : questions de rappel sur les phrases les plus denses.
  const keywordList = keywords(chunks.map((c) => c.content).join('\n'), 25);
  const keywordSet = new Map(keywordList.map((k) => [k.word, k.count]));
  const sentences = chunks
    .flatMap((chunk) =>
      splitSentences(joinWrappedLines(chunk.content)).map((sentence, index) => ({
        sentence,
        page: chunk.page ?? undefined,
        chapterId: chunk.chapterId ?? null,
        score: scoreSentence(sentence, keywordSet, index),
      })),
    )
    .sort((a, b) => b.score - a.score);

  for (const item of sentences) {
    if (cards.length >= limit) break;
    const terms = keywords(item.sentence, 3);
    const target = terms[0];
    if (!target) continue;
    const original = new RegExp(`\\b${target.word}\\b`, 'i');
    if (!original.test(normalize(item.sentence))) continue;
    const blanked = item.sentence.replace(
      new RegExp(`(\\p{L}*${target.word}\\p{L}*)`, 'iu'),
      '………………',
    );
    const dedupeKey = blanked.slice(0, 60);
    if (seen.has(dedupeKey) || blanked === item.sentence) continue;
    seen.add(dedupeKey);
    cards.push({
      question: `Complétez la phrase issue de votre cours : « ${blanked} »`,
      answer: target.word,
      page: item.page,
      chapterId: item.chapterId,
    });
  }
  return cards;
}

export function buildLocalMcqs(chunks: SourceChunk[], count = 8): LocalMcq[] {
  const definitions = extractDefinitions(chunks, 40);
  const questions: LocalMcq[] = [];

  for (const [index, definition] of definitions.entries()) {
    if (questions.length >= count) break;
    const distractors = definitions
      .filter((d) => d.term !== definition.term)
      .slice(index + 1)
      .concat(definitions.filter((d) => d.term !== definition.term).slice(0, index + 1))
      .filter((d) => d.definition !== definition.definition)
      .slice(0, 3);
    if (distractors.length < 2) continue;

    const options = [
      { id: 'a', text: truncate(definition.definition, 140), correct: true },
      ...distractors.map((d, i) => ({
        id: String.fromCharCode(98 + i),
        text: truncate(d.definition, 140),
        correct: false,
      })),
    ];
    const shuffled = deterministicShuffle(options, definition.term.length);
    questions.push({
      type: 'MCQ',
      prompt: `Dans le cours, quelle définition correspond à « ${definition.term} » ?`,
      choices: shuffled.map((o) => ({ id: o.id, text: o.text })),
      correctChoiceIds: shuffled.filter((o) => o.correct).map((o) => o.id),
      explanation: `D'après votre document (page ${definition.page ?? 'non précisée'}) : « ${definition.term} : ${truncate(definition.definition, 220)} ».`,
      difficulty: 'MOYEN',
      cognitiveLevel: 'CONNAISSANCE',
      points: 1,
      source: {
        page: definition.page,
        chapterId: definition.chapterId ?? null,
        quote: truncate(definition.definition, 300),
        fromCourse: true,
      },
    });
  }

  // Question d'application générique, adossée à une phrase du cours.
  if (questions.length < count) {
    const keywordList = keywords(chunks.map((c) => c.content).join('\n'), 12);
    for (const item of keywordList) {
      if (questions.length >= count) break;
      const chunk = chunks.find((c) => normalize(c.content).includes(item.word));
      if (!chunk) continue;
      const sentence = splitSentences(joinWrappedLines(chunk.content)).find((s) => normalize(s).includes(item.word));
      if (!sentence) continue;
      const others = keywordList.filter((k) => k.word !== item.word).slice(0, 3);
      if (others.length < 3) continue;
      const options = deterministicShuffle(
        [
          { id: 'a', text: item.word, correct: true },
          ...others.map((o, i) => ({ id: String.fromCharCode(98 + i), text: o.word, correct: false })),
        ],
        item.word.length,
      );
      questions.push({
        type: 'MCQ',
        prompt: `Quelle notion est au cœur de la phrase suivante ? « ${truncate(sentence, 220)} »`,
        choices: options.map((o) => ({ id: o.id, text: o.text })),
        correctChoiceIds: options.filter((o) => o.correct).map((o) => o.id),
        explanation: `La notion « ${item.word} » apparaît ${item.count} fois dans ce passage.`,
        difficulty: 'FACILE',
        cognitiveLevel: 'COMPREHENSION',
        points: 1,
        source: {
          page: chunk.page ?? undefined,
          chapterId: chunk.chapterId ?? null,
          quote: truncate(sentence, 300),
          fromCourse: true,
        },
      });
    }
  }

  return questions;
}

export function buildLocalWritten(chunks: SourceChunk[], count = 3): LocalWritten[] {
  const definitions = extractDefinitions(chunks, 12);
  return definitions.slice(0, count).map((definition) => {
    const keyPoints = keywords(definition.definition, 4).map((k) => k.word);
    return {
      type: 'WRITTEN' as const,
      prompt: `Expliquez avec vos propres mots ce qu'est « ${definition.term} », puis donnez un exemple tiré du cours.`,
      expectedAnswer: definition.definition,
      gradingRubric: [
        { criterion: `Définition correcte de « ${definition.term} »`, points: 2 },
        { criterion: 'Exactitude des notions employées', points: 1.5 },
        { criterion: 'Exemple ou application pertinente', points: 1.5 },
      ],
      keyPoints: keyPoints.length ? keyPoints : [definition.term],
      difficulty: 'MOYEN' as const,
      cognitiveLevel: 'COMPREHENSION' as const,
      points: 5,
      source: {
        page: definition.page,
        chapterId: definition.chapterId ?? null,
        quote: truncate(definition.definition, 300),
        fromCourse: true,
      },
    };
  });
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Mélange déterministe : même entrée → même sortie (testabilité). */
function deterministicShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let state = seed || 1;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    const a = arr[i];
    const b = arr[j];
    if (a !== undefined && b !== undefined) {
      arr[i] = b;
      arr[j] = a;
    }
  }
  return arr;
}

/**
 * Contrôle de plausible d'une réponse attendue.
 * Une définition tronquée (moins de 6 mots, ou finissant sur un mot outil) ne
 * doit jamais servir de corrigé : on préfère l'écarter.
 */
export function isPlausibleAnswer(text: string): boolean {
  const value = text.trim();
  if (value.length < 25) return false;
  const words = value.split(/\s+/);
  if (words.length < 6) return false;
  if (/\b(?:le|la|les|de|du|des|un|une|et|ou|à|au|aux|l['’]|d['’]|en|pour|par|sur|dans|qui|que|il|elle|ils|elles|est|sont)$/i.test(value)) {
    return false;
  }
  if (!/[.!?»]$/.test(value) && value.length < 80) return false;
  return true;
}

/** Nombre de « bonnes réponses » possibles dans une liste de choix. */
export function countCorrectChoices(choices: { id: string; text: string; correct: boolean }[]): number {
  return choices.filter((choice) => choice.correct).length;
}
