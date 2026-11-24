# MÉMO CAMPUS — publier le code (GitHub → lien permanent)

> Réponse courte à « comment activer GitHub dans les connecteurs ? » : **ce n'est pas possible sur ce compte.** Les connecteurs GitHub et Render ne sont pas proposés par Arena (`list_connector_tools` → *unsupported*). Les seuls moyens de mettre le code sur GitHub sont donc les trois ci-dessous — le n° 1 est le plus rapide, il ne demande ni Git, ni terminal.

---

## Voie 1 — Téléverser l'archive depuis le navigateur (le plus simple, ~5 min)

1. **Télécharger l'archive** : dans le panneau de fichiers de cet espace de travail, ouvrez `memo-campus/memo-campus-depot.tar.gz` → *Download*. (880 Ko, 279 fichiers, **aucun `.env`** — vérifié.)
2. **Décompresser** sur votre ordinateur (*clic droit → Extraire*, ou `tar -xzf memo-campus-depot.tar.gz`). Vous obtenez un dossier `memo-campus/`.
3. **Créer le dépôt** : [github.com/new](https://github.com/new) → nom `memo-campus` → **Private** → *Create repository* (ne cochez ni README, ni .gitignore).
4. Sur la page du dépôt vide : lien **« uploading an existing files »**.
5. **Sélectionner tout le contenu** du dossier `memo-campus/` (pas le dossier lui-même : son *contenu* — `apps/`, `packages/`, `render.yaml`, `package.json`…) et le glisser dans la page.
   > Le glisser-déposer du navigateur ne conserve pas les sous-dossiers de façon fiable. Si l'arborescence arrive à plat, utilisez la voie 2 (GitHub Desktop) : c'est le seul point qui peut coincer.
6. Message de commit : `MÉMO CAMPUS — version initiale` → **Commit changes**.

**Si l'envoi échoue**, c'est presque toujours l'un de ces trois cas :

| Ce que vous voyez | Cause | Solution |
|---|---|---|
| « Yowza, that's a lot of files » / l'envoi s'arrête | le navigateur n'a pas pu traiter l'arborescence | passer à la **voie 2** (GitHub Desktop) ou à la **voie 3** (terminal) |
| tous les fichiers arrivent à plat, sans dossiers | glisser-déposer d'un dossier parent au lieu de son contenu | refaire l'envoi en sélectionnant le **contenu**, ou voie 2 |
| « max 100 files per drag & drop » | votre compte est récent | envoyer en **3 fois** : (1) les fichiers de la racine + `documentation/`, (2) `apps/`, (3) `packages/`, `infrastructure/`, `scripts/` — l'ordre n'a aucune importance |

Vérification : la racine du dépôt doit afficher `render.yaml`, `package.json`, `apps/`, `packages/`, `infrastructure/`, `documentation/`, `scripts/`, `.env.example`.

> **Cas particulier (archive extraite sur Windows/macOS)** : le dossier `.github/` commence par un point, il est donc **invisible** dans l'explorateur Windows. Il contient les *workflows* CI. S'il n'est pas téléversé, GitHub ne le signalera pas et l'application fonctionnera quand même — vous perdrez simplement la CI automatique. Pour le voir : *Affichage → Éléments masqués* (Windows) ou `Cmd+Maj+.` (macOS).

---

## Voie 2 — GitHub Desktop (aucun terminal, gère les sous-dossiers)

1. Installer [GitHub Desktop](https://desktop.github.com) et se connecter.
2. *File → Add local repository* → sélectionner le dossier `memo-campus` décompressé à l'étape 1.
   S'il dit que ce n'est pas un dépôt : *create a repository* ici même — le `.git` est déjà présent dans l'archive, il devrait le reconnaître directement (3 commits déjà faits).
3. Bouton **Publish repository** → décocher *Keep this code private* uniquement si vous acceptez un dépôt public → **Publish**.

---

## Voie 3 — Terminal Git (si vous êtes à l'aise)

```bash
mkdir memo-campus && tar -xzf memo-campus-depot.tar.gz -C memo-campus
cd memo-campus
git remote add origin https://github.com/<votre-compte>/memo-campus.git
git push -u origin main
```

(Si `main` n'existe pas localement : `git branch -M main` avant le push.)

---

## Ensuite : le lien permanent (Render, ~10 min)

1. [dashboard.render.com](https://dashboard.render.com) → inscription avec **« Sign in with GitHub »** (autoriser l'accès au dépôt `memo-campus`).
2. **New → Postgres** : nom `memo-campus-db`, région **Frankfurt**, plan **Free** → créer → copier l'**Internal Database URL**.
3. **New → Blueprint** → sélectionner le dépôt `memo-campus` → Render lit `render.yaml` et propose les 2 services (`memo-api`, `memo-web`) + applique le plan.
4. Renseigner les variables marquées `sync: false` :

| Service | Variable | Valeur |
|---|---|---|
| memo-api | `DATABASE_URL` | l'Internal Database URL copiée à l'étape 2 |
| memo-api | `APP_URL` | `https://memo-web.onrender.com` (l'URL réelle du service Web, affichée par Render) |
| memo-api | `API_URL` | `https://memo-api.onrender.com` |
| memo-api | `CORS_ORIGINS` | `https://memo-web.onrender.com` |
| memo-web | `API_INTERNAL_URL` | `https://memo-api.onrender.com` |

   `JWT_SECRET` est généré automatiquement par Render. Aucun secret n'est écrit dans le dépôt.

5. Attendre la fin des 2 builds (5–8 min la première fois : les images installent poppler et Tesseract).
6. **Créer les données de démonstration** : service `memo-api` → onglet **Shell** :

```bash
SEED_MODE=demo npx tsx prisma/seed.ts
```

7. **Tester** : `https://memo-api.onrender.com/api/health` doit renvoyer `{"status":"ok"}`, puis ouvrir `https://memo-web.onrender.com` et cliquer sur **« Entrer en mode démonstration (un clic) »**.

> ⚠️ Avant d'envoyer le lien à un ami : lancer `./scripts/pret_pour_partage.sh` (ou vérifier à la main les comptes `@demo.memo-campus.cm`).

---

## Limites honnêtes du plan gratuit Render

- Le service **s'endort après 15 min** sans visite : le premier clic de votre ami attend **30–60 s**. (Correctif possible plus tard : un « ping » toutes les 10 min depuis [cron-job.org](https://cron-job.org), gratuit.)
- **Disque éphémère** : les fichiers importés (`/data/storage`) sont perdus à chaque redéploiement. Utilisez un disque Render payant ou un bucket S3 (voir `documentation/INTEGRATIONS.md`) pour un usage réel.
- La base **gratuite expire après 30 jours** sans activité (relançable depuis le tableau de bord).
- **Ce n'est pas moi qui peux cliquer ces étapes** : elles se passent dans votre compte GitHub et votre compte Render. Je n'ai aucun accès à ces comptes et aucun connecteur ne me les ouvre. Je peux en revanche préparer/vérifier tout le code, les fichiers et les commandes — c'est fait : `render.yaml`, les 2 Dockerfiles et ce guide existent et ont été contrôlés.

---

## Alternative sans GitHub du tout

[Railway](https://railway.app) accepte aussi un déploiement depuis un dépôt Git (même étape 1) **ou** l'upload direct d'un dossier via son CLI (`npm i -g @railway/cli`, `railway up`), ce qui évite GitHub. Les variables d'environnement et les commandes de migration sont identiques ; le guide détaillé est en fin de `RENDER.md`.
