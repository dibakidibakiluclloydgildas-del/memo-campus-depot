#!/usr/bin/env bash
# =============================================================================
# MÉMO CAMPUS — vérification avant de partager l'application avec un testeur
#
# Usage :  ./scripts/pret_pour_partage.sh
# Sortie  : contrôle chaque prérequis et affiche les adresses à transmettre.
# Le script ne modifie rien : il se contente de lire l'état réel des services.
# =============================================================================
set -uo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000}"
DEMO_EMAIL="${DEMO_STUDENT_EMAIL:-etudiant@demo.memo-campus.cm}"
DEMO_PASSWORD="${DEMO_STUDENT_PASSWORD:-MemoCampus2026!}"

ok=0; ko=0
pass() { printf '  \033[32m✅\033[0m %s\n' "$1"; ok=$((ok+1)); }
fail() { printf '  \033[31m❌\033[0m %s\n' "$1"; ko=$((ko+1)); }
warn() { printf '  \033[33m⚠️\033[0m  %s\n' "$1"; }

json() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(\"d$1\"))" 2>/dev/null; }

echo "=============================================================="
echo " MÉMO CAMPUS — contrôle avant partage"
echo " API : $API_URL   |   Web : $WEB_URL"
echo "=============================================================="

# --- 1. API ------------------------------------------------------------------
echo
echo "1. API"
if health=$(curl -s --max-time 5 "$API_URL/api/health"); then
  status=$(printf '%s' "$health" | json "['status']")
  db=$(printf '%s' "$health" | python3 -c "import sys,json;d=json.load(sys.stdin);print(next((c['ok'] for c in d.get('checks',[]) if c['name']=='postgres'), 'absent'))" 2>/dev/null || true)
  if [ -n "$status" ]; then
    pass "API joignable (statut : $status)"
    if [ "$db" = "True" ] || [ "$db" = "true" ]; then
      pass "Base de données connectée"
    else
      warn "État de la base non confirmé (champ checks.database = ${db:-absent})"
    fi
    ai=$(printf '%s' "$health" | json "['ai']['provider']" || true)
    [ "$ai" = "demo" ] && warn "IA en mode démonstration : les tests verront des contenus extractifs (c'est attendu, pas une panne)"
  else
    fail "L'API répond mais sans statut exploitable"
  fi
else
  fail "API injoignable sur $API_URL — lancez : npm run dev:api"
fi

# --- 2. Compte de démonstration ---------------------------------------------
echo
echo "2. Compte de démonstration"
login=$(curl -s --max-time 8 -X POST "$API_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASSWORD\"}")
token=$(printf '%s' "$login" | json "['token']")
if [ -n "$token" ] && [ "$token" != "None" ]; then
  pass "Connexion possible : $DEMO_EMAIL"
  me=$(curl -s --max-time 8 "$API_URL/api/auth/me" -H "Authorization: Bearer $token")
  plan=$(printf '%s' "$me" | json "['planCode']")
  docs=$(curl -s --max-time 8 "$API_URL/api/documents?pageSize=50" -H "Authorization: Bearer $token" | json "['items'].__len__()")
  pass "Offre : ${plan:-inconnue} · cours déjà présents : ${docs:-?}"
else
  fail "Connexion impossible — la base de démonstration est probablement vide : npm run db:seed"
fi

# --- 3. Offres (prix et quotas en base) -------------------------------------
echo
echo "3. Offres configurées"
plans=$(curl -s --max-time 5 "$API_URL/api/billing/plans")
count=$(printf '%s' "$plans" | json "['plans'].__len__()" || echo 0)
if [ "${count:-0}" -ge 1 ] 2>/dev/null; then
  pass "$count offre(s) publiée(s) — les prix et quotas sont administrables"
else
  fail "Aucune offre publiée : lancez npm run db:seed (sinon les quotas échouent)"
fi

# --- 4. Web ------------------------------------------------------------------
echo
echo "4. Application Web"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$WEB_URL/")
[ "$code" = "200" ] && pass "Page d'accueil accessible (HTTP 200)" || fail "Page d'accueil : HTTP $code — lancez npm run dev:web"
demo=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 -X POST "$WEB_URL/api/session" \
  -H 'Content-Type: application/json' -d '{"action":"demo"}')
case "$demo" in
  200) pass "Accès invité en un clic : actif" ;;
  403) warn "Accès invité désactivé (ALLOW_DEMO_LOGIN=false) : transmettez les identifiants de démo" ;;
  *)   warn "Accès invité : réponse HTTP $demo" ;;
esac

# --- 5. Adresses à transmettre ----------------------------------------------
echo
echo "5. Adresses à transmettre"
lan=$(hostname -I 2>/dev/null | awk '{print $1}')
echo "  • Depuis cet espace de travail : utilisez le lien de prévisualisation du port 3000"
echo "  • Même Wi-Fi          : http://${lan:-<IP-locale>}:3000"
echo "  • Depuis Internet     : npx localtunnel --port 3000   (ou cloudflared tunnel --url http://localhost:3000)"
echo
echo "  Pour l'application Android :"
echo "    EXPO_PUBLIC_API_URL=http://${lan:-<IP-locale>}:4000 npx expo start        # même Wi-Fi"
echo "    EXPO_PUBLIC_API_URL=https://<tunnel-api> npx expo start --tunnel          # à distance (Expo Go)"
echo "    eas build --platform android --profile partage                            # APK (adresse d'API figée)"

echo
echo "=============================================================="
printf ' RÉSULTAT : %d contrôle(s) réussi(s), %d échec(s)\n' "$ok" "$ko"
echo "=============================================================="
[ "$ko" -eq 0 ] || echo " Corrigez les échecs ci-dessus avant d'envoyer le lien."
