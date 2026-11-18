#!/usr/bin/env bash
# Prépare le serveur de développement (« ruche-dev », Debian 13, OVH) : l'aperçu en direct des
# branches et les commandes lourdes (tests, typecheck, captures), loin du PC de développement.
# Ce serveur n'est PAS la production (voir docs/adr/0003-hebergement.md) : il n'a ni vraie base,
# ni secret, ni domaine public, et ne s'ouvre qu'au réseau Tailscale. Voir docs/adr/0007-vps-dev.md.
#
# Il se lance depuis le PC, par SSH, une étape à la fois (« bash -s » lit le script sur l'entrée
# standard : rien n'est copié sur le serveur). Chaque étape peut être relancée sans dégâts.
#
#   ssh ruche-dev 'sudo bash -s -- check'           < infra/vps-dev/bootstrap.sh   état des lieux
#   ssh ruche-dev 'sudo bash -s -- user louis'      < infra/vps-dev/bootstrap.sh   compte « louis »
#   ssh ruche-dev 'sudo bash -s -- tailscale'       < infra/vps-dev/bootstrap.sh   rejoindre le tailnet
#   ssh ruche-dev 'sudo bash -s -- lock louis'      < infra/vps-dev/bootstrap.sh   SSH par clé, pare-feu
#   ssh ruche-dev 'sudo bash -s -- tools louis'     < infra/vps-dev/bootstrap.sh   Node, pnpm, Chromium…
#   ssh ruche-dev 'sudo bash -s -- services louis'  < infra/vps-dev/bootstrap.sh   aperçu par branche
set -euo pipefail

NODE_MAJOR=24
DEV_HOME=/srv/ruche-dev

die() {
  printf 'ÉCHEC : %s\n' "$*" >&2
  exit 1
}
step() {
  printf '\n▶ %s\n' "$*"
}
require_root() {
  [ "$(id -u)" -eq 0 ] || die "cette étape se lance avec sudo"
}
require_name() {
  [[ ${1:-} =~ ^[a-z][a-z0-9-]{0,31}$ ]] || die "nom de compte manquant ou invalide : « ${1:-} »"
}

# --- check : un état des lieux, sans rien modifier --------------------------------------------
check() {
  # shellcheck source=/dev/null
  . /etc/os-release
  step "Système"
  echo "$PRETTY_NAME, noyau $(uname -r), $(nproc) processeur(s)"
  step "Mémoire et disque"
  free -h
  df -h /
  step "Ports ouverts"
  ss -tulpn 2>/dev/null | sed 1d | awk '{print $1, $5, $7}' || true
  step "Tailscale"
  command -v tailscale >/dev/null && tailscale status 2>&1 | head -5 || echo "pas installé"
  step "Pare-feu"
  command -v ufw >/dev/null && ufw status verbose || echo "ufw : pas installé"
  step "Outils"
  for t in node pnpm git caddy; do printf '%-7s ' "$t"; command -v "$t" >/dev/null && "$t" --version 2>/dev/null | head -1 || echo "absent"; done
}

# --- user : le compte de travail, par clé seulement --------------------------------------------
user() {
  require_root
  require_name "${1:-}"
  local name=$1
  step "Compte « $name »"
  if id "$name" >/dev/null 2>&1; then echo "existe déjà"; else useradd -m -s /bin/bash "$name" && echo "créé"; fi
  step "Clé SSH : celle du compte qui lance le script"
  local src=/home/${SUDO_USER:-debian}/.ssh/authorized_keys
  [ -s "$src" ] || die "aucune clé dans $src"
  install -d -m 700 -o "$name" -g "$name" "/home/$name/.ssh"
  local keys=/home/$name/.ssh/authorized_keys
  { cat "$src"; if [ -f "$keys" ]; then cat "$keys"; fi; } | grep -v '^[[:space:]]*$' | sort -u >"$keys.new"
  install -m 600 -o "$name" -g "$name" "$keys.new" "$keys"
  rm -f "$keys.new"
  echo "$(wc -l <"$keys") clé(s)"
  step "sudo sans mot de passe (le compte n'en a pas)"
  local rule=/etc/sudoers.d/90-$name
  printf '%s ALL=(ALL) NOPASSWD:ALL\n' "$name" >"$rule.new"
  chmod 440 "$rule.new"
  visudo -cq -f "$rule.new" || { rm -f "$rule.new"; die "règle sudo invalide"; }
  mv "$rule.new" "$rule"
  step "Nom de la machine"
  hostnamectl set-hostname ruche-dev
  grep -q 'ruche-dev' /etc/hosts || printf '127.0.1.1 ruche-dev\n' >>/etc/hosts
  echo "ruche-dev"
}

