#!/usr/bin/env bash
# Essai complet de la pile de production, lancé par la CI à chaque pull request.
# On démarre la base, l'API et la porte d'entrée web avec le vrai docker-compose.yml et les vrais
# scripts du serveur (lib.sh, backup.sh, restore.sh), mais pour ruche.localhost et dans un dossier
# temporaire. Puis on vérifie, comme le ferait un visiteur :
#   - chaque adresse de l'appli mène à la bonne page, une adresse inconnue à « introuvable » (404) ;
#   - les en-têtes de sécurité et de cache ;
#   - les redirections (HTTP vers HTTPS, www, anciens domaines), qui ne mènent que chez nous ;
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

# Les deux étapes du navigateur (la visite, puis le parcours) tournent même si la première échoue :
# en R12, un défaut du parcours est resté caché derrière celui de la visite, et a coûté une CI de
# plus. Un échec à gauche d'un `||` ne déclenche pas le piège ERR ; il est noté ici, et le script
# échoue à la fin en nommant les étapes. Les autres vérifications s'arrêtent toujours au premier échec.
browser_failed=()

# Échoue avec un message si deux valeurs diffèrent.
expect() {
  [ "$2" = "$3" ] || die "$1 : attendu « $3 », obtenu « $2 »"
}

# Les adresses de la pile d'essai. Comme waiggle.com et api.waiggle.com, l'appli et l'API sont sur le
# même « site » pour un navigateur : ruche.localhost et api.ruche.localhost. Avec localhost et
# api.localhost, ce ne serait pas le cas (localhost compte comme une fin de domaine, comme .io), et
# le navigateur garderait le cookie de session pour l'API : l'appli connectée ne marcherait pas.
APP_HOST=ruche.localhost
API_HOST=api.$APP_HOST
# Les anciens domaines, qui ne font que rediriger (comme waiggle.io et api.waiggle.io).
OLD_HOST=old.localhost
OLD_API_HOST=api.$OLD_HOST

# curl vers notre serveur local : ces noms (et www.) mènent à cette machine, et -k accepte le
# certificat de Caddy, signé par sa propre autorité locale. --globoff : sans lui, curl lit les
# crochets d'une adresse (« /[lang]/rules », R12) comme une suite d'adresses à essayer (son
# « globbing ») et la refuse avant même de l'envoyer.
web() {
  curl -sS -k --globoff --max-time 20 \
    --resolve "$APP_HOST:443:127.0.0.1" --resolve "$APP_HOST:80:127.0.0.1" \
    --resolve "$API_HOST:443:127.0.0.1" --resolve "www.$APP_HOST:443:127.0.0.1" \
    --resolve "$OLD_HOST:443:127.0.0.1" --resolve "$OLD_HOST:80:127.0.0.1" \
    --resolve "www.$OLD_HOST:443:127.0.0.1" \
    --resolve "$OLD_API_HOST:443:127.0.0.1" --resolve "mta-sts.$APP_HOST:443:127.0.0.1" "$@"
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
    -d "{\"name\":\"Essai\",\"email\":\"$1\",\"password\":\"stack-test-password\",\"acceptRules\":true,\"ageDeclared\":true,\"inviteCode\":\"$INVITE_CODE\"}"
  sleep 1
  local link
  link=$(compose logs api 2>&1 | grep -o "https://$API_HOST/api/auth/verify-email[^ ]*" | tail -1)
  [ -n "$link" ] || die "lien de vérification introuvable pour $1"
  # Le lien ouvre aussi une session : son cookie est gardé dans $WORK/cookies-<adresse> (R12 : la
  # publication d'un projet public, plus bas, sans connexion de plus, que Better Auth compte).
  web -o /dev/null -c "$WORK/cookies-$1" "$link"
}

# Les en-têtes d'une réponse, en minuscules et sans retour chariot, pour les comparer simplement.
headers_of() {
  web -o /dev/null -D - "$@" | tr -d '\r' | tr '[:upper:]' '[:lower:]'
}

# Le code et la destination tels que Caddy les écrit : --path-as-is envoie le chemin sans le
# simplifier, et %header{location} lit l'en-tête brut (%{redirect_url} le normaliserait).
redirect_of() {
  web --path-as-is -o /dev/null -w '%{http_code} %header{location}' "$@"
}

# R12 : le marqueur de membre (cookie posé par l'appli web quand une session existe, voir
# infra/Caddyfile). Il ne donne aucun droit : il choisit seulement où Caddy envoie qui arrive.
MEMBER_MARKER='Cookie: waiggle_member=1'

step "Préparation : adresses locales, secrets tirés au hasard"
printf 'APP_DOMAIN=%s\nAPI_DOMAIN=%s\nLEGACY_APP_DOMAIN=%s\nLEGACY_API_DOMAIN=%s\nIMAGE_PREFIX=ruche-stack-test\n' \
  "$APP_HOST" "$API_HOST" "$OLD_HOST" "$OLD_API_HOST" >"$RUCHE_SITE_ENV"
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

