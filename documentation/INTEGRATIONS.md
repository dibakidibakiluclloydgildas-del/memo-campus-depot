# MÉMO CAMPUS — Intégrations nécessitant une clé, un compte externe ou un paiement

Ce document est un livrable obligatoire du cahier des charges : il liste **tout ce qui n'est pas activé** dans ce livrable, pourquoi, et comment l'activer. Aucune de ces intégrations n'est présentée comme opérationnelle dans l'application : tant qu'elle n'est pas configurée, l'API refuse explicitement (message d'erreur dédié) ou bascule en mode dégradé annoncé.

**Légende** — État : `Écrit et testé` (le code fonctionne, seule la clé manque) · `Écrit, non testé en conditions réelles` (nécessite un compte marchand) · `Non implémenté` (hors périmètre de cette version).

---

## 1. Fournisseurs d'intelligence artificielle (optionnels)

| Service | État | Variables | Coût | Sans clé |
|---|---|---|---|---|
| OpenAI (GPT) | Écrit et testé | `OPENAI_API_KEY`, `AI_MODEL` | payant à l'usage (~0,15–5 $/M jetons selon modèle) | mode `demo` |
| Google Gemini | Écrit et testé | `GOOGLE_API_KEY` | **palier gratuit** disponible, puis payant | mode `demo` |
| Anthropic (Claude) | Écrit et testé | `ANTHROPIC_API_KEY` | payant à l'usage | mode `demo` |
| Embeddings OpenAI | Écrit | `EMBEDDINGS_PROVIDER=openai` | payant (faible) | `local` (gratuit, déterministe) |
| Mode démonstration (`demo`) | **Actif par défaut** | aucune | **0 €** | — |

Priorité recommandée pour un budget nul : **Gemini (palier gratuit)** pour les résumés, puis `demo` pour tout le reste. Mesurez le coût réel dans `/admin` (coût par document et par génération) avant de passer au payant.

**Activation** : renseignez la clé dans `.env`, mettez `AI_PROVIDER=openai|google|anthropic`, `AI_DEMO_MODE=false`, redémarrez l'API, puis vérifiez que `GET /api/health` renvoie le mode `live` et qu'un résumé porte `"mode": "live"`.

---

## 2. Paiements (Cameroun et cartes)

| Service | État | Variables | Compte requis | Sans configuration |
|---|---|---|---|---|
| Campay (Orange Money, MTN MoMo) | Écrit, **non testé en conditions réelles** | `CAMPY_APP_ID`, `CAMPY_APP_SECRET`, `CAMPY_BASE_URL`, `CAMPY_WEBHOOK_SECRET` | compte marchand Campay validé | `POST /billing/checkout` renvoie « prestataire non configuré » ; aucun abonnement activé |
| Stripe (cartes, test) | Écrit, **non testé en conditions réelles** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | compte Stripe (gratuit, clés de test) | idem |
| Mobile Money direct (opérateur) | Non implémenté | — | contrat opérateur | — |

**Ce qui fonctionne sans compte** : le circuit complet est testé côté sécurité — signature HMAC obligatoire, rejet d'une signature invalide, idempotence, refus explicite sans secret. Aucun abonnement ne s'active sans webhook vérifié.

**Activation** : créez le compte marchand, renseignez les 3–4 variables, déclarez l'URL de webhook `https://api.<domaine>/api/billing/webhooks/CAMPY`, puis testez en sandbox avec une signature calculée (`documentation/ADMINISTRATION.md` §4). Ne passez en production qu'après un paiement de test réussi de bout en bout.

---

## 3. Envoi d'e-mails

| Service | État | Variables | Coût | Sans configuration |
|---|---|---|---|---|
| SMTP (Brevo, Mailgun, Gmail pro, Sendgrid…) | Écrit | `SMTP_URL`, `MAIL_FROM` | gratuit jusqu'à quelques centaines/jour (Brevo : 300/j) | le lien de réinitialisation est renvoyé par l'API **en développement uniquement**, jamais en production |

Sans SMTP en production, la réinitialisation de mot de passe **ne peut pas** aboutir : l'utilisateur reçoit un message l'invitant à contacter l'administration. C'est volontaire (aucun lien secret envoyé en clair au navigateur).

---

## 4. Stockage de fichiers

| Service | État | Variables | Coût |
|---|---|---|---|
| Disque local (`local`) | **Actif**, testé | `STORAGE_DRIVER=local`, `STORAGE_DIR` | 0 € |
| S3 compatible (MinIO auto-hébergé) | Écrit | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | 0 € si auto-hébergé |
| Cloudflare R2 / Backblaze B2 / AWS S3 | Écrit | idem | quelques centimes/Go/mois |

Pour un déploiement multi-serveurs, S3 compatible est recommandé (le disque local ne se partage pas entre instances).

---

## 5. Notifications Android

| Service | État | Variables | Compte requis |
|---|---|---|---|
| Rappels **locaux** (quotidien à 18 h) | **Actif**, testé (bundle) | aucune | aucun — fonctionne hors connexion |
| Push distant (FCM / Expo) | Non implémenté | `FCM_SERVER_KEY` | projet Firebase + `google-services.json` |

L'application n'annonce que les rappels locaux. Aucune notification push n'est promise.

---

## 6. Compilation de l'APK / AAB

| Service | État | Compte | Coût |
|---|---|---|---|
| Bundle JavaScript Android (`expo export`) | **Exécuté avec succès** (992 modules, 2,6 Mo) | aucun | 0 € |
| `prebuild` + Gradle local | Possible | Java 17 + Android SDK | 0 € |
| EAS Build (Expo) | Profils prêts (`eas.json`) | **compte Expo (gratuit)**, file d'attente limitée | gratuit / ~99 $/mois pour files prioritaires |
| Google Play (publication) | Non fait | compte développeur Google Play | 25 $ une fois |

Le code est compilable (types et bundle validés) ; la **signature** de l'APK exige votre keystore, que vous seul devez détenir.

---

## 7. Services d'infrastructure (facultatifs)

| Service | Rôle | Obligatoire ? |
|---|---|---|
| Redis | files BullMQ (traitement asynchrone) | non — l'API bascule en traitement synchrone sans perte |
| SMTP | réinitialisation de mot de passe | oui en production |
| Reverse proxy HTTPS (Caddy, Nginx, Traefik) | TLS | oui en production |
| Supervision (UptimeRobot gratuit, BetterStack) | alertes `/api/health` | fortement recommandé |
| Sentry (optionnel) | remontée d'erreurs | non |

---

## 8. Récapitulatif : ce qui fonctionne à 100 % sans compte externe

- Création de compte, connexion, sessions, profils, rôles, export et suppression de compte ;
- import PDF / photo (OCR avec Tesseract installé) / Word, analyse, découpage, indexation ;
- résumés, objectifs, notions, fiches, formules — **mode démonstration extractif** ;
- cartes mémoire, répétition espacée, priorités du jour justifiées ;
- évaluations QCM et écrites, correction, grilles, historique ;
- planning automatique, Pomodoro, statistiques ;
- assistant conversationnel et mode professeur en mode démonstration ;
- quotas et offres administrables depuis l'admin ;
- application Android (navigation, cache hors connexion, révisions hors ligne, rappels locaux).

**Ce qui exige une clé ou un compte** : IA générative réelle, paiements, e-mails de réinitialisation en production, push distant, signature/publication APK.
