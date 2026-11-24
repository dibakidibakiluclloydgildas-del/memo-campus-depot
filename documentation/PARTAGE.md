# MÉMO CAMPUS — Envoyer l'application à un ami pour qu'il la teste

Ce guide répond à une question précise : **« je veux envoyer l'application à mon ami pour qu'il teste avec le guide, je fais comment ? »**

Trois voies possibles. Choisissez la plus simple selon ce que vous voulez montrer.

| Voie | Ce que votre ami reçoit | Temps de mise en place | Ce qu'il peut tester |
|---|---|---|---|
| **A. Lien Web** (recommandé) | une simple adresse `https://…` à ouvrir dans son navigateur | quelques minutes | tout le Web : import, résumé, cartes, épreuves, planning, assistant, abonnement |
| **B. Expo Go** | l'application Android **sans installation d'APK** (il installe juste l'app Expo Go) | ~10 minutes | l'application mobile complète, hors connexion compris |
| **C. APK** | un fichier `.apk` qu'il installe sur son téléphone | 20–40 min (compte Expo + build) | idem B, mais en application autonome |

> **Ce qui compte avant tout** : l'application a besoin de **deux choses** pour être testée à distance — (1) une **API accessible depuis chez lui**, (2) un **compte** pour entrer. Le reste est du confort.

---

## 0. La checklist à passer AVANT d'envoyer quoi que ce soit

Lancez ce script : il vérifie que tout est réellement en état de marche et vous donne les bonnes adresses.

```bash
cd memo-campus
./scripts/pret_pour_partage.sh
```

Il contrôle : API en marche (`/api/health`), base de données, Web en marche, compte de démonstration existant, offres configurées, mode IA, et il affiche l'adresse IP locale de votre machine (utile pour un test sur le même Wi-Fi).

Points de vigilance manuels :

1. **Aucun secret ne doit partir.** Ne transmettez **jamais** votre fichier `.env` (il contient `JWT_SECRET`, clés IA, clés de paiement). Le `.gitignore` l'exclut déjà ; si vous envoyez une archive, créez-la avec `git archive` (qui n'embarque que le suivi par Git) ou excluez `.env`.
2. **Accès invité** : la page de connexion propose le bouton **« Entrer en mode démonstration (un clic) »**. Il dépend de `ALLOW_DEMO_LOGIN` : actif par défaut **hors production**, désactivé en production. Si vous partagez le Web en production, ajoutez `ALLOW_DEMO_LOGIN=true` dans l'environnement du serveur Web (ou donnez les identifiants ci-dessous).
3. **Comptes de démonstration** (mot de passe `MemoCampus2026!`) :
   - `etudiant@demo.memo-campus.cm` — offre Premium, données déjà prêtes
   - `etudiant.free@demo.memo-campus.cm` — offre Free (pour tester les quotas)
   - `enseignant@demo.memo-campus.cm`
   - `admin@demo.memo-campus.cm` — espace d'administration
