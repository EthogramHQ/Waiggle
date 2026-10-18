#!/usr/bin/env bash
# Sauvegarde la base de données et les fichiers des membres (avatars), dans /srv/ruche/backups.
#
# Usage : infra/backup.sh [étiquette]
#   infra/backup.sh                → sauvegarde « quotidien » (lancée chaque nuit par le minuteur)
#   infra/backup.sh avant-deploi   → sauvegarde faite par deploy.sh avant chaque mise à jour
#
# Chaque sauvegarde, ce sont deux fichiers portant la même date :
#   2026-10-13_033000-quotidien.db.dump      la base (format de pg_dump, relu par pg_restore)
#   2026-10-13_033000-quotidien.media.tar.gz les avatars
# (la rotation, plus bas, s'appuie sur ce format exact : date_heure-étiquette)
# Ils ne sont lisibles que par leur propriétaire : ils contiennent les données des membres.
#
# Rotation automatique : 14 jours de sauvegardes quotidiennes, les 5 dernières des autres.
# C'est le seul endroit où des sauvegardes sont effacées.
set -euo pipefail
# shellcheck source=infra/lib.sh
source "$(dirname "$0")/lib.sh"

main() {
  local label=${1:-quotidien}
  [[ $label =~ ^[a-z0-9-]+$ ]] || die "étiquette invalide : $label (lettres minuscules, chiffres, tirets)"
  take_lock

  # umask 077 : les fichiers créés ne sont lisibles que par leur propriétaire.
  umask 077
  mkdir -p "$RUCHE_BACKUPS"
  local base
  base="$RUCHE_BACKUPS/$(date +%Y-%m-%d_%H%M%S)-$label"

  step "Base de données → $(basename "$base").db.dump"
  # pg_dump tourne DANS le conteneur de la base, avec ses propres variables (utilisateur, nom de
  # la base) : aucun mot de passe ne passe par ce script. -Fc : format compressé de PostgreSQL.
  # On écrit d'abord dans un fichier « .partiel », renommé seulement si tout s'est bien passé :
  # une sauvegarde interrompue ne peut pas passer pour une bonne.
  # shellcheck disable=SC2016 # les $ sont lus par le shell du conteneur, pas par celui-ci
  compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$base.db.dump.partiel"
  # Relecture : pg_restore --list lit le sommaire de la sauvegarde ; il échoue si elle est abîmée.
  compose exec -T db pg_restore --list <"$base.db.dump.partiel" >/dev/null
  mv "$base.db.dump.partiel" "$base.db.dump"

  step "Avatars → $(basename "$base").media.tar.gz"
  # Un conteneur jetable (« run --rm ») monte le même volume que l'API et en fait une archive.
  # Il fonctionne même si l'API est arrêtée.
  compose run --rm --no-deps -T --entrypoint tar api -C /app/media -czf - . >"$base.media.tar.gz.partiel"
  gzip -t "$base.media.tar.gz.partiel" # vérifie que l'archive est lisible
  mv "$base.media.tar.gz.partiel" "$base.media.tar.gz"

  step "Rotation"
  # Quotidiennes : on garde 14 jours. -mtime +13 : modifiées il y a plus de 13 jours pleins.
  # Les noms complets (date_heure-étiquette) : « deploi » ne doit pas toucher « avant-deploi ».
  local stamp='????-??-??_??????'
  find "$RUCHE_BACKUPS" -maxdepth 1 -type f -name "$stamp-quotidien.*" -mtime +13 -print -delete
  # Les autres (avant-deploi, avant-restauration…) : on garde les 5 dernières de chaque étiquette.
  if [ "$label" != quotidien ]; then
    find "$RUCHE_BACKUPS" -maxdepth 1 -type f -name "$stamp-$label.db.dump" -printf '%f\n' |
      sort -r | tail -n +6 | while read -r old; do
        rm -v -- "$RUCHE_BACKUPS/$old" "$RUCHE_BACKUPS/${old%.db.dump}.media.tar.gz"
      done
  fi
  # Une sauvegarde interrompue laisse un fichier « .partiel » : inutile, on le retire.
  find "$RUCHE_BACKUPS" -maxdepth 1 -type f -name '*.partiel' -mmin +60 -print -delete

  printf '\nSauvegarde terminée : %s.{db.dump,media.tar.gz}\n' "$base"
}

main "$@"
