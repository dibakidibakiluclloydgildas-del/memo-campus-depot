# MÉMO CAMPUS — Référence API (OpenAPI / Swagger)

- **Base URL (développement)** : `http://localhost:4000/api`
- **Documentation interactive** : `http://localhost:4000/api/docs`
- **Spécification machine** : [`openapi.json`](./openapi.json) (exportée depuis l'instance en fonctionnement)
- **Format** : REST, JSON, UTF-8. **71 chemins**, 82 opérations.

Authentification : `Authorization: Bearer <jeton>` (applications natives) **ou** cookie `memo_session` httpOnly (Web). Le jeton est obtenu par `POST /api/auth/login`. Toutes les routes sont protégées sauf `register`, `login`, `forgot-password`, `reset-password`, `health`, `files/download` (URL signée) et `billing/webhooks/{provider}` (signature HMAC).

---

## 1. Conventions de réponse

**Succès** : le corps est directement la ressource, ou un objet `{ items, total }` pour les listes paginées.

**Erreur** — format unique :

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Les données envoyées sont invalides.",
  "details": [{ "field": "title", "message": "Titre requis" }],
  "requestId": "8f1c…",
  "path": "/api/documents",
  "timestamp": "2026-11-23T22:12:31.114Z"
}
```

| Code HTTP | Signification dans MÉMO CAMPUS |
|---|---|
| 400 | requête invalide (validation Zod) |
| 401 | session absente, expirée ou révoquée |
| 403 | droits insuffisants **ou quota d'abonnement dépassé** (`code: QUOTA_EXCEEDED`) |
| 404 | ressource inexistante **ou appartenant à un autre compte** (jamais 403, pour ne rien divulguer) |
| 409 | conflit (e-mail déjà utilisé) |
| 422 | validation métier approfondie |
| 429 | limitation de débit |
| 503 | dépendance indisponible (base, fournisseur IA) |

---

## 2. Authentification et compte

| Méthode | Chemin | Description |
|---|---|---|
| POST | `/auth/register` | création de compte → `{ token, user }` + cookie |
| POST | `/auth/login` | connexion (e-mail insensible à la casse) |
| POST | `/auth/logout` | révoque la session courante |
| POST | `/auth/logout-all` | révoque toutes les sessions |
| GET | `/auth/me` | profil, offre, consommation |
| PATCH | `/auth/me` | profil et préférences |
| POST | `/auth/forgot-password` | envoi du lien (réponse identique compte existant ou non) |
| POST | `/auth/reset-password` | réinitialisation par jeton à usage unique (1 h) |
| POST | `/auth/change-password` | changement authentifié — **révoque toutes les sessions** |
| GET | `/auth/sessions` | `{ items: [...] }` sessions actives |
| DELETE | `/auth/sessions/{id}` | révoque une session distante |
| GET | `/auth/export` | export complet JSON (RGPD / loi 2010/012) |
| DELETE | `/auth/account` | suppression définitive (`{ password, confirmation: "SUPPRIMER" }`) |

Exemple :

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"etudiant@demo.memo-campus.cm","password":"MemoCampus2026!"}' | jq -r .token)
curl -s http://localhost:4000/api/auth/me -H "Authorization: Bearer $TOKEN"
```

---

## 3. Cours et documents

| Méthode | Chemin | Description |
|---|---|---|
| POST | `/documents` | import `multipart/form-data` : `file`, `title` (requis), `subjectId?`, `language?` |
| GET | `/documents` | liste paginée + filtres (`status`, `subjectId`, `search`, `archived`, `page`, `pageSize`) |
| GET | `/documents/{id}` | détail : chapitres, pages, avertissements, URL de fichier signée |
| GET | `/documents/{id}/pages` | texte extrait page par page — **source de vérité des citations** |
| GET | `/documents/{id}/file` | URL signée du fichier original |
| POST | `/documents/{id}/reprocess` | relance de l'analyse (idempotent) |
| PATCH | `/documents/{id}/archive` | archiver / désarchiver |
| DELETE | `/documents/{id}` | suppression du cours et de ses dérivés |

Statuts du pipeline : `QUEUED → EXTRACTING → (OCR) → STRUCTURING → CHUNKING → INDEXING → READY` (`PARTIAL`, `FAILED` en cas d'incertitude ou d'erreur).

```bash
curl -X POST http://localhost:4000/api/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@cours-biologie-cellulaire.pdf" \
  -F "title=Biologie cellulaire — chapitre 1"
```

