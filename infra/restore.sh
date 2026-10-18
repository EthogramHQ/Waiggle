#!/usr/bin/env bash
# Remet le serveur dans l'état d'une sauvegarde : la base de données ET les avatars.
# Tout ce qui a changé depuis cette sauvegarde est perdu : c'est fait pour réparer une erreur ou
# revenir en arrière après une mise à jour ratée (voir docs/ops/serveur.md). À ne lancer qu'avec
# l'accord explicite de Louis.
#
# Usage : infra/restore.sh <sauvegarde> --effacer-les-donnees-actuelles
#   <sauvegarde> : le début commun des deux fichiers, sans l'extension, par exemple
#   /srv/ruche/backups/2026-10-13_033000-quotidien
# Le second mot est obligatoire : on ne remplace pas les données des membres par erreur.
#
# Prudence à chaque étape :
#   - l'état actuel est d'abord sauvegardé (étiquette « avant-restauration ») ;
#   - la sauvegarde est restaurée À CÔTÉ (une base et un dossier à part), sans toucher aux
#     données actuelles ; si elle est abîmée, on s'arrête là et rien n'a changé ;
#   - seulement ensuite, l'API s'arrête et l'on échange l'ancien et le nouveau.
set -euo pipefail
# shellcheck source=infra/lib.sh
source "$(dirname "$0")/lib.sh"

main() {
  local base=${1:-}
  base=${base%.db.dump}
  base=${base%.media.tar.gz}
  [ -n "$base" ] || die "usage : infra/restore.sh <sauvegarde> --effacer-les-donnees-actuelles"
  [ "${2:-}" = --effacer-les-donnees-actuelles ] ||
    die "ajouter --effacer-les-donnees-actuelles pour confirmer : les données actuelles seront remplacées"
  [ -f "$base.db.dump" ] || die "introuvable : $base.db.dump"
  [ -f "$base.media.tar.gz" ] || die "introuvable : $base.media.tar.gz"
  take_lock

  step "Vérification des fichiers de la sauvegarde"
  compose exec -T db pg_restore --list <"$base.db.dump" >/dev/null
  gzip -t "$base.media.tar.gz"

  step "Sauvegarde de l'état actuel, au cas où"
  "$RUCHE_REPO/infra/backup.sh" avant-restauration

  # Les $ entre apostrophes sont lus par le shell du conteneur de la base, qui connaît
  # POSTGRES_USER et POSTGRES_DB : aucun mot de passe ne passe par ce script.
  # shellcheck disable=SC2016
  local spare='"${POSTGRES_DB}_restauration"'

  step "Base de données, restaurée à côté de l'actuelle"
  # shellcheck disable=SC2016
  compose exec -T db sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists $spare && createdb -U \"\$POSTGRES_USER\" $spare"
  # shellcheck disable=SC2016
  if ! compose exec -T db sh -c "pg_restore -U \"\$POSTGRES_USER\" -d $spare --no-owner --exit-on-error" <"$base.db.dump"; then
    compose exec -T db sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists $spare" || true
    die "la sauvegarde ne se restaure pas. Rien n'a changé : le site tourne avec ses données actuelles."
  fi

  step "Avatars, déballés à côté des actuels"
  # Un conteneur jetable monte le volume des avatars et y déballe l'archive dans un dossier caché.
  compose run --rm --no-deps -T --entrypoint sh api -c \
    'rm -rf /app/media/.restauration && mkdir /app/media/.restauration && tar -C /app/media/.restauration -xzf -' \
    <"$base.media.tar.gz"

  step "Arrêt de l'API (plus personne n'écrit), puis échange"
  compose stop api
  # La base actuelle est supprimée, la base restaurée prend son nom. --force : coupe les
  # connexions encore ouvertes. Les deux -c sont deux commandes séparées : PostgreSQL refuse de
  # supprimer une base au milieu d'une transaction.
  # shellcheck disable=SC2016
  compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" \
    -c "ALTER DATABASE \"${POSTGRES_DB}_restauration\" RENAME TO \"$POSTGRES_DB\""' ||
    die "échange des bases interrompu : la base restaurée est dans <POSTGRES_DB>_restauration (voir docs/ops/serveur.md)"
  compose run --rm --no-deps -T --entrypoint sh api -c \
    'find /app/media -mindepth 1 -maxdepth 1 ! -name .restauration -exec rm -rf {} \; &&
     find /app/media/.restauration -mindepth 1 -maxdepth 1 -exec mv {} /app/media/ \; &&
     rmdir /app/media/.restauration' ||
    die "base restaurée, mais l'échange des avatars s'est interrompu : ils sont dans le dossier caché .restauration du volume des avatars (voir docs/ops/serveur.md)"

  step "Redémarrage de l'API"
  compose up -d --wait api

  printf '\nRestauration terminée depuis %s\n' "$base"
}

main "$@"
