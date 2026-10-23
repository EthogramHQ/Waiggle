#!/usr/bin/env bash
# Essai complet de la pile de production, lancé par la CI à chaque pull request.
# On démarre la base, l'API et la porte d'entrée web avec le vrai docker-compose.yml et les vrais
# scripts du serveur (lib.sh, backup.sh, restore.sh), mais pour ruche.localhost et dans un dossier
# temporaire. Puis on vérifie, comme le ferait un visiteur :
#   - chaque adresse de l'appli mène à la bonne page, une adresse inconnue à « introuvable » (404) ;
#   - les en-têtes de sécurité et de cache ;
#   - les redirections (HTTP vers HTTPS, www) ;
#   - l'API derrière Caddy ;
#   - une visite dans un vrai navigateur (apps/app/scripts/site-check.mjs) ;
#   - une sauvegarde suivie d'une restauration rend exactement les données sauvegardées ;
#   - le parcours réel de deux membres, dans un vrai navigateur (apps/app/scripts/journey.mjs) :
#     inscription, photos, projet privé puis supprimé, compte supprimé, fichiers effacés ;
#   - infra/deploy.sh : trois déploiements successifs (dont un retour arrière) depuis un dépôt
#     d'images local, et un déploiement refusé qui ne laisse aucune trace.
#
# Usage (depuis la racine du dépôt) : infra/stack-test.sh
# Demande Docker, les dépendances (pnpm install) et Chromium
# (pnpm --filter @ruche/app exec playwright install chromium).
# Tout est supprimé à la fin.
set -Eeuo pipefail # -E : le piège ERR (plus bas) vaut aussi dans les fonctions

WORK=$(mktemp -d)
export RUCHE_HOME=$WORK
export RUCHE_REPO=$PWD
export RUCHE_SITE_ENV=$WORK/site.env
# shellcheck source=infra/lib.sh
source infra/lib.sh

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker rm -f stack-registry >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
# Une commande qui échoue sans passer par « die » est signalée avec sa ligne (annotation dans
# GitHub Actions), puis on montre l'état des conteneurs pour comprendre.
on_error() {
  printf '::error::stack-test.sh, ligne %s : %s\n' "$1" "$2"
  # L'état des conteneurs et la fin de leurs logs, en annotations (lisibles sans ouvrir les logs).
  { compose ps -a --format '{{.Service}} {{.State}} {{.Status}}'; compose logs --no-log-prefix --tail 8 web api; } 2>&1 |
    head -40 | sed 's/^/::warning::/' || true
}
trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR

# Échoue avec un message si deux valeurs diffèrent.
expect() {
  [ "$2" = "$3" ] || die "$1 : attendu « $3 », obtenu « $2 »"
}

# Les adresses de la pile d'essai. Comme waiggle.io et api.waiggle.io, l'appli et l'API sont sur le
# même « site » pour un navigateur : ruche.localhost et api.ruche.localhost. Avec localhost et
# api.localhost, ce ne serait pas le cas (localhost compte comme une fin de domaine, comme .io), et
# le navigateur garderait le cookie de session pour l'API : l'appli connectée ne marcherait pas.
APP_HOST=ruche.localhost
API_HOST=api.$APP_HOST

# curl vers notre serveur local : ces noms (et www.) mènent à cette machine, et -k accepte le
# certificat de Caddy, signé par sa propre autorité locale.
web() {
  curl -sS -k --max-time 20 \
    --resolve "$APP_HOST:443:127.0.0.1" --resolve "$APP_HOST:80:127.0.0.1" \
    --resolve "$API_HOST:443:127.0.0.1" --resolve "www.$APP_HOST:443:127.0.0.1" "$@"
}

# Le nombre de membres dans la base.
members() {
  echo 'select count(*) from "user";' | db_query
}

# Inscrit un membre par l'API, en passant par Caddy, puis clique sur le lien de vérification
# (en développement, les e-mails sont écrits dans les logs de l'API).
sign_up() {
  web -f -o /dev/null -X POST "https://$API_HOST/api/auth/sign-up/email" \
    -H 'Content-Type: application/json' -H "Origin: https://$APP_HOST" \
    -d "{\"name\":\"Essai\",\"email\":\"$1\",\"password\":\"stack-test-password\",\"inviteCode\":\"$INVITE_CODE\"}"
  sleep 1
  local link
  link=$(compose logs api 2>&1 | grep -o "https://$API_HOST/api/auth/verify-email[^ ]*" | tail -1)
  [ -n "$link" ] || die "lien de vérification introuvable pour $1"
  web -o /dev/null "$link"
}

