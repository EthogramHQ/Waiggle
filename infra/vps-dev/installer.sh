#!/bin/bash -p
# installer.sh <commit>: installs the night deployment scripts on vps-dev (infra/vps-dev/contrat.md, A8).
#
# Run by root (Louis, as admin). The script itself is read from root's bare repository, never
# from a working copy of louis, which louis could change (see infra/vps-dev/README.md):
#   sudo bash -c 'git -C /srv/waiggle-deploy/depot.git show "$1:infra/vps-dev/installer.sh" > /root/waiggle-installer.sh && bash /root/waiggle-installer.sh "$1"' _ <commit>
#
# It installs only the three files below, read by `git show <commit>:<path>` from that same
# repository, and checks each installed file against the blob of the commit. It touches neither
# sudoers, nor the keys, nor the read token, nor the ntfy topic, nor known_hosts: those are
# Louis's own steps, recalled at the end.
#
# `-p` stops bash from reading BASH_ENV, SHELLOPTS and BASHOPTS, and from importing functions.
set -euo pipefail
IFS=$' \t\n'
umask 077
cd /

# Every exported variable goes (A3.3); the programs below get a known PATH, HOME and LANG.
for nom in $(compgen -e); do
  unset -v "$nom" 2>/dev/null || true
done
export PATH=/usr/sbin:/usr/bin:/sbin:/bin HOME=/root LANG=C.UTF-8

# Every program and every file, by its absolute path (A3.5). The test rewrites this block only.
# The uid comes from `id -u` and the owner from `chown root:root` (rather than $EUID and
# `install -o`), so that the test copy can run without root.
# --- chemins : début ---
GIT=/usr/bin/git
ID=/usr/bin/id
CHOWN=/usr/bin/chown
CHMOD=/usr/bin/chmod
MKDIR=/usr/bin/mkdir
MV=/usr/bin/mv
RM=/usr/bin/rm
DEPOT=/srv/waiggle-deploy/depot.git
SBIN=/usr/local/sbin
LOGROTATE=/etc/logrotate.d
ETAT=/var/lib/waiggle-deploy
CONFIG=/root/.config/waiggle-deploy
# --- chemins : fin ---

commit=
temporaire=

refuser() {
  printf 'installer.sh : %s\n' "$1" >&2
  exit 2
}

# A file being written is removed if the script stops half way.
nettoyer() {
  if [[ -n $temporaire ]]; then
    "$RM" -f -- "$temporaire"
  fi
}
trap nettoyer EXIT

# Installs one file of the commit: written next to its destination, then moved in place (a
# running waiggle-deployer keeps reading the old file, since bash reads a script as it goes),
# then read again and compared with the blob of the commit. A difference removes the file.
poser() {
  local chemin=$1 destination=$2 mode=$3 attendu lu
  temporaire=$destination.nouveau
  "$GIT" -C "$DEPOT" show "$commit:$chemin" >"$temporaire"
  "$CHMOD" "$mode" "$temporaire"
  "$MV" -f -- "$temporaire" "$destination"
  temporaire=
  "$CHOWN" root:root "$destination"
  attendu=$("$GIT" -C "$DEPOT" rev-parse --verify --quiet "$commit:$chemin") || attendu=
  lu=$("$GIT" -C "$DEPOT" hash-object --no-filters -- "$destination") || lu=
  if [[ -z $attendu || $lu != "$attendu" ]]; then
    "$RM" -f -- "$destination"
    refuser "$destination ne correspond pas à $chemin du commit : retiré, rien d'autre n'est installé."
  fi
  printf 'installé : %s (%s, root:root)\n' "$destination" "$mode"
}

# 1. Root, one full commit, on main of root's bare repository.
uid=$("$ID" -u) || uid=
if [[ $uid != 0 ]]; then
  refuser "il faut le lancer en root ; rien n'est installé."
fi
if (($# != 1)) || [[ ! $1 =~ ^[0-9a-f]{40}$ ]]; then
  refuser "il faut un seul argument : le commit complet (40 caractères hexadécimaux en minuscules)."
fi
commit=$1
lu=$("$GIT" -C "$DEPOT" rev-parse --verify --quiet "$commit^{commit}") || lu=
if [[ $lu != "$commit" ]] || ! "$GIT" -C "$DEPOT" merge-base --is-ancestor "$commit" refs/remotes/origin/main; then
  refuser "ce commit n'est pas sur main du dépôt de root ($DEPOT) ; fais d'abord le fetch."
fi

# 2 and 3. The named files only, each checked against the commit. The two directories exist on
# any Debian; they are created only if missing, in their usual mode.
for dossier in "$SBIN" "$LOGROTATE"; do
  if [[ ! -d $dossier ]]; then
    "$MKDIR" -p -- "$dossier"
    "$CHMOD" 0755 "$dossier"
  fi
done
poser infra/vps-dev/waiggle-deployer "$SBIN/waiggle-deployer" 0755
poser infra/vps-dev/waiggle-retour "$SBIN/waiggle-retour" 0755
poser infra/vps-dev/waiggle-deploy.logrotate "$LOGROTATE/waiggle-deploy" 0644

# 4. The state directory (attempts, last alert) and root's configuration directory.
for dossier in "$ETAT" "$CONFIG"; do
  if [[ ! -d $dossier ]]; then
    "$MKDIR" -p -- "$dossier"
    "$CHMOD" 0700 "$dossier"
    "$CHOWN" root:root "$dossier"
  fi
done

# 5. What stays for Louis, in this order (infra/vps-dev/README.md).
printf '%s\n' \
  "Installé au commit $commit. Restent tes gestes, dans l'ordre (infra/vps-dev/README.md) :" \
  "  1. sudoers (visudo) : ajouter /usr/local/sbin/waiggle-deployer à l'alias de l'aperçu de louis ; jamais waiggle-retour ;" \
  "  2. les clés : /root/.ssh/waiggle-prod (sans phrase de passe) et /root/.ssh/waiggle-retour (avec la tienne), et leurs lignes sur la production ;" \
  "  3. le jeton fin de lecture, par gh auth login, collé au terminal, dans $CONFIG/gh ;" \
  "  4. le sujet ntfy de root, dans $CONFIG/ntfy.curl (0600) ;" \
  "  5. known_hosts : la production seule, empreinte vérifiée à la main ;" \
  "  puis les vérifications du README (A11)."
