# MÉMO CAMPUS — Guide utilisateur

Bienvenue ! MÉMO CAMPUS transforme vos cours en outils de travail : résumés, fiches, cartes de révision, évaluations corrigées et planning. Ce guide suit l'ordre réel de vos premières minutes, puis chaque outil.

**Deux applications, un seul compte** : votre espace Web (`https://<votre-domaine>`) et l'application Android partagent les mêmes comptes et les mêmes données. Un cours importé sur le téléphone apparaît sur le Web quelques secondes plus tard, et inversement.

---

## 1. Créer votre compte

1. Ouvrez l'application Web ou Android, puis **Créer un compte**.
2. Renseignez votre nom, votre adresse e-mail, un mot de passe **d'au moins 10 caractères avec une majuscule, une minuscule et un chiffre**.
3. Indiquez votre établissement et votre niveau — c'est facultatif, mais cela adapte la formulation des explications.
4. Cochez l'acceptation des conditions d'utilisation, puis validez.

Vous arrivez directement sur votre **tableau de bord**. L'offre Découverte est gratuite et sans carte bancaire.

**Mot de passe oublié** : sur l'écran de connexion, **Mot de passe oublié**, saisissez votre e-mail. Pour des raisons de sécurité, l'écran affiche toujours la même réponse, que le compte existe ou non. Le lien reçu par e-mail est valable une heure.

---

## 2. Importer un cours

### Depuis le Web
*Bibliothèque → Importer un cours*, glissez un fichier : **PDF** (texte ou scanné), **photo JPG/PNG**, **Word (.docx)**. Donnez un titre clair (« Biologie cellulaire — chapitre 1 »), choisissez éventuellement la matière, puis validez.

### Depuis Android
Onglet **Importer** :
- **Parcourir mes fichiers** pour un PDF ou un Word ;
- **Utiliser l'appareil photo** pour photographier une page de polycopié ou un tableau.

Photographiez bien à plat, avec un bon éclairage : l'OCR reconnaît d'autant mieux le texte. Le flash est souvent utile, l'ombre de votre main ne l'est pas.

### Ce qui se passe ensuite
1. Le fichier est **validé** (type réel du fichier, taille maximale 25 Mo).
2. Le texte est **extrait** ; s'il s'agit d'une photo ou d'un PDF scanné, une **reconnaissance optique (OCR)** est lancée.
3. La structure est **détectée** : chapitres, sections, pages.
4. Le contenu est **découpé et indexé** pour permettre des réponses sourcées.
5. La bibliothèque affiche le statut réel : *En file → Extraction → OCR → Structure → Prêt*.

L'analyse prend de quelques secondes à une ou deux minutes selon la taille. Vous pouvez quitter la page, le traitement continue côté serveur.

> **Hors connexion (Android)** : l'import nécessite Internet. Si vous prenez une photo sans réseau, elle est **conservée sur le téléphone** et envoyée au retour de la connexion. L'écran vous le dit explicitement — il ne fait jamais semblant que l'envoi a réussi.

> **Si un passage est illisible**, l'application le signale (« Passage possiblement illisible, page 3 ») plutôt que d'inventer du contenu. Une zone « À vérifier sur le document » apparaît dans le résumé.

---

## 3. Comprendre un cours : résumé, notions, fiches

Ouvrez un cours dans la bibliothèque, puis **Générer le résumé** :

| Élément | À quoi cela sert |
|---|---|
| Résumé général | vue d'ensemble du chapitre en quelques phrases |
| Objectifs d'apprentissage | ce que vous devez savoir faire à la fin |
| Notions essentielles | définitions avec la **page source** pour vérifier |
| Par chapitre | un résumé par partie, pour réviser ciblé |
| Formules | les formules trouvées, citées telles quelles |
| À vérifier | incertitudes détectées dans le document |

**Onglet Fiche** : une page synthétique imprimable, idéale pour réviser avant un contrôle.

Chaque notion porte une référence de page : cliquez, vérifiez dans votre cours. L'application ne présente jamais une interprétation comme si c'était le texte de votre professeur.

