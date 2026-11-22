# Le déploiement de nuit depuis vps-dev

Trois scripts mettent en ligne un commit de `main` sans le PC de Louis :

- `waiggle-deployer <commit>`, sur vps-dev, que `louis` lance par `sudo`, sans mot de passe ;
- `waiggle-retour <commit>`, sur vps-dev, qu'`admin` seul lance, avec son mot de passe, pour revenir
  à un commit plus ancien ;
- `waiggle-deploy-force`, sur la production, le gardien que les deux appellent par `ssh`
  (`infra/production/`).

Ce qu'ils vérifient, et dans quel ordre, est dans [`contrat.md`](contrat.md) (parties A3 à A7). Ce
fichier dit comment les installer, et les gestes que Louis fait à la main. Aucun secret n'y est
écrit : ni jeton, ni sujet ntfy, ni clé.

## Avant la première installation (une fois)

Sous `admin`, sur vps-dev. Les commandes qui touchent un secret le lisent au terminal, jamais dans
un argument ni dans un tube : `ps` montre les lignes de commande à tous les comptes.

0. **Un `gh` récent, sur vps-dev comme sur la production.** Celui de Debian (2.46) ne sait pas
   vérifier une attestation par empreinte : `waiggle-deployer` refuse alors à l'étape 9, sans rien
   déployer (vu au premier essai, le 21/11/2026). Installer celui du dépôt de GitHub
   (2.105 le 21/11/2026), puis vérifier `gh --version`.

