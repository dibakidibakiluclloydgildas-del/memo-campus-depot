# MÉMO CAMPUS — Guide d'administration et de maintenance

Destiné aux administrateurs de la plateforme, aux administrateurs d'établissement et aux personnes assurant la maintenance technique.

---

## 1. Se connecter à l'espace d'administration

1. Ouvrez `https://<votre-domaine>/connexion`.
2. Connectez-vous avec un compte ayant le rôle `ADMIN` (ou `INSTITUTION_ADMIN` pour la vue établissement).
3. L'entrée **Administration** apparaît dans la navigation ; l'adresse directe est `/admin`.

Un étudiant qui demande `/admin` est redirigé (jamais servi, jamais d'erreur d'autorisation détaillée). Les appels API correspondants renvoient **403** : le contrôle se fait côté serveur, pas dans l'interface.

Compte de démonstration (après `npm run db:seed`) : `admin@demo.memo-campus.cm` / `MemoCampus2026!` — **à supprimer ou changer immédiatement sur toute instance accessible publiquement**.

---

## 2. Ce que contient le tableau de bord d'administration

| Bloc | Contenu | Point de vigilance |
|---|---|---|
| Vue d'ensemble | comptes actifs, cours importés, générations IA, abonnements en cours, revenus du mois | ne montre que des agrégats, jamais le contenu des cours |
| Comptes | recherche, rôle, offre, état | l'admin ne peut pas lire les documents des utilisateurs : uniquement les métadonnées nécessaires |
| Offres et quotas | prix (XAF mensuel/annuel), quotas, ordre d'affichage, promotions | **aucun prix n'est codé en dur** : tout est en base, modifiable ici |
| Paiements | transactions, statut, justificatif | un paiement ne s'active qu'après **webhook signé** vérifié |
| Coûts IA | générations, jetons, coût estimé par compte | permet de mesurer le coût par document et par génération |
| Signalements | contenus signalés, statut de traitement | aucun accès au document d'autrui sans base légale documentée |
| Journal d'audit | action, acteur, cible, horodatage | aucun mot de passe, aucun jeton, aucune donnée de carte |

---

## 3. Gérer les offres, prix et quotas

Tout se fait depuis **Administration → Offres** (API `POST /api/admin/plans`) :

```json
{
  "code": "PREMIUM",
  "name": "Premium",
  "priceXafMonthly": 3500,
  "priceXafYearly": 35000,
  "quotas": {
    "documents_total": -1,
    "documents_per_month": 60,
    "ai_generations_per_month": 400,
    "assessments_per_month": 80,
    "assistant_messages_per_day": 200,
    "storage_mb": 5000,
    "ocr_pages_per_month": 600
  }
}
```

- `-1` signifie **illimité**.
- Les quotas sont **appliqués côté serveur** à chaque import, génération, question à l'assistant et création d'épreuve. Modifier une offre prend effet immédiatement, sans redéploiement.
- Après une promotion, vérifiez l'impact dans **Coûts IA** : c'est la principale source de dépense.

