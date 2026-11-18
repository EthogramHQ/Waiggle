#!/usr/bin/env bash
# L'outil du serveur de développement (installé en /usr/local/bin/ruche-dev par bootstrap.sh,
# étape « services »). Le PC l'appelle par SSH (ssh ruche-dev ruche-dev …).
#
#   ruche-dev prepare <branche> <commit>          copie de travail de la branche à ce commit,
#                                                 dépendances installées si le lockfile a changé
#   ruche-dev run <branche> <commit> -- <cmd…>    prepare, puis la commande dans la copie
#   ruche-dev apercu <branche> | stop             l'aperçu (API + appli) suit cette branche
#   ruche-dev etat                                ce qui tourne, mémoire, copies de travail
#   ruche-dev mails [n]                           les n derniers e-mails de l'API d'aperçu (3)
#   ruche-dev navigateurs                          Chromium pour Playwright (captures, parcours)
#   ruche-dev post-receive                        appelé par le hook du dépôt nu
#
# Aucune donnée réelle ici : la base de l'aperçu est une base PGlite propre au serveur, et les
# e-mails ne partent jamais (MAIL_PROVIDER=console, lus par « mails »).
set -euo pipefail
# Un hook du dépôt nu reçoit GIT_DIR, GIT_QUARANTINE_PATH… : ils feraient agir « git » des copies
# de travail sur le dépôt nu lui-même. Chaque commande ici dit elle-même où elle agit.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_QUARANTINE_PATH GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_PUSH_OPTION_COUNT

DEV_HOME=${DEV_HOME:-/srv/ruche-dev}
REPO=$DEV_HOME/waiggle.git
BRANCHES=$DEV_HOME/branches
LOGS=$DEV_HOME/logs
APERCU=$DEV_HOME/apercu
export PLAYWRIGHT_BROWSERS_PATH=$DEV_HOME/ms-playwright
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export CI=1 # pnpm sans question ; Expo et Jest sans mode interactif

die() {
  printf 'ruche-dev : %s\n' "$*" >&2
  exit 1
}
# « feat/r16-skeletons » -> « feat__r16-skeletons » : un nom de dossier sûr.
slug() {
  [[ ${1:-} =~ ^[A-Za-z0-9._/-]{1,120}$ ]] || die "nom de branche invalide : « ${1:-} »"
  printf '%s' "${1//\//__}"
}
require_sha() {
  [[ ${1:-} =~ ^[0-9a-f]{7,40}$ ]] || die "commit invalide : « ${1:-} »"
}

# La copie de travail d'une branche, mise au commit demandé. Un verrou par branche : deux
# commandes sur la même branche passent l'une après l'autre, jamais l'une sous l'autre.
prepare() {
  local branch=$1 sha=$2 dir
  require_sha "$sha"
  dir=$BRANCHES/$(slug "$branch")
  git --git-dir="$REPO" cat-file -e "$sha^{commit}" 2>/dev/null || die "commit $sha absent du serveur : pousser d'abord"
  if [ ! -d "$dir" ]; then
    git --git-dir="$REPO" worktree add --force --detach "$dir" "$sha" >/dev/null 2>&1 ||
      die "copie de travail impossible pour $branch"
  fi
  (
    cd "$dir"
    git checkout --force --detach "$sha" >/dev/null 2>&1
    # -d : enlève les fichiers que le commit n'a plus ; sans -x : node_modules et les caches restent.
    git clean -fdq
    local lock_sum
    lock_sum=$(sha256sum pnpm-lock.yaml | cut -c1-16)
    if [ "$(cat node_modules/.ruche-dev-lock 2>/dev/null)" != "$lock_sum" ] || [ ! -d node_modules ]; then
      echo "ruche-dev : dépendances de $branch (lockfile changé ou absent)…" >&2
      corepack pnpm install --frozen-lockfile --prefer-offline >"$LOGS/install-$(slug "$branch").log" 2>&1 ||
        die "pnpm install a échoué : $LOGS/install-$(slug "$branch").log"
      echo "$lock_sum" >node_modules/.ruche-dev-lock
    fi
  )
  printf '%s\n' "$dir"
}

