#!/usr/bin/env bash
# Fait d'un compte un compte d'exemples, ou le rend ordinaire (tranche R12b, « Les exemples ») :
# l'équipe y publie des projets fictifs pour remplir la vitrine de l'accueil, et l'appli les montre
# avec une pastille « Exemple ». C'est le seul moyen de poser ce marquage : aucun écran ni aucune
# route de l'API ne l'écrit. Copié de infra/grant-admin.sh, dont il reprend les règles.
#
# Usage : infra/mark-example.sh <adresse e-mail> [--revoke]
#   infra/mark-example.sh bot@example.com            → compte d'exemples (rien ne change s'il l'est déjà)
#   infra/mark-example.sh bot@example.com --revoke   → compte ordinaire ; la ligne est effacée
#
# Règles :
# - l'adresse est vérifiée en entier par une expression régulière AVANT toute requête : ni
#   apostrophe, ni espace, rien qui puisse sortir de la chaîne SQL ; elle entre ensuite dans la
#   requête par une variable psql (:'email'), que psql met lui-même entre apostrophes ;
# - la recherche ignore les majuscules (lower()) ; le compte doit avoir vérifié son adresse ;
# - aucune ligne trouvée : échec, avec un message ;
# - le journal du serveur note l'identifiant du membre, jamais son adresse.
set -euo pipefail
# shellcheck source=infra/lib.sh
source "$(dirname "$0")/lib.sh"

# La même adresse simple que grant-admin.sh : des lettres, chiffres et . _ % + - avant l'arobase, un
# nom de domaine avec au moins un point après.
EMAIL_PATTERN='^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'

main() {
  if [ $# -lt 1 ] || [ $# -gt 2 ]; then die "usage : infra/mark-example.sh <adresse e-mail> [--revoke]"; fi
  local email=$1 action=mark
  if [ $# -eq 2 ]; then
    [ "$2" = "--revoke" ] || die "option inconnue : $2 (seule --revoke existe)"
    action=revoke
  fi
  [[ $email =~ $EMAIL_PATTERN ]] || die "adresse invalide (lettres, chiffres, . _ % + - et un domaine)"
  # En minuscules, comme la recherche (lower(email)).
  email=${email,,}
  take_lock

  # Comme grant-admin.sh : l'adresse dans une variable psql (\set), citée par :'email' ; l'heure
  # UTC (« now() at time zone 'UTC' »), comme toutes les dates de la base ; l'écriture enveloppée
  # dans « with done as (…) select … », pour que psql n'affiche que l'identifiant écrit (ou rien).
  local sql
  if [ "$action" = mark ]; then
    # « on conflict … do update » : un compte déjà marqué le reste, et l'identifiant est rendu quand
    # même (un « do nothing » ne rendrait rien, et le script croirait le compte inconnu). La date du
    # premier marquage est gardée.
    sql="with done as (
      insert into example_account (user_id, marked_at)
      select id, now() at time zone 'UTC' from \"user\"
      where lower(email) = :'email' and email_verified
      on conflict (user_id) do update set marked_at = example_account.marked_at
      returning user_id
    ) select user_id from done;"
  else
    # Un marquage n'est pas un droit : rien à garder, la ligne s'efface.
    sql="with done as (
      delete from example_account
      where user_id = (select id from \"user\" where lower(email) = :'email')
      returning user_id
    ) select user_id from done;"
  fi

  local id
  id=$(printf '\\set email %s\n%s\n' "'$email'" "$sql" | db_query)
  if [ -z "$id" ]; then
    if [ "$action" = mark ]; then
      die "aucun compte vérifié avec cette adresse"
    fi
    die "aucun compte d'exemples avec cette adresse"
  fi

  # La trace : l'identifiant seulement, dans la sortie et dans le journal du système (logger écrit
  # dans journald, gardé plus longtemps que l'historique du terminal).
  local message
  if [ "$action" = mark ]; then message="Example account marked: $id"; else message="Example account revoked: $id"; fi
  echo "$message"
  if command -v logger >/dev/null 2>&1; then logger -t ruche-example "$message" || true; fi
}

main "$@"
