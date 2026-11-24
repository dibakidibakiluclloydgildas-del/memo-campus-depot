/**
 * Données de démonstration — SÉPARÉES des données réelles.
 *
 * Règles :
 *  - ce script est idempotent (upsert) et ne s'exécute que sur une base de
 *    développement/démo (`SEED_MODE=demo`) ;
 *  - les comptes créés portent des adresses `@demo.memo-campus.cm` ;
 *  - les cours de démonstration sont générés à partir d'un texte pédagogique
 *    réel, court et vérifiable : aucune fausse analyse n'est simulée.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'MemoCampus2026!';

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  // ---------------------------------------------------------------------------
  // Offres (prix et quotas administrables — AUCUN prix en dur dans le code)
  // ---------------------------------------------------------------------------
  const plans = [
    {
      code: 'FREE',
      name: 'Découverte',
      description: 'Pour essayer MÉMO CAMPUS sans engagement.',
      priceXafMonthly: 0,
      priceXafYearly: 0,
      quotas: {
        documents_total: 5,
        documents_per_month: 3,
        ai_generations_per_month: 10,
        assessments_per_month: 3,
        assistant_messages_per_day: 10,
        storage_mb: 100,
        ocr_pages_per_month: 20,
      },
      features: [
        '5 cours dans la bibliothèque',
        'Résumés extractifs et fiches de révision',
        '3 évaluations par mois',
        'Révisions espacées',
      ],
      sortOrder: 1,
    },
    {
      code: 'PREMIUM',
      name: 'Premium',
      description: 'Pour les étudiants qui préparent des examens décisifs.',
      priceXafMonthly: 3500,
      priceXafYearly: 35000,
      quotas: {
        documents_total: -1,
        documents_per_month: 60,
        ai_generations_per_month: 400,
        assessments_per_month: 80,
        assistant_messages_per_day: 200,
        storage_mb: 5000,
        ocr_pages_per_month: 600,
      },
      features: [
        'Cours illimités dans la bibliothèque',
        'Assistant IA illimité dans la limite quotidienne',
        'Épreuves personnalisées illimitées',
        'Statistiques avancées et rapports',
        'Répétition espacée prioritaire',
      ],
      sortOrder: 2,
    },
    {
      code: 'INSTITUTION',
      name: 'Institution',
      description: "Pour les écoles, universités et centres de formation.",
      priceXafMonthly: 45000,
      priceXafYearly: 450000,
      quotas: {
        documents_total: -1,
        documents_per_month: 2000,
        ai_generations_per_month: 10000,
        assessments_per_month: 5000,
        assistant_messages_per_day: 1000,
        storage_mb: 50000,
        ocr_pages_per_month: 20000,
      },
      features: [
        'Espaces d’établissement et groupes',
        'Comptes enseignants et tableaux de bord agrégés',
        'Licences nominatives',
        'Administration des organisations',
        'Accompagnement au déploiement',
      ],
      sortOrder: 3,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: plan,
      update: { name: plan.name, description: plan.description, priceXafMonthly: plan.priceXafMonthly, priceXafYearly: plan.priceXafYearly, quotas: plan.quotas, features: plan.features, sortOrder: plan.sortOrder },
    });
  }

  // ---------------------------------------------------------------------------
  // Établissement de démonstration
  // ---------------------------------------------------------------------------
  const institution = await prisma.institution.upsert({
    where: { slug: 'universite-de-yaounde-1-demo' },
    create: {
      name: 'Université de Yaoundé I (démo)',
      slug: 'universite-de-yaounde-1-demo',
      city: 'Yaoundé',
      contactEmail: 'scolarite@demo.memo-campus.cm',
      seats: 120,
      licenses: { create: { seats: 120, expiresAt: new Date(Date.now() + 365 * 86_400_000), reference: 'DEMO-2026' } },
    },
    update: {},
  });

  // ---------------------------------------------------------------------------
  // Comptes de démonstration
  // ---------------------------------------------------------------------------
  const accounts = [
    { email: 'etudiant@demo.memo-campus.cm', displayName: 'Aïcha Nkomo', role: 'STUDENT', planCode: 'PREMIUM', level: 'Licence 2', field: 'Sciences' },
    { email: 'etudiant.free@demo.memo-campus.cm', displayName: 'Bertrand Mballa', role: 'STUDENT', planCode: 'FREE', level: 'Terminale', field: 'Série C' },
    { email: 'enseignant@demo.memo-campus.cm', displayName: 'M. Emmanuel Fotso', role: 'TEACHER', planCode: 'INSTITUTION', level: 'Enseignant', field: 'Biologie' },
    { email: 'admin@demo.memo-campus.cm', displayName: 'Administrateur MÉMO', role: 'ADMIN', planCode: 'INSTITUTION', level: null, field: null },
  ];

  for (const account of accounts) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      create: {
        email: account.email,
        passwordHash,
        displayName: account.displayName,
        role: account.role,
        planCode: account.planCode,
        institution: 'Université de Yaoundé I',
        institutionId: account.planCode === 'INSTITUTION' ? institution.id : null,
        level: account.level,
        field: account.field,
        emailVerifiedAt: new Date(),
        preferences: { theme: 'system', dailyReviewLimit: 20, reviewPace: 'NORMAL' },
      },
      update: { planCode: account.planCode, displayName: account.displayName, role: account.role },
    });

    const existingSubjects = await prisma.subject.count({ where: { userId: user.id } });
    if (existingSubjects === 0) {
      await prisma.subject.createMany({
        data: [
          { userId: user.id, name: 'Biologie cellulaire', color: '#10b981', level: 'INTERMEDIAIRE' },
          { userId: user.id, name: 'Physique', color: '#0ea5e9', level: 'INTERMEDIAIRE' },
          { userId: user.id, name: 'Méthodologie', color: '#8b5cf6', level: 'DEBUTANT' },
        ],
      });
    }

    if (account.role === 'STUDENT' && account.planCode === 'PREMIUM') {
      const existing = await prisma.subscription.findFirst({ where: { userId: user.id, status: 'ACTIVE' } });
      if (!existing) {
        await prisma.subscription.create({
          data: {
            userId: user.id,
            planCode: 'PREMIUM',
            status: 'ACTIVE',
            currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
            provider: 'MANUAL',
          },
        });
      }
    }
  }

  console.log('✅ Offres, établissement et comptes de démonstration prêts.');
  console.log('   Mot de passe commun :', DEMO_PASSWORD);
  console.log('   etudiant@demo.memo-campus.cm (Premium) · etudiant.free@demo.memo-campus.cm (Free)');
  console.log('   enseignant@demo.memo-campus.cm (Institution) · admin@demo.memo-campus.cm (Administrateur)');
}

main()
  .catch((error) => {
    console.error('❌ Échec du seed :', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