with_lock() {
  local branch=$1
  shift
  local lock
  lock=$DEV_HOME/locks/$(slug "$branch").lock
  mkdir -p "$DEV_HOME/locks"
  exec 9>"$lock"
  if ! flock -n 9; then
    echo "ruche-dev : $branch est occupée par une autre commande, j'attends…" >&2
    flock 9
  fi
  "$@"
}

run() {
  local branch=$1 sha=$2
  shift 2
  [ "${1:-}" = -- ] && shift
  [ $# -gt 0 ] || die "aucune commande après --"
  run_locked() {
    local dir
    dir=$(prepare "$branch" "$sha")
    cd "$dir"
    # La commande telle que le PC l'a écrite ; « bash -lc » pour corepack, pnpm et le PATH.
    nice -n 5 bash -lc "$*"
  }
  with_lock "$branch" run_locked "$@"
}

# --- l'aperçu : une branche à la fois (le téléphone n'a que le port 443) -----------------------
apercu() {
  local target=${1:-}
  [ -n "$target" ] || die "apercu <branche> | stop"
  if [ "$target" = stop ]; then
    sudo systemctl disable --now ruche-dev-app ruche-dev-api
    rm -f "$APERCU/branche"
    echo "aperçu arrêté"
    return
  fi
  local sha
  sha=$(git --git-dir="$REPO" rev-parse --verify -q "refs/heads/$target^{commit}") ||
    die "branche $target absente du serveur : la pousser d'abord (vps.mjs push)"
  mkdir -p "$APERCU"
  with_lock "$target" prepare "$target" "$sha" >/dev/null
  printf '%s\n' "$target" >"$APERCU/branche"
  write_env "$target"
  # Activés, pas seulement démarrés : l'aperçu revient seul après un redémarrage du serveur.
  sudo systemctl enable --quiet ruche-dev-api ruche-dev-app
  sudo systemctl restart ruche-dev-api ruche-dev-app
  echo "aperçu : $target ($(git --git-dir="$REPO" log -1 --format='%h %s' "$sha"))"
  echo "adresse : https://$(tailscale_name)/"
}

tailscale_name() {
  tailscale status --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.Self.DNSName.replace(/\.$/,""))})'
}

# Les variables des deux services de l'aperçu, relues à chaque redémarrage.
write_env() {
  local branch=$1 host dir
  host=$(tailscale_name)
  dir=$BRANCHES/$(slug "$branch")
  [ -s "$APERCU/invite" ] || head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n' >"$APERCU/invite"
  mkdir -p "$APERCU/data/$(slug "$branch")/pglite" "$APERCU/data/$(slug "$branch")/media"
  cat >"$APERCU/env.new" <<EOF
APERCU_DIR=$dir
PORT=3000
NODE_ENV=development
DATABASE_URL=
PGLITE_DIR=$APERCU/data/$(slug "$branch")/pglite
MEDIA_DIR=$APERCU/data/$(slug "$branch")/media
MAIL_PROVIDER=console
SIGNUP_INVITE_CODE=$(cat "$APERCU/invite")
APP_URL=https://$host
PUBLIC_API_URL=https://$host
EXPO_PUBLIC_API_URL=https://$host
EXPO_PUBLIC_APP_URL=https://$host
EOF
  mv "$APERCU/env.new" "$APERCU/env"
}

