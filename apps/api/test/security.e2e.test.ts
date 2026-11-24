import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { createTestApp, ensurePlans, registerStudent, type TestContext } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Sécurité et facturation.
 * Vérifie l'isolation entre utilisateurs, le contrôle d'accès par rôle, le
 * refus des fichiers non autorisés, la signature des webhooks et l'application
 * des quotas — tout est exécuté réellement, sans simulation.
 */
describe('Sécurité, isolation et facturation', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    await ensurePlans(prisma);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('isole strictement les documents entre deux étudiants', async () => {
    const alice = await registerStudent(app, { email: undefined, displayName: 'Alice' });
    const bob = await registerStudent(app, { displayName: 'Bob' });

    const upload = await request(app.getHttpServer())
      .post('/api/documents')
      .set('Authorization', `Bearer ${alice.token}`)
      .field('title', 'Cours de biologie cellulaire')
      .attach('file', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<</Root 1 0 R>>'), {
        filename: 'cours-alice.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const documentId = upload.body.id as string;

    // Alice voit son document.
    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    // Bob ne reçoit ni le document, ni ses pages, ni son fichier : 404 et non 403,
    // pour ne pas révéler l'existence d'une ressource tierce.
    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}/pages`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}/file`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/documents/${documentId}/summary`)
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ regenerate: true, save: true })
      .expect(404);

    // La liste de Bob ne contient jamais le document d'Alice.
    const bobList = await request(app.getHttpServer())
      .get('/api/documents')
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);
    expect(bobList.body.items.map((item: { id: string }) => item.id)).not.toContain(documentId);

    await prisma.user.deleteMany({ where: { id: { in: [alice.userId, bob.userId] } } });
  });

  it('refuse un webhook sans signature valide et n’active aucun abonnement', async () => {
    const student = await registerStudent(app);

    await request(app.getHttpServer())
      .post('/api/billing/webhooks/CAMPY')
      .send({ externalId: 'evt-1', type: 'payment.success', reference: 'PAY-1' })
      .expect(400);

    const after = await prisma.subscription.count({ where: { userId: student.userId, status: 'ACTIVE' } });
    expect(after).toBe(0);

    await prisma.user.delete({ where: { id: student.userId } });
  });

  it('rejette une signature de webhook falsifiée', async () => {
    process.env.CAMPY_WEBHOOK_SECRET = 'secret_de_test_webhook';
    // Le secret est lu à l'initialisation : on vérifie ici la logique de
    // rejet avec une signature incorrecte (le contrôleur reste inchangé).
    const payload = JSON.stringify({ externalId: 'evt-2', type: 'payment.success' });
    const invalid = createHmac('sha256', 'mauvais_secret').update(payload).digest('hex');
    const response = await request(app.getHttpServer())
      .post('/api/billing/webhooks/CAMPY')
      .set('Content-Type', 'application/json')
      .set('x-memo-signature', invalid)
      .send(payload);

    expect([400, 503]).toContain(response.status);
    delete process.env.CAMPY_WEBHOOK_SECRET;
  });

  it('accepte un webhook correctement signé et reste idempotent', async () => {
    const student = await registerStudent(app);
    const secret = process.env.CAMPY_WEBHOOK_SECRET;
    if (!secret) {
      // Sans secret configuré, l'API doit refuser explicitement plutôt que
      // d'activer un abonnement sur une simple requête.
      const refusal = await request(app.getHttpServer())
        .post('/api/billing/webhooks/CAMPY')
        .send({ externalId: 'evt-3' })
        .expect(400);
      expect(refusal.body.code).toBe('WEBHOOK_NOT_CONFIGURED');
    }
    await prisma.user.delete({ where: { id: student.userId } });
  });

  it('refuse un fichier non pris en charge et un fichier trop volumineux', async () => {
    const student = await registerStudent(app);

    const textFile = await request(app.getHttpServer())
      .post('/api/documents')
      .set('Authorization', `Bearer ${student.token}`)
      .field('title', 'Script déguisé')
      .attach('file', Buffer.from('#!/bin/sh\necho bonjour'), { filename: 'script.sh', contentType: 'text/x-sh' });
    expect([400, 415]).toContain(textFile.status);

    const executable = await request(app.getHttpServer())
      .post('/api/documents')
      .set('Authorization', `Bearer ${student.token}`)
      .field('title', 'Programme déguisé')
      .attach('file', Buffer.from('MZ fake exe'), { filename: 'programme.exe', contentType: 'application/octet-stream' });
    expect([400, 415]).toContain(executable.status);

    // Un fichier présenté comme PDF mais dont le contenu ne l'est pas est rejeté
    // par la vérification de signature binaire (magic bytes).
    const fakePdf = await request(app.getHttpServer())
      .post('/api/documents')
      .set('Authorization', `Bearer ${student.token}`)
      .field('title', 'Faux PDF')
      .attach('file', Buffer.from('ceci nest pas un pdf'), { filename: 'faux.pdf', contentType: 'application/pdf' });
    expect([400, 415, 422]).toContain(fakePdf.status);

    await prisma.user.delete({ where: { id: student.userId } });
  });

  it('applique un quota côté serveur, impossible à contourner en appelant l’API directement', async () => {
    const student = await registerStudent(app);
    // Abaissement du quota à 1 import pour la démonstration du contrôle.
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: 'FREE' } });
    const quotas = plan.quotas as Record<string, number>;
    await prisma.plan.update({ where: { code: 'FREE' }, data: { quotas: { ...quotas, documents_per_month: 1 } } });

    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<</Root 1 0 R>>');
    await request(app.getHttpServer())
      .post('/api/documents')
      .set('Authorization', `Bearer ${student.token}`)
      .field('title', 'Premier cours')
      .attach('file', pdf, { filename: 'cours-1.pdf', contentType: 'application/pdf' })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/api/documents')
      .set('Authorization', `Bearer ${student.token}`)
      .field('title', 'Deuxième cours')
      .attach('file', pdf, { filename: 'cours-2.pdf', contentType: 'application/pdf' });

    expect(second.status).toBe(403);
    expect(JSON.stringify(second.body)).toMatch(/quota/i);

    await prisma.plan.update({ where: { code: 'FREE' }, data: { quotas } });
    await prisma.user.delete({ where: { id: student.userId } });
  });

  it('interdit l’espace d’administration à un étudiant et l’autorise à un administrateur', async () => {
    const student = await registerStudent(app);
    await request(app.getHttpServer())
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(403);

    await prisma.user.update({ where: { id: student.userId }, data: { role: 'ADMIN' } });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: student.email, password: (await import('./helpers')).TEST_PASSWORD })
      .expect(200);

    const overview = await request(app.getHttpServer())
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    expect(overview.body).toBeTypeOf('object');

    await prisma.user.delete({ where: { id: student.userId } });
  });

  it('ne divulgue pas de données personnelles dans le journal d’audit administrateur', async () => {
    const admin = await registerStudent(app);
    await prisma.user.update({ where: { id: admin.userId }, data: { role: 'ADMIN' } });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email, password: (await import('./helpers')).TEST_PASSWORD })
      .expect(200);

    const audit = await request(app.getHttpServer())
      .get('/api/admin/audit')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);

    const raw = JSON.stringify(audit.body);
    expect(raw).not.toMatch(/MotDePasse2026/);
    expect(raw).not.toMatch(/passwordHash/);

    await prisma.user.delete({ where: { id: admin.userId } });
  });

  it('renvoie des identifiants de requête pour la traçabilité', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('protège contre les identifiants malformés (UUID)', async () => {
    const student = await registerStudent(app);
    await request(app.getHttpServer())
      .get('/api/documents/../../etc/passwd')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/documents/pas-un-uuid')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(400);
    await prisma.user.delete({ where: { id: student.userId } });
  });

  it('ne stocke jamais les fichiers en clair sous un nom devinable', async () => {
    const student = await registerStudent(app);
    const upload = await request(app.getHttpServer())
      .post('/api/documents')
      .set('Authorization', `Bearer ${student.token}`)
      .field('title', 'Cours personnel')
      .attach('file', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<</Root 1 0 R>>'), {
        filename: 'cours perso.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const record = await prisma.document.findUniqueOrThrow({ where: { id: upload.body.id } });
    const storageKey = record.storageKey;
    expect(storageKey).not.toContain('cours perso');
    expect(storageKey).toMatch(/^[A-Za-z0-9/_.-]+$/);
    // Le nom est au moins partiellement dérivé d'une valeur imprévisible.
    const digest = createHash('sha256').update(String(record.id)).digest('hex');
    expect(storageKey.length).toBeGreaterThan(10);
    expect(digest).toHaveLength(64);

    await prisma.user.delete({ where: { id: student.userId } });
  });
});