step "Les journaux de la base n'écrivent ni la valeur d'une erreur, ni la requête refusée"
# R11 (relecture de sécurité S-C4) : une erreur de PostgreSQL peut citer une valeur (une adresse
# e-mail en double, par exemple) ; « terse » n'en garde que le message court. Et la requête qui a
# échoué n'est jamais recopiée dans le journal (« panic » : seulement pour une panne du serveur).
expect "log_error_verbosity" "$(echo 'show log_error_verbosity;' | db_query)" terse
expect "log_min_error_statement" "$(echo 'show log_min_error_statement;' | db_query)" panic
echo "ok"

step "Chaque adresse mène à sa page"
# Le contenu attendu est lu directement dans l'image web, là où Caddy le prend.
page_in_image() {
  docker run --rm --entrypoint cat ruche-stack-test-web:stack-test "/srv/app/$1"
}
# Avec le marqueur de membre : les anciennes adresses publiques (/projects/<id>, /rules…) servent
# alors la page des membres, sans redirection (R12). Sans lui, voir « Qui arrive où », plus bas.
while read -r path file; do
  status=$(web -H "$MEMBER_MARKER" -o "$WORK/body" -w '%{http_code}' "https://$APP_HOST$path")
  expect "code HTTP de $path" "$status" 200
  page_in_image "$file" | cmp -s - "$WORK/body" || die "$path ne sert pas $file"
  echo "ok : $path → $file"
done <<'EOF'
/feed feed.html
/sign-in sign-in.html
/sign-up sign-up.html
/account account.html
/account/delete account/delete.html
/projects/new projects/new.html
/projects/0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6 projects/[id].html
/projects/0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6/edit projects/[id]/edit.html
/projects/0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6/updates projects/[id]/updates.html
/members/AbC123_xyz-9 members/[id].html
/tags/claude-code tags/[slug].html
/rules rules.html
/privacy privacy.html
/legal legal.html
/accessibility accessibility.html
/licences-tierces.txt licences-tierces.txt
EOF

step "Les pages publiques : une adresse par langue, et leur tête écrite par Caddy (R12)"
# Caddy lit ces pages comme des gabarits (infra/Caddyfile, « templates ») : il y écrit la tête que
# l'API lui donne (titre, description, aperçu des liens, « noindex ») et la langue de <html>. Le
# reste du fichier, après </head>, arrive tel qu'il est dans l'image. Aucune instruction
# « [[waiggle … ]] » ne reste dans la page reçue.
public_page() { # public_page <adresse> <fichier> <langue attendue>
  local body expected
  expect "code HTTP de $1" "$(web -o "$WORK/body" -w '%{http_code}' "https://$APP_HOST$1")" 200
  body=$(cat "$WORK/body")
  expected=$(page_in_image "$2")
  [[ $body != *'[[waiggle'* ]] || die "$1 : une instruction de gabarit est restée dans la page"
  [ "${body#*</head>}" = "${expected#*</head>}" ] || die "$1 ne sert pas $2"
  grep -q '<title>' <<<"$body" || die "$1 : la tête de l'API n'a pas été écrite"
  # La langue que lit le navigateur : le premier « lang » de <html> (voir apps/app/app/+html.tsx).
  expect "langue de $1" "$(grep -o '<html[^>]*>' <<<"$body" | grep -o ' lang="[a-z]*"' | head -1)" " lang=\"$3\""
  echo "ok : $1 → $2 ($3)"
}
while read -r path file lang; do
  public_page "$path" "$file" "$lang"
done <<'EOF'
/fr/ fr/index.html fr
/en/ en/index.html en
/fr/rules fr/rules.html fr
/en/privacy en/privacy.html en
/fr/legal fr/legal.html fr
/en/accessibility en/accessibility.html en
/fr/projects/0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6 fr/projects/[id].html fr
/en/projects/0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6/updates en/projects/[id]/updates.html en
/en/members/AbC123_xyz-9 en/members/[id].html en
EOF
# Un projet inconnu : la tête neutre, avec « noindex », sans titre ni image de projet.
unknown=$(web "https://$APP_HOST/fr/projects/0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6")
grep -q '<meta name="robots" content="noindex">' <<<"$unknown" || die "projet inconnu : pas de « noindex » dans la tête"
if grep -q 'og:title' <<<"$unknown"; then die "projet inconnu : une balise d'aperçu dans la tête"; fi
# Une page publique dit son adresse canonique, sur le domaine du site (APP_URL de l'API).
grep -q '<link rel="canonical" href="https://'"$APP_HOST"'/fr/rules">' <<<"$(web "https://$APP_HOST/fr/rules")" ||
  die "/fr/rules : pas d'adresse canonique"
echo "ok : tête neutre d'un projet inconnu, adresse canonique d'une page publique"

