# MÉMO CAMPUS

**Plateforme EdTech** : application **Web responsive** + application **Android native** partageant une même API, les mêmes comptes et les mêmes données.

> Comprendre, mémoriser, réussir. Import de cours → analyse → résumés sourcés → fiches → cartes de révision → évaluations corrigées → planning.

Interface **entièrement en français**, thème clair et sombre.

---

## État du livrable (23 novembre 2026)

| Élément | État |
|---|---|
| API NestJS + PostgreSQL/pgvector + Prisma (2 migrations, seed) | ✅ construite et **en marche** |
| Interface Web Next.js 15 — 22 routes | ✅ construite, toutes les pages authentifiées vérifiées en HTTP 200 |
| Application Android Expo / React Native | ✅ bundle Hermes généré (992 modules) ; APK/AAB à signer avec votre keystore |
| Tests | ✅ **165 vérifications, 0 échec** (voir `documentation/RAPPORT_TESTS.md`) |
| 13 défauts réels trouvés par les tests | ✅ corrigés (liste et impact documentés) |
| Documentation (installation, admin, utilisateur, API, sécurité/RGPD, intégrations) | ✅ |

**Non activé faute de clé ou de compte externe** (documenté en détail dans `documentation/INTEGRATIONS.md`) : IA générative distante (mode démonstration actif par défaut), paiements Mobile Money/carte, e-mails en production, push distant, signature APK.

---

## Maquette de l'interface

Le dossier `scripts/screenshots/` contient une **maquette HTML** de l'interface (`maquette.html`, à ouvrir dans un navigateur, aucune ressource externe) et un aperçu image (`web-dashboard.png`). Elle présente la direction visuelle et les écrans (tableau de bord, résumé, révision, épreuve, planning, mobile) en un seul fichier autonome, sans dépendance réseau : utile pour valider le design sans démarrer les serveurs.

> Il s'agit d'une maquette **de présentation uniquement**, sans données réelles ni interaction serveur. La véritable interface est rendue par l'application Next.js (`apps/web`) et par l'application Android (`apps/mobile`).

---

## Démarrage rapide

```bash
# Prérequis : Node 20, PostgreSQL 17 + pgvector, poppler-utils, tesseract-ocr-fra, Redis (facultatif)
cp .env.example .env            # renseignez JWT_SECRET (openssl rand -base64 48)
npm install
npm run build:shared
npm run db:migrate && npm run db:seed
npm run dev:api                 # http://localhost:4000/api — Swagger : /api/docs
npm run dev:web                 # http://localhost:3000
```

Avec Docker :

```bash
docker compose -f infrastructure/docker-compose.yml up --build
```

Application Android :

```bash
cd apps/mobile && npm install --legacy-peer-deps
npx expo start --android        # EXPO_PUBLIC_API_URL=http://10.0.2.2:4000 (émulateur)
```

**Comptes de démonstration** (mot de passe `MemoCampus2026!`) :
`etudiant@demo.memo-campus.cm` (Premium) · `etudiant.free@demo.memo-campus.cm` (Free) · `enseignant@demo.memo-campus.cm` · `admin@demo.memo-campus.cm`

---

## Architecture

```
apps/
  api/      NestJS 11 · Prisma · PostgreSQL + pgvector · BullMQ (facultatif) · Swagger
  web/      Next.js 15 (App Router) · React 19 · Tailwind CSS 4
  mobile/   Expo SDK 54 · React Native 0.81 · Expo Router · hors connexion
packages/
  shared/   schémas Zod, types, moteurs : répétition espacée, notation,
            planificateur, quotas, moteur d'extraction local (testés)
infrastructure/  Dockerfiles, docker-compose, init base, CI GitHub Actions
documentation/  6 guides + spécification OpenAPI exportée
scripts/         verification de bout en bout, fixtures PDF/PNG
```

**Compromis de stack assumé** : `packages/types` et `packages/validation` sont fusionnés dans `packages/shared` (un schéma Zod = un type = une validation, donc aucune divergence entre Web, Android et API). Prisma retenu plutôt qu'un ORM maison ; Redis optionnel pour que l'application reste utilisable avec un budget nul.

---

## Fonctionnalités

**Cours** — import PDF (texte ou scanné), JPG/PNG, Word ; validation par signature binaire ; pipeline `QUEUED → EXTRACTION → OCR → STRUCTURE → CHUNKING → INDEXATION → READY` avec progression, relance et statut réel ; pages sources conservées ; incertitudes signalées, jamais de contenu inventé.

**Pédagogie** — résumé général et par chapitre, objectifs, notions clés avec page source, définitions, formules, explications simplifiées, fiche de révision, cartes mémoire ; mode démonstration **strictement extractif** (gratuit, sans clé) distinct du mode IA réelle.