1. **L'adresse de la production.** Dans `waiggle-deployer` et `waiggle-retour`, la ligne
   `PRODUCTION=louis@…` du bloc des chemins porte l'IPv4 de la production. Elle doit être juste
   **dans le commit installé** (l'installation compare chaque fichier au commit) : la corriger par
   une PR avant tout, si besoin.
2. **Le dépôt nu de root**, d'où viennent les scripts et où `waiggle-deployer` vérifie que le commit
   est sur `main` :
   ```sh
   sudo mkdir -m 0700 /srv/waiggle-deploy
   sudo git init --quiet --bare /srv/waiggle-deploy/depot.git
   sudo mkdir -p -m 0700 /root/.config/waiggle-deploy
   ```
3. **Le jeton fin de lecture** (M5, I-2). Sur GitHub, connecté au compte machine
   `ethogram-machine`, **jamais au compte de Louis** : un jeton « fine-grained », accès « Public
   repositories », en lecture seule, rien d'autre. Il lit le contenu, les PR et les attestations de
   `EthogramHQ/Waiggle`, dépôt public ; le compte n'étant pas membre d'EthogramHQ, un jeton limité
   au seul dépôt ne peut pas se créer. Son échéance va dans les échéances du Pilote. Puis, sur
   vps-dev :
   ```sh
   sudo /usr/bin/env GH_CONFIG_DIR=/root/.config/waiggle-deploy/gh gh auth login --hostname github.com --git-protocol https --with-token
   ```
   Colle le jeton **au terminal**, Entrée, puis Ctrl-D. `gh` crée son dossier avec les droits par
   défaut : les resserrer, puis vérifier (root partout, 0700 pour le dossier, 0600 pour les
   fichiers) :
   ```sh
   sudo chmod 0700 /root/.config/waiggle-deploy/gh
   sudo sh -c 'chmod 0600 /root/.config/waiggle-deploy/gh/*'
   sudo ls -la /root/.config/waiggle-deploy/gh
   ```
   (`sudo sh -c '…'` : le `*` doit être lu par root ; sinon c'est le shell d'`admin`, qui ne voit
   pas dans le dossier, qui le remplace, et la commande échoue.)
4. **Le premier `fetch`**, à la main, le même que celui du script (contrat, A3). Les guillemets
   sont simples : dans un terminal, un `!` entre guillemets doubles rappelle une commande de
   l'historique au lieu de rester un `!`.
   ```sh
   sudo git -C /srv/waiggle-deploy/depot.git -c credential.helper= -c 'credential.helper=!/usr/bin/env GH_CONFIG_DIR=/root/.config/waiggle-deploy/gh /usr/bin/gh auth git-credential' fetch --quiet --no-tags --prune https://github.com/EthogramHQ/Waiggle.git +refs/heads/main:refs/remotes/origin/main
   ```

## L'installation (et chaque mise à jour)

Le commit à installer doit être sur `main`, et déjà dans le dépôt nu de root (le `fetch` ci-dessus,
ou un essai de `waiggle-deployer`, le met à jour). Sous `admin` :

```sh
sudo bash -c 'git -C /srv/waiggle-deploy/depot.git show "$1:infra/vps-dev/installer.sh" > /root/waiggle-installer.sh && bash /root/waiggle-installer.sh "$1"' _ <commit>
```

L'installateur est lu dans le dépôt nu de root, jamais dans une copie de `louis` (M4). Il pose
seulement :

| Fichier du commit | Destination | Droits |
| --- | --- | --- |
| `infra/vps-dev/waiggle-deployer` | `/usr/local/sbin/waiggle-deployer` | root:root 0755 |
| `infra/vps-dev/waiggle-retour` | `/usr/local/sbin/waiggle-retour` | root:root 0755 |
| `infra/vps-dev/waiggle-deploy.logrotate` | `/etc/logrotate.d/waiggle-deploy` | root:root 0644 |

Chaque fichier posé est relu et comparé au commit ; une différence le retire et arrête tout. Il
crée aussi `/var/lib/waiggle-deploy` et `/root/.config/waiggle-deploy` (0700) s'ils manquent. Il
ne touche ni au `sudoers`, ni aux clés, ni au jeton, ni au sujet ntfy, ni à `known_hosts`.

## Les gestes de Louis après la première installation, dans l'ordre

1. **Le `sudoers`** : trouver le fichier de l'aperçu de `louis` par
   `sudo sh -c 'grep -l pilote-deployer /etc/sudoers.d/*'` (le `*` lu par root : `admin` ne voit
   pas dans `/etc/sudoers.d`), puis `sudo visudo -f <ce fichier>`, et ajouter
   `/usr/local/sbin/waiggle-deployer` à l'alias de l'aperçu de `louis` (celui qui porte déjà
   `pilote-deployer`). Jamais `waiggle-retour` ; ni `SETENV`, ni `env_keep`, ni `!env_reset`.
2. **Les deux clés de root** :
   ```sh
   sudo ssh-keygen -t ed25519 -N '' -C waiggle-prod@vps-dev -f /root/.ssh/waiggle-prod
   sudo ssh-keygen -t ed25519 -C waiggle-retour@vps-dev -f /root/.ssh/waiggle-retour
   ```
   La première sans phrase de passe ; la seconde **avec** une phrase de passe que toi seul connais
   (elle est demandée à chaque `waiggle-retour`). Puis, sur la production, compte `louis`, les deux
   lignes de `~/.ssh/authorized_keys` données par le contrat (A2), avec l'IPv4 de vps-dev dans
   `from=`, et le gardien `/usr/local/sbin/waiggle-deploy-force` installé (`infra/production/`).
3. **Le jeton** : déjà posé avant l'installation (étape 3 ci-dessus).
4. **Le sujet ntfy de root**, un sujet à lui, différent de ceux du Pilote :
   ```sh
   sudo touch /root/.config/waiggle-deploy/ntfy.curl
   sudo chmod 0600 /root/.config/waiggle-deploy/ntfy.curl
   sudo nano /root/.config/waiggle-deploy/ntfy.curl
   ```
   Une seule ligne, `url = "https://<serveur ntfy>/<sujet de root>"`, tapée dans l'éditeur (jamais
   dans une commande).