step "Une adresse inconnue mène à « introuvable », avec le code 404"
page_in_image +not-found.html >"$WORK/not-found"
# /catalogue : un outil de développement, construit avec l'appli (audit de sécurité du 7/11/2026).
# --path-as-is envoie le chemin tel quel, sans en retirer les « /./ » : Caddy 2.11.7 servait
# /_sitemap.html/./ et /catalogue.html/./ (GHSA-25cw, corrigé en 2.11.9, montées du 12/11/2026).
# /catalogue.html/ et /%63atalogue (« c » encodé) : d'autres façons d'écrire le même nom.
for path in /nope /projects /projects/a/b/c /members /tags/a/b /sign-in/extra /_sitemap /_sitemap.html \
  /catalogue /catalogue.html /catalogue.php /catalogue.html/ /%63atalogue /_sitemap.html/./ \
  /catalogue.html/./ \
  /[lang]/rules /[lang] /%5Blang%5D/ /fr/../[lang]/rules /de/ /fr/sign-in /fr/feed \
  '/v1/public/head?path=%2Ffr%2F&lang=fr' /v1/public/projects/x /v1/public/sitemap; do
  # R12 : la copie générique des pages par langue n'est jamais servie (infra/Caddyfile,
  # « @generic_lang »), sous aucune écriture ; une langue inconnue, une page de membre sous une
  # langue non plus. Les relais vers l'API ne prennent que leurs adresses exactes : la tête n'est
  # demandée que par Caddy lui-même, aucune autre route de l'API ne passe par ce domaine.
  status=$(web --path-as-is -o "$WORK/body" -w '%{http_code}' "https://$APP_HOST$path")
  expect "code HTTP de $path" "$status" 404
  cmp -s "$WORK/not-found" "$WORK/body" || die "$path ne sert pas la page introuvable"
  echo "ok : $path → 404"
done
# Une écriture vers l'API par ce domaine : introuvable aussi (relecture de sécurité du plan, I3).
expect "POST /v1/public/reports par le domaine de l'appli" "$(web -o /dev/null -w '%{http_code}' -X POST \
  "https://$APP_HOST/v1/public/reports" -H "Origin: https://$APP_HOST" -H 'Content-Type: application/json' -d '{}')" 404
echo "ok : POST /v1/public/reports → 404"

step "En-têtes de sécurité et de cache"
# R12 : / ne fait plus que rediriger ; une page publique est un gabarit ; le repli d'une page
# publique, l'API arrêtée, est vérifié plus bas.
for url in "https://$APP_HOST/" "https://$APP_HOST/fr/" "https://$APP_HOST/en/projects/x" "https://$APP_HOST/nope"; do
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
script=$(web "https://$APP_HOST/fr/" | grep -o '/_expo/static/js/web/[^"]*\.js' | head -1)
[ -n "$script" ] || die "aucun script trouvé dans la page d'accueil"
grep -qx 'cache-control: public, max-age=31536000, immutable' <<<"$(headers_of "https://$APP_HOST$script")" ||
  die "$script : devrait être gardé un an par le navigateur"
echo "ok : $script gardé un an"
# L'adresse de repli de l'appli (config.ts) ne doit jamais finir dans le bundle publié : un lien
# partagé ou copié pointerait vers le PC du développeur (relecture de sécurité de R5a, sec-B7).
if web "https://$APP_HOST$script" | grep -q 'localhost:8081'; then
  die "$script : contient localhost:8081 (EXPO_PUBLIC_APP_URL absente à la construction ?)"
fi
echo "ok : $script sans adresse de développement"

# R18 : la compression à l'avance (infra/web/precompress.mjs, « precompressed br zstd » du
# Caddyfile). Le même script, demandé en brotli puis en zstd : mêmes en-têtes de cache et de type,
# « vary: accept-encoding », et une fois décompressé le même contenu que sans compression (même
# empreinte SHA-256). Node décompresse (curl n'a pas toujours brotli et zstd).
decoded_sha() { # decoded_sha <br|zstd> <adresse> : l'empreinte du corps reçu, décompressé
  web -H "Accept-Encoding: $1" "$2" | node -e '
    const z = require("node:zlib");
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => {
      const body = Buffer.concat(chunks);
      const plain = { br: z.brotliDecompressSync, zstd: z.zstdDecompressSync }[process.argv[1]](body);
      console.log(require("node:crypto").createHash("sha256").update(plain).digest("hex"));
    });' "$1"
}
same_headers() { # same_headers <br|zstd|identity> : les en-têtes à comparer, un par ligne
  headers_of -H "Accept-Encoding: $1" "https://$APP_HOST$script" |
    grep -E '^(content-type|cache-control|x-content-type-options|vary):'
}
for coding in br zstd; do
  grep -qx "content-encoding: $coding" <<<"$(headers_of -H "Accept-Encoding: $coding" "https://$APP_HOST$script")" ||
    die "$script : pas servi en $coding"
done
expect "$script : en-têtes en br et en zstd" "$(same_headers br)" "$(same_headers zstd)"
# Et les mêmes que sans compression (relecture de sécurité R18, A1) : un `Content-Type` changé sur
# les seuls fichiers précompressés ferait refuser le script par le navigateur (`nosniff`). La
# réponse non compressée n'a pas `vary` : on le retire des deux côtés.
expect "$script : en-têtes compressés comme sans compression" \
  "$(same_headers br | grep -v '^vary:')" "$(same_headers identity | grep -v '^vary:')"
