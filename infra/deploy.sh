#!/usr/bin/env bash
# Met en ligne une version de l'appli sur le serveur, ou revient à une version précédente.
# D'habitude, on ne le lance pas soi-même : infra/deploy-from-pc.sh vérifie d'abord, depuis le
# PC, que les images ont bien été construites par la CI de main, puis l'appelle par SSH.
#
# Usage : infra/deploy.sh <commit> <image de l'API> <image web>
#   <commit>        le numéro complet (40 caractères) d'un commit de main ;
#   <image …>       l'image vérifiée, désignée par son empreinte et non par une étiquette :
#                   ghcr.io/ethogramhq/waiggle-api@sha256:… (une étiquette peut être déplacée,
#                   une empreinte désigne toujours exactement le même contenu).
#
# Les étapes :
#   1. vérifier que le commit est sur main, et que les images viennent du bon dépôt ;
#   2. placer la copie du dépôt sur ce commit (les fichiers d'infra de cette version) ;
#   3. télécharger les images ;
#   4. sauvegarder la base et les avatars (les migrations s'appliquent au démarrage de l'API) ;
#   5. relancer les conteneurs qui ont changé ;
#   6. vérifier que l'API répond avec ce numéro de version ;
#   7. supprimer les images inutilisées depuis plus d'une semaine.
# Si quelque chose échoue avant l'étape 5, rien n'a changé : la copie du dépôt revient où elle
# était. Après, revenir en arrière, c'est déployer la version précédente (affichée à la fin).
set -euo pipefail
# shellcheck source=infra/lib.sh
source "$(dirname "$0")/lib.sh"