# --- tailscale : rejoindre le réseau privé -----------------------------------------------------
tailscale_step() {
  require_root
  step "Paquet Tailscale (dépôt officiel)"
  if ! command -v tailscale >/dev/null; then
    apt-get update -q
    apt-get install -y -q curl gnupg ca-certificates
    # shellcheck source=/dev/null
    . /etc/os-release
    curl -fsSL "https://pkgs.tailscale.com/stable/debian/${VERSION_CODENAME}.noarmor.gpg" \
      -o /usr/share/keyrings/tailscale-archive-keyring.gpg
    curl -fsSL "https://pkgs.tailscale.com/stable/debian/${VERSION_CODENAME}.tailscale-keyring.list" \
      -o /etc/apt/sources.list.d/tailscale.list
    apt-get update -q
    apt-get install -y -q tailscale
  fi
  tailscale version | head -1
  step "Connexion au tailnet"
  if tailscale status >/dev/null 2>&1; then
    tailscale status | head -3
  else
    # --timeout : rend la main avec le lien de connexion, à ouvrir par l'administrateur du tailnet ; la machine reste en
    # attente de son accord et rejoint le tailnet dès qu'il clique « Connect ».
    tailscale up --hostname=ruche-dev --timeout=20s 2>&1 || true
  fi
}

# --- lock : SSH par clé seulement, pare-feu fermé hors Tailscale -------------------------------
lock() {
  require_root
  require_name "${1:-}"
  local name=$1
  [ -s "/home/$name/.ssh/authorized_keys" ] || die "« $name » n'a aucune clé SSH : on se fermerait la porte"
  tailscale status >/dev/null 2>&1 || die "Tailscale n'est pas connecté : on se fermerait la porte"
  step "Réglages SSH"
  cat >/etc/ssh/sshd_config.d/00-ruche-dev.conf.new <<'EOF'
# Écrit par infra/vps-dev/bootstrap.sh (étape lock). Ne pas modifier à la main.
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
EOF
  mv /etc/ssh/sshd_config.d/00-ruche-dev.conf.new /etc/ssh/sshd_config.d/00-ruche-dev.conf
  sshd -t || die "réglages SSH invalides"
  systemctl reload ssh
  echo "ok"
  step "Pare-feu : tout fermé, sauf l'interface Tailscale"
  command -v ufw >/dev/null || apt-get install -y -q ufw
  ufw --force reset >/dev/null
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow in on tailscale0
  # Le port de Tailscale lui-même (connexions directes plutôt que relayées).
  ufw allow 41641/udp
  # « lock louis public » garde le SSH public (par clé seulement) tant que la politique du tailnet
  # n'ouvre pas ruche-dev au PC ; « lock louis » le ferme.
  if [ "${2:-}" = public ]; then ufw allow 22/tcp; fi
  ufw --force enable
  ufw status verbose
  step "Mises à jour de sécurité automatiques"
  apt-get install -y -q unattended-upgrades
  dpkg-reconfigure -f noninteractive unattended-upgrades
  echo "ok"
}

# --- tools : Node, pnpm, git, mémoire d'appoint -----------------------------------------------
tools() {
  require_root
  require_name "${1:-}"
  local name=$1
  step "Paquets de base"
  apt-get update -q
  apt-get install -y -q git curl ca-certificates gnupg build-essential jq unzip htop
  step "Node $NODE_MAJOR (dépôt NodeSource)"
  if ! node --version 2>/dev/null | grep -q "^v$NODE_MAJOR\."; then
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
      gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
    printf 'deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_%s.x nodistro main\n' \
      "$NODE_MAJOR" >/etc/apt/sources.list.d/nodesource.list
    apt-get update -q
    apt-get install -y -q nodejs
  fi
  node --version
  step "pnpm (corepack, la version du packageManager du dépôt)"
  corepack enable
  echo "ok"
  step "Mémoire d'appoint (swap de 4 Go)"
  if ! swapon --show | grep -q /swapfile; then
    fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  fi
  swapon --show
  step "Surveillance des fichiers (Metro en surveille beaucoup)"
  printf 'fs.inotify.max_user_watches=524288\nfs.inotify.max_user_instances=1024\n' >/etc/sysctl.d/60-ruche-dev.conf
  sysctl -q --system
  echo "ok"
  step "Dossier de travail $DEV_HOME"
  install -d -o "$name" -g "$name" "$DEV_HOME" "$DEV_HOME/branches" "$DEV_HOME/logs"
  echo "ok"
}