grep -qx 'vary: accept-encoding' <<<"$(same_headers br)" || die "$script : « vary: accept-encoding » manquant"
plain_sha=$(web -H 'Accept-Encoding: identity' "https://$APP_HOST$script" | sha256sum | cut -d' ' -f1)
expect "$script : contenu en br" "$(decoded_sha br "https://$APP_HOST$script")" "$plain_sha"
expect "$script : contenu en zstd" "$(decoded_sha zstd "https://$APP_HOST$script")" "$plain_sha"
echo "ok : $script en br et zstd, mêmes en-têtes que sans compression, même contenu"
# Une page publique n'est jamais précompressée : Caddy la lit comme un gabarit à chaque visite.
page_br=$(headers_of -H 'Accept-Encoding: br' "https://$APP_HOST/fr/")
if grep -qx 'content-encoding: br' <<<"$page_br"; then die "/fr/ : précompressée en brotli"; fi
[[ $(web -H 'Accept-Encoding: br' "https://$APP_HOST/fr/") != *'[[waiggle'* ]] ||
  die "/fr/ : une instruction de gabarit est restée"
echo "ok : /fr/ jamais précompressée, gabarit lu"

step "Les moteurs de recherche : les pages publiques par langue, la connexion et l'inscription"
# R11 puis R12 (scénario, « Ce que lisent les moteurs ») : robots.txt (apps/app/public/robots.txt)
# propose ces adresses, et les anciennes qui y redirigent, écarte le reste, refuse tout aux robots
# d'entraînement et donne le plan du site ; l'en-tête X-Robots-Tag de Caddy dit « noindex »
# partout ailleurs, pour un moteur qui ne lirait pas robots.txt.
grep -qi '^content-type: text/plain' <<<"$(headers_of "https://$APP_HOST/robots.txt")" ||
  die "robots.txt : pas servi en text/plain"
robots=$(web -f "https://$APP_HOST/robots.txt" | tr -d '\r')
# Caddy le lit comme un gabarit, pour une seule instruction : le domaine du plan du site.
[[ $robots != *'[[waiggle'* ]] || die "robots.txt : une instruction de gabarit est restée"
expect "robots.txt sans son adresse de plan du site" "$(grep -v '^Sitemap: ' <<<"$robots")" \
  "$(tr -d '\r' <apps/app/public/robots.txt | grep -v '^Sitemap: ')"
grep -qx "Sitemap: https://$APP_HOST/sitemap.xml" <<<"$robots" || die "robots.txt : pas de plan du site à l'adresse du site"
grep -qx 'User-agent: \*' <<<"$robots" || die "robots.txt : pas de « User-agent: * »"
grep -qx 'User-agent: GPTBot' <<<"$robots" || die "robots.txt : les robots d'entraînement ne sont pas nommés"
grep -qx 'Disallow: /' <<<"$robots" || die "robots.txt : le reste du site n'est pas écarté (« Disallow: / »)"
# L'accueil seul (« /$ » : l'adresse exacte, pas tout ce qui commence par « / »).
grep -qx 'Allow: /\$' <<<"$robots" || die "robots.txt : l'accueil n'est pas proposé (« Allow: /\$ »)"
for path in /fr/ /en/ /sign-in /sign-up /rules /privacy /legal /accessibility; do
  # « [$]? » : un « $ » final permis (l'adresse exacte), jamais demandé.
  grep -Eqx "Allow: ${path}[\$]?" <<<"$robots" || die "robots.txt : $path n'est pas proposé"
done
for path in /fr/ /en/ /fr/rules /en/privacy /fr/projects/0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6 /sign-in /sign-up; do
  if grep -q '^x-robots-tag:.*noindex' <<<"$(headers_of "https://$APP_HOST$path")"; then
    die "$path : écarté des moteurs (X-Robots-Tag), alors qu'il doit pouvoir être trouvé"
  fi
done
# Les pages des membres, à leur ancienne adresse (avec le marqueur, elles ne redirigent pas).
for path in /feed /projects/0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6 /members/AbC123_xyz-9 /rules /account \
  /tags/claude-code /nope /[lang]/rules; do
  grep -q '^x-robots-tag:.*noindex' <<<"$(headers_of -H "$MEMBER_MARKER" "https://$APP_HOST$path")" ||
    die "$path : pas d'en-tête « X-Robots-Tag: noindex »"
done
echo "ok"

step "Le plan du site, relayé vers l'API (GET /v1/public/sitemap)"
h=$(headers_of "https://$APP_HOST/sitemap.xml")
grep -q '^http/[0-9.]* 200' <<<"$h" || die "/sitemap.xml : pas de réponse 200"
grep -q '^content-type: application/xml' <<<"$h" || die "/sitemap.xml : pas servi en XML"
sitemap=$(web -f "https://$APP_HOST/sitemap.xml")
grep -q '<urlset' <<<"$sitemap" || die "/sitemap.xml : ce n'est pas un plan du site"
grep -q "<loc>https://$APP_HOST/en/privacy</loc>" <<<"$sitemap" || die "/sitemap.xml : /en/privacy n'y est pas"
# Seuls GET et HEAD sont relayés.
expect "POST /sitemap.xml" "$(web -o /dev/null -w '%{http_code}' -X POST "https://$APP_HOST/sitemap.xml" -d x)" 404
echo "ok"