---

## 4. Contenus pédagogiques

| Méthode | Chemin | Description |
|---|---|---|
| POST | `/documents/{documentId}/summary` | résumé structuré (`{ regenerate, save, level? }`) |
| GET | `/documents/{documentId}/summary` | dernier résumé enregistré |
| POST/GET | `/documents/{documentId}/flashcards` | cartes mémoire du cours |
| GET | `/documents/{documentId}/revision-sheet` | fiche de révision complète |
| POST | `/documents/{documentId}/written-questions` | questions ouvertes + grille de correction |

Réponse `summary` :

```json
{
  "payload": {
    "title": "Biologie cellulaire",
    "generalSummary": "…",
    "objectives": ["…"],
    "keyNotions": [{ "term": "Le chloroplaste", "definition": "…", "source": { "page": 1 } }],
    "formulas": [{ "expression": "6 CO2 + 6 H2O + lumière = C6H12O6 + 6 O2" }],
    "chapters": [{ "title": "La cellule", "summary": "…" }],
    "uncertainties": ["Pages sans texte exploitable : 4, 5"],
    "complementaryNotes": ["…"],
    "extractive": true
  },
  "mode": "demo",
  "warnings": ["Résumé produit en mode démonstration…"]
}
```

`mode` vaut `demo` (moteur extractif local, gratuit, sans clé) ou `live` (fournisseur IA configuré). **Le client doit afficher cette distinction** : c'est une exigence du cahier des charges.

---

## 5. Révisions (rappel actif + répétition espacée)

| Méthode | Chemin | Description |
|---|---|---|
| POST | `/learning/flashcards/generate` | `{ documentId, count }` → `{ cards, mode, warnings }` |
| GET | `/learning/flashcards` | liste filtrable (`status`, `subjectId`) |
| GET | `/learning/reviews/today` | `{ totalDue, pace, items: [{ …, why }] }` — chaque carte est **justifiée** |
| POST | `/learning/reviews` | `{ flashcardId, grade: AGAIN\|HARD\|GOOD\|EASY, durationMs }` |
| POST | `/learning/flashcards/{id}/flag` | signaler une carte erronée |
| GET | `/learning/stats` | maîtrise, séries, historique |

```json
POST /api/learning/reviews
{ "flashcardId": "…", "grade": "GOOD", "durationMs": 4200 }

→ { "flashcard": { "dueAt": "2026-11-26T18:00:00Z", "intervalDays": 3, "masteryScore": 42, "masteryStatus": "FRAGILE" },
    "explanation": "Intervalle porté à 3 jours : vos réponses récentes sont correctes." }
```

L'ordonnancement est calculé **côté serveur** à partir de l'état stocké : le client ne peut pas le falsifier.

---

## 6. Évaluations

| Méthode | Chemin | Description |
|---|---|---|
| POST | `/assessments/generate` | création (`type`, `difficulty`, `mcqCount`, `writtenCount`, `durationMinutes`, `documentIds`) |
| GET | `/assessments` | historique (`status`) |
| GET | `/assessments/{id}` | épreuve sans les corrigés |
| POST | `/assessments/{id}/start` | démarre le chronomètre → `{ startedAt, endsAt }` |
| POST | `/assessments/{id}/submit` | soumission → correction complète |
| GET | `/assessments/{id}/report` | rapport enregistré |

```json
POST /api/assessments/generate
{ "title": "Épreuve de biologie", "type": "MIXED", "difficulty": "MOYEN",
  "mcqCount": 3, "writtenCount": 1, "durationMinutes": 20, "documentIds": ["…"] }

→ { "assessmentId": "…", "mode": "demo", "questionCount": 4, "warnings": ["…"] }
```

Réponse à `submit` :

```json
{
  "score": 8, "maxScore": 15, "percentage": 53, "mention": "Passable",
  "corrections": [{
    "questionId": "…", "type": "MCQ", "points": 1, "awarded": 1, "correct": true,
    "selectedChoiceIds": ["a"], "correctChoiceIds": ["a"],
    "explanation": "D'après votre document (page 1) : « … »",
    "misconceptions": []
  }],
  "weakNotions": ["…"],
  "recommendations": ["…"]
}
```

Une épreuve déjà soumise renvoie `403 ALREADY_SUBMITTED` : le résultat est figé dans l'historique.

---

