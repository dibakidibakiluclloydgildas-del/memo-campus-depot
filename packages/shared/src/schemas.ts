import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/*  Primitives réutilisables                                                   */
/* -------------------------------------------------------------------------- */

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email("Adresse e-mail invalide")
  .transform((v) => v.toLowerCase());

/**
 * Mot de passe : 10 caractères minimum, une majuscule, une minuscule, un chiffre.
 * Choix assumé : on privilégie la longueur à la complexité excessive,
 * conformément aux recommandations ANSSI/OWASP 2023.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caractères')
  .max(128, 'Le mot de passe est trop long (128 caractères maximum)')
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre');

export const uuidSchema = z.string().uuid('Identifiant invalide');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

/* -------------------------------------------------------------------------- */
/*  Authentification                                                           */
/* -------------------------------------------------------------------------- */

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères').max(80),
  institution: z.string().trim().max(120).optional().or(z.literal('').transform(() => undefined)),
  level: z.string().trim().max(60).optional().or(z.literal('').transform(() => undefined)),
  field: z.string().trim().max(120).optional().or(z.literal('').transform(() => undefined)),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "Vous devez accepter les conditions d'utilisation" }),
  }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: passwordSchema,
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  institution: z.string().trim().max(120).nullish(),
  level: z.string().trim().max(60).nullish(),
  field: z.string().trim().max(120).nullish(),
  specialty: z.string().trim().max(120).nullish(),
  goal: z.string().trim().max(500).nullish(),
  locale: z.enum(['fr', 'en']).optional(),
  /** Préférences d'apprentissage (rythme de révision, thème, etc.). */
  preferences: z
    .object({
      theme: z.enum(['light', 'dark', 'system']).optional(),
      dailyReviewLimit: z.number().int().min(5).max(200).optional(),
      reviewPace: z.enum(['DOUX', 'NORMAL', 'INTENSIF']).optional(),
      reducedMotion: z.boolean().optional(),
    })
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Mot de passe requis pour confirmer'),
  confirmation: z.literal('SUPPRIMER'),
});

/* -------------------------------------------------------------------------- */
/*  Matières et documents                                                      */
/* -------------------------------------------------------------------------- */

export const subjectInputSchema = z.object({
  name: z.string().trim().min(2, 'Nom de matière trop court').max(80),
  code: z.string().trim().max(20).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hexadécimale attendue')
    .default('#2563eb'),
  level: z.enum(['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE']).default('INTERMEDIAIRE'),
});
export type SubjectInput = z.infer<typeof subjectInputSchema>;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 Mo
export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const documentMetaSchema = z.object({
  title: z.string().trim().min(2, 'Titre trop court').max(160),
  subjectId: uuidSchema.optional(),
  chapterHint: z.string().trim().max(120).optional(),
  language: z.enum(['fr', 'en']).default('fr'),
});
export type DocumentMetaInput = z.infer<typeof documentMetaSchema>;

/* -------------------------------------------------------------------------- */
/*  Génération pédagogique (sorties structurées, validées)                      */
/* -------------------------------------------------------------------------- */