step "La politique MTA-STS des e-mails, et rien d'autre à son adresse"
# Le fichier exact du dépôt, en texte brut ; toute autre adresse de ce nom : 404.
web -D "$WORK/mta-headers" -o "$WORK/mta-sts.txt" "https://mta-sts.$APP_HOST/.well-known/mta-sts.txt"
cmp -s "$WORK/mta-sts.txt" infra/web/mta-sts.txt || die "mta-sts.txt : ce n'est pas infra/web/mta-sts.txt"
grep -qi '^content-type: text/plain' "$WORK/mta-headers" || die "mta-sts.txt : pas servi en text/plain"
expect "autre adresse de mta-sts" "$(web -o /dev/null -w '%{http_code}' "https://mta-sts.$APP_HOST/")" 404
echo "ok"

step "Redirections"
expect "HTTP → HTTPS" "$(web -o /dev/null -w '%{http_code} %{redirect_url}' "http://$APP_HOST/sign-in")" \
  "308 https://$APP_HOST/sign-in"
expect "www → domaine" "$(web -o /dev/null -w '%{http_code} %{redirect_url}' "https://www.$APP_HOST/sign-in?a=1")" \
  "301 https://$APP_HOST/sign-in?a=1"
echo "ok"

step "Qui arrive où : l'accueil, le Fil, et les anciennes adresses publiques (R12)"
# Sans le marqueur, l'accueil mène à la langue du navigateur (le français s'il n'en dit rien), et
# une ancienne adresse publique à la même page dans cette langue (301, ses paramètres gardés). Avec
# le marqueur, l'accueil mène au Fil, et l'ancienne adresse sert la page des membres (plus haut).
P=0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6
EN='Accept-Language: en-GB,en;q=0.9,fr;q=0.8'
while IFS='|' read -r label language path expected; do
  expect "$label" "$(redirect_of -H "Accept-Language: $language" "https://$APP_HOST$path")" "$expected"
done <<EOF
accueil, sans langue||/|302 /fr/
accueil, en anglais|en-GB,en;q=0.9,fr;q=0.8|/|302 /en/
accueil, français avant anglais|fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7|/|302 /fr/
accueil, allemand puis anglais|de-DE,de;q=0.9,en;q=0.8|/|302 /en/
accueil, une langue que l'appli n'a pas|de-DE,de;q=0.9|/|302 /fr/
accueil, « english » n'est pas « en »|english|/|302 /fr/
/fr sans barre|en|/fr|301 /fr/
/en sans barre||/en|301 /en/
un projet|fr-CA|/projects/$P|301 /fr/projects/$P
un projet, en anglais|en|/projects/$P|301 /en/projects/$P
la frise d'un projet|EN-us|/projects/$P/updates|301 /en/projects/$P/updates
une page de membre|de,en;q=0.5|/members/AbC123_xyz-9|301 /en/members/AbC123_xyz-9
les Règles, avec un paramètre|fr|/rules?from=mail|301 /fr/rules?from=mail
la Confidentialité, en-tête piégé|//evil.example|/privacy|301 /fr/privacy
les Mentions||/legal|301 /fr/legal
l'Accessibilité|en|/accessibility|301 /en/accessibility
EOF
expect "accueil d'un membre" "$(redirect_of -H 'Cookie: theme=dark; waiggle_member=1' "https://$APP_HOST/")" "302 /feed"
expect "accueil, marqueur d'une autre valeur" "$(redirect_of -H 'Cookie: waiggle_member=10' "https://$APP_HOST/")" "302 /fr/"
expect "projet d'un membre" "$(redirect_of -H "$MEMBER_MARKER" -H "$EN" "https://$APP_HOST/projects/$P")" "200 "
# Les pages des membres ne redirigent jamais, marqueur ou non : « Nouveau projet » n'est pas un projet.
for path in /projects/new /projects/$P/edit /feed /sign-in; do
  expect "$path sans marqueur" "$(redirect_of -H "$EN" "https://$APP_HOST$path")" "200 "
done
# Une redirection ne se garde pas : elle dépend du marqueur et de la langue.
grep -qx 'cache-control: no-cache' <<<"$(headers_of "https://$APP_HOST/projects/$P")" ||
  die "/projects/<id> : la redirection peut être gardée par le navigateur"
echo "ok"

step "Les anciens domaines renvoient vers les nouveaux, et seulement chez nous"
expect "ancien domaine" "$(redirect_of "https://$OLD_HOST/sign-in?code=a1")" "301 https://$APP_HOST/sign-in?code=a1"
expect "ancien www" "$(redirect_of "https://www.$OLD_HOST/projects/x")" "301 https://$APP_HOST/projects/x"
# L'ancien nom de l'API ne transmet rien à l'API : il redirige, même /health.
expect "ancienne API" "$(redirect_of "https://$OLD_API_HOST/health")" "308 https://$API_HOST/health"
expect "ancienne API, POST" "$(redirect_of -X POST "https://$OLD_API_HOST/v1/email/unsubscribe?token=x")" \
  "308 https://$API_HOST/v1/email/unsubscribe?token=x"