5. **`known_hosts`** : la production seule, empreinte vérifiée à la main. Lire l'empreinte sur la
   production même (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`, depuis la console de
   l'hébergeur ou une session déjà sûre), puis sur vps-dev, sous `admin`, dans un dossier neuf à
   lui (mode 0700, nom tiré au hasard) : un fichier au nom fixe dans `/tmp` pourrait être posé à
   l'avance par un autre compte.
   ```sh
   d=$(mktemp -d "$HOME/production.XXXXXX")
   ssh-keyscan -4 -t ed25519 <IPv4 de la production> > "$d/hote"
   ssh-keygen -lf "$d/hote"
   ```
   Si les deux empreintes sont identiques : `sudo install -m 0644 -o root -g root "$d/hote"
   /root/.ssh/known_hosts`. Dans tous les cas, pour finir : `rm -r "$d"`.

## Les vérifications de Louis (contrat, A11)

Ce que les tests ne peuvent pas montrer : le vrai `sudo`, le vrai bac à sable, les vraies clés.

Sur vps-dev, sous `louis` :
- `sudo -k; sudo -n /usr/local/sbin/waiggle-deployer x; echo $?` : le refus du script (code 2),
  et non « a password is required » ;
- `sudo -n /usr/local/sbin/waiggle-retour <commit>` : refusé (pas dans ses droits) ;
- `sudo -n true` : refusé ;
- `cat /root/.ssh/waiggle-prod` et `ls /srv/waiggle-deploy` : refusés.

Sur vps-dev, sous `admin` :
- `sudo -l -U louis` : l'aperçu, `pilote-deployer` et `waiggle-deployer`, rien d'autre ; ni
  `SETENV`, ni `env_keep` ajouté, ni `!env_reset` ; `secure_path` présent ;
- `namei -l /usr/bin/git /usr/bin/gh /usr/bin/node /usr/bin/ssh /usr/bin/curl /usr/bin/systemd-run /usr/bin/flock /usr/bin/timeout` :
  chaque maillon est à root, et non inscriptible par le groupe ni par les autres ;
- `sysctl kernel.yama.ptrace_scope` : 1 au moins ;
- `sudo ssh -F /dev/null -4 -i /root/.ssh/waiggle-prod <production> id` : refusé par le gardien ;
  `… -W 127.0.0.1:22 <production>` : refusé (le relais demandé tout de suite ; avec `-N -L`, rien
  n'est demandé avant une connexion au port local, et la commande attend sans rien montrer) ;
- `sudo ssh-keygen -y -f /root/.ssh/waiggle-retour` : demande la phrase de passe.

Depuis une autre machine : la clé de déploiement est refusée par `from=`.

Au premier essai : le vrai `gh api … --jq` rend du JSON compact (`[12]`) pour la liste des PR, comme
le faux `gh` des tests.

Sur GitHub :
- `gh api repos/EthogramHQ/Waiggle/collaborators/<compte machine>/permission --jq .permission` :
  `read` ;
- les PR de fork : sur un dépôt public, GitHub ne leur donne jamais de jeton en écriture ni de
  secrets, et les cases « Send write tokens » et « Send secrets » n'existent pas. Reste à voir le
  réglage « Approval for running fork pull request workflows » (Settings, Actions, General) ;
- la fusion par rebase est désactivée ;
- `gh api user --jq .id`, sous le compte de Louis : la valeur de `ID_LOUIS` dans
  `waiggle-deployer` ;
- l'inventaire des identités de vps-dev qui écrivent sur Waiggle est vide.

## L'usage

- `louis` : `sudo /usr/local/sbin/waiggle-deployer <commit complet>`. Codes : `0` déployé, `2`
  refusé, `3` trop tôt (un déploiement en cours, 10 minutes depuis le dernier essai, ou 6 essais
  dans le jour UTC), `4` échec ou délai dépassé du côté de la production, `5` notification de début
  impossible.
- `admin` : `ssh admin@vps-dev`, puis `/usr/bin/sudo /usr/local/sbin/waiggle-retour <commit>`. Il
  attend jusqu'à 15 minutes un déploiement en cours, et demande la phrase de passe de la clé de
  retour.
- Le journal : `/var/log/waiggle-deploy.log` (root, 0600), une ligne `debut` et une ligne `fin` par
  essai ; chaque essai notifie son début et sa fin.
