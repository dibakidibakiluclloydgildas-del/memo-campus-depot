# MÉMO CAMPUS — Guide d'installation et de déploiement

> Plateforme EdTech : **application Web responsive** + **application Android native** + **API REST** partageant les mêmes comptes, les mêmes données et le même moteur pédagogique.

Ce guide décrit l'installation réelle, testée sur ce projet. Les commandes sont celles qui ont servi à construire et vérifier la plateforme.

---

## 1. Prérequis

| Outil | Version | Rôle |
|---|---|---|
| Node.js | 20 LTS ou 22 | API, Web, paquets partagés |
| npm | 10+ | monorepo `npm workspaces` |
| PostgreSQL | 17 **avec pgvector** | base de données + recherche vectorielle |
| Redis | 7 (facultatif) | files BullMQ ; **l'API fonctionne sans Redis** (dégradation contrôlée) |
| poppler-utils | `pdftotext`, `pdfinfo`, `pdftoppm` | extraction des PDF et rendu des pages |
| tesseract-ocr + `tesseract-ocr-fra` | 5.x | OCR des PDF scannés et des photos |
| Docker + Docker Compose | 24+ | installation « en une commande » (facultatif) |
| Java 17 + Android Studio, **ou** un compte Expo | — | compilation de l'APK / AAB |

Sous Debian/Ubuntu :

```bash
sudo apt-get update
sudo apt-get install -y postgresql-17 postgresql-17-pgvector redis-server \
  poppler-utils tesseract-ocr tesseract-ocr-fra
```

> **Important** : sans `poppler-utils`, l'import de PDF échoue ; sans `tesseract-ocr-fra`, l'OCR des photos renvoie du charabia. L'API teste leur présence au démarrage et signale leur absence dans le journal (elle ne prétend pas que l'OCR fonctionne).

---

## 2. Installation locale (sans Docker) — 6 étapes

### 2.1 Récupérer le code et installer les dépendances

```bash
git clone <votre-depot> memo-campus && cd memo-campus
npm install                     # workspaces api + web + shared
cd apps/mobile && npm install --legacy-peer-deps && cd ../..   # Android (hors workspaces)
```

### 2.2 Configurer l'environnement

```bash
cp .env.example .env
# Générer un secret de session robuste
openssl rand -base64 48         # → coller dans JWT_SECRET du fichier .env
```