step "Préparation : adresses locales, secrets tirés au hasard"
printf 'APP_DOMAIN=%s\nAPI_DOMAIN=%s\nIMAGE_PREFIX=ruche-stack-test\n' "$APP_HOST" "$API_HOST" >"$RUCHE_SITE_ENV"
# Le même modèle et les mêmes commandes que infra/server/bootstrap.sh sur le serveur.
INVITE_CODE=$(openssl rand -hex 8)
# ALLOW_CONSOLE_MAIL : les e-mails sont écrits dans les logs, pour y lire les liens de vérification.
sed -e "s/^POSTGRES_PASSWORD=\$/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" \
  -e "s/^ALLOW_CONSOLE_MAIL=\$/ALLOW_CONSOLE_MAIL=true/" \
  -e "s/^BETTER_AUTH_SECRET=\$/BETTER_AUTH_SECRET=$(openssl rand -hex 32)/" \
  -e "s/^SIGNUP_INVITE_CODE=\$/SIGNUP_INVITE_CODE=$INVITE_CODE/" \
  infra/.env.example >"$RUCHE_SECRETS"
printf 'RUCHE_VERSION=stack-test\nAPI_IMAGE=ruche-stack-test-api:stack-test\nWEB_IMAGE=ruche-stack-test-web:stack-test\n' \
  >"$RUCHE_DEPLOYED"

step "Construction des images et démarrage"
compose up -d --build --wait --wait-timeout 300
compose ps

step "L'API répond derrière Caddy, avec la version déployée"
# Caddy fabrique ses certificats locaux au démarrage : on lui laisse quelques secondes.
for _ in $(seq 1 30); do web -f -o /dev/null "https://$API_HOST/health" 2>/dev/null && break; sleep 1; done
expect "version de l'API" "$(web -f "https://$API_HOST/health" | node -e 'process.stdin.on("data", (d) => console.log(JSON.parse(d).version))')" stack-test

step "Chaque adresse mène à sa page"
# Le contenu attendu est lu directement dans l'image web, là où Caddy le prend.
page_in_image() {
  docker run --rm --entrypoint cat ruche-stack-test-web:stack-test "/srv/app/$1"
}
while read -r path file; do
  status=$(web -o "$WORK/body" -w '%{http_code}' "https://$APP_HOST$path")
  expect "code HTTP de $path" "$status" 200
  page_in_image "$file" | cmp -s - "$WORK/body" || die "$path ne sert pas $file"
  echo "ok : $path → $file"
done <<'EOF'
/ index.html
/sign-in sign-in.html
/sign-up sign-up.html
/account account.html
/account/delete account/delete.html
/projects/new projects/new.html
/projects/0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6 projects/[id].html
/projects/0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6/edit projects/[id]/edit.html
/members/AbC123_xyz-9 members/[id].html
/tags/claude-code tags/[slug].html
/licences-tierces.txt licences-tierces.txt
EOF

step "Une adresse inconnue mène à « introuvable », avec le code 404"
page_in_image +not-found.html >"$WORK/not-found"
for path in /nope /projects /projects/a/b/c /members /tags/a/b /sign-in/extra /_sitemap /catalogue.php; do
  status=$(web -o "$WORK/body" -w '%{http_code}' "https://$APP_HOST$path")
  expect "code HTTP de $path" "$status" 404
  cmp -s "$WORK/not-found" "$WORK/body" || die "$path ne sert pas la page introuvable"
  echo "ok : $path → 404"
done

step "En-têtes de sécurité et de cache"
headers_of() {
  web -o /dev/null -D - "$@" | tr -d '\r' | tr '[:upper:]' '[:lower:]'
}
for url in "https://$APP_HOST/" "https://$APP_HOST/nope"; do
  h=$(headers_of "$url")
  for expected in \
    "strict-transport-security: max-age=31536000; includesubdomains" \
    "x-content-type-options: nosniff" \
    "x-frame-options: deny" \
    "referrer-policy: strict-origin-when-cross-origin" \
    "cache-control: no-cache"; do
    grep -qx "$expected" <<<"$h" || die "$url : en-tête manquant « $expected »"
  done
  grep -q "^content-security-policy: default-src 'self'; script-src 'self' 'sha256-" <<<"$h" ||
    die "$url : CSP manquante"
  grep -q "connect-src 'self' blob: https://$API_HOST;" <<<"$h" || die "$url : la CSP n'autorise pas l'API"
  if grep -q '^server:' <<<"$h"; then die "$url : Caddy annonce son nom"; fi
  echo "ok : $url"