4. **Données** : votre ami peut tout casser sans risque, ce sont des données de démonstration. Il peut aussi créer son propre compte (offre gratuite, sans carte).
5. **Limite honnête à annoncer** : les contenus générés sont en **mode démonstration** (extraits réels de son cours, pas d'IA distante) et les paiements ne sont pas activés. Dites-le-lui : il ne doit pas croire à une panne.

---

## 0 bis. Pour un lien **stable** (celui que vous voulez vraiment)

Un tunnel gratuit (`trycloudflare`, `localtunnel`) **n'est pas un hébergement** : son URL change à chaque lancement, il expire quand l'ordinateur s'endort ou se met à jour, et c'est exactement ce qui produit les erreurs **1033** (« origine injoignable ») et **530** que vous avez vues. Tant que l'application tourne sur une machine de travail reliée par un tunnel jetable, aucune promesse de stabilité n'est honnête.

Pour un lien qui reste debout plusieurs jours **sans rien maintenir** :

```bash
# tout est décrit pas à pas dans :
cat infrastructure/deploy/RENDER.md
```

En résumé : dépôt GitHub privé → Render → PostgreSQL gratuit (Francfort) → Blueprint `render.yaml` (déjà fourni à la racine) → 3 variables à saisir → une commande de migration + une commande de données de démo. Résultat : une adresse fixe du type `https://memo-web.onrender.com` que votre ami peut garder en favori. Limite honnête du plan gratuit : le service s'endort après 15 min d'inactivité et met 30–60 s à se réveiller au premier clic.

## 1. Voie A — Partager le lien Web (le plus simple, recommandé)

### A.1 Si vous travaillez dans cet espace de travail (Arena)

Le serveur Web tourne déjà sur le port `3000` : ouvrez le panneau de prévisualisation, cliquez sur l'icône de partage et **envoyez le lien à votre ami**. Il n'a rien à installer : il ouvre le lien, clique sur « Entrer en mode démonstration (un clic) », et il est dans l'application.

> Le lien de prévisualisation est public tant que votre session de travail est ouverte. Pour un test durable, utilisez A.2.

### A.2 Sur votre propre machine, accessible depuis Internet (tunnel HTTPS)

Le plus rapide, sans serveur à louer :

```bash
# Terminal 1 — l'API (écoute déjà sur 0.0.0.0)
cd memo-campus && npm run dev:api

# Terminal 2 — le Web
cd memo-campus && npm run dev:web

# Terminal 3 — un tunnel public vers le Web
npx localtunnel --port 3000
# → https://un-nom-aleatoire.loca.lt   ← c'est ce lien que vous envoyez
```

Avec Cloudflare Tunnel (**recommandé** : pas de page mot de passe, HTTPS, plus stable) :

```bash
# installation (une seule fois)
curl -L -o cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared

# lancement
./cloudflared tunnel --url http://127.0.0.1:3000 --no-autoupdate
# → https://un-nom-aleatoire.trycloudflare.com   ← c'est ce lien que vous envoyez
```

> **Retour d'expérience (important)** : Cloudflare quick tunnel et `localtunnel` sont des **outils de dépannage**, pas des liens à envoyer à un testeur.
> - `localtunnel` affiche une page « Tunnel Password » incompréhensible sur téléphone et tombe en `503` au bout de quelques heures ;
> - `trycloudflare` change d'URL à chaque lancement, renvoie `1033` dès que le serveur local bouge d'interface, `530` quand le tunnel n'est plus enregistré, et parfois des connexions coupées en rafale.
>
> Mesuré sur ce projet : un premier tunnel est passé en `530` définitivement ; le second a répondu par séries de 7–6 échecs consécutifs avant de redevenir joignable. **Si vous devez envoyer un lien à quelqu'un qui n'est pas à côté de vous, passez par la §0 bis (Render).**

**Important** : le Web parle à l'API **côté serveur** (`API_INTERNAL_URL=http://127.0.0.1:4000`). Vous n'avez donc **pas besoin** d'exposer l'API séparément : un seul tunnel vers le port 3000 suffit. Vérifiez simplement que `apps/web/.env.local` (ou l'environnement) contient `API_INTERNAL_URL=http://127.0.0.1:4000`.

**Attention** : si vous passez le Web en `NODE_ENV=production`, le cookie de session devient `Secure` — il faut alors **HTTPS** (c'est le cas des tunnels ci-dessus).

### A.3 Sur un vrai serveur (test durable, plusieurs jours)

Suivez `documentation/INSTALLATION.md` §3 (Docker) puis §4 (HTTPS) sur un petit VPS. Vous obtiendrez une adresse stable du type `https://demo.memo-campus.cm`, que votre ami peut utiliser quand il veut. Pensez à :

```bash
# dans .env du serveur
ALLOW_DEMO_LOGIN=true          # accès invité en un clic
JWT_SECRET=<openssl rand -base64 48>
APP_URL=https://demo.memo-campus.cm
```

et à exécuter une fois `npm run db:seed` (ou `docker compose exec api npx tsx prisma/seed.ts`) pour créer les comptes de démonstration.

---

## 2. Voie B — Faire tester l'application **Android** sans APK (Expo Go)

C'est la façon la plus rapide de faire tester le mobile : votre ami n'installe que l'application **Expo Go** (gratuite, sur le Play Store), pas votre APK.

### B.1 Exposer l'API publiquement

Le téléphone de votre ami n'est pas sur votre réseau : il faut une adresse HTTPS publique pour l'API.

```bash
# Terminal 1 — API
cd memo-campus && npm run dev:api

# Terminal 2 — tunnel vers l'API (port 4000)
npx localtunnel --port 4000
# → https://api-xyz.loca.lt
```

Testez vous-même `https://api-xyz.loca.lt/api/health` dans votre navigateur : vous devez voir un JSON `{ "status": "ok", … }`.

**Étape souvent oubliée (localtunnel)** : le service affiche d'abord une page « tunnel password ». Ce mot de passe est **l'adresse IP publique de la machine qui héberge le tunnel** — ce n'est pas `127.0.0.1`. Récupérez-la ici :

```bash
curl https://loca.lt/mytunnelpassword     # ex. 35.185.224.230
```

Votre ami la saisit une fois, puis coche « Cliquez pour continuer » : l'application s'affiche normalement. (Avec Cloudflare Tunnel, cette étape n'existe pas — c'est plus confortable pour un testeur non technique.)

> Si votre API refuse la connexion, vérifiez `CORS_ORIGINS` : l'application mobile n'envoie pas d'en-tête `Origin`, elle est donc autorisée par construction. Le Web, lui, doit être listé.

### B.2 Lancer Expo en mode tunnel avec cette adresse

```bash
cd memo-campus/apps/mobile
EXPO_PUBLIC_API_URL=https://api-xyz.loca.lt npx expo start --tunnel
```

Un **QR code** s'affiche. Envoyez-le à votre ami (capture d'écran ou photo).

### B.3 Ce que fait votre ami

1. Installe **Expo Go** depuis le Play Store ;
2. ouvre Expo Go → **Scan QR code** → scanne votre QR ;
3. l'application MÉMO CAMPUS se charge (10–30 s la première fois) ;
4. se connecte avec `etudiant@demo.memo-campus.cm` / `MemoCampus2026!`.

**Limites à lui annoncer** : en mode Expo Go, l'app fonctionne, mais le tunnel doit rester ouvert chez vous ; les notifications et la persistance du stockage sécurisé sont limitées (Expo Go ne reproduit pas exactement un APK signé). Pour un test « comme en vrai », passez à la voie C.

---

## 3. Voie C — Envoyer un APK installable

### C.1 Construire l'APK avec EAS (compte Expo gratuit)

```bash
npm install -g eas-cli
eas login                       # créer un compte gratuit sur expo.dev si besoin
cd memo-campus/apps/mobile
eas init                        # associe le projet (crée un projectId)

# l'APK de partage, avec l'adresse de l'API figée dedans
eas build --platform android --profile partage
```

À la fin du build, EAS affiche un **lien de téléchargement** (et vous envoie un e-mail). Envoyez ce lien à votre ami — il est valable plusieurs jours, l'APK reste téléchargeable.

**Avant de lancer le build**, vérifiez l'adresse de l'API dans `apps/mobile/eas.json`, profil `partage` :

```json
"partage": {
  "distribution": "internal",
  "android": { "buildType": "apk" },
  "env": { "EXPO_PUBLIC_API_URL": "https://api-demo.memo-campus.cm" }
}
```

Remplacez cette URL par **la vôtre** (tunnel HTTPS ou serveur déployé). ⚠️ Une adresse `localhost`, `127.0.0.1` ou `10.0.2.2` **ne fonctionnera pas** sur le téléphone de votre ami : elle désigne *son* téléphone, pas votre machine. L'adresse est figée à la compilation : après un changement, il faut **reconstruire** l'APK.

Contrôle possible avant de partager (facultatif) :

```bash
EXPO_PUBLIC_API_URL=https://votre-api.exemple.cm npx expo export --platform android --output-dir /tmp/verif
strings /tmp/verif/_expo/static/js/android/*.hbc | grep -c "votre-api.exemple.cm"   # doit renvoyer 1
```

### C.2 Ou construire l'APK en local (sans compte Expo)

```bash
cd memo-campus/apps/mobile
EXPO_PUBLIC_API_URL=https://votre-api.exemple.cm npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Nécessite **Java 17** et le **SDK Android** : c'est la voie la plus longue, à réserver si vous ne voulez pas de compte Expo.

### C.3 Ce que fait votre ami pour installer

1. Il télécharge l'APK depuis le lien (sur son téléphone, pas sur un ordinateur) ;
2. Android affiche « Installation d'applications inconnues » : il autorise son navigateur ou son gestionnaire de fichiers à installer des applications ;
3. il ouvre **MÉMO CAMPUS**, se connecte avec le compte de démonstration ;
4. il peut tester le mode hors connexion : ouvrir un cours → **Télécharger pour hors connexion** → activer le mode avion → relire le résumé, puis réviser des cartes ; les réponses partiront à la reconnexion.

**Notes honnêtes à transmettre** :
- l'APK n'est **pas signé par le Play Store** : Android avertit, c'est normal pour un test ;
- iOS n'est pas couvert par un APK (il faudrait un build EAS iOS + un compte Apple) ;
- les notifications push distantes ne sont pas activées ; les **rappels locaux** (18 h) le sont.

---

## 4. Si vous envoyez plutôt le **code source**

Votre ami développeur peut tout relancer lui-même :

```bash
git archive --format=zip --output=memo-campus.zip HEAD   # sans .env, sans node_modules
```

Puis, chez lui, `documentation/INSTALLATION.md` §2 (6 étapes). Pensez à lui transmettre **séparément** (et jamais dans le dépôt) les éventuelles clés d'API, ou dites-lui de rester en mode démonstration (aucune clé nécessaire).

Ne transmettez pas non plus : `*.dump`, sauvegardes de base, dossiers `var/storage` (ils contiennent des documents d'utilisateurs).

---

## 5. Le message type à envoyer avec le lien

> Salut ! Voici MÉMO CAMPUS, la plateforme que je développe — **Web et Android**.
>
> 👉 Lien : **https://…** (ou fichier APK joint)
>
> Pour entrer : clique sur **« Entrer en mode démonstration (un clic) »**, ou utilise `etudiant@demo.memo-campus.cm` / `MemoCampus2026!`.
>
> Le guide de test est ici : `documentation/GUIDE_UTILISATEUR.md` (ou `docs/FICHE_DE_TEST.md` que je t'envoie).
>
> Deux choses à savoir pour ne pas croire à un bug :
> • les contenus (résumés, cartes, épreuves) sont produits en **mode démonstration** à partir du vrai texte de tes cours — c'est indiqué dans l'interface ;
> • les **paiements ne sont pas activés** (aucun compte marchand branché) : l'abonnement s'affiche, mais rien n'est débité.
>
> Ce qui m'intéresse le plus dans ton retour : la clarté du parcours d'import, la pertinence des questions générées, et si le planning te paraît réaliste. Merci !

---

## 6. Pannes fréquentes quand on partage

| Symptôme chez votre ami | Cause | Correctif |
|---|---|---|
| Page blanche / « site inaccessible » | tunnel fermé ou serveur arrêté | relancer le tunnel, vérifier `curl <url>/api/health` |
| « Tunnel Password » demandé (localtunnel) | protection anti-abus de localtunnel | fournir l'IP publique : `curl https://loca.lt/mytunnelpassword` |
| Le lien du tunnel ne fonctionne plus au bout de quelques heures | URL localtunnel temporaire, ou session de travail fermée | relancer le tunnel ; pour un test durable, Cloudflare Tunnel ou un VPS |
| **Erreur 1033** (Cloudflare « Argo Tunnel error ») | le lien Cloudflare rapide ne trouve plus son serveur local : celui-ci a été **arrêté** ou a **redémarré sur une autre adresse**. Cloudflare ne sait plus où envoyer la requête. | voir l'encadré ci-dessous |
| « Échec de la connexion » sur le Web | l'API n'est pas joignable côté serveur | vérifier `API_INTERNAL_URL` (doit pointer sur votre API locale) |
| Bouton démo → « accès invité désactivé » | `NODE_ENV=production` sans `ALLOW_DEMO_LOGIN` | ajouter `ALLOW_DEMO_LOGIN=true`, redémarrer le Web |
| Connexion impossible après redémarrage de la base | base réinitialisée, comptes absents | relancer `npm run db:seed` |
| APK : « Network request failed » | mauvaise `EXPO_PUBLIC_API_URL` figée dans l'APK | reconstruire avec l'URL publique correcte |
| APK : « analyse » bloquée en `QUEUED` | pas de Redis sur le serveur partagé | normal : le traitement se fait en synchrone ; sinon relancer l'analyse |
| Photos : OCR vide | Tesseract/pack français absent sur le serveur | `apt-get install tesseract-ocr tesseract-ocr-fra` |
| Session perdue au bout de 7 jours | durée du jeton (`JWT_EXPIRES_IN=7d`) | normal, il se reconnecte |

### 6.1 Erreur 1033 : que faire exactement

L'erreur 1033 vient de **Cloudflare**, pas de l'application : elle signifie « tunnel vivant, mais ton serveur local ne répond pas à l'adresse attendue ». Trois causes, dans l'ordre de fréquence :

1. **Le serveur Web a été arrêté** (fermeture du terminal, redémarrage, veille de la machine) → relancer `npm run dev:web` (ou `npx next start`).
2. **Le serveur Web écoute sur une autre interface**. Le tunnel pointe sur `http://127.0.0.1:3000` : si Next écoute seulement sur `0.0.0.0` ou sur `::1`, ou sur un autre port, Cloudflare reçoit un refus. Lancez-le explicitement sur **127.0.0.1:3000** :
   ```bash
   npx next start -H 127.0.0.1 -p 3000
   ```
3. **Le tunnel a perdu sa connexion** (réseau instable) → arrêter et relancer `cloudflared` ; un **nouveau** lien est alors généré (l'ancien est mort, il faut renvoyer le nouveau à votre testeur).

Diagnostic en 3 commandes :

```bash
curl -s -o /dev/null -w "serveur local : %{http_code}\n" http://127.0.0.1:3000/
curl -s -o /dev/null -w "via tunnel    : %{http_code}\n" https://<votre-lien>.trycloudflare.com/
pgrep -af "cloudflared|next" | head
```

Si le premier répond 200 et le second 1033/502 → le tunnel est en cause, relancez-le.
Si les deux échouent → relancez le serveur Web d'abord, puis le tunnel.

> **Pourquoi ces liens tombent souvent** : un tunnel rapide (`trycloudflare.com`) n'a aucune garantie de disponibilité et disparaît dès que votre machine, votre terminal ou votre session de travail s'arrête. C'est parfait pour une démonstration de 30 minutes, jamais pour un test étalé sur plusieurs jours. Pour un lien qui **ne meurt pas**, il faut un hébergement (voir §1.A.3) : c'est la seule solution honnête.

---

## 7. Après le test : récupérer les retours et nettoyer

- Les comptes créés par votre ami restent dans votre base : supprimez-les depuis `/admin` (ou laissez-les, ce sont des données de démo).
- Si vous avez ouvert un tunnel public, **fermez-le** (`Ctrl+C`) : il expose votre machine.
- Ne réutilisez pas `MemoCampus2026!` sur une instance réelle : changez les mots de passe ou supprimez les comptes de démonstration avant d'ouvrir au public.
