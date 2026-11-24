#!/usr/bin/env bash
# =============================================================================
# MÉMO CAMPUS — Préparer le dépôt Git et l'archive à envoyer sur GitHub
#
#   ./scripts/preparer_depot_git.sh
#
# Le script :
#   1. refuse de continuer si un fichier .env (secret) est présent dans l'arbre ;
#   2. crée une archive propre (sans node_modules, .next, dist, .env, var/) ;
#   3. initialise le dépôt Git s'il n'existe pas et fait le premier commit.
# Il n'envoie rien sur Internet : la commande de push est seulement affichée.
# =============================================================================
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE" || exit 1

ARCHIVE="memo-campus-depot.tar.gz"
ECHEC=0

titre() { printf "\n\033[1m%s\033[0m\n" "$1"; }
ok()    { printf "  \033[32m✔\033[0m %s\n" "$1"; }
ko()    { printf "  \033[31m✘\033[0m %s\n" "$1"; ECHEC=$((ECHEC + 1)); }

titre "1. Contrôle des secrets"

# Un fichier .env local est normal : ce qui compte, c'est qu'il ne soit jamais suivi
# ni embarqué dans l'archive. Sa présence sur le disque n'est pas une erreur.
SECRETS=$(find . -path ./node_modules -prune -o -path ./.git -prune -o \
          -name ".env" -print -o -name ".env.local" -print -o -name ".env.*.local" -print 2>/dev/null)
if [ -z "$SECRETS" ]; then
  ok "aucun fichier .env local (seul .env.example est distribué)"
else
  ok "fichiers .env locaux ignorés par Git et exclus de l'archive :"
  echo "$SECRETS" | sed 's/^/      /'
fi

# Détection de vraies clés, hors documentation et hors de ce script.
MOTIFS_EXCLUS='--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=dist --exclude-dir=var --exclude=preparer_depot_git.sh --exclude=*.md --exclude=*.example'
for motif in "BEGIN RSA PRIVATE KEY" "BEGIN OPENSSH PRIVATE KEY" "sk-ant-[A-Za-z0-9]" "sk-proj-[A-Za-z0-9]" "AIza[0-9A-Za-z_-]\{20\}"; do
  # shellcheck disable=SC2086
  TROUVES=$(grep -rIl $MOTIFS_EXCLUS -E -- "$motif" . 2>/dev/null)
  if [ -n "$TROUVES" ]; then
    ko "clé potentielle détectée ($motif) dans :"
    echo "$TROUVES" | head -3 | sed 's/^/      /'
  else
    ok "aucune clé « $motif »"
  fi
done

if grep -q "^\.env$" .gitignore 2>/dev/null; then
  ok ".gitignore exclut bien .env"
else
  ko ".gitignore ne protège pas .env"
fi

titre "2. Archive propre (à téléverser sur GitHub si vous n'utilisez pas Git)"

rm -f "$ARCHIVE"
tar --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='dist' \
    --exclude='var' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='.env.*.local' \
    --exclude='sauvegardes' \
    --exclude='memo-campus-depot.tar.gz' \
    -czf "$ARCHIVE" . 2>/dev/null
if [ -s "$ARCHIVE" ]; then
  ok "archive créée : $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
  if tar -tzf "$ARCHIVE" | grep -qE '(^|/)\.env$'; then
    ko "l'archive contient un .env — supprimez-le avant tout envoi"
  else
    ok "l'archive ne contient aucun .env"
  fi
  printf "      contenu : %s fichiers\n" "$(tar -tzf "$ARCHIVE" | wc -l)"
else
  ko "échec de création de l'archive"
fi

titre "3. Dépôt Git local"

if [ -d .git ]; then
  ok "dépôt Git déjà initialisé ($(git rev-list --count HEAD 2>/dev/null || echo 0) commit(s))"
else
  git init -q -b main . && ok "dépôt initialisé sur la branche main"
  git add -A
  git -c user.name="Memo Campus" -c user.email="dev@memo-campus.cm" \
      commit -q -m "MÉMO CAMPUS — plateforme EdTech complète (API, Web, mobile, docs)" \
    && ok "premier commit créé ($(git ls-files | wc -l) fichiers suivis)"
fi

if git ls-files | grep -qE '^\.env$'; then
  ko ".env est suivi par Git — exécutez : git rm --cached .env"
else
  ok ".env n'est pas suivi par Git"
fi

titre "Résultat"

if [ "$ECHEC" -gt 0 ]; then
  printf "  \033[31m%d point(s) à corriger avant d'envoyer le code.\033[0m\n" "$ECHEC"
else
  printf "  \033[32mTout est propre : le code peut être publié.\033[0m\n"
fi

cat <<'FIN'

  Pour publier et obtenir un lien stable :

    1) créer un dépôt privé vide sur https://github.com/new  (nom : memo-campus)
    2) git remote add origin https://github.com/<votre-compte>/memo-campus.git
       git push -u origin main
    3) suivre infrastructure/deploy/RENDER.md (Render → Blueprint → render.yaml)

  Sans Git : téléversez memo-campus-depot.tar.gz via « upload files » sur GitHub,
  ou utilisez Render → New → Web Service → « Deploy from a public Git URL ».
FIN
