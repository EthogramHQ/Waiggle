#!/usr/bin/env bash
# Donne, ou retire, le rôle d'administrateur de la modération à un membre (tranche 7a). C'est le
# seul moyen de le donner : aucune route de l'API ne l'écrit. Procédure : docs/ops/moderation.md.
#
# Usage : infra/grant-admin.sh <adresse e-mail> [--revoke]
#   infra/grant-admin.sh louis@example.com            → administrateur (ou de nouveau, après --revoke)
#   infra/grant-admin.sh louis@example.com --revoke   → plus administrateur ; la ligne reste, datée
#                                                       de la révocation (l'historique des rôles)
#
# Règles (règle 19 de la relecture du plan) :
# - l'adresse est vérifiée en entier par une expression régulière AVANT toute requête : ni
#   apostrophe, ni espace, rien qui puisse sortir de la chaîne SQL ; elle entre ensuite dans la
#   requête par une variable psql (:'email'), que psql met lui-même entre apostrophes ;
# - la recherche ignore les majuscules (lower()) ; le compte doit avoir vérifié son adresse ;
# - aucune ligne trouvée : échec, avec un message ;
# - le journal du serveur note l'identifiant du membre, jamais son adresse.
set -euo pipefail
# shellcheck source=infra/lib.sh
source "$(dirname "$0")/lib.sh"

# Une adresse e-mail simple : des lettres, chiffres et . _ % + - avant l'arobase, un nom de domaine
# avec au moins un point après. Volontairement plus étroite que la norme : c'est un outil
# d'exploitation, pas un formulaire d'inscription.
EMAIL_PATTERN='^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'

main() {
  if [ $# -lt 1 ] || [ $# -gt 2 ]; then die "usage : infra/grant-admin.sh <adresse e-mail> [--revoke]"; fi
  local email=$1 action=grant
  if [ $# -eq 2 ]; then
    [ "$2" = "--revoke" ] || die "option inconnue : $2 (seule --revoke existe)"
    action=revoke
  fi
  [[ $email =~ $EMAIL_PATTERN ]] || die "adresse invalide (lettres, chiffres, . _ % + - et un domaine)"
  # En minuscules, comme la recherche (lower(email)).
  email=${email,,}
  take_lock

  # La requête lit l'adresse dans une variable psql (\set), et la cite avec :'email', qui l'écrit
  # comme une chaîne SQL correctement échappée. « now() at time zone 'UTC' » : l'heure UTC, comme
  # toutes les dates de la base (des timestamp sans fuseau).
  # L'écriture est enveloppée dans « with done as (…) select … » : psql n'affiche alors que
  # l'identifiant écrit (ou rien), sans la ligne « INSERT 0 1 » qu'il ajoute après une écriture.
  local sql
  if [ "$action" = grant ]; then
    # « on conflict … do update » : un ancien administrateur, révoqué, le redevient (sa ligne est
    # réutilisée, avec une nouvelle date).
    sql="with done as (
      insert into admin_member (user_id, granted_at, revoked_at)
      select id, now() at time zone 'UTC', null from \"user\"
      where lower(email) = :'email' and email_verified
      on conflict (user_id) do update set granted_at = excluded.granted_at, revoked_at = null
      returning user_id
    ) select user_id from done;"
  else
    sql="with done as (
      update admin_member set revoked_at = now() at time zone 'UTC'
      where revoked_at is null
        and user_id = (select id from \"user\" where lower(email) = :'email')
      returning user_id
    ) select user_id from done;"
  fi

  local id
  id=$(printf '\\set email %s\n%s\n' "'$email'" "$sql" | db_query)
  if [ -z "$id" ]; then
    if [ "$action" = grant ]; then
      die "aucun compte vérifié avec cette adresse"
    fi
    die "aucun administrateur en fonction avec cette adresse"
  fi

  # La trace : l'identifiant seulement, dans la sortie et dans le journal du système (logger écrit
  # dans journald, gardé plus longtemps que l'historique du terminal).
  local message
  if [ "$action" = grant ]; then message="Admin role granted to $id"; else message="Admin role revoked from $id"; fi
  echo "$message"
  if command -v logger >/dev/null 2>&1; then logger -t ruche-admin "$message" || true; fi
}

main "$@"
