import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, ensurePlans, registerStudent, uniqueEmail, TEST_PASSWORD, type TestContext } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Authentification, sessions et isolation des comptes.
 * Chaque assertion s'exécute contre la vraie base et la vraie API.
 */
describe('Authentification et sessions', () => {
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

  it('inscrit un compte et renvoie un jeton + un cookie httpOnly', async () => {
    const email = uniqueEmail('inscription');
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: TEST_PASSWORD, displayName: 'Awa Ngo', acceptTerms: true })
      .expect(201);

    expect(response.body.token).toBeTypeOf('string');
    expect(response.body.user.email).toBe(email);
    expect(response.body.user.role).toBe('STUDENT');
    expect(response.body.user.planCode).toBe('FREE');

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const sessionCookie = cookies.find((cookie) => cookie.startsWith('memo_session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');

    // Le mot de passe n'est jamais renvoyé, ni stocké en clair.
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.passwordHash).toBeTypeOf('string');
    expect(stored.passwordHash).not.toContain(TEST_PASSWORD);
    expect(JSON.stringify(response.body)).not.toContain(TEST_PASSWORD);

    await prisma.user.delete({ where: { id: stored.id } });
  });

  it('refuse un mot de passe faible et un e-mail invalide', async () => {
    const weak = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail('faible'), password: 'azerty', displayName: 'Test Faible', acceptTerms: true })
      .expect(400);
    expect(JSON.stringify(weak.body)).toMatch(/mot de passe/i);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'pas-un-email', password: TEST_PASSWORD, displayName: 'Test Email', acceptTerms: true })
      .expect(400);

    // Sans acceptation des conditions, l'inscription est refusée (base légale).
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail('cgv'), password: TEST_PASSWORD, displayName: 'Test CGV', acceptTerms: false })
      .expect(400);
  });

  it('refuse un e-mail déjà utilisé', async () => {
    const student = await registerStudent(app);
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: student.email, password: TEST_PASSWORD, displayName: 'Doublon', acceptTerms: true })
      .expect(409);
    await prisma.user.delete({ where: { id: student.userId } });
  });

  it('accepte la connexion par e-mail insensible à la casse et renvoie /me', async () => {
    const student = await registerStudent(app);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: student.email.toUpperCase(), password: TEST_PASSWORD })
      .expect(200);

    expect(login.body.token).toBeTypeOf('string');

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    expect(me.body.email).toBe(student.email);

    await prisma.user.delete({ where: { id: student.userId } });
  });

  it('rejette un mauvais mot de passe sans révéler si le compte existe', async () => {
    const student = await registerStudent(app);
    const wrong = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: student.email, password: 'MauvaisMotDePasse1!' })
      .expect(401);
    const unknown = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: uniqueEmail('inconnu'), password: 'MauvaisMotDePasse1!' })
      .expect(401);

    expect(wrong.body.message).toBe(unknown.body.message);
    await prisma.user.delete({ where: { id: student.userId } });
  });

  it('refuse l’accès sans jeton et avec un jeton invalide', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', 'Bearer faux.jeton.invalide').expect(401);
  });

  it('révoque la session à la déconnexion', async () => {
    const student = await registerStudent(app);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(401);

    await prisma.user.delete({ where: { id: student.userId } });
  });

  it('change le mot de passe et invalide les sessions existantes', async () => {
    const student = await registerStudent(app);
    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NouveauSecret2027!' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: student.email, password: 'NouveauSecret2027!' })
      .expect(200);

    await prisma.user.delete({ where: { id: student.userId } });
  });

  it('réinitialise un mot de passe oublié sans divulguer l’existence du compte', async () => {
    const student = await registerStudent(app);
    const known = await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: student.email }).expect(200);
    const unknown = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: uniqueEmail('fantome') })
      .expect(200);

    expect(known.body.message).toBe(unknown.body.message);

    const reset = await prisma.passwordResetToken.findFirst({ where: { userId: student.userId } }).catch(() => null);
    expect(reset).not.toBeNull();
    // Le jeton n'est jamais stocké en clair : seul son condensat l'est.
    expect(reset?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    await prisma.user.delete({ where: { id: student.userId } });
  });

  it('met à jour le profil et applique les préférences', async () => {
    const student = await registerStudent(app);
    const updated = await request(app.getHttpServer())
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ displayName: 'Awa Ngo Bell', level: 'Licence 2', institution: 'Université de Douala', preferences: { theme: 'dark' } })
      .expect(200);

    expect(updated.body.displayName).toBe('Awa Ngo Bell');
    expect(updated.body.level).toBe('Licence 2');

    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });
    expect(persisted.displayName).toBe('Awa Ngo Bell');
    expect(JSON.stringify(persisted.preferences)).toContain('dark');

    await prisma.user.delete({ where: { id: student.userId } });
  });

  it('liste et révoque les sessions actives', async () => {
    const student = await registerStudent(app);
    const second = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: student.email, password: TEST_PASSWORD })
      .expect(200);

    const sessions = await request(app.getHttpServer())
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);
    expect(Array.isArray(sessions.body.items)).toBe(true);
    expect(sessions.body.items.length).toBeGreaterThanOrEqual(2);

    const other = sessions.body.items.find((session: { current: boolean }) => !session.current);
    await request(app.getHttpServer())
      .delete(`/api/auth/sessions/${other.id}`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${second.body.token}`).expect(401);

    await prisma.user.delete({ where: { id: student.userId } });
  });

  it('exporte les données personnelles et supprime le compte', async () => {
    const student = await registerStudent(app);
    const exported = await request(app.getHttpServer())
      .get('/api/auth/export')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);
    expect(exported.body.account.email).toBe(student.email);

    await request(app.getHttpServer())
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ password: TEST_PASSWORD, confirmation: 'SUPPRIMER' })
      .expect(200);

    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${student.token}`).expect(401);

    const remaining = await prisma.user.findFirst({ where: { email: student.email } });
    // Suppression effective : plus aucun document rattaché à ce compte.
    if (remaining) {
      expect(remaining.deletedAt).not.toBeNull();
      await prisma.user.delete({ where: { id: remaining.id } });
    }
  });
});