# En suivant la redirection, la méthode arrive intacte : un POST avec un faux jeton reçoit le refus
# de l'API (400), là où un GET aurait été renvoyé vers la page de l'appli. Avec -d (et non
# -X POST, que curl garde après n'importe quelle redirection), curl fait comme une messagerie :
# il ne garde le POST qu'après un 308.
expect "désinscription en un clic, redirigée" "$(web -L -o /dev/null -w '%{http_code}' \
  -d 'List-Unsubscribe=One-Click' "https://$OLD_API_HOST/v1/email/unsubscribe?token=x")" 400
# Redirections piégées : la destination reste toujours sur notre domaine.
for path in '//evil.example/' '/%5Cevil.example' '/\evil.example' '/..//evil.example'; do
  location=$(web --path-as-is -o /dev/null -w '%header{location}' "https://$OLD_HOST$path")
  [[ $location == "https://$APP_HOST/"* ]] || die "$path renvoie vers « $location »"
done
# Un en-tête Host inconnu : Caddy n'a aucun bloc pour ce nom, il ne redirige nulle part.
location=$(web -o /dev/null -w '%header{location}' -H 'Host: evil.example' "https://$OLD_HOST/x")
[ -z "$location" ] || die "un en-tête Host piégé obtient une redirection : « $location »"
# Les anciens noms passent aussi de HTTP à HTTPS, avant de rediriger.
expect "ancien domaine, HTTP → HTTPS" "$(redirect_of "http://$OLD_HOST/x")" "308 https://$OLD_HOST/x"
# HSTS reste sur les redirections (le navigateur l'a retenu pour ces noms), et Caddy n'y annonce
# pas son nom.
for url in "https://$OLD_HOST/" "https://$OLD_API_HOST/health" "https://www.$APP_HOST/"; do
  h=$(headers_of "$url")
  grep -qx "strict-transport-security: max-age=31536000; includesubdomains" <<<"$h" || die "$url : HSTS manquant"
  if grep -q '^server:' <<<"$h"; then die "$url : Caddy annonce son nom"; fi
done
# L'API refuse l'ancienne origine : écriture, connexion, et pré-vol CORS.
expect "écriture depuis l'ancienne origine" "$(web -o /dev/null -w '%{http_code}' -X PATCH "https://$API_HOST/v1/me" \
  -H "Origin: https://$OLD_HOST" -H 'Content-Type: application/json' -d '{}')" 403
expect "connexion depuis l'ancienne origine" "$(web -o /dev/null -w '%{http_code}' -X POST \
  "https://$API_HOST/api/auth/sign-in/email" -H "Origin: https://$OLD_HOST" -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"stack-test-password"}')" 403
# Le contrôle général de Better Auth sur ses POST ne joue qu'avec un cookie : un faux suffit.
expect "déconnexion depuis l'ancienne origine" "$(web -o /dev/null -w '%{http_code}' -X POST \
  "https://$API_HOST/api/auth/sign-out" -H "Origin: https://$OLD_HOST" -H 'Content-Type: application/json' \
  -H 'Cookie: __Secure-ruche.session_token=faux' -d '{}')" 403
preflight=$(headers_of -X OPTIONS "https://$API_HOST/v1/me" -H "Origin: https://$OLD_HOST" \
  -H 'Access-Control-Request-Method: PATCH')
if grep -q '^access-control-allow-origin:' <<<"$preflight"; then
  die "le pré-vol CORS accepte l'ancienne origine"
fi
echo "ok"

step "Les fichiers de la porte d'entrée ne peuvent pas être modifiés, Caddy ne tourne pas en root"
if compose exec -T web touch /srv/app/probe 2>/dev/null; then die "/srv/app est modifiable"; fi
[ "$(compose exec -T web id -u)" != 0 ] || die "Caddy tourne en root"
echo "ok"

step "Le réseau de la porte d'entrée parle IPv6 (sinon tous les visiteurs IPv6 auraient la même adresse)"
expect "IPv6 du réseau web" "$(docker network inspect ruche_web --format '{{.EnableIPv6}}')" true
echo "ok"

step "Les lectures d'un visiteur répondent par l'API, sans cookie (R12)"
# Un projet inconnu : le 404 de tout projet caché, sans attendre. Comme l'appli web, avec l'origine
# de l'appli et sans session.
expect "projet public inconnu" "$(web -o /dev/null -w '%{http_code}' -H "Origin: https://$APP_HOST" \
  "https://$API_HOST/v1/public/projects/0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6?lang=fr")" 404
expect "vitrine" "$(web -o /dev/null -w '%{http_code}' -H "Origin: https://$APP_HOST" \
  "https://$API_HOST/v1/public/showcase")" 200
echo "ok"

step "Dans un vrai navigateur : rien n'est bloqué par la CSP, aucune erreur dans les pages"
# Demande l'installation des dépendances (pnpm install) et de Chromium (voir la CI).
node apps/app/scripts/site-check.mjs "https://$APP_HOST" || browser_failed+=("visite (site-check.mjs)")

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