Le fichier `apps/api/.env` lit les mêmes variables (chemins relatifs à l'API). En développement, `DATABASE_URL` pointe sur `127.0.0.1:5432`.

### 2.3 Créer la base et activer pgvector

```bash
sudo -u postgres psql -c "CREATE DATABASE memo_campus ENCODING 'UTF8';"
sudo -u postgres psql -d memo_campus -c "CREATE EXTENSION IF NOT EXISTS vector;"
sudo -u postgres psql -d memo_campus -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# Base séparée pour les tests d'intégration (jamais la base réelle)
sudo -u postgres psql -c "CREATE DATABASE memo_campus_test ENCODING 'UTF8';"
sudo -u postgres psql -d memo_campus_test -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 2.4 Appliquer les migrations et charger les données de démonstration

```bash
npm run build:shared                 # le paquet @memo/shared doit être compilé avant l'API
npm run db:migrate                   # prisma migrate deploy
npm run db:seed                      # offres, comptes de démonstration, cours d'exemple
```

Le jeu de démonstration est **séparé** du schéma : `apps/api/prisma/seed.ts`. Il est refusé en production (`NODE_ENV=production`) sauf `SEED_FORCE=true`, afin de ne jamais injecter de faux comptes sur un serveur réel.

### 2.5 Démarrer l'API et le Web

```bash
# Terminal 1 — API (http://localhost:4000/api, documentation /api/docs)
npm run dev:api

# Terminal 2 — Web (http://localhost:3000)
npm run dev:web
```

### 2.6 Vérifier que tout fonctionne réellement

```bash
curl -s http://localhost:4000/api/health | python3 -m json.tool
python3 scripts/verify_flow.py       # parcours HTTP complet de bout en bout
npm test                             # tests unitaires + intégration API
```

`scripts/verify_flow.py` crée un compte, importe un PDF, attend l'analyse, génère un résumé, des cartes, une épreuve, la corrige, génère un planning, interroge l'assistant, vérifie les quotas, l'export et la suppression de compte. Il affiche un décompte de réussites/échecs et quitte avec un code non nul en cas d'échec (utilisable en CI).

---

## 3. Installation avec Docker (recommandée pour un serveur)

```bash
cp .env.example .env
# Renseigner au minimum JWT_SECRET (obligatoire : le démarrage échoue sinon)
docker compose -f infrastructure/docker-compose.yml up --build
```

| Service | URL | Remarque |
|---|---|---|
| Web | http://localhost:3000 | Next.js en production |
| API | http://localhost:4000/api | documentation sur `/api/docs` |
| PostgreSQL + pgvector | `localhost:5432` | volume `db-data` |
| Redis | `localhost:6379` | volume `redis-data` |
| Fichiers importés | volume `storage-data` | monté sur `/data/storage` |

L'image API contient **poppler** et **Tesseract avec le français** : l'OCR fonctionne dès le premier lancement. Les migrations sont appliquées automatiquement (`prisma migrate deploy`, idempotent).

Premier chargement des données de démonstration :

```bash
docker compose -f infrastructure/docker-compose.yml exec api npx tsx prisma/seed.ts
```

> Les fichiers Docker ont été écrits et relus, mais **Docker n'était pas disponible dans l'environnement de développement** : ils n'ont donc pas été exécutés ici. Le reste (migrations, build, tests, parcours HTTP) a été exécuté réellement — voir `RAPPORT_TESTS.md`.

---

## 4. Mise en production : sécurité minimale

1. **HTTPS obligatoire** : placez Nginx, Caddy ou Traefik devant le Web et l'API. Exemple Caddy (certificats automatiques) :

   ```caddyfile
   memocampus.cm {
       reverse_proxy 127.0.0.1:3000
   }
   api.memocampus.cm {
       reverse_proxy 127.0.0.1:4000
   }
   ```

2. **Secrets** : `JWT_SECRET` unique par environnement, stocké dans un gestionnaire de secrets (Vault, SSM, secret Docker). Jamais dans Git.
3. **Cookies** : `COOKIE_DOMAIN` sur votre domaine réel, cookies `Secure` automatiquement en production.
4. **CORS** : `CORS_ORIGINS` limité à vos domaines (`https://memocampus.cm`).
5. **Base** : sauvegardes quotidiennes chiffrées + test de restauration mensuel (voir `documentation/ADMIN.md`).
6. **Fichiers** : volume dédié, jamais servi directement par le serveur web — ils passent par des **URL signées** (`/api/files/download`).
7. **Journalisation** : chaque requête reçoit un `X-Request-Id` ; le journal d'audit admin trace les actions sensibles sans données personnelles inutiles.

---

## 5. Application Android (APK / AAB)

### 5.1 Développement

```bash
cd apps/mobile
cp .env.example .env        # EXPO_PUBLIC_API_URL=http://10.0.2.2:4000 (émulateur)
npx expo start --android
```

- **Émulateur** : `http://10.0.2.2:4000` (alias de la machine hôte).
- **Téléphone physique** : `EXPO_PUBLIC_API_URL=http://<IP-de-votre-machine>:4000`, téléphone et ordinateur sur le même réseau Wi-Fi. L'API écoute déjà sur `0.0.0.0`.
- La connexion au backend nécessite **HTTP en développement** ; en production, l'API doit être en HTTPS.

### 5.2 Vérifier la compilation du bundle (exécutable sans Android Studio)

```bash
cd apps/mobile
npx tsc --noEmit                                   # types
npx expo export --platform android --output-dir dist-android   # bundle Hermes
```

Cet export a été exécuté avec succès sur ce projet : 992 modules, bundle Hermes de ~2,6 Mo. Il prouve que tout le code JavaScript/TypeScript de l'application est compilable.

### 5.3 Générer l'APK de test (profil `preview`) ou l'AAB de production

```bash
npm install -g eas-cli
eas login
cd apps/mobile
eas build --platform android --profile preview     # → APK installable
eas build --platform android --profile production  # → AAB pour le Play Store
```

Les profils sont déjà décrits dans `apps/mobile/eas.json`. La compilation native demande un **compte Expo (gratuit)** et un identifiant de dépôt : c'est une des intégrations listées dans `documentation/INTEGRATIONS.md` comme **nécessitant un compte externe**.

### 5.4 En local, sans compte Expo

```bash
cd apps/mobile
npx expo prebuild --platform android      # génère le projet natif android/
cd android && ./gradlew assembleRelease   # nécessite Java 17 + Android SDK
```

---

## 6. Mise à jour d'une instance existante

```bash
git pull
npm install
npm run build:shared
npm run db:migrate          # jamais de reset en production
npm run build
# Redémarrage de l'API puis du Web (pm2, systemd ou docker compose)
```

Les migrations Prisma livrées sont additives ; une sauvegarde préalable reste la règle.

---

## 7. Diagnostic des pannes courantes

| Symptôme | Cause probable | Correctif |
|---|---|---|
| `Le fichier reçu est vide` | poppler absent | `apt-get install poppler-utils` |
| Statut `FAILED` sur une photo | Tesseract ou pack français absent | `apt-get install tesseract-ocr tesseract-ocr-fra` |
| `Redis indisponible — traitement en mode synchrone` | pas de Redis | normal : l'API traite en interne, aucun job perdu |
| `Aucune offre n'est configurée` | seed non exécuté | `npm run db:seed` |
| `quota dépassé` inattendu | quotas du plan en base | les modifier dans l'espace admin (`/admin`) |
| Mobile : erreur réseau | mauvaise adresse d'API | vérifier `EXPO_PUBLIC_API_URL` |
| `P1001: Can't reach database` | PostgreSQL arrêté | `pg_ctl -D <data> start` ou `systemctl start postgresql` |

---

## 8. Structure du dépôt

```
memo-campus/
├── apps/
│   ├── api/         API NestJS + Prisma (migrations, seed)
│   ├── web/         Interface Web Next.js 15 (App Router)
│   └── mobile/      Application Android Expo / React Native
├── packages/
│   └── shared/      Types, schémas Zod et moteurs métier partagés (testés)
├── infrastructure/  Dockerfiles, docker-compose, init de la base
├── documentation/   Guides (installation, administration, utilisateur, API, sécurité, RGPD…)
├── scripts/         Vérification de bout en bout, fixtures de test
└── .github/         Intégration continue
```

Les fichiers `packages/types` et `packages/validation` du cahier des charges ont été **fusionnés dans `packages/shared`** : partager un même schéma Zod pour les types et la validation évite toute divergence entre le Web, l'Android et l'API. Compromis assumé : un paquet unique plus gros, mais une seule source de vérité validée par 40 tests.
