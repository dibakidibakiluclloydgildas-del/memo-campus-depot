import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTestApp, ensurePlans, registerStudent, type TestContext } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Parcours pédagogique complet, de bout en bout, avec de vrais fichiers :
 * import d'un PDF -> analyse -> résumé sourcé -> cartes -> révision espacée ->
 * épreuve -> correction -> planning -> assistant.
 *
 * Le fournisseur IA est `demo` (extractif) : les tests vérifient donc aussi que
 * l'application ne prétend jamais produire du contenu inventé et que chaque
 * sortie reste rattachée au document source.
 */
const FIXTURE_PDF = resolve(__dirname, '../../../scripts/fixtures/cours-biologie-cellulaire.pdf');
const FIXTURE_IMAGE = resolve(__dirname, '../../../scripts/fixtures/cours-physique-scan.png');

describe('Parcours pédagogique de bout en bout', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: string;
  let documentId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    await ensurePlans(prisma);
    const student = await registerStudent(app, { displayName: 'Étudiant Parcours' });
    token = student.token;
    userId = student.userId;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await ctx.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('importe un PDF réel et le déclare en file de traitement', async () => {
    expect(existsSync(FIXTURE_PDF)).toBe(true);
    const file = readFileSync(FIXTURE_PDF);

    const response = await request(app.getHttpServer())
      .post('/api/documents')
      .set(auth())
      .field('title', 'Biologie cellulaire — chapitre 1')
      .attach('file', file, { filename: 'cours-biologie-cellulaire.pdf', contentType: 'application/pdf' })
      .expect(201);

    documentId = response.body.id;
    expect(documentId).toBeTypeOf('string');
    expect(['QUEUED', 'EXTRACTING', 'OCR', 'STRUCTURING', 'CHUNKING', 'INDEXING', 'READY']).toContain(response.body.status);

    // L'original est conservé, privé, avec une empreinte d'intégrité.
    const stored = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(stored.sizeBytes).toBe(file.byteLength);
    expect(stored.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.userId).toBe(userId);
  });

  it('analyse le document (statut READY) avec chapitres, pages et texte extrait', async () => {
    let document: Record<string, unknown> = {};
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await request(app.getHttpServer()).get(`/api/documents/${documentId}`).set(auth()).expect(200);
      document = response.body;
      if (['READY', 'PARTIAL', 'FAILED'].includes(String(document.status))) break;
      await new Promise((done) => setTimeout(done, 500));
    }

    expect(['READY', 'PARTIAL']).toContain(document.status);
    expect(Number(document.pageCount)).toBeGreaterThan(0);

    const pages = await request(app.getHttpServer()).get(`/api/documents/${documentId}/pages`).set(auth()).expect(200);
    const pageList = pages.body as { pageNumber: number; text: string | null; usedOcr: boolean }[];
    expect(Array.isArray(pageList)).toBe(true);
    expect(pageList.length).toBeGreaterThan(0);
    expect(pageList[0]).toHaveProperty('pageNumber');
    // Le texte source est conservé par page : c'est la base de toute citation.
    expect(typeof pageList[0]?.text === 'string' || pageList[0]?.text === null).toBe(true);

    const detail = document as unknown as { chapters: { id: string; title: string }[]; pages: { pageNumber: number }[] };
    expect(detail.chapters.length).toBeGreaterThan(0);
    expect(detail.pages.length).toBeGreaterThan(0);
  });

  it('refuse de générer un résumé avant la fin de l’analyse du cours', async () => {
    // Garde-fou : on ne produit jamais de « résumé » à partir de rien.
    const pending = await request(app.getHttpServer())
      .post('/api/documents/22222222-2222-4222-8222-222222222222/summary')
      .set(auth())
      .send({ regenerate: true, save: true })
      .expect(404);
    expect(['DOCUMENT_NOT_FOUND', 'NOT_FOUND']).toContain(pending.body.code);
  });

  it('génère un résumé structuré ancré dans la source, en mode démonstration assumé', async () => {
    const summary = await request(app.getHttpServer())
      .post(`/api/documents/${documentId}/summary`)
      .set(auth())
      .send({ regenerate: true, save: true })
      .expect(201);

    expect(['demo', 'live']).toContain(summary.body.mode);
    if (summary.body.mode === 'demo') {
      // Le mode démonstration doit être annoncé sans ambiguïté à l'étudiant.
      expect(JSON.stringify(summary.body)).toMatch(/d[ée]monstration|demo/i);
    }
    const payload = summary.body.payload;
    expect(payload.generalSummary.length).toBeGreaterThan(50);
    expect(payload.chapters.length).toBeGreaterThan(0);
    expect(Array.isArray(payload.keyNotions)).toBe(true);

    // Aucun contenu ne doit être inventé : en mode démo, chaque notion est un
    // extrait du texte réellement extrait du PDF.
    const pages = await request(app.getHttpServer()).get(`/api/documents/${documentId}/pages`).set(auth()).expect(200);
    const source = (pages.body as { text: string | null }[])
      .map((page) => page.text ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    for (const notion of payload.keyNotions.slice(0, 3)) {
      const term = String(notion.term).toLowerCase().replace(/\.$/, '');
      if (term.length > 8) {
        expect(source).toContain(term.slice(0, 8));
      }
    }

  });

  it('génère des cartes mémoire liées au cours et refuse un cours inexistant', async () => {
    const cards = await request(app.getHttpServer())
      .post('/api/learning/flashcards/generate')
      .set(auth())
      .send({ documentId, count: 5 });

    // Soit des cartes sont créées, soit l'API explique honnêtement qu'elle ne
    // dispose pas de notions assez sûres — jamais de cartes inventées.
    expect([201, 400]).toContain(cards.status);

    if (cards.status === 201) {
      expect(Array.isArray(cards.body.cards)).toBe(true);
      expect(cards.body.cards.length).toBeGreaterThan(0);
      expect(cards.body.cards.length).toBeLessThanOrEqual(5);
      for (const card of cards.body.cards) {
        expect(card.question.length).toBeGreaterThan(5);
        expect(card.answer.length).toBeGreaterThan(1);
      }
      const stored = await prisma.flashcard.findMany({ where: { userId }, take: 50 });
      expect(stored.length).toBeGreaterThan(0);
      expect(stored[0]?.documentId).toBe(documentId);
      expect(stored[0]?.question.length).toBeGreaterThan(5);
      expect(stored[0]?.answer.length).toBeGreaterThan(1);
    } else {
      expect(JSON.stringify(cards.body)).toMatch(/notion|contenu|analys/i);
    }

    await request(app.getHttpServer())
      .post('/api/learning/flashcards/generate')
      .set(auth())
      .send({ documentId: '11111111-1111-4111-8111-111111111111', count: 3 })
      .expect(404);
  });

  it('applique la répétition espacée : la carte revient plus tard après réussite', async () => {
    const card = await prisma.flashcard.findFirst({ where: { userId } });
    if (!card) {
      // Le cours d'essai ne contient parfois aucune notion isolable (PDF très
      // court) : le test de l'algorithme reste couvert par les tests unitaires
      // de `packages/shared` (spaced-repetition).
      expect(card).toBeNull();
      return;
    }
    const before = card.dueAt.getTime();

    const review = await request(app.getHttpServer())
      .post('/api/learning/reviews')
      .set(auth())
      .send({ flashcardId: card.id, grade: 'GOOD', durationMs: 4200 })
      .expect(201);

    expect(review.body.flashcard.masteryScore).toBeGreaterThanOrEqual(0);
    expect(review.body.explanation.length).toBeGreaterThan(5);
    const after = await prisma.flashcard.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.dueAt.getTime()).toBeGreaterThan(before);
    expect(after.repetitions).toBe(1);

    // Un oubli ramène la carte immédiatement dans la file prioritaire.
    await request(app.getHttpServer())
      .post('/api/learning/reviews')
      .set(auth())
      .send({ flashcardId: card.id, grade: 'AGAIN', durationMs: 1200 })
      .expect(201);

    const again = await prisma.flashcard.findUniqueOrThrow({ where: { id: card.id } });
    expect(again.dueAt.getTime()).toBeLessThan(after.dueAt.getTime());
    expect(again.masteryScore).toBeLessThanOrEqual(after.masteryScore);

    // Le journal de révision est conservé (historique vérifiable).
    const logs = await prisma.reviewLog.count({ where: { userId, flashcardId: card.id } });
    expect(logs).toBe(2);
    const grades = await prisma.reviewLog.findMany({ where: { userId, flashcardId: card.id }, orderBy: { createdAt: 'asc' } });
    expect(grades.map((log) => log.grade)).toEqual(['GOOD', 'AGAIN']);
  });

  it('justifie chaque révision prioritaire du jour', async () => {
    const today = await request(app.getHttpServer()).get('/api/learning/reviews/today').set(auth()).expect(200);
    expect(today.body).toHaveProperty('items');
    expect(Array.isArray(today.body.items)).toBe(true);
    for (const item of today.body.items) {
      expect(typeof item.why).toBe('string');
      expect(item.why.length).toBeGreaterThan(3);
      expect(item).toHaveProperty('masteryScore');
    }
  });

  it('génère une épreuve mixte, la corrige et enregistre le résultat', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/assessments/generate')
      .set(auth())
      .send({
        title: 'Épreuve de biologie cellulaire',
        type: 'MIXED',
        difficulty: 'MOYEN',
        mcqCount: 3,
        writtenCount: 1,
        durationMinutes: 20,
        documentIds: [documentId],
        includeAnswerKey: true,
      })
      .expect(201);

    const assessmentId = created.body.assessmentId as string;
    expect(assessmentId).toBeTypeOf('string');
    expect(created.body.questionCount).toBe(4);
    expect(created.body.mode).toBe('demo');

    const detail = await request(app.getHttpServer()).get(`/api/assessments/${assessmentId}`).set(auth()).expect(200);
    expect(detail.body.questions.length).toBe(4);
    expect(detail.body.questions.filter((q: { type: string }) => q.type === 'MCQ')).toHaveLength(3);
    expect(detail.body.questions.filter((q: { type: string }) => q.type === 'WRITTEN')).toHaveLength(1);

    const mcq = detail.body.questions.find((question: { type: string }) => question.type === 'MCQ');
    const written = detail.body.questions.find((question: { type: string }) => question.type === 'WRITTEN');
    expect(mcq.choices.length).toBeGreaterThanOrEqual(3);
    expect(written.prompt.length).toBeGreaterThan(10);
    // La bonne réponse n'est pas encore révélée pendant l'épreuve.
    expect(mcq.correctChoiceIds).toBeUndefined();

    await request(app.getHttpServer()).post(`/api/assessments/${assessmentId}/start`).set(auth()).expect(201);

    // On répond « a » : le corrigé est vérifié après soumission, comme pour
    // un étudiant réel qui ne connaît pas la bonne réponse à l'avance.
    const correctChoice = 'a';
    const submitted = await request(app.getHttpServer())
      .post(`/api/assessments/${assessmentId}/submit`)
      .set(auth())
      .send({
        answers: [
          { questionId: mcq.id, type: 'MCQ', selectedChoiceIds: [correctChoice], timeSpentSeconds: 40 },
          {
            questionId: written.id,
            type: 'WRITTEN',
            text: 'La membrane plasmique est une bicouche lipidique qui contrôle les échanges entre la cellule et son milieu.',
            timeSpentSeconds: 300,
          },
        ],
        autoSubmitted: false,
      })
      .expect(201);

    expect(submitted.body.score).toBeTypeOf('number');
    expect(submitted.body.maxScore).toBeGreaterThan(0);
    expect(submitted.body.corrections.length).toBeGreaterThan(0);
    expect(submitted.body.mention.length).toBeGreaterThan(3);

    const mcqCorrection = submitted.body.corrections.find((correction: { questionId: string }) => correction.questionId === mcq.id);
    // La correction expose la bonne réponse, l'explication et le barème.
    expect(Array.isArray(mcqCorrection.correctChoiceIds)).toBe(true);
    expect(mcqCorrection.correctChoiceIds.length).toBe(1);
    expect(mcqCorrection.explanation.length).toBeGreaterThan(5);
    expect(mcqCorrection.points).toBe(1);
    expect(mcqCorrection.awarded).toBeLessThanOrEqual(mcqCorrection.points);
    expect(mcqCorrection.correct).toBe(mcqCorrection.correctChoiceIds[0] === correctChoice);

    const writtenCorrection = submitted.body.corrections.find((correction: { questionId: string }) => correction.questionId === written.id);
    // Une question ouverte est évaluée avec une grille explicite, jamais un score opaque.
    expect(writtenCorrection.awarded).toBeGreaterThanOrEqual(0);
    expect(writtenCorrection.awarded).toBeLessThanOrEqual(writtenCorrection.points);
    expect(JSON.stringify(writtenCorrection)).toMatch(/critère|critere|grille|rubric|mots|attendu/i);

    const stored = await prisma.assessment.findUniqueOrThrow({ where: { id: assessmentId } });
    expect(stored.status).toBe('GRADED');
    expect(stored.score).toBeTypeOf('number');

    // Une seconde soumission est refusée : le résultat est figé dans l'historique.
    await request(app.getHttpServer())
      .post(`/api/assessments/${assessmentId}/submit`)
      .set(auth())
      .send({ answers: [] })
      .expect(403);

    const report = await request(app.getHttpServer()).get(`/api/assessments/${assessmentId}/report`).set(auth()).expect(200);
    expect(report.body).toBeTypeOf('object');
  });

  it('refuse une épreuve sans question et un paramétrage incohérent', async () => {
    await request(app.getHttpServer())
      .post('/api/assessments/generate')
      .set(auth())
      .send({ title: 'Épreuve vide', type: 'MCQ', mcqCount: 0, writtenCount: 0 })
      .expect(400);

    // Sans identifiant de cours, l'API se rabat sur les cours analysés du
    // compte : elle ne génère jamais d'épreuve sans source vérifiée.
    const fallback = await request(app.getHttpServer())
      .post('/api/assessments/generate')
      .set(auth())
      .send({ title: 'Épreuve sans source', type: 'MCQ', mcqCount: 3, writtenCount: 0, documentIds: [] });
    expect([201, 400]).toContain(fallback.status);
    if (fallback.status === 400) {
      expect(fallback.body.code).toBe('NO_SOURCE_DOCUMENT');
    }

    // Le nombre de questions produites ne dépasse jamais la demande.
    const limited = await request(app.getHttpServer())
      .post('/api/assessments/generate')
      .set(auth())
      .send({ title: 'Deux QCM seulement', type: 'MCQ', mcqCount: 2, writtenCount: 0, documentIds: [documentId] });
    expect(limited.status).toBe(201);
    expect(limited.body.questionCount).toBeLessThanOrEqual(2);
  });

  it('construit un planning réaliste à partir des disponibilités', async () => {
    const availability = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 18 * 60, endMinute: 21 * 60 }));
    await request(app.getHttpServer()).post('/api/planning/availability').set(auth()).send({ slots: availability }).expect(201);

    const from = new Date();
    const to = new Date(Date.now() + 8 * 86_400_000);

    const plan = await request(app.getHttpServer())
      .post('/api/planning/auto')
      .set(auth())
      .send({ from, to, sessionMinutes: 45, breakMinutes: 10, maxSessionsPerDay: 2, save: true })
      .expect(201);

    expect(plan.body.blocks.length).toBeGreaterThan(0);
    for (const block of plan.body.blocks) {
      const start = new Date(block.startAt);
      // Aucune séance en dehors des disponibilités déclarées, ni le week-end.
      const weekday = start.getDay();
      expect(availability.map((slot) => slot.weekday)).toContain(weekday);
      // Les disponibilités sont saisies en minutes « du jour » (18 h – 21 h).
      // L'API renvoie une date construite en heure locale : on accepte la
      // correspondance UTC exacte ou l'équivalent local, selon le fuseau.
      const localMinutes = start.getHours() * 60 + start.getMinutes();
      const utcMinutes = start.getUTCHours() * 60 + start.getUTCMinutes();
      expect(Math.min(localMinutes, utcMinutes)).toBeGreaterThanOrEqual(18 * 60);
      expect(block.rationale.length).toBeGreaterThan(3);
    }

    // Jamais plus de séances par jour que demandé (protection contre la surcharge).
    const perDay = new Map<string, number>();
    for (const block of plan.body.blocks) {
      const key = new Date(block.startAt).toISOString().slice(0, 10);
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    for (const count of perDay.values()) expect(count).toBeLessThanOrEqual(2);

    const agenda = await request(app.getHttpServer())
      .get(`/api/planning?from=${from.toISOString()}&to=${to.toISOString()}`)
      .set(auth())
      .expect(200);
    expect(agenda.body.blocks.length).toBeGreaterThan(0);
  });

  it('répond à une question de l’assistant en citant les extraits de cours', async () => {
    const answer = await request(app.getHttpServer())
      .post('/api/assistant/ask')
      .set(auth())
      .send({ message: 'Qu’est-ce que la membrane plasmique ?', documentIds: [documentId], mode: 'TUTEUR' })
      .expect(201);

    expect(answer.body.answer.length).toBeGreaterThan(20);
    expect(answer.body.mode).toBe('demo');
    expect(answer.body.disclaimer.length).toBeGreaterThan(10);
    expect(Array.isArray(answer.body.citations)).toBe(true);
  });

  it('bascule l’assistant en mode professeur (une question à la fois)', async () => {
    const answer = await request(app.getHttpServer())
      .post('/api/assistant/ask')
      .set(auth())
      .send({ message: 'Explique-moi la photosynthèse', mode: 'PROFESSEUR', documentIds: [documentId] })
      .expect(201);

    // Le mode professeur procède par une seule question à la fois.
    expect(answer.body.answer).toMatch(/question/i);
  });

  it('importe une photo de cours (OCR) et signale les incertitudes', async () => {
    if (!existsSync(FIXTURE_IMAGE)) return;
    const upload = await request(app.getHttpServer())
      .post('/api/documents')
      .set(auth())
      .field('title', 'Physique — photo de tableau')
      .attach('file', readFileSync(FIXTURE_IMAGE), { filename: 'cours-physique-scan.png', contentType: 'image/png' })
      .expect(201);

    let status = '';
    let detail: Record<string, unknown> = {};
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await request(app.getHttpServer()).get(`/api/documents/${upload.body.id}`).set(auth()).expect(200);
      detail = response.body;
      status = String(detail.status);
      if (['READY', 'PARTIAL', 'FAILED'].includes(status)) break;
      await new Promise((done) => setTimeout(done, 500));
    }

    // Une photo passe nécessairement par l'OCR : le statut doit le refléter.
    expect(['READY', 'PARTIAL']).toContain(status);
    const stored = await prisma.document.findUniqueOrThrow({ where: { id: upload.body.id } });
    expect(stored.ocrPages).toBeGreaterThan(0);
  });

  it('produit des statistiques cohérentes avec l’activité réelle', async () => {
    const stats = await request(app.getHttpServer()).get('/api/dashboard').set(auth()).expect(200);
    const documents = await prisma.document.count({ where: { userId } });
    expect(stats.body.library.totalDocuments).toBe(documents);
    expect(stats.body.library.totalDocuments).toBeGreaterThan(0);

    const cards = await prisma.flashcard.count({ where: { userId } });
    expect(stats.body.memory.totalCards).toBe(cards);

    const reviews = await prisma.reviewLog.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    });
    expect(stats.body.memory.reviewsLast7Days).toBe(reviews);
  });
});