export const sourceRefSchema = z.object({
  chapterId: uuidSchema.optional(),
  page: z.number().int().min(1).optional(),
  sectionTitle: z.string().max(200).optional(),
  quote: z.string().max(600).optional(),
  /** true si le contenu vient du cours, false s'il s'agit d'un complément général. */
  fromCourse: z.boolean(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

export const summarySchema = z.object({
  title: z.string().min(1).max(200),
  generalSummary: z.string().min(40).max(6000),
  objectives: z.array(z.string().min(3).max(300)).min(1).max(12),
  keyNotions: z
    .array(
      z.object({
        term: z.string().min(1).max(120),
        definition: z.string().min(10).max(1200),
        source: sourceRefSchema.optional(),
      }),
    )
    .max(30),
  formulas: z
    .array(z.object({ expression: z.string().max(300), meaning: z.string().max(400) }))
    .max(20)
    .default([]),
  chapters: z
    .array(
      z.object({
        chapterId: uuidSchema.optional(),
        title: z.string().min(1).max(200),
        summary: z.string().min(20).max(4000),
        pageFrom: z.number().int().min(1).optional(),
        pageTo: z.number().int().min(1).optional(),
      }),
    )
    .max(40)
    .default([]),
  uncertainties: z.array(z.string().max(400)).default([]),
  complementaryNotes: z.array(z.string().max(600)).default([]),
});
export type SummaryPayload = z.infer<typeof summarySchema>;

export const flashcardSchema = z.object({
  question: z.string().min(5).max(400),
  answer: z.string().min(1).max(2000),
  hint: z.string().max(300).optional(),
  source: sourceRefSchema.optional(),
});
export type FlashcardPayload = z.infer<typeof flashcardSchema>;

export const mcqQuestionSchema = z
  .object({
    type: z.literal('MCQ'),
    prompt: z.string().min(10).max(1200),
    choices: z
      .array(z.object({ id: z.string().min(1).max(4), text: z.string().min(1).max(500) }))
      .min(3, 'Un QCM doit proposer au moins 3 choix')
      .max(6),
    correctChoiceIds: z.array(z.string().min(1).max(4)).min(1),
    explanation: z.string().min(10).max(1500),
    difficulty: z.enum(['FACILE', 'MOYEN', 'DIFFICILE']),
    cognitiveLevel: z.enum([
      'CONNAISSANCE',
      'COMPREHENSION',
      'APPLICATION',
      'ANALYSE',
      'RAISONNEMENT',
    ]),
    points: z.number().min(0.5).max(20).default(1),
    source: sourceRefSchema,
  })
  .refine((q) => q.correctChoiceIds.every((id) => q.choices.some((c) => c.id === id)), {
    message: 'La bonne réponse doit faire partie des choix proposés',
    path: ['correctChoiceIds'],
  })
  .refine((q) => new Set(q.choices.map((c) => c.id)).size === q.choices.length, {
    message: 'Les identifiants de choix doivent être uniques',
    path: ['choices'],
  })
  .refine((q) => new Set(q.choices.map((c) => c.text.trim().toLowerCase())).size === q.choices.length, {
    message: 'Deux choix identiques ont été détectés',
    path: ['choices'],
  });
export type McqQuestion = z.infer<typeof mcqQuestionSchema>;

export const writtenQuestionSchema = z.object({
  type: z.literal('WRITTEN'),
  prompt: z.string().min(10).max(1500),
  expectedAnswer: z.string().min(10).max(4000),
  /** Grille de correction explicite : critère -> points. */
  gradingRubric: z
    .array(z.object({ criterion: z.string().min(3).max(300), points: z.number().min(0.25).max(20) }))
    .min(1, 'Une grille de correction est obligatoire'),
  keyPoints: z.array(z.string().max(300)).default([]),
  modelSolution: z.string().max(4000).optional(),
  difficulty: z.enum(['FACILE', 'MOYEN', 'DIFFICILE']),
  cognitiveLevel: z.enum([
    'CONNAISSANCE',
    'COMPREHENSION',
    'APPLICATION',
    'ANALYSE',
    'RAISONNEMENT',
  ]),
  points: z.number().min(0.5).max(20).default(4),
  source: sourceRefSchema,
});
export type WrittenQuestion = z.infer<typeof writtenQuestionSchema>;

/**
 * `z.union` (et non `discriminatedUnion`) car les branches MCQ portent des
 * `refine` (ZodEffects), incompatibles avec la discrimination stricte par clé.
 * Les deux branches restent discriminables via `type` côté TypeScript.
 */
export const generatedQuestionSchema = z.union([mcqQuestionSchema, writtenQuestionSchema]);
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

export const assessmentGenerationSchema = z.object({
  title: z.string().min(3).max(200),
  instructions: z.string().max(1200).default(''),
  questions: z.array(generatedQuestionSchema).min(1).max(50),
});
export type AssessmentGeneration = z.infer<typeof assessmentGenerationSchema>;

export const assessmentConfigSchema = z
  .object({
    subjectId: uuidSchema.optional(),
    documentIds: z.array(uuidSchema).max(20).default([]),
    title: z.string().trim().min(3, 'Titre requis').max(160),
    type: z.enum(['MCQ', 'WRITTEN', 'MIXED']),
    difficulty: z.enum(['FACILE', 'MOYEN', 'DIFFICILE']).default('MOYEN'),
    mcqCount: z.number().int().min(0).max(40).default(0),
    writtenCount: z.number().int().min(0).max(20).default(0),
    durationMinutes: z.number().int().min(5).max(240).default(30),
    includeAnswerKey: z.boolean().default(true),
  })
  .refine((c) => c.type === 'MCQ' || c.writtenCount > 0, {
    message: 'Ajoutez au moins une question écrite pour ce type d’épreuve',
    path: ['writtenCount'],
  })
  .refine((c) => c.type === 'WRITTEN' || c.mcqCount > 0, {
    message: 'Ajoutez au moins un QCM pour ce type d’épreuve',
    path: ['mcqCount'],
  })
  .refine((c) => c.mcqCount + c.writtenCount > 0, {
    message: 'Le nombre total de questions doit être supérieur à zéro',
    path: ['mcqCount'],
  });
export type AssessmentConfigInput = z.infer<typeof assessmentConfigSchema>;

export const mcqAnswerSchema = z.object({
  questionId: uuidSchema,
  type: z.literal('MCQ'),
  selectedChoiceIds: z.array(z.string()).max(6),
  timeSpentSeconds: z.number().int().min(0).max(86400).default(0),
});
export const writtenAnswerSchema = z.object({
  questionId: uuidSchema,
  type: z.literal('WRITTEN'),
  text: z.string().max(20000).default(''),
  timeSpentSeconds: z.number().int().min(0).max(86400).default(0),
});
export const submitAssessmentSchema = z.object({
  answers: z.array(z.discriminatedUnion('type', [mcqAnswerSchema, writtenAnswerSchema])),
  autoSubmitted: z.boolean().default(false),
});
export type SubmitAssessmentInput = z.infer<typeof submitAssessmentSchema>;

/* -------------------------------------------------------------------------- */
/*  Planning / révisions                                                       */
/* -------------------------------------------------------------------------- */

export const planningBlockSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    type: z.enum(['REVISION', 'COURS', 'EXAMEN', 'DEVOIR', 'PAUSE', 'AUTRE']),
    subjectId: uuidSchema.nullish(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    priority: z.number().int().min(1).max(5).default(3),
    notes: z.string().max(1000).nullish(),
  })
  .refine((b) => b.endAt > b.startAt, {
    message: 'La fin du créneau doit être postérieure au début',
    path: ['endAt'],
  });
export type PlanningBlockInput = z.infer<typeof planningBlockSchema>;

export const availabilitySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(0).max(1439),
  })
  .refine((a) => a.endMinute > a.startMinute, {
    message: 'La fin de disponibilité doit suivre le début',
    path: ['endMinute'],
  });