done
script=$(web "https://$APP_HOST/" | grep -o '/_expo/static/js/web/[^"]*\.js' | head -1)
[ -n "$script" ] || die "aucun script trouvé dans la page d'accueil"
grep -qx 'cache-control: public, max-age=31536000, immutable' <<<"$(headers_of "https://$APP_HOST$script")" ||
  die "$script : devrait être gardé un an par le navigateur"
echo "ok : $script gardé un an"

step "Redirections"
expect "HTTP → HTTPS" "$(web -o /dev/null -w '%{http_code} %{redirect_url}' "http://$APP_HOST/sign-in")" \
  "308 https://$APP_HOST/sign-in"
expect "www → domaine" "$(web -o /dev/null -w '%{http_code} %{redirect_url}' "https://www.$APP_HOST/sign-in?a=1")" \
  "301 https://$APP_HOST/sign-in?a=1"
echo "ok"

step "Les fichiers de la porte d'entrée ne peuvent pas être modifiés, Caddy ne tourne pas en root"
if compose exec -T web touch /srv/app/probe 2>/dev/null; then die "/srv/app est modifiable"; fi
[ "$(compose exec -T web id -u)" != 0 ] || die "Caddy tourne en root"
echo "ok"

step "Le réseau de la porte d'entrée parle IPv6 (sinon tous les visiteurs IPv6 auraient la même adresse)"
expect "IPv6 du réseau web" "$(docker network inspect ruche_web --format '{{.EnableIPv6}}')" true
echo "ok"

step "Dans un vrai navigateur : rien n'est bloqué par la CSP, aucune erreur dans les pages"
# Demande l'installation des dépendances (pnpm install) et de Chromium (voir la CI).
node apps/app/scripts/site-check.mjs "https://$APP_HOST"

step "Sauvegarde, puis restauration"
sign_up avant@example.com
compose exec -T api node -e "require('fs').writeFileSync('/app/media/avant.txt', 'x')"
expect "membres avant la sauvegarde" "$(members)" 1
infra/backup.sh essai
backup=$(find "$RUCHE_BACKUPS" -name '*-essai.db.dump' | head -1)
backup=${backup%.db.dump}
expect "droits de la sauvegarde" "$(stat -c '%a' "$backup.db.dump") $(stat -c '%a' "$backup.media.tar.gz")" "600 600"
# Des changements après la sauvegarde : ils doivent disparaître à la restauration.
sign_up apres@example.com
compose exec -T api node -e "require('fs').rmSync('/app/media/avant.txt'); require('fs').writeFileSync('/app/media/apres.txt', 'x')"
expect "membres après la sauvegarde" "$(members)" 2
# GITHUB_ACTIONS vide : ce refus est attendu, il ne doit pas apparaître comme une erreur de la CI.
if GITHUB_ACTIONS="" infra/restore.sh "$backup" 2>/dev/null; then die "la restauration doit exiger une confirmation"; fi
infra/restore.sh "$backup" --effacer-les-donnees-actuelles
expect "membres après la restauration" "$(members)" 1
compose exec -T api sh -c 'test -f /app/media/avant.txt' || die "avatar sauvegardé absent après restauration"
if compose exec -T api sh -c 'test -f /app/media/apres.txt'; then die "fichier postérieur toujours là"; fi
[ -n "$(find "$RUCHE_BACKUPS" -name '*-avant-restauration.db.dump')" ] || die "pas de sauvegarde avant restauration"
expect "version après restauration" "$(web -f "https://$API_HOST/health" | node -e 'process.stdin.on("data", (d) => console.log(JSON.parse(d).version))')" stack-test
echo "ok"

step "Le rôle d'administrateur de la modération (infra/grant-admin.sh)"
# Le membre restauré (avant@example.com, adresse vérifiée) reçoit le rôle, puis le perd ; sa ligne
# reste, datée de la révocation. Une adresse avec une apostrophe est refusée avant toute requête,
# une adresse inconnue échoue. GITHUB_ACTIONS vide : ces refus sont attendus.
admins() {
  echo "select count(*) from admin_member where revoked_at is null;" | db_query
}
if GITHUB_ACTIONS="" infra/grant-admin.sh "a'@b.io" 2>/dev/null; then die "une adresse avec une apostrophe a été acceptée"; fi
if GITHUB_ACTIONS="" infra/grant-admin.sh personne@example.com 2>/dev/null; then die "une adresse inconnue a été acceptée"; fi
expect "administrateurs après les refus" "$(admins)" 0
infra/grant-admin.sh AVANT@example.com
expect "administrateurs en fonction" "$(admins)" 1
infra/grant-admin.sh avant@example.com --revoke
expect "administrateurs après --revoke" "$(admins)" 0
expect "lignes gardées après --revoke" "$(echo 'select count(*) from admin_member;' | db_query)" 1
if GITHUB_ACTIONS="" infra/grant-admin.sh avant@example.com --revoke 2>/dev/null; then die "une seconde révocation a été acceptée"; fi
echo "ok"