step "Rotation : chaque étiquette a sa borne d'âge, les fichiers refus-*.txt aussi"
# R11 (relecture de sécurité S-C5) : à chaque passage, la sauvegarde quotidienne comprise, une
# sauvegarde d'une autre étiquette (ici « manuel ») de plus de 30 jours part, avec les fichiers
# refus-*.txt d'une restauration (des identifiants de membres) ; plus récents, ils restent. Les
# dates des noms et celles des fichiers (touch -d) disent la même chose.
old=$(date -u -d '31 days ago' +%Y-%m-%d_%H%M%S)
recent=$(date -u -d '20 days ago' +%Y-%m-%d_%H%M%S)
aged() { # aged <il y a combien> <fichier>… : crée des fichiers vides, datés dans le passé
  local ago=$1
  shift
  for file in "$@"; do
    : >"$RUCHE_BACKUPS/$file"
    touch -d "$ago" "$RUCHE_BACKUPS/$file"
  done
}
old_files=("$old-manuel.db.dump" "$old-manuel.media.tar.gz" "refus-$old.txt")
recent_files=("$recent-manuel.db.dump" "$recent-manuel.media.tar.gz" "refus-$recent.txt")
aged '31 days ago' "${old_files[@]}"
aged '20 days ago' "${recent_files[@]}"
infra/backup.sh
for file in "${old_files[@]}"; do
  [ ! -e "$RUCHE_BACKUPS/$file" ] || die "$file : plus de 30 jours, toujours là après une sauvegarde quotidienne"
done
for file in "${recent_files[@]}"; do
  [ -e "$RUCHE_BACKUPS/$file" ] || die "$file : 20 jours seulement, effacé trop tôt"
done
[ -n "$(find "$RUCHE_BACKUPS" -name '*-essai.db.dump')" ] || die "la sauvegarde « essai » du jour a disparu"
rm -f -- "${recent_files[@]/#/$RUCHE_BACKUPS/}"
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

step "Un projet public : son titre reste du texte, jamais une instruction de Caddy (R12)"
# Relecture de sécurité du plan, B1 : Caddy relit la tête donnée par l'API comme un gabarit. Un
# titre qui ressemble à une instruction (ici, lire une variable du serveur) doit s'afficher tel
# quel. Le membre restauré (avant@example.com) publie en « Public » avec la session ouverte par son
# lien de vérification (sign_up), puis le projet est supprimé : le parcours ne le voit jamais.
jar=$WORK/cookies-avant@example.com
# Les accents graves font partie du titre, ils ne doivent pas être exécutés par le shell.
# shellcheck disable=SC2016
title='[[waiggle env `APP_DOMAIN`]]'
project=$(web -f -b "$jar" -X POST "https://$API_HOST/v1/projects" -H "Origin: https://$APP_HOST" \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"$title\",\"pitch\":\"Un compte à rebours.\",\"primaryCategory\":\"home-garden\",\"visibility\":\"web\"}" |
  node -e 'process.stdin.on("data", (d) => console.log(JSON.parse(d).id))')
[ -n "$project" ] || die "le projet public n'a pas été publié"
page=$(web -f "https://$APP_HOST/fr/projects/$project")
shown=$(grep -o '<title>[^<]*</title>' <<<"$page" | head -1)
[[ $shown == *'&#91;&#91;waiggle env'* ]] || die "titre du projet public : « $shown »"
if grep -q "<title>$APP_HOST" <<<"$page"; then die "le titre du projet a été exécuté par Caddy : « $shown »"; fi
grep -q '<meta property="og:title"' <<<"$page" || die "projet public : pas d'aperçu de lien dans la tête"
if grep -q '<meta name="robots" content="noindex">' <<<"$page"; then die "projet public marqué « noindex »"; fi
echo "ok : $shown"

step "Le compte d'exemples (infra/mark-example.sh, R12b)"
# Le membre restauré (avant@example.com) devient un compte d'exemples : l'auteur de son projet public
# porte alors `example: true` dans la réponse de l'API ; --revoke efface la ligne, et le champ
# disparaît (absent, jamais `false`). Une adresse avec une apostrophe est refusée avant toute
# requête, une adresse inconnue échoue. GITHUB_ACTIONS vide : ces refus sont attendus.
example_of() { # le champ `example` de l'auteur du projet public, tel qu'un visiteur le lit
  web -f -H "Origin: https://$APP_HOST" "https://$API_HOST/v1/public/projects/$project" |
    node -e 'process.stdin.on("data", (d) => console.log(String(JSON.parse(d).author.example)))'
}
if GITHUB_ACTIONS="" infra/mark-example.sh "a'@b.io" 2>/dev/null; then die "une adresse avec une apostrophe a été acceptée"; fi
if GITHUB_ACTIONS="" infra/mark-example.sh personne@example.com 2>/dev/null; then die "une adresse inconnue a été acceptée"; fi
expect "auteur ordinaire" "$(example_of)" undefined
infra/mark-example.sh AVANT@example.com
expect "auteur d'exemples" "$(example_of)" true
infra/mark-example.sh avant@example.com --revoke
expect "auteur après --revoke" "$(example_of)" undefined
expect "lignes après --revoke" "$(echo 'select count(*) from example_account;' | db_query)" 0
if GITHUB_ACTIONS="" infra/mark-example.sh avant@example.com --revoke 2>/dev/null; then die "un second retrait a été accepté"; fi
echo "ok"