# --- services : le dépôt nu, l'outil ruche-dev, l'aperçu, Chromium ---------------------------
# Celle-ci a besoin des fichiers voisins (ruche-dev.sh) : on copie le dossier d'abord.
#   scp -r infra/vps-dev ruche-dev:/tmp/ && ssh ruche-dev 'sudo bash /tmp/vps-dev/bootstrap.sh services louis'
services() {
  require_root
  require_name "${1:-}"
  local name=$1 here
  here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  [ -f "$here/ruche-dev.sh" ] || die "ruche-dev.sh introuvable à côté du script : copier le dossier (voir plus haut)"
  step "L'outil /usr/local/bin/ruche-dev"
  install -m 755 "$here/ruche-dev.sh" /usr/local/bin/ruche-dev
  echo "ok"
  step "Le dépôt nu $DEV_HOME/waiggle.git (le PC y pousse par SSH)"
  if [ ! -d "$DEV_HOME/waiggle.git" ]; then
    sudo -u "$name" git init -q --bare "$DEV_HOME/waiggle.git"
  fi
  sudo -u "$name" git --git-dir="$DEV_HOME/waiggle.git" config receive.denyNonFastForwards false
  cat >"$DEV_HOME/waiggle.git/hooks/post-receive" <<'EOF'
#!/bin/sh
exec /usr/local/bin/ruche-dev post-receive
EOF
  chmod 755 "$DEV_HOME/waiggle.git/hooks/post-receive"
  chown "$name:$name" "$DEV_HOME/waiggle.git/hooks/post-receive"
  echo "ok"
  step "Les deux services de l'aperçu (API et appli), arrêtés tant qu'aucune branche n'est choisie"
  install -d -o "$name" -g "$name" "$DEV_HOME/apercu"
  cat >/etc/systemd/system/ruche-dev-api.service <<EOF
[Unit]
Description=Aperçu Waiggle : l'API (tsx watch, base PGlite du serveur)
After=network-online.target

[Service]
User=$name
EnvironmentFile=$DEV_HOME/apercu/env
ExecStart=/bin/bash -c 'cd "\$APERCU_DIR/apps/api" && exec ./node_modules/.bin/tsx watch src/index.ts'
Restart=on-failure
RestartSec=5
MemoryMax=3G

[Install]
WantedBy=multi-user.target
EOF
  cat >/etc/systemd/system/ruche-dev-app.service <<EOF
[Unit]
Description=Aperçu Waiggle : l'appli web (Expo / Metro, rechargement à chaud)
After=ruche-dev-api.service

[Service]
User=$name
EnvironmentFile=$DEV_HOME/apercu/env
# Pas de CI=1 ici : Expo couperait la surveillance des fichiers, donc le rechargement à chaud.
ExecStart=/bin/bash -c 'cd "\$APERCU_DIR/apps/app" && exec ./node_modules/.bin/expo start --web --port 8081 --clear'
Restart=on-failure
RestartSec=5
MemoryMax=5G

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  echo "ok"
  step "Caddy en local (127.0.0.1:8080) : les chemins de l'API vers 3000, le reste vers Metro"
  # Une seule origine pour l'appli et l'API, comme en production (cookies, CORS). Tailscale serve
  # ne sait pas monter un chemin sans le retirer (/api/auth/x arriverait en /auth/x) : Caddy le fait.
  command -v caddy >/dev/null || apt-get install -y -q caddy
  cat >/etc/caddy/Caddyfile <<'EOF'
# Écrit par infra/vps-dev/bootstrap.sh (étape services). Ne pas modifier à la main.
{
	admin off
	auto_https off
}
http://:8080 {
	bind 127.0.0.1
	@api path /v1/* /api/auth/* /media/* /health /openapi.json
	reverse_proxy @api 127.0.0.1:3000
	# Metro refuse toute requête dont l'en-tête Origin n'est pas localhost (« Unauthorized request ») :
	# les polices (FontFace) et le rechargement à chaud en envoient un. Pour le navigateur, l'appli
	# n'a qu'une origine : Caddy retire l'en-tête et présente localhost à Metro.
	reverse_proxy 127.0.0.1:8081 {
		header_up Host localhost:8081
		header_up -Origin
	}
}
EOF
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
  systemctl restart caddy
  echo "ok"
  step "Tailscale serve : https://<ruche-dev>/ -> Caddy (réseau Tailscale seulement)"
  tailscale serve reset
  tailscale serve --bg --https=443 http://127.0.0.1:8080 >/dev/null
  tailscale serve status
  step "Chromium pour Playwright (captures, parcours), partagé par toutes les copies"
  install -d -o "$name" -g "$name" "$DEV_HOME/ms-playwright"
  echo "après le premier « prepare » (ou « apercu ») : ruche-dev navigateurs"
}

case "${1:-}" in
check) check ;;
services) services "${2:-}" ;;
user) user "${2:-}" ;;
tailscale) tailscale_step ;;
lock) lock "${2:-}" "${3:-}" ;;
tools) tools "${2:-}" ;;
*) die "étape inconnue : « ${1:-} » (check, user, tailscale, lock, tools, services)" ;;
esac