> **Mode démonstration** : sans clé d'IA configurée, les contenus sont **extraits** de votre cours (phrases réelles, définitions réelles) et l'interface l'indique clairement. Aucune phrase n'est inventée. Avec une clé d'IA configurée par votre établissement, la mention passe en mode IA et les réponses restent sourcées.

---

## 4. Réviser avec les cartes et la répétition espacée

*Révisions → Générer des cartes* depuis un cours, ou *Bibliothèque → Cartes*.

Une carte affiche une **question** ; vous répondez **de mémoire, sans regarder**, puis vous affichez la réponse et jugez honnêtement :

| Votre réponse | Vous choisissez | Effet |
|---|---|---|
| Aucun souvenir | **Oublié** | la carte revient très vite |
| Difficile mais retrouvé | **Difficile** | intervalle court |
| Correcte | **Bien** | intervalle normal |
| Immédiate | **Facile** | intervalle allongé |

Vos cartes sont classées : **maîtrisée**, **fragile**, **non maîtrisée**. Chaque jour, la file de révision est **priorisée** et chaque carte indique **pourquoi** elle est là (« Proposée car notion encore fragile », « Révision due »). Vous pouvez modifier le rythme dans les préférences du profil.

**Hors connexion (Android)** : une session de révision se déroule normalement, les réponses sont enregistrées sur le téléphone et envoyées au retour du réseau. Rien n'est perdu.

---

## 5. S'évaluer : épreuves et corrections

*Évaluations → Nouvelle épreuve* :

- **Type** : QCM, questions écrites, ou épreuve mixte ;
- **Périmètre** : matière ou cours précis ;
- **Difficulté** : facile, moyen, difficile ;
- **Nombre de questions** et **durée** ;
- **Barème** affiché avant de commencer.

Pendant l'épreuve : chronomètre, navigation entre les questions, **sauvegarde automatique**, confirmation avant de quitter. Si le temps expire, l'épreuve est soumise automatiquement avec vos réponses déjà saisies.

Après soumission, la **correction détaillée** affiche : note, pourcentage, appréciation, le détail question par question, **la bonne réponse, votre réponse, l'explication et la page du cours**. Pour les questions ouvertes, une **grille explicite** (critères et points) justifie la note, avec des points partiels. Vos **erreurs récurrentes** et vos recommandations de révision sont listées. Tout l'historique reste consultable.

> Une question ouverte exige une réponse rédigée : l'application indique qu'une relecture humaine peut être nécessaire lorsque l'évaluation automatique n'est pas sûre d'elle.

---

## 6. Organiser son travail : planning et Pomodoro

*Planning* :

1. Renseignez vos **disponibilités** (jours et horaires) — le planning s'adapte à votre vie réelle, pas l'inverse.
2. Indiquez vos **échéances** (devoirs, examens) et vos priorités.
3. Lancez **Proposer un planning** : les séances respectent vos créneaux, incluent des pauses, priorisent les échéances proches et vos notions fragiles, et **chaque séance explique pourquoi elle est placée là**.
4. Ajustez librement : déplacer, supprimer, replanifier. Si une séance est manquée, **Replanifier** la replace sans surcharger les jours suivants.

Vues **jour, semaine, mois**. Rappels avant chaque séance.

**Pomodoro** : choisissez la durée de concentration (25 min par défaut), la pause courte (5 min) et le nombre de cycles. Chaque session terminée alimente vos statistiques réelles.

---

## 7. L'assistant et le mode professeur

*Assistant* : posez une question sur vos cours (« Explique-moi la photosynthèse simplement »). L'assistant répond **à partir de vos documents**, affiche les **extraits et pages** utilisés, et sépare clairement **ce qui vient de votre cours** de **ce qui est un complément général**.

- **Mode tuteur** : réponse directe et explications progressives.
- **Mode professeur** : il vous pose **une question à la fois**, vous donne un **indice** si vous bloquez, et adapte la difficulté à vos réponses. C'est le mode qui fait le plus progresser.
- **Mode examen blanc** : il vous interroge sans donner la réponse immédiatement.

