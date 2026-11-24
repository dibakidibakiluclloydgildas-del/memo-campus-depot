import type { QuotaKey } from '../enums.js';

/**
 * Application des quotas d'abonnement — **côté serveur uniquement**.
 * Les limites proviennent de la table `Plan` (configuration administrable) ;
 * aucun prix ni quota n'est codé en dur dans les fonctionnalités produit.
 *
 * Convention : une valeur de quota `-1` signifie « illimité ».
 */

export type QuotaMap = Partial<Record<QuotaKey, number>>;

export interface UsageSnapshot {
  /** Nombre total de documents possédés (cumul). */
  documentsTotal: number;
  /** Documents importés sur le mois courant. */
  documentsThisMonth: number;
  aiGenerationsThisMonth: number;
  assessmentsThisMonth: number;
  assistantMessagesToday: number;
  storageMb: number;
  ocrPagesThisMonth: number;
}

export interface QuotaDecision {
  allowed: boolean;
  key: QuotaKey;
  limit: number;
  used: number;
  remaining: number;
  /** Message prêt à afficher en français, avec le nom de l'offre. */
  reason: string;
  upgradeSuggested: boolean;
}

const KEY_TO_USAGE: Record<QuotaKey, keyof UsageSnapshot> = {
  documents_total: 'documentsTotal',
  documents_per_month: 'documentsThisMonth',
  ai_generations_per_month: 'aiGenerationsThisMonth',
  assessments_per_month: 'assessmentsThisMonth',
  assistant_messages_per_day: 'assistantMessagesToday',
  storage_mb: 'storageMb',
  ocr_pages_per_month: 'ocrPagesThisMonth',
};

const QUOTA_LABELS: Record<QuotaKey, string> = {
  documents_total: 'de cours dans votre bibliothèque',
  documents_per_month: 'imports ce mois-ci',
  ai_generations_per_month: 'générations IA ce mois-ci',
  assessments_per_month: 'évaluations ce mois-ci',
  assistant_messages_per_day: "messages d'assistant aujourd'hui",
  storage_mb: 'Mo de stockage',
  ocr_pages_per_month: 'pages OCR ce mois-ci',
};

export function checkQuota(params: {
  key: QuotaKey;
  planCode: string;
  planName: string;
  quotas: QuotaMap;
  usage: UsageSnapshot;
  /** Quantité demandée (ex. 3 pages OCR, 1,5 Mo). */
  amount?: number;
}): QuotaDecision {
  const { key, planCode, planName, quotas, usage, amount = 1 } = params;
  const limit = quotas[key] ?? 0;
  const used = usage[KEY_TO_USAGE[key]] ?? 0;

  if (limit === -1) {
    return {
      allowed: true,
      key,
      limit: -1,
      used,
      remaining: Infinity,
      reason: 'Quota illimité avec votre offre.',
      upgradeSuggested: false,
    };
  }

  const remaining = Math.max(0, limit - used);
  const allowed = used + amount <= limit;
  const reason = allowed
    ? `Il vous reste ${remaining - amount} ${QUOTA_LABELS[key]} (offre ${planName}).`
    : `Quota atteint pour ${QUOTA_LABELS[key]} (offre ${planName} : ${limit}). Passez à une offre supérieure pour continuer.`;

  return {
    allowed,
    key,
    limit,
    used,
    remaining,
    reason,
    upgradeSuggested: !allowed && planCode !== 'INSTITUTION',
  };
}

/** Renvoie tous les quotas dépassés (utile pour le tableau de bord). */
export function quotaOverview(
  planCode: string,
  planName: string,
  quotas: QuotaMap,
  usage: UsageSnapshot,
): QuotaDecision[] {
  return (Object.keys(KEY_TO_USAGE) as QuotaKey[]).map((key) =>
    checkQuota({ key, planCode, planName, quotas, usage }),
  );
}
