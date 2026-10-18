#!/usr/bin/env bash
# Test « de fumée » de l'image Docker de l'API : on la démarre comme en production (système de
# fichiers en lecture seule, vraie base PostgreSQL), puis on vérifie l'essentiel de bout en bout.
# Le nom vient de l'électronique : on branche l'appareil et on regarde s'il en sort de la fumée.
#
# Usage (depuis la racine du dépôt, une fois l'image construite) :
#   docker build -f apps/api/Dockerfile -t ruche-api:ci .
#   infra/smoke-test.sh ruche-api:ci
# Lancé par la CI à chaque pull request. Tout est supprimé à la fin.
set -euo pipefail

IMAGE=${1:?usage: infra/smoke-test.sh <image>}
API=http://localhost:3000
APP=http://localhost:8081 # adresse de l'appli web par défaut, la seule origine autorisée
WORK=$(mktemp -d)
# Un code d'invitation tiré au hasard : l'API refuse les codes d'exemple publiés dans le dépôt.
INVITE=$(openssl rand -hex 8)

cleanup() {
  docker rm -f smoke-api smoke-db >/dev/null 2>&1 || true
  docker volume rm smoke-media >/dev/null 2>&1 || true
  docker network rm smoke >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

step() { printf '\n▶ %s\n' "$1"; }

step "Base de données"
docker network create smoke >/dev/null
docker run -d --name smoke-db --network smoke \
  -e POSTGRES_USER=ruche -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=ruche \
  pgvector/pgvector:pg17 >/dev/null
for _ in $(seq 1 60); do docker exec smoke-db pg_isready -U ruche -d ruche >/dev/null 2>&1 && break; sleep 1; done

step "API, avec les mêmes protections que dans infra/docker-compose.yml"
docker run -d --name smoke-api --network smoke -p 3000:3000 \
  --read-only --tmpfs /tmp --memory 1g -v smoke-media:/app/media \
  --cap-drop ALL --security-opt no-new-privileges \
  -e DATABASE_URL=postgres://ruche:smoke@smoke-db:5432/ruche \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  -e PUBLIC_API_URL=$API -e APP_URL=$APP \
  -e SIGNUP_INVITE_CODE="$INVITE" -e ALLOW_CONSOLE_MAIL=true \
  "$IMAGE" >/dev/null
for _ in $(seq 1 60); do curl -fsS $API/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS $API/health

step "Le code de l'API ne peut pas être modifié, le dossier des avatars si"
if docker exec smoke-api node -e "require('fs').writeFileSync('/app/dist/probe', 'x')" 2>/dev/null; then
  echo "ÉCHEC : /app/dist est modifiable" && exit 1
fi
docker exec smoke-api node -e "require('fs').writeFileSync('/app/media/probe', 'x')"
echo "ok"

step "Sans le code d'invitation, l'inscription est refusée"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/api/auth/sign-up/email \
  -H 'Content-Type: application/json' -H "Origin: $APP" \
  -d '{"name":"Smoke","email":"smoke@example.com","password":"smoke-test-password"}')
test "$STATUS" = 403
echo "ok"

step "Inscription, puis lien de vérification (les e-mails sont écrits dans les logs)"
curl -fsS -o /dev/null -X POST $API/api/auth/sign-up/email \
  -H 'Content-Type: application/json' -H "Origin: $APP" \
  -d "{\"name\":\"Smoke\",\"email\":\"smoke@example.com\",\"password\":\"smoke-test-password\",\"inviteCode\":\"$INVITE\"}"
sleep 1
LINK=$(docker logs smoke-api 2>&1 | grep -o "$API/api/auth/verify-email[^ ]*" | tail -1)
curl -fsS -o /dev/null -c "$WORK/cookies" "$LINK"
echo "ok"

step "Envoi d'un avatar : sharp (binaire Alpine) le ré-encode en WebP 512 × 512, visible des seuls membres"
# La photo de test est fabriquée par sharp, dans le conteneur lui-même.
docker exec smoke-api node -e "import('sharp').then(({ default: sharp }) => sharp({ create: { width: 900, height: 600, channels: 3, background: '#f4b400' } }).jpeg().toBuffer()).then((b) => process.stdout.write(b))" >"$WORK/photo.jpg"
AVATAR_URL=$(curl -fsS -b "$WORK/cookies" -H "Origin: $APP" -F "avatar=@$WORK/photo.jpg;type=image/jpeg" \
  $API/v1/me/avatar | node -e "let d = ''; process.stdin.on('data', (c) => { d += c }).on('end', () => console.log(JSON.parse(d).avatarUrl))")
# Les images sont réservées aux membres connectés : on la lit avec la session (-b, le cookie)…
curl -fsS -b "$WORK/cookies" -o "$WORK/avatar.webp" -w '%{content_type}\n' "$AVATAR_URL" | grep -qx 'image/webp'
test "$(head -c 4 "$WORK/avatar.webp")" = "RIFF" # début de tout fichier WebP
# … et sans session, la même adresse répond « introuvable ».
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$AVATAR_URL")
test "$STATUS" = "404" || { echo "avatar visible sans session : $STATUS"; exit 1; }
echo "ok : $AVATAR_URL"

step "Photo d'un projet : WebP 1 600 px au plus et ThumbHash (la bibliothèque est bien dans l'image)"
PROJECT_ID=$(curl -fsS -b "$WORK/cookies" -H "Origin: $APP" -H 'Content-Type: application/json' \
  -d '{"title":"Fumée","pitch":"Un projet de test"}' $API/v1/projects |
  node -e "let d = ''; process.stdin.on('data', (c) => { d += c }).on('end', () => console.log(JSON.parse(d).id))")
# La réponse est le projet mis à jour ; on en garde l'adresse de la photo, sa taille et son ThumbHash.
VISUAL=$(curl -fsS -b "$WORK/cookies" -H "Origin: $APP" -F "visual=@$WORK/photo.jpg;type=image/jpeg" -F slot=gallery \
  "$API/v1/projects/$PROJECT_ID/visuals" |
  node -e "let d = ''; process.stdin.on('data', (c) => { d += c }).on('end', () => { const v = JSON.parse(d).visuals[0]; console.log(v.url, v.width, v.height, v.thumbhash) })")
read -r VISUAL_URL VISUAL_WIDTH VISUAL_HEIGHT THUMBHASH <<<"$VISUAL"
test "$VISUAL_WIDTH x $VISUAL_HEIGHT" = "900 x 600" # une petite photo n'est jamais agrandie
test -n "$THUMBHASH"
curl -fsS -b "$WORK/cookies" -o "$WORK/visual.webp" -w '%{content_type}\n' "$VISUAL_URL" | grep -qx 'image/webp'
test "$(head -c 4 "$WORK/visual.webp")" = "RIFF"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$VISUAL_URL")
test "$STATUS" = "404" || { echo "photo visible sans session : $STATUS"; exit 1; }
echo "ok : $VISUAL_URL ($THUMBHASH)"

step "Une modification venue d'un autre site est refusée"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -b "$WORK/cookies" -X PATCH $API/v1/me \
  -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -d '{"bio":"x"}')
test "$STATUS" = 403
echo "ok"

printf '\n✅ Image prête pour la production.\n'