Il ne fournit **jamais de lien vidéo ou de ressource inventée**. Seules de vraies ressources vérifiées sont proposées, et vous pouvez les mettre en favoris.

> L'assistant nécessite Internet : il ne fonctionne pas hors connexion, et l'application vous le dit avant que vous ne posiez la question.

---

## 8. Suivre ses progrès

*Statistiques* : cours importés, cartes maîtrisées/fragiles/non maîtrisées, révisions des 7 derniers jours, taux de réussite, temps de concentration, évolution des résultats aux évaluations. Ces chiffres viennent de votre activité réelle — aucune donnée de remplissage.

---

## 9. Votre compte, votre offre

*Profil* : nom, établissement, niveau, préférences (thème clair/sombre), sessions actives, mot de passe.

*Abonnement* : offre en cours, consommation du mois par rapport aux quotas (cours, générations, stockage), et changement d'offre. Les prix et quotas sont fixés par l'établissement et affichés en francs CFA.

**Payer au Cameroun** : Orange Money, MTN Mobile Money ou carte bancaire. Le paiement Mobile Money suit le parcours habituel (validation par code sur votre téléphone). **Une capture d'écran ne prouve jamais un paiement** : l'activation se fait uniquement à la réception de la confirmation signée du prestataire.

---

## 10. Vos données, vos droits

- **Exporter mes données** (profil → données personnelles) : un fichier JSON complet vous est fourni.
- **Supprimer mon compte** : suppression définitive après saisie de votre mot de passe et du mot `SUPPRIMER`.
- Vos documents sont **privés** : aucun autre utilisateur ni l'administration ne peut lire leur contenu.
- **Stockage hors connexion (Android)** : vous pouvez supprimer à tout moment les cours téléchargés sur le téléphone, sans rien perdre sur votre compte.

---

## 11. Questions fréquentes

**Mon PDF est refusé.** Vérifiez qu'il s'agit d'un vrai PDF ou d'une photo, et qu'il fait moins de 25 Mo. Un fichier renommé en `.pdf` est détecté et refusé.

**L'analyse reste bloquée sur « Extraction ».** Patientez une minute. Si le statut passe à *Échec*, rouvrez le cours et choisissez **Relancer l'analyse**. Si cela se répète, votre fichier est probablement protégé ou corrompu : ré-exportez-le.

**L'OCR a mal lu un mot.** L'application signale les passages douteux. Corrigez mentalement grâce à la photo d'origine, ou réimportez une photo plus nette.

**Puis-je utiliser l'application sans Internet ?** Oui pour ce que vous avez **déjà téléchargé** : résumés, fiches, cartes et révisions. Non pour l'import, la génération de contenus, l'assistant et la correction d'épreuve — l'application vous l'indique clairement et n'affiche aucune fonction trompeuse.

**Mes réponses faites hors connexion sont-elles perdues ?** Non : elles sont conservées et envoyées automatiquement au retour du réseau. Le profil affiche le nombre de réponses en attente.

**Mes cours servent-ils à entraîner une IA ?** Non. Vos documents privés ne sont jamais utilisés pour entraîner un modèle sans base légale explicite et consentement documenté.

**Qui peut voir mes notes ?** Vous seul. L'administration voit des statistiques agrégées, jamais le contenu de vos évaluations.

---

## 12. Raccourcis et astuces

- **Bibliothèque** : filtrez par matière et statut, archivez les cours terminés sans les supprimer.
- **Fiche** : imprimable (Ctrl+P) — format A4, idéal pour réviser sur papier.
- **Révision** : 10 minutes par jour valent mieux que 2 heures la veille.
- **Mode professeur** : utilisez-le sur les notions fragiles, pas sur celles déjà maîtrisées.
- **Android** : téléchargez vos cours avant un trajet ; vous pourrez réviser dans le bus.
- **Thème sombre** : *Profil → Préférences*.

Bon travail — comprendre, mémoriser, réussir.