step "Le parcours réel d'un membre, dans un vrai navigateur (apps/app/scripts/journey.mjs)"
# Deux comptes, un projet avec photos, privé puis supprimé, puis un compte supprimé : ce que voit
# chacun, et ce qui reste sur le disque. Le script lit les e-mails dans les logs de l'API, et liste
# les fichiers du dossier des médias, dans le conteneur lui-même. Son administrateur de la
# modération (tranche 7a) reçoit le rôle par le script de production, grant-admin.sh.
api_container=$(compose ps -q api)
JOURNEY_ADMIN_CMD=infra/grant-admin.sh \
  JOURNEY_INVITE_CODE=$INVITE_CODE \
  JOURNEY_MAIL_CMD="docker logs $api_container" \
  JOURNEY_MEDIA_CMD="docker exec $api_container find /app/media -name '*.webp'" \
  node apps/app/scripts/journey.mjs "https://$APP_HOST" "https://$API_HOST"

step "Déploiements avec infra/deploy.sh"
# Un dépôt d'images local (comme ghcr.io) et un dépôt Git local (comme GitHub), avec deux commits
# sur main. Les images sont celles construites plus haut.
docker run -d --name stack-registry -p 127.0.0.1:5000:5000 registry:2.8.3 >/dev/null
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:5000/v2/ >/dev/null 2>&1 && break; sleep 1; done
# Publie une image et renvoie sa référence par empreinte (dépôt@sha256:…).
publish() {
  local target=localhost:5000/ruche-stack-test-$1:essai digest
  docker tag "ruche-stack-test-$1:stack-test" "$target"
  digest=$(docker push "$target" | sed -n 's/.*digest: \(sha256:[0-9a-f]\{64\}\).*/\1/p')
  [ -n "$digest" ] || die "publication de l'image $1 dans le dépôt local"
  echo "localhost:5000/ruche-stack-test-$1@$digest"
}
api_ref=$(publish api)
web_ref=$(publish web)
git init --quiet --bare --initial-branch=main "$WORK/origin.git"
# La copie de la CI peut être « superficielle » (sans tout l'historique) : on l'accepte quand même.
git -C "$WORK/origin.git" config receive.shallowUpdate true
git push --quiet "$WORK/origin.git" HEAD:refs/heads/main
git clone --quiet "$WORK/origin.git" "$WORK/repo"
first=$(git -C "$WORK/repo" rev-parse HEAD)
git -C "$WORK/repo" -c user.name=Essai -c user.email=essai@example.com commit --quiet --allow-empty -m essai
git -C "$WORK/repo" push --quiet origin HEAD:main
second=$(git -C "$WORK/repo" rev-parse HEAD)
printf 'APP_DOMAIN=%s\nAPI_DOMAIN=%s\nIMAGE_PREFIX=localhost:5000/ruche-stack-test\n' "$APP_HOST" "$API_HOST" >"$RUCHE_SITE_ENV"
health_version() {
  web -f "https://$API_HOST/health" | node -e 'process.stdin.on("data", (d) => console.log(JSON.parse(d).version))'
}
for version in "$first" "$second" "$first"; do
  RUCHE_REPO=$WORK/repo "$WORK/repo/infra/deploy.sh" "$version" "$api_ref" "$web_ref"
  expect "version en ligne" "$(health_version)" "$version"
  expect "copie du dépôt" "$(git -C "$WORK/repo" rev-parse HEAD)" "$version"
  echo "ok : ${version:0:7} déployée"
done
[ -n "$(find "$RUCHE_BACKUPS" -name '*-avant-deploi.db.dump')" ] || die "pas de sauvegarde avant déploiement"
# Une image d'un autre dépôt d'images : refusée, et la copie du dépôt n'a pas bougé.
if GITHUB_ACTIONS="" RUCHE_REPO=$WORK/repo "$WORK/repo/infra/deploy.sh" "$second" "ailleurs.example/ruche-api@${api_ref#*@}" "$web_ref" 2>/dev/null; then
  die "une image d'un autre dépôt a été acceptée"
fi
expect "copie du dépôt après un refus" "$(git -C "$WORK/repo" rev-parse HEAD)" "$first"
expect "version après un refus" "$(health_version)" "$first"
echo "ok : refus sans trace"

printf '\n✅ Pile de production prête : pages, en-têtes, redirections, parcours de deux membres, sauvegarde, restauration et déploiement.\n'
