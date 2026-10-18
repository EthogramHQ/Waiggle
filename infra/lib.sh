# Réglages et petites fonctions communs aux scripts du serveur (deploy.sh, backup.sh, restore.sh).
# Ce fichier n'est pas lancé seul : les scripts le chargent avec « source ».
#
# Sur le serveur, tout vit dans /srv/ruche :
#   repo/          une copie du dépôt, placée sur la version déployée
#   secrets.env    les secrets (mots de passe, clés), lisibles par leur seul propriétaire
#   deployed.env   la version déployée (RUCHE_VERSION=<numéro de commit>)
#   backups/       les sauvegardes
# Chaque chemin peut être changé par une variable d'environnement : la CI s'en sert pour tout
# essayer dans un dossier temporaire (infra/stack-test.sh).
# shellcheck shell=bash

RUCHE_HOME=${RUCHE_HOME:-/srv/ruche}
RUCHE_REPO=${RUCHE_REPO:-$RUCHE_HOME/repo}
RUCHE_SITE_ENV=${RUCHE_SITE_ENV:-$RUCHE_REPO/infra/site.env}
RUCHE_SECRETS=${RUCHE_SECRETS:-$RUCHE_HOME/secrets.env}
RUCHE_DEPLOYED=${RUCHE_DEPLOYED:-$RUCHE_HOME/deployed.env}
RUCHE_BACKUPS=${RUCHE_BACKUPS:-$RUCHE_HOME/backups}

# Arrête le script avec un message clair. Dans GitHub Actions, le message devient aussi une
# « annotation », visible directement sur la page de la vérification.
die() {
  printf 'ÉCHEC : %s\n' "$*" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then printf '::error::%s\n' "$*"; fi
  exit 1
}

# Annonce une étape, pour suivre ce qui se passe dans le terminal.
step() {
  printf '\n▶ %s\n' "$*"
}

# Les adresses publiques et le préfixe des images (APP_DOMAIN, API_DOMAIN, IMAGE_PREFIX).
# « set -a » exporte automatiquement les variables lues. Ce fichier ne contient aucun secret ;
# le fichier des secrets, lui, n'est jamais chargé dans le shell : seul Docker Compose le lit.
load_site() {
  [ -f "$RUCHE_SITE_ENV" ] || die "fichier introuvable : $RUCHE_SITE_ENV"
  set -a
  # shellcheck source=/dev/null
  . "$RUCHE_SITE_ENV"
  set +a
}

# Une valeur de la version déployée (RUCHE_VERSION, API_IMAGE, WEB_IMAGE), ou rien avant le tout
# premier déploiement.
deployed_value() {
  if [ -f "$RUCHE_DEPLOYED" ]; then
    sed -n "s/^$1=//p" "$RUCHE_DEPLOYED"
  fi
}

# Un seul de ces scripts à la fois (déploiement, sauvegarde, restauration) : la sauvegarde de la
# nuit ne doit pas tomber au milieu d'une restauration. flock pose un verrou sur un fichier et
# attend qu'il se libère (10 minutes au plus). Un script lancé par un autre (restore.sh lance
# backup.sh) profite du verrou de son parent : RUCHE_LOCKED le lui signale.
take_lock() {
  [ -z "${RUCHE_LOCKED:-}" ] || return 0
  mkdir -p "$RUCHE_HOME"
  # 9 : un numéro de « descripteur de fichier », une poignée ouverte sur le fichier du verrou.
  exec 9>>"$RUCHE_HOME/.lock" ||
    die "verrou $RUCHE_HOME/.lock inaccessible (créé par root ? sudo chown $(id -un) $RUCHE_HOME/.lock)"
  if ! flock -n 9; then
    echo "Un autre script (déploiement, sauvegarde ou restauration) tourne : attente, 10 minutes au plus…"
    flock -w 600 9 || die "l'autre script tourne toujours : réessayer plus tard"
  fi
  export RUCHE_LOCKED=1
}

# Docker Compose, avec tous les bons fichiers. Toujours passer par là, jamais par
# « docker compose » seul : il manquerait les adresses, les secrets ou la version.
compose() {
  [ -f "$RUCHE_SECRETS" ] || die "fichier des secrets introuvable : $RUCHE_SECRETS"
  [ -f "$RUCHE_DEPLOYED" ] || : >"$RUCHE_DEPLOYED"
  docker compose \
    --project-directory "$RUCHE_REPO/infra" \
    -f "$RUCHE_REPO/infra/docker-compose.yml" \
    --env-file "$RUCHE_SITE_ENV" \
    --env-file "$RUCHE_SECRETS" \
    --env-file "$RUCHE_DEPLOYED" \
    "$@"
}

# psql dans le conteneur de la base, la requête SQL lue sur l'entrée standard. Les $ entre
# apostrophes sont lus par le shell du conteneur : aucun mot de passe ne passe par ici.
# Exemple : echo 'select count(*) from "user";' | db_query
db_query() {
  # shellcheck disable=SC2016
  compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -v ON_ERROR_STOP=1'
}
