# MÉMO CAMPUS — Sécurité, confidentialité et conformité

Ce document décrit ce qui est **réellement implémenté** (vérifiable dans le code et les tests), ce qui dépend d'une configuration externe, et les limites connues. Il ne prétend pas à une conformité certifiée : il prépare la mise en conformité.

---

## 1. Authentification et sessions

| Mesure | Implémentation | Preuve |
|---|---|---|
| Hachage des mots de passe | Argon2id (`argon2`) — jamais de mot de passe en clair ni réversible | test : le hash ne contient pas le mot de passe |
| Politique de mot de passe | 10 caractères min., majuscule, minuscule, chiffre (schéma Zod partagé) | test : `Azerty` refusé |
| Jeton de session | JWT signé (HS256), durée 7 j, contient `sub` + `sid` | `auth.guard.ts` |
| Révocation | chaque requête vérifie la session en base ; `revokedAt` → 401 immédiat | test : déconnexion, changement de mot de passe |
| Transport du jeton (Web) | cookie **httpOnly, SameSite=Lax, Secure en production** — inaccessible au JavaScript | `api/session/route.ts` |
| Transport du jeton (Android) | `expo-secure-store` → Keystore Android (chiffré matériellement) | `src/lib/api.ts` |
| Réinitialisation | jeton aléatoire, stocké **haché**, usage unique, expiration 1 h | test : `tokenHash` = 64 caractères hex |
| Anti-énumération | réponses identiques (connexion ratée, mot de passe oublié) | test : messages comparés |
| Sessions distantes | listables et révocables une par une | test |
| Changement de mot de passe | révoque **toutes** les sessions, y compris la courante | test |

**À faire en production** : rotation périodique de `JWT_SECRET` (invalide toutes les sessions — à annoncer), second facteur pour les comptes `ADMIN`, verrouillage progressif après échecs répétés (le rate limiting global atténue déjà le risque).

---

## 2. Isolation des données (contrôle côté serveur)

Toute requête est filtrée par `userId` **dans la requête SQL**, jamais côté client :

```ts
// documents.service.ts — exemple réel
const owned = await this.prisma.document.findFirst({ where: { id, userId: user.id } });
if (!owned) throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
```

- Une ressource appartenant à un autre compte renvoie **404**, pas 403 : l'existence même de la ressource n'est pas révélée.
- Vérifié par tests : détail, pages, fichier et génération de résumé d'un document tiers → 404 pour chacun.
- Les rôles sont contrôlés par un garde global + décorateur `@Roles()`. `GET /api/admin/overview` → 403 pour un étudiant, 200 pour un administrateur (testé).
- Les administrateurs voient des **métadonnées** et des agrégats, jamais le contenu des cours ou des évaluations.

---

## 3. Validation des entrées et des fichiers

- **Schémas Zod partagés** (`packages/shared/src/schemas.ts`) appliqués côté API et réutilisables côté clients : une seule source de vérité.
- **Vérification des types réels de fichiers (magic bytes)** : un exécutable renommé `.pdf` est refusé ; un shell renommé est refusé.
- **Taille maximale** configurable (25 Mo par défaut), vérifiée avant écriture.
- **Noms de stockage non devinables** : les fichiers sont stockés sous une clé dérivée d'un identifiant aléatoire, jamais sous leur nom d'origine (testé).
- **Empreinte SHA-256** de chaque fichier : contrôle d'intégrité et détection de doublons.
- **Limitation de débit** : 120 requêtes / minute par IP (`@nestjs/throttler`).
- **Identifiants malformés** : `ParseUUIDPipe` → 400 ; tentative de traversée de chemin → 404 (testé).

---

## 4. Fichiers privés et URL signées

- Les documents ne sont **jamais** servis par un répertoire statique.
- L'accès passe par une **URL signée HMAC** avec expiration (`/api/files/download?key&exp&sig`), vérifiée en temps constant.
- Le stockage est abstrait (`local` ou S3 compatible) : en production, un bucket privé avec URLs présignées est recommandé (`STORAGE_DRIVER=s3`).
- Le disque des fichiers est isolé du code et sauvegardé séparément.

---

## 5. Sécurité applicative (API et Web)

| En-tête / mesure | Valeur |
|---|---|
| `Content-Security-Policy` | `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'` |
| `Strict-Transport-Security` | activé en HTTPS (Helmet) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| CORS | liste blanche d'origines (`CORS_ORIGINS`), `credentials: true` |
| Cookies | `httpOnly`, `SameSite=Lax`, `Secure` en production |
| Erreurs | filtre global : aucune trace de pile, aucun détail interne renvoyé au client |
| Traçabilité | `X-Request-Id` sur chaque requête, présent dans les erreurs |
| Journalisation | méthode, chemin, statut, durée — **jamais** corps de requête ni en-tête d'autorisation |
| Injections | Prisma (requêtes paramétrées), aucun SQL concaténé ; `sanitize-html` sur les contenus rendus |
| XSS | React échappe par défaut ; pas de `dangerouslySetInnerHTML` sur du contenu utilisateur |

---

## 6. Intelligence artificielle : clés, coûts et données