export const generatePlanningSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  /** Durée d'une séance en minutes. */
  sessionMinutes: z.number().int().min(15).max(120).default(45),
  /** Répartition libre laissée à l'étudiant (0 désactive). */
  pomodoroMinutes: z.number().int().min(10).max(90).default(25),
  breakMinutes: z.number().int().min(3).max(30).default(5),
  maxSessionsPerDay: z.number().int().min(1).max(8).default(3),
  availability: z.array(availabilitySchema).min(1, 'Renseignez au moins une disponibilité'),
});
export type GeneratePlanningInput = z.infer<typeof generatePlanningSchema>;

export const reviewSubmissionSchema = z.object({
  flashcardId: uuidSchema,
  grade: z.enum(['AGAIN', 'HARD', 'GOOD', 'EASY']),
  durationMs: z.number().int().min(0).max(600000).default(0),
});
export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;

/* -------------------------------------------------------------------------- */
/*  Assistant                                                                  */
/* -------------------------------------------------------------------------- */

export const assistantMessageSchema = z.object({
  conversationId: uuidSchema.optional(),
  message: z.string().trim().min(1, 'Message vide').max(4000),
  subjectId: uuidSchema.optional(),
  documentIds: z.array(uuidSchema).max(10).default([]),
  mode: z.enum(['TUTEUR', 'PROFESSEUR', 'EXAMEN_BLANC']).default('TUTEUR'),
});
export type AssistantMessageInput = z.infer<typeof assistantMessageSchema>;

/* -------------------------------------------------------------------------- */
/*  Paiement                                                                   */
/* -------------------------------------------------------------------------- */

export const checkoutSchema = z.object({
  planCode: z.enum(['FREE', 'PREMIUM', 'INSTITUTION']),
  provider: z.enum(['CAMPY', 'MTN_MOMO', 'ORANGE_MONEY', 'STRIPE', 'MANUAL']),
  phoneNumber: z
    .string()
    .regex(/^\+?[0-9 ]{8,18}$/, 'Numéro de téléphone invalide')
    .optional(),
  email: emailSchema.optional(),
  /** Cycle de facturation en mois (1 ou 12). */
  months: z.number().int().min(1).max(12).default(1),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/* -------------------------------------------------------------------------- */
/*  Administration                                                             */
/* -------------------------------------------------------------------------- */

export const planUpsertSchema = z.object({
  code: z.enum(['FREE', 'PREMIUM', 'INSTITUTION']),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).default(''),
  priceXafMonthly: z.number().int().min(0).max(10_000_000),
  priceXafYearly: z.number().int().min(0).max(100_000_000),
  quotas: z.record(z.string(), z.number().int().min(-1).max(10_000_000)),
  features: z.array(z.string().max(120)).default([]),
  isActive: z.boolean().default(true),
});
export type PlanUpsertInput = z.infer<typeof planUpsertSchema>;