# Après chaque push : la copie de l'aperçu suit sa branche. Metro et « tsx watch » voient les
# fichiers changer et rechargent seuls ; on ne redémarre que si les dépendances ont changé.
post_receive() {
  local active=""
  [ -s "$APERCU/branche" ] && active=$(cat "$APERCU/branche")
  local _old new ref
  while read -r _old new ref; do
    case "$ref" in refs/heads/*) ;; *) continue ;; esac
    local branch=${ref#refs/heads/}
    [ "$new" = 0000000000000000000000000000000000000000 ] && continue
    printf '%s %s %s\n' "$(date -Is)" "$branch" "${new:0:9}" >>"$LOGS/pushes.log"
    if [ "$branch" = "$active" ]; then
      # Dans une session à part (setsid) : le push du PC rend la main tout de suite, et la mise à
      # jour survit à la fin de sa connexion SSH.
      setsid -f /usr/local/bin/ruche-dev suivre "$branch" "$new" </dev/null >/dev/null 2>&1
      echo "ruche-dev : aperçu de $branch en cours de mise à jour (${new:0:9})"
    fi
  done
}

suivre() {
  local branch=$1 sha=$2 before after
  before=$(cat "$BRANCHES/$(slug "$branch")/node_modules/.ruche-dev-lock" 2>/dev/null || true)
  if ! with_lock "$branch" prepare "$branch" "$sha" >/dev/null 2>>"$LOGS/apercu.log"; then
    echo "$(date -Is) ÉCHEC de la mise à jour : $branch ${sha:0:9}" >>"$LOGS/apercu.log"
    return 1
  fi
  after=$(cat "$BRANCHES/$(slug "$branch")/node_modules/.ruche-dev-lock" 2>/dev/null || true)
  if [ "$before" != "$after" ]; then sudo systemctl restart ruche-dev-api ruche-dev-app; fi
  echo "$(date -Is) aperçu à jour : $branch ${sha:0:9}" >>"$LOGS/apercu.log"
}

etat() {
  echo "Aperçu : $(cat "$APERCU/branche" 2>/dev/null || echo 'arrêté')"
  for s in ruche-dev-api ruche-dev-app; do printf '  %-15s %s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null || true)"; done
  [ -s "$APERCU/invite" ] && echo "  code d'invitation : $(cat "$APERCU/invite")"
  echo "Adresse : https://$(tailscale_name)/"
  echo
  free -h | sed -n '1,2p'
  echo
  echo "Copies de travail :"
  for d in "$BRANCHES"/*/; do
    [ -d "$d" ] || continue
    printf '  %-40s %s\n' "$(basename "$d" | sed 's/__/\//g')" "$(git -C "$d" log -1 --format='%h %cr' 2>/dev/null)"
  done
  echo
  echo "Derniers pushes :"
  tail -n 5 "$LOGS/pushes.log" 2>/dev/null | sed 's/^/  /' || true
}

mails() {
  # L'API écrit chaque e-mail entre « --- E-mail pour … --- » et « --- fin --- » (createConsoleMailer) :
  # on montre les n derniers en entier, liens compris.
  journalctl -u ruche-dev-api --no-pager -n 5000 -o cat 2>/dev/null |
    awk -v n="${1:-3}" '
      /^--- E-mail pour / { on = 1; b = "" }
      on { b = b $0 "\n" }
      /^--- fin ---/ { if (on) m[++k] = b; on = 0 }
      END {
        if (!k) { print "aucun e-mail depuis le démarrage de l API"; exit }
        for (i = (k > n ? k - n + 1 : 1); i <= k; i++) printf "%s\n", m[i]
      }'
}

# Chromium pour Playwright (captures, parcours), à la version que le dépôt demande : une fois par
# montée de version de Playwright, depuis une copie qui a ses dépendances.
navigateurs() {
  local dir=${1:-}
  [ -n "$dir" ] || dir=$(find "$BRANCHES" -mindepth 1 -maxdepth 1 -type d | head -1)
  [ -x "$dir/apps/app/node_modules/.bin/playwright" ] || die "aucune copie avec Playwright : lancer d'abord un « prepare »"
  sudo env PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" "$dir/apps/app/node_modules/.bin/playwright" install-deps chromium 2>&1 | tee "$LOGS/navigateurs.log" >/dev/null
  "$dir/apps/app/node_modules/.bin/playwright" install chromium
}

case "${1:-}" in
prepare) with_lock "${2:-}" prepare "${2:-}" "${3:-}" ;;
run) shift && run "$@" ;;
apercu) apercu "${2:-}" ;;
etat) etat ;;
mails) mails "${2:-}" ;;
navigateurs) navigateurs "${2:-}" ;;
post-receive) post_receive ;;
suivre) suivre "${2:-}" "${3:-}" ;;
*) die "commande inconnue : « ${1:-} » (prepare, run, apercu, etat, mails, navigateurs)" ;;
esac
