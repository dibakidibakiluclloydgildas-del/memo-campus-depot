# MÉMO CAMPUS — Rapport de tests exécutés

**Date d'exécution** : 23 novembre 2026
**Environnement** : Linux (conteneur de développement), Node 20, PostgreSQL 17.11 + pgvector, Redis 7, poppler-utils, Tesseract 5 (pack français), Next.js 15.5.29, NestJS 11, Expo SDK 54 / React Native 0.81.

Tous les résultats ci-dessous proviennent de commandes **réellement exécutées**. Aucun chiffre n'est estimé. Les commandes de reproduction sont indiquées.

---

## 1. Synthèse

| Suite | Périmètre | Résultat | Durée |
|---|---|---|---|
| `packages/shared` | moteurs métier (répétition espacée, notation, planificateur, quotas, moteur d'extraction local) | **40 / 40** | 0,7 s |
| `apps/api` | intégration complète : vraie application NestJS + vraie base PostgreSQL | **37 / 37** | 12,5 s |
| `apps/mobile` | client Android : cache hors connexion, file de synchronisation, client API | **13 / 13** | 0,3 s |
| `scripts/verify_flow.py` | parcours HTTP réel de bout en bout sur l'instance en marche | **75 / 75 vérifications** | 11 s |
| **Total automatisé** | | **165 vérifications, 0 échec** | |

| Construction | Résultat |
|---|---|
| `packages/shared` — `tsup` (ESM + CJS + déclarations) | ✅ 76,59 Ko de types |
| `apps/api` — `nest build` + `tsc --noEmit` | ✅ 0 erreur |
| `apps/web` — `next build` | ✅ 22 routes compilées, First Load JS partagé 103 Ko |
| `apps/web` — `tsc --noEmit` | ✅ 0 erreur |
| `apps/mobile` — `tsc --noEmit` | ✅ 0 erreur |
| `apps/mobile` — `expo export --platform android` | ✅ 992 modules, bundle Hermes 2,65 Mo |

---

## 2. Tests unitaires du socle métier — `packages/shared` (40)

```bash
cd packages/shared && npx vitest run
# ✓ test/logic.test.ts (22)  ✓ test/local-engine.test.ts (18)
```

### `test/logic.test.ts` (22)
Répétition espacée (intervalles, échec, maîtrise), notation (QCM, points partiels, mention), planificateur (priorités, respect des disponibilités, anti-surcharge), quotas (plafonds, illimité, message d'amélioration), moteur local (résumé extractif, ordre du document).

### `test/local-engine.test.ts` (18) — ajouté pour verrouiller les défauts observés en conditions réelles
- **Recalage des lignes coupées** : une phrase répartie sur deux lignes de PDF est recomposée ; deux paragraphes distincts ne sont jamais fusionnés ; les listes à puces et titres numérotés sont préservés.
- **Nettoyage des intitulés** : « L'équation bilan de la photosynthèse s'écrit » → « L'équation bilan de la photosynthèse ».
- **Définitions** : jamais tronquées en fin de ligne, toujours rattachées à une page, les fragments trop courts sont écartés.
- **QCM** : ≥ 3 choix, identifiants uniques, **exactement une bonne réponse**, jamais deux textes identiques, page et extrait source obligatoires, ordre reproductible.
- **Questions écrites** : grille de correction dont la somme des points égale le barème de la question.
- **Cartes** : réponse jamais vide, jamais tronquée en fin de phrase.
- **Planificateur** : fusion des créneaux qui se chevauchent, aucune séance avant l'heure actuelle, horodatage en heure locale (18 h saisies = 18 h affichées), plafond de séances par jour, tâches non plaçables signalées.

---

## 3. Tests d'intégration API — `apps/api` (37)

Conditions réelles : `Test.createTestingModule` instancie **l'application NestJS complète**, sur une **vraie base PostgreSQL** migrée ; aucun mock de Prisma. Les fichiers de test utilisent les vraies fixtures PDF et PNG de `scripts/fixtures/`.

```bash
cd apps/api && npx vitest run
# ✓ test/auth.e2e.test.ts (12) ✓ test/security.e2e.test.ts (11) ✓ test/pedagogy.e2e.test.ts (14)
```

### `auth.e2e.test.ts` (12)
Inscription (jeton + cookie httpOnly, e-mail en minuscules, rôle, offre), mot de passe jamais exposé ni stocké en clair, refus d'un mot de passe faible / e-mail invalide / conditions non acceptées, e-mail déjà utilisé (409), connexion insensible à la casse, message d'erreur identique compte connu ou non (anti-énumération), accès refusé sans jeton / jeton invalide, révocation à la déconnexion, changement de mot de passe (toutes les sessions révoquées), réinitialisation avec jeton haché, mise à jour du profil et des préférences persistées, liste et révocation des sessions, export complet et suppression de compte.

### `security.e2e.test.ts` (11)
Isolation stricte entre deux étudiants (détail, pages, fichier, génération → **404** ; la liste de l'autre compte n'expose rien), webhook sans signature (aucun abonnement créé), signature falsifiée rejetée, webhook sans secret configuré → `WEBHOOK_NOT_CONFIGURED`, fichiers non pris en charge (shell, exécutable) et faux PDF refusés, **quota mensuel appliqué côté serveur** (2ᵉ import → 403 `QUOTA_EXCEEDED`), espace admin interdit à un étudiant (403) et autorisé à un administrateur, journal d'audit sans mot de passe ni hash, `X-Request-Id` présent, UUID malformé (400) et tentative de traversée de chemin (404), clé de stockage non devinable et sans le nom d'origine.

### `pedagogy.e2e.test.ts` (14) — parcours complet
1. Import d'un **vrai PDF** → statut de file, empreinte SHA-256, propriétaire correct ;
2. analyse jusqu'à `READY`/`PARTIAL` : pages extraites, texte par page, chapitres détectés ;
3. garde-fou : résumé impossible sur un cours inexistant ;
4. résumé **ancré dans la source** (`mode: demo`, notions réellement présentes dans le texte extrait) ;
5. cartes mémoire liées au cours, cours inexistant → 404 ;
6. **répétition espacée** : `GOOD` repousse l'échéance, `AGAIN` la ramène en avant et abaisse la maîtrise, deux entrées d'historique (`GOOD`, `AGAIN`) ;
7. file du jour : chaque carte porte une justification (`why`) ;
8. épreuve mixte : 3 QCM + 1 question écrite, bonne réponse **non exposée avant soumission**, correction avec choix corrects, explication, barème, points partiels sur la question ouverte, `GRADED` en base, seconde soumission refusée (403), rapport consultable ;
9. paramétrage incohérent refusé, nombre de questions produit **jamais supérieur à la demande** ;
10. planning : aucune séance hors disponibilités, jamais le week-end, plafond par jour respecté, justification présente, agenda relisible ;
11. assistant : réponse sourcée et avertissement de mode ; mode professeur posant **une question** ;
12. import d'une **photo** (OCR réel exécuté) : `ocrPages > 0` ;
13. statistiques du tableau de bord **exactement égales** aux comptages en base (documents, cartes, révisions).

---

## 4. Tests du client Android — `apps/mobile` (13)

`vitest` avec AsyncStorage, SecureStore et `fetch` simulés en mémoire : la logique testée est celle embarquée dans le bundle.

- cache de la bibliothèque et relecture ; téléchargement d'un cours pour consultation hors connexion ; liste et suppression des téléchargements ; cache des révisions du jour ;
- **file de synchronisation** : révisions conservées hors connexion, envoi à la reconnexion et vidage de la file, **aucune perte** si le réseau est encore absent, abandon propre d'une carte refusée par le serveur (404) ;
- **client API** : jeton stocké dans le Keystore sécurisé et envoyé en `Authorization: Bearer`, `OfflineError` distinguée de `ApiError` (401 avec message serveur) ;
- **import** : mise en file d'un fichier choisi hors connexion, ordre conservé, contenu binaire jamais stocké en clair.

---

## 5. Vérification de bout en bout sur l'instance réelle — 75 vérifications

```bash
python3 scripts/verify_flow.py      # API en marche sur 127.0.0.1:4000
# RÉSULTAT : 75 vérifications réussies, 0 échec
```

13 sections : santé de l'API · inscription et connexion · import PDF · analyse et structure · résumé · cartes · révisions · évaluations et correction · planning · assistant · abonnement et offres · **quotas côté serveur** · export et suppression de compte.

---

## 6. Vérifications manuelles (HTTP réel, interface Web en marche)

| Vérification | Résultat |
|---|---|
| `GET /` (landing) | 200 |
| Connexion via `/api/session` (cookie httpOnly) | 200 |
| `/tableau-de-bord`, `/bibliotheque`, `/bibliotheque/importer`, `/revisions`, `/evaluations`, `/evaluations/nouvelle`, `/planning`, `/assistant`, `/statistiques`, `/profil`, `/abonnement` (session étudiante) | **200 partout** |
| `/admin` en session étudiante | 307 (redirection, jamais de contenu d'administration) |
| Import PDF via `/api/proxy/documents` | 201 → `READY` (3 chapitres, 2 pages) |
| Résumé généré et affiché dans `/bibliotheque/[id]` | `mode: demo`, 8 notions, 3 chapitres |
| Génération d'épreuve (5 QCM) | 200 avec avertissement de mode démonstration |
| `GET /api/docs-json` | 200 — **71 chemins, 82 opérations** exportés dans `documentation/openapi.json` |
| **Accès invité en un clic** (`POST /api/session {"action":"demo"}`) | 200 — ouvre la session `etudiant@demo.memo-campus.cm` (Premium) ; 8 pages authentifiées en 200 avec ce cookie ; refus explicite (403) quand `ALLOW_DEMO_LOGIN=false` |
| `scripts/pret_pour_partage.sh` | 6 contrôles verts : API, base, compte de démo, offres publiées, page d'accueil, accès invité |
| URL d'API figée dans le bundle Android (`EXPO_PUBLIC_API_URL`) | vérifiée par `strings` sur le bundle : l'adresse fournie à la compilation est bien celle embarquée |

---

## 7. Défauts réels détectés par ces tests, puis corrigés

Ces corrections ne sont pas cosmétiques : chacune correspond à un comportement fautif constaté par l'exécution.

| # | Défaut | Impact | Correction |
|---|---|---|---|
| 1 | `POST /auth/change-password` ne révoquait pas la session courante | une session compromise survivait au changement de mot de passe | révocation de **toutes** les sessions (test dédié) |
| 2 | `GET /auth/sessions` renvoyait un tableau brut alors que le Web attendait `{ items }` | la page **Profil plantait (HTTP 500)** | contrat unifié `{ items, total }` + page corrigée |
| 3 | L'export RGPD exposait la clé `profile` au lieu de `account` | incohérence avec le reste de l'API | clé unifiée |
| 4 | Le quota **mensuel** d'imports n'était pas appliqué (seuls le total et le stockage l'étaient) | contournement possible de l'offre Free | `documents_per_month` vérifié avant écriture (testé) |
| 5 | Le moteur local produisait des définitions coupées par la mise en page (« … = 6 O2. Le ») | fiches et QCM pédagogiquement faux | recollage des lignes + filtre de plausibilité + 18 tests |
| 6 | Les intitulés de notions contenaient le verbe de liaison (« … s'écrit ») | questions mal formulées | `cleanTerm()` + tests |
| 7 | Le mode démonstration ignorait le nombre de questions demandé (5 QCM pour 2 demandés) | durée et barème faussés | respect exact du paramétrage + avertissement si le cours ne suffit pas |
| 8 | Le planificateur datait les séances en UTC | séances affichées au mauvais moment dans certains fuseaux | horodatage en heure locale (tests dédiés) |
| 9 | Le planificateur pouvait placer une séance à une heure déjà passée | proposition irréaliste | prise en compte de l'heure courante |
| 10 | Deux disponibilités qui se chevauchent produisaient deux séances simultanées | emploi du temps incohérent | fusion des créneaux |
| 11 | Échec du worker si le document était supprimé pendant l'analyse | enregistrement d'erreur non géré | mise à jour tolérante aux suppressions concurrentes |
| 12 | Les tests d'intégration pouvaient consommer les jobs Redis du serveur déjà lancé | tests instables | instance Redis isolée pour les tests (`127.0.0.1:6390`) |
| 13 | Vite/esbuild ne produit pas `emitDecoratorMetadata` | tests d'intégration impossibles (NestJS sans métadonnées) | transformation SWC dans `vitest.config.ts` |

---

## 8. Ce qui n'a PAS été testé (et pourquoi)

| Élément | Raison | Ce qui est néanmoins vérifié |
|---|---|---|
| Compilation APK/AAB signée | ni Android SDK ni keystore dans l'environnement ; `eas build` exige un compte Expo | `tsc` sans erreur, **bundle Android Hermes généré** (992 modules), profils EAS prêts |
| `docker compose up` | Docker absent de l'environnement | Dockerfiles et compose écrits et relus ; tous les composants ont été exercés hors Docker |
| Paiements réels / webhooks de bout en bout | aucun compte marchand Campay ou Stripe | circuit de signature testé (signature invalide rejetée, secret manquant → refus, idempotence) |
| Envoi réel d'e-mails | aucun serveur SMTP | génération et hachage du jeton de réinitialisation testés |
| IA générative distante (`live`) | aucune clé API fournie | mode `demo` intégralement testé ; abstraction multi-fournisseurs et repli testés |
| Notifications push Android | projet Firebase absent | rappels **locaux** implémentés (`expo-notifications`), bundle compilé |
| Interface Web en test navigateur automatisé (Playwright) | navigateur headless non installé | toutes les pages rendues en **HTTP 200 réel** avec session ; flux complet vérifié par requêtes HTTP |
| Montée en charge / performance sous charge | hors périmètre de cette itération | temps de réponse mesurés dans les journaux (`durationMs`) |

---

## 9. Reproductibilité

```bash
# 1. Prérequis : PostgreSQL + pgvector, poppler-utils, tesseract-ocr-fra
# 2. Base de test
createdb memo_campus_test && psql -d memo_campus_test -c "CREATE EXTENSION vector;"
cd apps/api && DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/memo_campus_test?schema=public" npx prisma migrate deploy

# 3. Toutes les suites
npm run build:shared
(cd packages/shared && npx vitest run)
(cd apps/api && npx vitest run)
(cd apps/mobile && npx vitest run)

# 4. Parcours réel (API démarrée)
npm run build -w @memo/api && (cd apps/api && node dist/main.js &)
python3 scripts/verify_flow.py
```

La CI (`.github/workflows/ci.yml`) exécute les étapes 3 et 4 avec un service PostgreSQL pgvector et le bundle Android.