- **Aucune clé d'IA dans le client.** Web et Android ne connaissent que l'API ; les fournisseurs sont appelés **uniquement côté serveur**.
- Le mode `demo` (par défaut) n'envoie **rien** à un tiers : extraction locale, gratuite, sans clé.
- Passage en mode `live` (OpenAI / Gemini / Anthropic) : les extraits du cours de l'utilisateur sont transmis au fournisseur choisi. **Cette transmission doit être documentée dans votre politique de confidentialité et, si nécessaire, encadrée contractuellement.**
- Sorties structurées validées par Zod : une réponse non conforme est écartée, jamais affichée telle quelle.
- Séparation explicite cours / connaissances complémentaires dans chaque réponse, avec citations.
- **Budget** : `AI_MONTHLY_BUDGET_USD` + comptage des jetons par génération ; l'espace admin expose le coût par document et par génération.
- **Entraînement** : aucun document privé n'est utilisé pour entraîner un modèle, ni dans ce projet ni par défaut chez les fournisseurs configurables (vérifier votre contrat).

---

## 7. Paiements

- Aucune donnée de carte ne transite ni n'est stockée par MÉMO CAMPUS : les prestataires hébergent la saisie.
- Activation d'un abonnement **uniquement** après webhook à signature HMAC valide, comparée en temps constant.
- Idempotence par `(provider, externalId)` : un événement rejoué n'active rien deux fois.
- Sans secret configuré : refus explicite (`WEBHOOK_NOT_CONFIGURED`), aucun abonnement accordé.
- Les prix et quotas sont en base, jamais codés en dur ; ils sont appliqués côté serveur.

---

## 8. Données personnelles et conformité (Cameroun, loi n° 2010/012 ; principes RGPD)

| Droit | Implémentation |
|---|---|
| Accès | `GET /api/auth/export` — JSON complet (profil, matières, documents, résumés, cartes, révisions, évaluations, planning, conversations, paiements) |
| Rectification | `PATCH /api/auth/me` |
| Effacement | `DELETE /api/auth/account` (`password` + `confirmation: "SUPPRIMER"`) — suppression en cascade, anonymisation du journal d'audit |
| Portabilité | même export, format JSON lisible par machine |
| Opposition / limitation | suppression des cours et des contenus générés, à tout moment |
| Information | conditions acceptées à l'inscription (`acceptTerms: true` obligatoire, testé) |

**Minimisation** : seules les données nécessaires au service sont collectées (identité, contact, niveau, documents, activité pédagogique). Pas de données de géolocalisation, pas de publicité tierce.

**Durées de conservation** : documents et contenus jusqu'à suppression du compte ; sessions 7 jours ; jetons de réinitialisation 1 heure ; journal d'audit 12 mois.

**Sous-traitants à déclarer** dans votre registre : hébergeur, fournisseur IA si activé, prestataire de paiement, prestataire d'e-mail.

**Sécurité des données sensibles** : les fichiers des étudiants peuvent contenir des informations personnelles. Accès restreint au propriétaire ; tout accès d'administration à un contenu doit reposer sur une base légale documentée et être journalisé.

---

## 9. Journalisation et audit

- `AuditLog` enregistre : acteur, action (`AUTH_LOGIN`, `AUTH_PASSWORD_CHANGED`, `DATA_EXPORT`, `DOCUMENT_DELETED`, …), cible, horodatage, métadonnées.
- **Aucun** mot de passe, jeton, contenu de document ou donnée de carte n'y figure (testé : le journal ne contient ni `passwordHash` ni mot de passe).
- Consultable par un administrateur (`GET /api/admin/audit`).

---

## 10. Sauvegardes et continuité

- Sauvegardes PostgreSQL (`pg_dump -Fc`) + fichiers, **chiffrées**, conservées hors du serveur (7 quotidiennes / 4 hebdomadaires / 12 mensuelles).
- **Restauration testée mensuellement** sur une base jetable (procédure dans `ADMINISTRATION.md`).
- L'API survit à la perte de Redis (mode synchrone) ; les documents en échec sont relançables sans perte.
- Migrations additives : un retour arrière applicatif ne casse pas le schéma.

---

## 11. Limites connues (à traiter avant une mise en production grand public)

1. **HTTPS** doit être terminé par un reverse proxy (non fourni dans l'environnement de développement).
2. **Envoi d'e-mails** non activé (pas de SMTP configuré) : la réinitialisation fonctionne, mais le lien de réinitialisation est renvoyé par l'API **uniquement hors production**.
3. **Webhooks de paiement** non activés faute de comptes marchands : le circuit est écrit et testé côté signature, pas en conditions réelles.
4. **Push distant Android** non activé (rappels **locaux** fonctionnels) : nécessite un projet Firebase.
5. **2FA administrateur** non implémenté.
6. **Audit de sécurité externe** (test d'intrusion) non réalisé : recommandé avant l'ouverture publique.
7. **Chiffrement au repos** dépend de l'hébergeur (disque chiffré à activer côté infrastructure).
8. **Notification d'incident** : procédure à formaliser avec votre délégué à la protection des données.

Aucun de ces points ne conduit l'application à **prétendre** qu'une fonction de sécurité est active alors qu'elle ne l'est pas : chaque fonction non configurée est refusée explicitement avec un message clair.
