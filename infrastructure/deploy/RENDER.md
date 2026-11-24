# Déploiement permanent sur Render (lien stable, gratuit)

Objectif : obtenir un lien du type **`https://memo-campus.onrender.com`** qui **ne meurt plus** quand votre ordinateur s'éteint, et une base PostgreSQL hébergée.

> ⚠️ À lire avant de commencer : **Render déploie depuis un dépôt Git.** Il faut donc que le code soit sur GitHub (gratuit). Sans cela, aucun hébergeur ne peut compiler votre application. Cette étape est inévitable — comptez 10 minutes.

---

## 1. Publier le code sur GitHub (10 min)

Dans le dossier `memo-campus`, une seule commande fait le travail (contrôle des secrets, archive propre, dépôt Git + premier commit) :

```bash
./scripts/preparer_depot_git.sh
```

Elle doit finir sur **« Tout est propre : le code peut être publié »**, afficher `✔ .env n'est pas suivi par Git` et créer `memo-campus-depot.tar.gz` (archive sans `.env`, sans `node_modules`).

> Le fichier `.gitignore` fourni exclut déjà `node_modules`, `.env`, `dist`, les sauvegardes et les clés.

Créez un dépôt **privé** sur GitHub (bouton *New repository*, ne cochez rien), puis :

```bash
git remote add origin https://github.com/<votre-compte>/memo-campus.git
git branch -M main
git push -u origin main
```

---

## 2. Créer la base PostgreSQL (5 min)

1. Sur [dashboard.render.com](https://dashboard.render.com) → **New → Postgres**.
2. Nom : `memo-campus-db` · Région : `Frankfurt` (la plus proche du Cameroun) · Plan : **Free**.
3. Après création, copiez **Internal Database URL** (commence par `postgres://…`).

> Le plan gratuit de Render expire la base au bout de 30 jours sans activité : relancez-la depuis le tableau de bord, ou passez au plan payant (7 $/mois) pour un test long.

---

## 3. Déployer l'API + le Web (dépôt déjà préparé)

Le dépôt contient les deux fichiers de blueprint nécessaires :

- `render.yaml` — les deux services (API et Web) et la base ;
- `infrastructure/deploy/render-api.Dockerfile` et `render-web.Dockerfile` — images de production (poppler + Tesseract français inclus).

### Méthode automatique (recommandée)

1. Render → **New → Blueprint** → sélectionnez votre dépôt GitHub.
2. Render lit `render.yaml` et propose les services. Acceptez.
3. Il demande les variables marquées `sync: false`. Renseignez :
   - `DATABASE_URL` → l'URL **interne** de la base créée à l'étape 2 ;
   - `APP_URL` et `API_URL` → vos futures adresses Render (voir étape 4) ;
   - `JWT_SECRET` → générez-en un : `openssl rand -base64 48`.
4. **Apply**. Le premier build prend 8–12 minutes (installation, compilation, migrations).

### Méthode manuelle (si le blueprint échoue)

Créez deux services **Web Service** :

| Service | Dockerfile | Port | Variables d'environnement |
|---|---|---|---|
| `memo-api` | `infrastructure/deploy/render-api.Dockerfile` | 4000 | `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `API_URL`, `CORS_ORIGINS`, `AI_PROVIDER=demo`, `STORAGE_DRIVER=local`, `STORAGE_DIR=/data/storage` |
| `memo-web` | `infrastructure/deploy/render-web.Dockerfile` | 3000 | `API_INTERNAL_URL=https://memo-api.onrender.com`, `ALLOW_DEMO_LOGIN=true` |

---

## 4. Renseigner les adresses croisées

Une fois les deux services créés, Render affiche leurs URL :

```
API : https://memo-api.onrender.com
Web : https://memo-campus.onrender.com
```

Mettez à jour, dans le service **API** :

```
APP_URL=https://memo-campus.onrender.com
API_URL=https://memo-api.onrender.com
CORS_ORIGINS=https://memo-campus.onrender.com
```

puis, dans le service **Web** :

```
API_INTERNAL_URL=https://memo-api.onrender.com
ALLOW_DEMO_LOGIN=true
```

Chaque modification déclenche un redéploiement automatique.

---

## 5. Charger les données de démonstration (une seule fois)

Dans le service **API** → onglet **Shell** :

```bash
npx prisma migrate deploy --schema prisma/schema.prisma
npx tsx prisma/seed.ts
```

Vous verrez `Comptes de démonstration créés`. C'est terminé : le lien est public et permanent.

---

## 6. Vérifier — et seulement ensuite envoyer le lien

```bash
API_URL=https://memo-api.onrender.com WEB_URL=https://memo-campus.onrender.com \
  ./scripts/pret_pour_partage.sh
```

Le script doit afficher **0 échec**. Envoyez alors :

- **Lien** : `https://memo-campus.onrender.com`
- **Compte** : `etudiant@demo.memo-campus.cm` / `MemoCampus2026!` (ou le bouton « Entrer en mode démonstration »)
- **Fiche de test** : `documentation/FICHE_DE_TEST.md`

---

## 7. Limites honnêtes du plan gratuit Render

| Limite | Conséquence | Solution |
|---|---|---|
| Mise en veille après 15 min sans visite | le premier accès prend 30–60 s | prévenir le testeur, ou passer au plan payant (7 $/mois) |
| Disque éphémère | les fichiers importés disparaissent au redéploiement | brancher un bucket S3 (`STORAGE_DRIVER=s3`) — le code le gère déjà |
| PostgreSQL gratuit expiré après 30 jours | la base est suspendue | relancer depuis le tableau de bord, ou plan payant |
| Websockets/upload limités | — | sans impact ici (imports ≤ 25 Mo) |

Pour un usage réel en établissement : plan payant + stockage S3 + sauvegardes quotidiennes (`documentation/ADMINISTRATION.md` §5).

---

## 8. Alternative : Railway (plus simple, sans blueprint)

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**.
2. Ajoutez un plugin **PostgreSQL** ; Railway fournit `DATABASE_URL`.
3. Service API : *Settings → Build → Dockerfile* = `infrastructure/deploy/render-api.Dockerfile`, port 4000.
4. Service Web : même dépôt, Dockerfile = `infrastructure/deploy/render-web.Dockerfile`, port 3000, variable `API_INTERNAL_URL` = l'URL publique de l'API.
5. Dans le shell de l'API : `npx prisma migrate deploy && npx tsx prisma/seed.ts`.

Railway ne met pas les services en veille, mais le quota d'essai est limité (5 $/mois offerts).
