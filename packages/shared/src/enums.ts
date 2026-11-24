/**
 * Énumérations métier partagées entre l'API, le Web et l'Android.
 * Toute valeur stockée en base doit figurer ici (source de vérité unique).
 */

export const ROLES = ['STUDENT', 'TEACHER', 'INSTITUTION_ADMIN', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const AI_PROVIDERS = [
  'demo', // mode démonstration déterministe, clairement identifié
  'openai',
  'google',
  'anthropic',
  'openrouter',
  'ollama',
] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

export const DOCUMENT_STATUSES = [
  'UPLOADED',
  'QUEUED',
  'EXTRACTING',
  'OCR',
  'STRUCTURING',
  'CHUNKING',
  'INDEXING',
  'READY',
  'FAILED',
  'PARTIAL',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const SUBJECT_LEVELS = ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE'] as const;
export type SubjectLevel = (typeof SUBJECT_LEVELS)[number];

export const ASSESSMENT_TYPES = ['MCQ', 'WRITTEN', 'MIXED'] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const QUESTION_TYPES = ['MCQ', 'WRITTEN'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Taxonomie de Bloom simplifiée : pilote la difficulté cognitive des questions. */
export const COGNITIVE_LEVELS = [
  'CONNAISSANCE',
  'COMPREHENSION',
  'APPLICATION',
  'ANALYSE',
  'RAISONNEMENT',
] as const;
export type CognitiveLevel = (typeof COGNITIVE_LEVELS)[number];

export const DIFFICULTIES = ['FACILE', 'MOYEN', 'DIFFICILE'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const MASTERY_STATUSES = ['NOUVELLE', 'FRAGILE', 'EN_COURS', 'MAITRISEE'] as const;
export type MasteryStatus = (typeof MASTERY_STATUSES)[number];

export const REVIEW_GRADES = ['AGAIN', 'HARD', 'GOOD', 'EASY'] as const;
export type ReviewGrade = (typeof REVIEW_GRADES)[number];

export const PLAN_CODES = ['FREE', 'PREMIUM', 'INSTITUTION'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/** Clés de quotas — jamais de prix/limites codés en dur dans le code produit. */
export const QUOTA_KEYS = [
  'documents_total',
  'documents_per_month',
  'ai_generations_per_month',
  'assessments_per_month',
  'assistant_messages_per_day',
  'storage_mb',
  'ocr_pages_per_month',
] as const;
export type QuotaKey = (typeof QUOTA_KEYS)[number];

export const PAYMENT_PROVIDERS = ['CAMPAY', 'MTN_MOMO', 'ORANGE_MONEY', 'STRIPE', 'MANUAL'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'EXPIRED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = [
  'ACTIVE',
  'TRIALING',
  'PAST_DUE',
  'CANCELLED',
  'EXPIRED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PLANNING_BLOCK_TYPES = [
  'REVISION',
  'COURS',
  'EXAMEN',
  'DEVOIR',
  'PAUSE',
  'AUTRE',
] as const;
export type PlanningBlockType = (typeof PLANNING_BLOCK_TYPES)[number];

export const RESOURCE_KINDS = ['VIDEO', 'EXERCICE', 'ARTICLE', 'MOOC', 'PODCAST'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const FRENCH_LABELS = {
  ROLES: {
    STUDENT: 'Étudiant',
    TEACHER: 'Enseignant',
    INSTITUTION_ADMIN: "Administrateur d'établissement",
    ADMIN: 'Administrateur',
  } satisfies Record<Role, string>,
  DOCUMENT_STATUSES: {
    UPLOADED: 'Téléversé',
    QUEUED: 'En file',
    EXTRACTING: 'Extraction du texte',
    OCR: 'Reconnaissance optique (OCR)',
    STRUCTURING: 'Analyse de la structure',
    CHUNKING: 'Découpage en sections',
    INDEXING: 'Indexation',
    READY: 'Prêt',
    FAILED: 'Échec',
    PARTIAL: 'Partiel',
  } satisfies Record<DocumentStatus, string>,
  MASTERY_STATUSES: {
    NOUVELLE: 'Nouvelle',
    FRAGILE: 'Fragile',
    EN_COURS: 'En cours',
    MAITRISEE: 'Maîtrisée',
  } satisfies Record<MasteryStatus, string>,
  DIFFICULTIES: {
    FACILE: 'Facile',
    MOYEN: 'Moyen',
    DIFFICILE: 'Difficile',
  } satisfies Record<Difficulty, string>,
  ASSESSMENT_TYPES: {
    MCQ: 'QCM',
    WRITTEN: 'Questions écrites',
    MIXED: 'Épreuve mixte',
  } satisfies Record<AssessmentType, string>,
  PLAN_CODES: {
    FREE: 'Découverte',
    PREMIUM: 'Premium',
    INSTITUTION: 'Institution',
  } satisfies Record<PlanCode, string>,
};