main() {
  local sha=${1:-} api_image=${2:-} web_image=${3:-}
  [[ $sha =~ ^[0-9a-f]{40}$ ]] ||
    die "usage : infra/deploy.sh <commit (40 caractères)> <image API @sha256:…> <image web @sha256:…>"
  take_lock
  local previous previous_checkout
  previous=$(deployed_value RUCHE_VERSION)

  step "1. Le commit ${sha:0:7} est-il sur main ?"
  cd "$RUCHE_REPO"
  # Le serveur ne se modifie jamais à la main : tout changement passe par le dépôt.
  [ -z "$(git status --porcelain)" ] || die "la copie du dépôt a été modifiée sur le serveur ($RUCHE_REPO) : git status"
  git fetch --quiet origin main
  git cat-file -e "$sha^{commit}" 2>/dev/null || die "commit inconnu : $sha"
  git merge-base --is-ancestor "$sha" origin/main || die "ce commit n'est pas sur main : on ne déploie que ce qui a été relu et fusionné"
  previous_checkout=$(git rev-parse HEAD)

  # Jusqu'au lancement (étape 5), un échec remet la copie du dépôt où elle était. « trap … EXIT »
  # exécute une commande à la sortie du script, qu'il réussisse ou qu'il échoue.
  LAUNCHED=no
  # shellcheck disable=SC2064 # la valeur de previous_checkout est fixée ici, volontairement
  trap "[ \"\$LAUNCHED\" = yes ] || git -C '$RUCHE_REPO' checkout --quiet --detach '$previous_checkout'" EXIT

  step "2. La copie du dépôt passe à ${sha:0:7}"
  git checkout --quiet --detach "$sha"
  load_site
  # Les images doivent venir du bon dépôt d'images (infra/site.env), désignées par leur empreinte.
  local part image
  for part in api web; do
    image=$api_image
    [ "$part" = api ] || image=$web_image
    [[ $image == "$IMAGE_PREFIX-$part@sha256:"* && ${image##*@sha256:} =~ ^[0-9a-f]{64}$ ]] ||
      die "image $part attendue sous la forme $IMAGE_PREFIX-$part@sha256:<empreinte>, reçu : « $image »"
  done
  echo "ok"

  step "3. Téléchargement des images"
  docker pull --quiet "$api_image"
  docker pull --quiet "$web_image"
  compose pull --quiet db

  step "4. Sauvegarde avant la mise à jour"
  if [ -n "$(compose ps --status running --quiet db 2>/dev/null)" ]; then
    "$RUCHE_REPO/infra/backup.sh" avant-deploi
  else
    echo "La base ne tourne pas encore (premier déploiement) : rien à sauvegarder."
  fi

  step "5. Lancement de la version ${sha:0:7}"
  # On écrit la version dans un fichier temporaire, puis on le renomme : le fichier n'est jamais
  # à moitié écrit, même si le script est interrompu.
  printf 'RUCHE_VERSION=%s\nAPI_IMAGE=%s\nWEB_IMAGE=%s\n' "$sha" "$api_image" "$web_image" >"$RUCHE_DEPLOYED.tmp"
  mv "$RUCHE_DEPLOYED.tmp" "$RUCHE_DEPLOYED"
  LAUNCHED=yes
  # --wait : attend que chaque conteneur se déclare en bonne santé. --remove-orphans : arrête les
  # conteneurs d'un service qui n'existe plus dans docker-compose.yml.
  if ! compose up -d --no-build --remove-orphans --wait --wait-timeout 300; then
    compose ps
    die "la version ${sha:0:7} ne démarre pas. Revenir en arrière : infra/deploy-from-pc.sh ${previous:-<commit précédent>}"
  fi

  step "6. L'API répond-elle avec la bonne version ?"
  local running
  running=$(compose exec -T api node -e \
    "fetch('http://127.0.0.1:3000/health').then((r) => r.json()).then((h) => console.log(h.version))")
  [ "$running" = "$sha" ] || die "l'API annonce la version « $running » au lieu de $sha"
  echo "ok : $running"
  # Depuis Internet, en passant par Caddy et le HTTPS. Avant que le DNS pointe vers le serveur,
  # ou pendant l'obtention des certificats, ceci peut échouer : ce n'est qu'un avertissement.
  if curl -fsS --max-time 15 -o /dev/null "https://$API_DOMAIN/health" &&
    curl -fsS --max-time 15 -o /dev/null "https://$APP_DOMAIN/"; then
    echo "ok : https://$APP_DOMAIN et https://$API_DOMAIN répondent"
  else
    echo "AVERTISSEMENT : https://$APP_DOMAIN ou https://$API_DOMAIN ne répond pas encore (DNS, certificats ?)"
  fi
  # Les anciens domaines renvoient vers les nouveaux (infra/Caddyfile) : on lit le code et la
  # destination de la redirection, sans la suivre.
  local legacy_app=${LEGACY_APP_DOMAIN:-} legacy_api=${LEGACY_API_DOMAIN:-} answer
  if [ -n "$legacy_app" ] && [ -n "$legacy_api" ]; then
    answer="$(curl -s --max-time 15 -o /dev/null -w '%{http_code} %header{location}' "https://$legacy_app/" || true) $(
      curl -s --max-time 15 -o /dev/null -w '%{http_code} %header{location}' "https://$legacy_api/health" || true)"
    if [ "$answer" = "301 https://$APP_DOMAIN/ 308 https://$API_DOMAIN/health" ]; then
      echo "ok : $legacy_app et $legacy_api renvoient vers les nouveaux domaines"
    else
      echo "AVERTISSEMENT : redirections des anciens domaines inattendues (« $answer »)"
    fi
  fi
  # Les images sont réservées aux membres : une vraie image, demandée sans session, doit répondre
  # « introuvable ». On prend une photo de projet (ou, sinon, un avatar) dans la base ; sa clé est
  # vérifiée avant d'en faire une adresse. Sans aucune image en base, rien à vérifier.
  local key status
  key=$(db_query <<<"select storage_key from project_media union all select avatar_key from profile where avatar_key is not null limit 1;")
  if [[ $key =~ ^(avatars|visuals)/[0-9a-f-]{36}\.webp$ ]]; then
    status=$(curl -s --max-time 15 -o /dev/null -w '%{http_code}' "https://$API_DOMAIN/media/$key" || true)
    case $status in
      404) echo "ok : une image de membre est introuvable sans session" ;;
      200) die "une image de membre est visible sans session : revenir en arrière avec infra/deploy-from-pc.sh ${previous:-<commit précédent>}" ;;
      *) echo "AVERTISSEMENT : image de membre sans session, réponse « $status » (DNS, certificats ?)" ;;
    esac
  fi

  step "7. Nettoyage des images inutilisées depuis plus d'une semaine"
  # Celles de la version en cours sont utilisées, donc gardées. Revenir à une version plus
  # ancienne retélécharge simplement ses images.
  docker image prune --all --force --filter "until=168h" >/dev/null

  printf '\nVersion %s en ligne.\n' "$sha"
  if [ -n "$previous" ] && [ "$previous" != "$sha" ]; then
    printf 'Pour revenir à la version précédente, depuis le PC : infra/deploy-from-pc.sh %s\n' "$previous"
  fi
}

# « exit » juste après : le script change de version pendant qu'il tourne (git checkout), Bash ne
# doit plus rien lire du fichier une fois main terminée.
main "$@"
exit