step "L'API arrêtée : les pages publiques restent lisibles, avec leurs en-têtes de sécurité (R12)"
# Relecture de sécurité du plan, I1 : sans tête (l'instruction échoue), Caddy sert le fichier tel
# qu'il est dans l'image (repli « handle_errors 500 502 503 »), avec le code 200 et la CSP. Le
# plan du site, lui, ne peut pas être écrit.
compose stop api
for pair in "/fr/privacy fr/privacy.html" "/en/projects/$project en/projects/[id].html"; do
  read -r path file <<<"$pair"
  h=$(web -D - -o "$WORK/body" "https://$APP_HOST$path" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
  grep -q '^http/[0-9.]* 200' <<<"$h" || die "$path, API arrêtée : pas de réponse 200"
  grep -q "^content-security-policy: default-src 'self'; script-src 'self' 'sha256-" <<<"$h" ||
    die "$path, API arrêtée : CSP manquante"
  grep -qx 'x-frame-options: deny' <<<"$h" || die "$path, API arrêtée : en-têtes de sécurité manquants"
  if grep -q '^etag:' <<<"$h"; then die "$path, API arrêtée : le repli garde une empreinte (ETag)"; fi
  page_in_image "$file" | cmp -s - "$WORK/body" || die "$path, API arrêtée : ne sert pas $file"
  echo "ok : $path → $file, sans tête"
done
expect "/sitemap.xml, API arrêtée" "$(web -o /dev/null -w '%{http_code}' "https://$APP_HOST/sitemap.xml")" 502
compose start api
for _ in $(seq 1 60); do web -f -o /dev/null "https://$API_HOST/health" 2>/dev/null && break; sleep 1; done
expect "version de l'API, redémarrée" "$(web -f "https://$API_HOST/health" | node -e 'process.stdin.on("data", (d) => console.log(JSON.parse(d).version))')" stack-test
expect "suppression du projet public" "$(web -o /dev/null -w '%{http_code}' -b "$jar" -X DELETE \
  "https://$API_HOST/v1/projects/$project" -H "Origin: https://$APP_HOST")" 204
echo "ok"

step "Le parcours réel d'un membre, dans un vrai navigateur (apps/app/scripts/journey.mjs)"
# Deux comptes, un projet avec photos, privé puis supprimé, puis un compte supprimé : ce que voit
# chacun, et ce qui reste sur le disque. Le script lit les e-mails dans les logs de l'API, et liste
# les fichiers du dossier des médias, dans le conteneur lui-même. Son administrateur de la
# modération (tranche 7a) reçoit le rôle par le script de production, grant-admin.sh.
api_container=$(compose ps -q api)
# R11 : Inès s'inscrit, puis « a oublié d'accepter » les règles, pour voir l'écran « Accepter ».
# Aucune route ne retire un accord : ce petit script, écrit dans le dossier temporaire de l'essai
# (jamais sur le serveur), efface ses lignes d'accord. L'adresse est vérifiée avant la requête, puis
# passée à psql par une variable (:'email'), qui l'écrit comme une chaîne SQL échappée.
cat >"$WORK/forget-rules.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
source "$RUCHE_REPO/infra/lib.sh"
[[ ${1:-} =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "adresse invalide"
printf '\\set email %s\n%s\n' "'${1,,}'" \
  "delete from rules_acceptance where user_id = (select id from \"user\" where lower(email) = :'email');" |
  db_query >/dev/null
SCRIPT
chmod +x "$WORK/forget-rules.sh"
JOURNEY_FORGET_RULES_CMD="$WORK/forget-rules.sh" \
  JOURNEY_ADMIN_CMD=infra/grant-admin.sh \
  JOURNEY_INVITE_CODE=$INVITE_CODE \
  JOURNEY_MAIL_CMD="docker logs $api_container" \
  JOURNEY_MEDIA_CMD="docker exec $api_container find /app/media -name '*.webp'" \
  node apps/app/scripts/journey.mjs "https://$APP_HOST" "https://$API_HOST" ||
  browser_failed+=("parcours (journey.mjs)")

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
printf 'APP_DOMAIN=%s\nAPI_DOMAIN=%s\nLEGACY_APP_DOMAIN=%s\nLEGACY_API_DOMAIN=%s\nIMAGE_PREFIX=localhost:5000/ruche-stack-test\n' \
  "$APP_HOST" "$API_HOST" "$OLD_HOST" "$OLD_API_HOST" >"$RUCHE_SITE_ENV"
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

if ((${#browser_failed[@]} > 0)); then
  die "échec dans le navigateur : ${browser_failed[*]}"
fi

printf '\n✅ Pile de production prête : pages, en-têtes, redirections, parcours de deux membres, sauvegarde, restauration et déploiement.\n'