**Mémorisation** — rappel actif + répétition espacée (maîtrisée / fragile / non maîtrisée), priorités du jour **justifiées**, rythme modifiable, révisions hors connexion sur Android.

**Évaluations** — QCM à 5 niveaux cognitifs avec distracteurs plausibles, questions écrites avec grille explicite et points partiels, épreuves mixtes, chronomètre, sauvegarde automatique, correction détaillée, erreurs récurrentes, historique.

**Organisation** — calendrier jour/semaine/mois, disponibilités, échéances, planning proposé et **justifié**, replanification sans surcharge, Pomodoro.

**Assistant** — RAG sur les cours de l'utilisateur, citations avec pages, modes tuteur / professeur (une question à la fois) / examen blanc, aucune ressource inventée.

**SaaS** — offres Free / Premium / Institution **configurables en base**, quotas appliqués côté serveur, paiements Mobile Money et carte en sandbox avec webhooks signés (activation impossible sans signature valide).

**Administration** — statistiques, comptes et rôles, offres/prix/quotas, paiements, coûts IA, signalements, journal d'audit, données personnelles restreintes.

---

## Sécurité

Argon2id · JWT + sessions révocables · cookies httpOnly · Keystore Android · contrôle d'accès côté serveur · isolation vérifiée par tests (404 pour les ressources tierces) · fichiers privés et URL signées · validation Zod partagée · rate limiting · Helmet + CSP · export et suppression de compte · aucune clé d'IA côté client.

Détails et limites connues : `documentation/SECURITE_RGPD.md`.

---

## Envoyer l'application à un ami pour qu'il la teste

```bash
./scripts/pret_pour_partage.sh      # vérifie API, base, comptes, offres et donne les bonnes adresses
```

**Pour un lien qui reste debout** (recommandé, à faire une fois pour toutes) :

```bash
./scripts/preparer_depot_git.sh       # contrôle des secrets + archive + dépôt Git prêt à pousser
cat infrastructure/deploy/RENDER.md   # 15 min : GitHub → PostgreSQL → Blueprint render.yaml → lien fixe
```

Un tunnel gratuit (`trycloudflare`, `localtunnel`) n'est **pas** un hébergement : il change d'URL à chaque lancement et produit les erreurs **1033** / **530**. Il ne sert qu'au dépannage, quand le testeur est à côté de vous.

Les trois voies de partage, détaillées dans **`documentation/PARTAGE.md`** :

1. **Lien Web** : votre ami ouvre l'URL et clique sur **« Entrer en mode démonstration (un clic) »**.
2. **Expo Go** (Android sans APK) : exposez l'API publiquement puis `EXPO_PUBLIC_API_URL=https://… npx expo start --tunnel`, et envoyez le QR code.
3. **APK** : `eas build --platform android --profile partage` (l'adresse de l'API est figée à la compilation — remplacez-la par une adresse publique dans `eas.json`).

La fiche à envoyer avec le lien : **`documentation/FICHE_DE_TEST.md`** (parcours guidé de 25 minutes + grille de retours).

---

## Documentation

| Fichier | Contenu |
|---|---|
| `documentation/INSTALLATION.md` | installation locale, Docker, production, APK/AAB, dépannage |
| `documentation/ADMINISTRATION.md` | exploitation, offres et quotas, paiements, sauvegardes, incidents |
| `documentation/GUIDE_UTILISATEUR.md` | guide utilisateur complet en français |
| `documentation/API.md` | référence API + `documentation/openapi.json` |
| `documentation/SECURITE_RGPD.md` | sécurité, confidentialité, loi 2010/012 |
| `documentation/INTEGRATIONS.md` | **liste explicite des intégrations nécessitant une clé ou un compte** |
| `documentation/PARTAGE.md` | envoyer l'application à un testeur (Web, Expo Go, APK, dépannage) |
| `documentation/PUBLIER_SUR_GITHUB.md` | publier le code sur GitHub sans terminal, puis déployer (lien permanent) |
| `documentation/FICHE_DE_TEST.md` | fiche de test à transmettre à votre ami |
| `documentation/RAPPORT_TESTS.md` | tests exécutés, résultats exacts, défauts corrigés, non-testé |
| `infrastructure/deploy/RENDER.md` | obtenir un **lien stable** (hébergement permanent gratuit + base hébergée) |

---

## Qualité

```bash
npm run build:shared && (cd packages/shared && npx vitest run)   # 40 tests
(cd apps/api && npx vitest run)                                  # 37 tests d'intégration
(cd apps/mobile && npx vitest run)                               # 13 tests
python3 scripts/verify_flow.py                                   # 75 vérifications HTTP réelles
```