## 7. Planning, Pomodoro, tableau de bord

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/planning?from&to&view` | agenda (jour/semaine/mois) + disponibilités + objectifs |
| POST | `/planning/blocks` | créer un bloc |
| PATCH/DELETE | `/planning/blocks/{id}` | déplacer, terminer, supprimer |
| POST | `/planning/availability` | disponibilités hebdomadaires `{ slots: [{ weekday, startMinute, endMinute }] }` |
| POST | `/planning/auto` | proposition automatique (`from`, `to`, `sessionMinutes`, `breakMinutes`, `maxSessionsPerDay`, `save`) |
| POST | `/planning/pomodoro/start` | démarre une session de concentration |
| POST | `/planning/pomodoro/{id}/complete` | clôture la session (alimente les statistiques) |
| GET | `/dashboard` | vue d'ensemble : bibliothèque, mémoire, évaluations, planning, notifications, offre, consommation |
| GET | `/dashboard/notifications` | notifications |
| GET/POST/DELETE | `/dashboard/resources…` | ressources et favoris (URL réelles uniquement) |

---

## 8. Assistant

| Méthode | Chemin | Description |
|---|---|---|
| POST | `/assistant/ask` | `{ message, mode: TUTEUR\|PROFESSEUR\|EXAMEN_BLANC, documentIds[], subjectId?, conversationId? }` |
| GET | `/assistant/conversations` | historique |
| GET | `/assistant/conversations/{id}` | conversation complète |

```json
{
  "conversationId": "…", "messageId": "…", "mode": "demo",
  "answer": "D'après votre cours (page 1) : …",
  "citations": [{ "page": 1, "documentTitle": "Biologie", "quote": "…" }],
  "quota": { "remaining": 9, "limit": 10 },
  "disclaimer": "Réponse produite en mode démonstration à partir de vos documents."
}
```

---

## 9. Abonnements et paiements

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/billing/plans` | offres actives (prix et quotas lus **en base**) |
| GET | `/billing/subscription` | abonnement courant + consommation |
| POST | `/billing/checkout` | initialise un paiement (`planCode`, `billingPeriod`, `provider`) |
| GET | `/billing/payments` | historique |
| GET | `/billing/payments/{id}/receipt` | reçu |
| POST | `/billing/webhooks/{provider}` | **webhook signé** : seule voie d'activation |

```bash
BODY='{"externalId":"test-001","type":"payment.success","planCode":"PREMIUM"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$CAMPY_WEBHOOK_SECRET" -hex | awk '{print $2}')
curl -X POST http://localhost:4000/api/billing/webhooks/CAMPY \
  -H "Content-Type: application/json" -H "X-Memo-Signature: $SIG" -d "$BODY"
```

Sans secret configuré → `400 WEBHOOK_NOT_CONFIGURED` ; signature incorrecte → `400 INVALID_SIGNATURE` ; événement rejoué → `{ received: true, duplicate: true }`.

---

## 10. Administration et divers

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/admin/overview` | ADMIN |
| GET | `/admin/users`, PATCH `/admin/users/{id}` | ADMIN |
| GET/POST | `/admin/plans` | ADMIN — offres, prix, quotas |
| GET | `/admin/payments` | ADMIN |
| GET/POST | `/admin/institutions` | ADMIN |
| GET | `/admin/reports`, PATCH `/admin/reports/{id}` | ADMIN |
| GET | `/admin/audit` | ADMIN — journal d'audit |
| POST | `/reports` | tout utilisateur connecté |
| GET | `/subjects`, POST, PATCH, DELETE | matières de l'utilisateur |
| GET | `/health` | état système (base, Redis, OCR, mode IA) |
| GET | `/files/download?key&exp&sig` | téléchargement par URL signée (expire) |
| GET | `/api/docs` | interface Swagger |

---

## 11. Limitation de débit et quotas

- Limitation globale par IP : 120 requêtes / 60 s (`THROTTLE_LIMIT`, `THROTTLE_TTL_SECONDS`).
- Quotas par offre appliqués **côté serveur** sur : imports totaux, imports mensuels, espace de stockage, générations IA, évaluations, messages à l'assistant, pages OCR.
- Dépassement → `403 QUOTA_EXCEEDED` avec `details: { quota, limit, used, upgradeSuggested }`.

---

## 12. Tester l'API rapidement

```bash
python3 scripts/verify_flow.py     # 75 vérifications HTTP réelles de bout en bout
npm test -w @memo/api              # 37 tests d'intégration (vraie base, vraie app NestJS)
```