**Bonne pratique** : quand vous changez le prix d'une offre, laissez l'ancien prix actif pour les abonnements en cours (le changement s'applique aux nouveaux paiements).

---

## 4. Paiements : ce qui est activé, ce qui ne l'est pas

| Prestataire | État dans ce livrable | Ce qu'il faut pour l'activer |
|---|---|---|
| Campay (Orange Money / MTN MoMo) | intégration écrite, **non activée** | `CAMPY_APP_ID`, `CAMPY_APP_SECRET`, `CAMPY_WEBHOOK_SECRET` fournis par Campay, plus un compte marchand validé |
| Stripe (cartes, mode test) | intégration écrite, **non activée** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (clés de test `sk_test_…`) |

Règles appliquées par le code, sans exception :

1. Une souscription n'est **jamais** activée par une simple demande de l'utilisateur, ni par une capture d'écran ;
2. le webhook doit porter une signature HMAC correcte (`X-Memo-Signature` ou `X-Campay-Signature`) comparée en temps constant ;
3. un événement déjà traité (`provider` + `externalId`) est ignoré : rejouer un webhook ne prolonge pas deux fois l'abonnement ;
4. si aucun secret n'est configuré, l'API répond `WEBHOOK_NOT_CONFIGURED` et n'active rien.

Configuration du webhook côté prestataire : `POST https://api.<domaine>/api/billing/webhooks/CAMPY` (ou `/STRIPE`).

**Test en sandbox** (sans argent réel) :

```bash
# Signature correcte d'un événement de test
BODY='{"externalId":"test-001","type":"payment.success","reference":"PAY-001","planCode":"PREMIUM"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$CAMPY_WEBHOOK_SECRET" -hex | awk '{print $2}')
curl -X POST https://api.<domaine>/api/billing/webhooks/CAMPY \
  -H "Content-Type: application/json" -H "X-Memo-Signature: $SIG" -d "$BODY"
```

---

## 5. Maintenance courante

### 5.1 Sauvegardes

```bash
# Sauvegarde quotidienne (à placer en cron, 02:00)
pg_dump -Fc memo_campus > /sauvegardes/memo_$(date +%F).dump
tar czf /sauvegardes/storage_$(date +%F).tar.gz /data/storage

# Restauration testée (à faire au moins une fois par mois, sur une base jetable)
createdb memo_restauration && pg_restore -d memo_restauration /sauvegardes/memo_2026-11-20.dump
```

Conservez 7 sauvegardes quotidiennes, 4 hebdomadaires, 12 mensuelles. Chiffrez-les (age ou GPG) et stockez-les hors du serveur.

### 5.2 Tâches planifiées internes

L'API programme elle-même (`@nestjs/schedule`) : rappels d'échéances, recalcul des révisions dues, purge des sessions expirées. Aucune tâche cron externe n'est nécessaire, mais surveillez les journaux `[Scheduler]`.

### 5.3 Surveillance

| Indicateur | Seuil d'alerte | Où |
|---|---|---|
| `GET /api/health` | non-200 pendant 2 min | supervision externe (UptimeRobot, BetterStack) |
| Documents en statut `FAILED` | > 5 par heure | `/admin` → vue d'ensemble |
| Coût IA du jour | > 80 % du budget `AI_MONTHLY_BUDGET_USD` | `/admin` → coûts IA |
| Espace disque `storage-data` | > 80 % | hôte / Docker |
| Erreurs 5xx | > 1 % des requêtes | journaux API (`X-Request-Id` pour tracer) |

### 5.4 Logs

```bash
docker compose -f infrastructure/docker-compose.yml logs -f api --tail=200
# ou, en installation locale :
journalctl -u memo-api -f
```

Chaque ligne HTTP contient `requestId`, `method`, `path`, `status`, `durationMs`. Pour retrouver une requête signalée par un utilisateur, demandez-lui l'identifiant affiché dans le message d'erreur.

---

## 6. Gestion des comptes et des rôles

| Rôle | Peut faire | Ne peut pas |
|---|---|---|
| `STUDENT` | gérer ses cours, réviser, s'évaluer, planifier | voir un document tiers, accéder à l'admin |
| `TEACHER` | ce qui précède + partager des ressources avec ses groupes | lire les cours privés des étudiants |
| `INSTITUTION_ADMIN` | administrer les comptes de son établissement | agir hors de son établissement |
| `ADMIN` | administration complète de la plateforme | lire le contenu des documents sans base légale |

L'isolation est vérifiée par des tests automatisés : un document d'un autre compte renvoie **404** (et non 403), pour ne pas révéler son existence.

**Désactiver un compte** : `PATCH /api/admin/users/:id` avec `{ "isActive": false }`. Les sessions en cours sont invalidées à la requête suivante.

---

## 7. Incidents fréquents et procédure

| Incident | Diagnostic | Action |
|---|---|---|
| Documents bloqués en `QUEUED` | Redis arrêté ? | l'API bascule en mode synchrone ; relancer depuis la bibliothèque (`POST /api/documents/:id/reprocess`) |
| OCR de mauvaise qualité | photo floue, éclairage insuffisant | l'interface signale déjà les incertitudes ; demandez une nouvelle photo |
| Taux d'erreur IA élevé | clé API expirée, quota fournisseur épuisé | l'API retombe automatiquement en mode démonstration et l'affiche ; vérifiez la clé |
| Paiements non activés | webhook non signé / secret absent | vérifier `CAMPY_WEBHOOK_SECRET`, consulter `/api/admin/payments` |
| Fuite suspectée de données | — | révoquer les sessions (`POST /api/auth/logout-all`), changer `JWT_SECRET` (invalide tous les jetons), consigner l'incident, notifier selon la loi 2010/012 |

---

## 8. Mise à jour et retour arrière

```bash
pg_dump -Fc memo_campus > /sauvegardes/avant_maj.dump   # 1. sauvegarder
git pull && npm install && npm run build:shared
npm run db:migrate                                       # 2. migrations additives
npm run build && <redémarrer les services>               # 3. déployer
python3 scripts/verify_flow.py                           # 4. vérifier le parcours réel
```

En cas de régression applicative : redéployer la version précédente (les migrations étant additives, l'ancien code fonctionne encore). En cas de corruption de données : restaurer la sauvegarde puis rejouer les migrations.
