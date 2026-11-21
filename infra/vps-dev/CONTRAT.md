# Partie A : le déploiement de nuit depuis vps-dev (contrat)

Ce contrat fixe trois scripts et leur installation :
- `waiggle-deployer`, sur vps-dev, que `louis` lance sans mot de passe ;
- `waiggle-retour`, sur vps-dev, qu'`admin` seul lance, avec son mot de passe ;
- `waiggle-deploy-force`, le gardien de la production.

Il est écrit avant les tests. Les tests et les scripts lui obéissent ; s'il se trompe, on le corrige ici d'abord.

## A1. Les noms

- **Le dépôt** : `EthogramHQ/Waiggle`, branche `main`.
- **Un commit** : exactement `^[0-9a-f]{40}$`. Jamais un nom de branche, jamais un préfixe.
- **Une empreinte** : exactement `^[0-9a-f]{64}$`.
- **Le préfixe des images** : la ligne `IMAGE_PREFIX=` de `infra/site.env` **dans l'arbre du commit**, conforme à
  `^ghcr\.io/[a-z0-9._/-]+$`. Les images sont `<préfixe>-api` et `<préfixe>-web`, étiquetées par la CI au commit
  complet (`ci.yml`, `tags: …-api:${{ github.sha }}`). Les paquets sont publics (`docs/ops/serveur.md`).
- **Le compte de Louis sur GitHub** : `ID_LOUIS`, son **identifiant numérique**, constante écrite dans
  `waiggle-deployer`, hors du bloc des chemins. Jamais un `login`, qui se renomme.
- **Les appelants** : `louis` lance `waiggle-deployer` (sudo sans mot de passe, cette seule commande en plus de
  l'aperçu et de `pilote-deployer`) ; `admin` lance `waiggle-retour` (sudo avec mot de passe, en terminal SSH).

## A2. Fichiers et droits

Sur vps-dev :

| Chemin | Propriétaire et mode | Contenu |
| --- | --- | --- |
| `/usr/local/sbin/waiggle-deployer`, `/usr/local/sbin/waiggle-retour` | root:root 0755 | les scripts, posés par `installer.sh` |
| `/srv/waiggle-deploy/` et `depot.git` | root 0700 | le dépôt nu de root |
| `/root/.config/waiggle-deploy/` | root 0700 | — |
| `/root/.config/waiggle-deploy/gh/hosts.yml` | root 0600 | le jeton fin de lecture (M5) |
| `/root/.config/waiggle-deploy/ntfy.curl` | root 0600 | une ligne `url = "https://…/<sujet de root>"` |
| `/root/.ssh/waiggle-prod` | root 0600 | la clé de déploiement, sans phrase de passe |
| `/root/.ssh/waiggle-retour` | root 0600 | la clé de retour, **avec** une phrase de passe que seul Louis connaît |
| `/root/.ssh/known_hosts` | root 0644 | la production seule, empreinte vérifiée à la main |
| `/var/lib/waiggle-deploy/` | root 0700 | `essais` et `derniere-alerte` |
| `/var/log/waiggle-deploy.log` | root 0600 | le journal, avec `/etc/logrotate.d/waiggle-deploy` (root 0644) |
| `/run/waiggle-deploy/` | root 0755 | dossiers temporaires des Mentions légales, recréé à chaque lancement |
| `/run/waiggle-deploy.lock` | root 0600 | le verrou |
| ligne `sudoers` | `visudo`, par Louis | `waiggle-deployer` ajouté à l'alias de l'aperçu de `louis` ; `waiggle-retour` n'y est pas |

**Le jeton fin** (M5 et I-2) : sur le seul `EthogramHQ/Waiggle`, en lecture seule, `contents:read`,
`attestations:read`, `pull_requests:read`, rien d'autre. Son échéance va dans les échéances du Pilote.

Sur la production, compte `louis` (celui qui lance `deploy.sh` aujourd'hui) :

| Chemin | Propriétaire et mode | Contenu |
| --- | --- | --- |
| `/usr/local/sbin/waiggle-deploy-force` | root:root 0755 | le gardien, **hors du dépôt** (I3) |
| `/srv/ruche/waiggle-deploy-force/` | louis 0700 | un journal par déploiement lancé |
| `~louis/.ssh/authorized_keys` | louis 0600 | les deux lignes ci-dessous |

```
restrict,from="<IPv4 de vps-dev>",command="/usr/local/sbin/waiggle-deploy-force" ssh-ed25519 AAAA… waiggle-prod@vps-dev
restrict,from="<IPv4 de vps-dev>",command="/usr/local/sbin/waiggle-deploy-force --retour" ssh-ed25519 AAAA… waiggle-retour@vps-dev
```

`ssh` part toujours en IPv4 (`-4`), donc `from=` ne porte que l'IPv4 de vps-dev (M2).

## A3. Les règles communes aux trois scripts

1. **En-tête** : `#!/bin/bash -p`, puis `set -euo pipefail`, `IFS=$' \t\n'`, `umask 077`, `cd /`. `-p` empêche bash de
   lire `BASH_ENV`, `SHELLOPTS`, `BASHOPTS` et d'importer des fonctions.
2. **L'appelant** (m1) : sur vps-dev, la toute première ligne utile lit `SUDO_USER` et le valide
   (`^[a-z_][a-z0-9_-]{0,31}$`, sinon `inconnu`). C'est la seule lecture de l'environnement de l'appelant.
3. **L'environnement est vidé** juste après, dans le processus même : chaque variable exportée (`compgen -e`) est
   retirée, puis seules `PATH=/usr/sbin:/usr/bin:/sbin:/bin`, `HOME=/root` (vps-dev) et `LANG=C.UTF-8` sont posées.
   Le script ne se relance pas sous `env -i`, car il faudrait un marqueur que l'appelant pourrait poser. Un
   programme qui a besoin d'une variable la reçoit sur sa ligne (`/usr/bin/env GH_CONFIG_DIR=… /usr/bin/gh …`).
4. **Aucune valeur par défaut tirée de l'environnement** : ni `${X:-…}` sur une variable de l'appelant, ni option de
   test, ni fichier lu sous `/home`.
5. **Un seul bloc de chemins**, entre deux lignes exactes :
   ```
   # --- chemins : début ---
   …
   # --- chemins : fin ---
   ```
   Il porte chaque programme appelé, par son chemin absolu, et chaque fichier ou adresse. La copie de test ne
   remplace que ce bloc ; un test prouve qu'elle ne diffère du script qu'entre ces deux lignes. Hors du bloc, aucun
   programme n'est appelé par son seul nom, sauf les commandes internes de bash.
6. **Aucun secret sur une ligne de commande** (M1), puisque `ps` la montre à `louis`. Le jeton reste dans
   `GH_CONFIG_DIR`, le sujet ntfy dans le fichier passé par `curl -K`, et aucune adresse n'est de la forme
   `https://x:jeton@`.
7. **Aucun texte reçu n'est recopié** dans le journal, une notification ou `logger` : seulement des valeurs
   validées (commit, empreinte, appelant) et des codes de la liste fermée A7.
8. **Messages** : une ligne en français sur la sortie d'erreur pour un refus (`waiggle-deployer : <phrase>`) ; les
   étapes sur la sortie standard.

Le bloc de vps-dev (`waiggle-deployer` ; `waiggle-retour` prend le même, sans ce qui ne lui sert pas) :

```
# --- chemins : début ---
GIT=/usr/bin/git
GH=/usr/bin/gh
SSH=/usr/bin/ssh
CURL=/usr/bin/curl
SYSTEMD_RUN=/usr/bin/systemd-run
FLOCK=/usr/bin/flock
TIMEOUT=/usr/bin/timeout
ID=/usr/bin/id
ORIGINE=https://github.com/EthogramHQ/Waiggle.git
DEPOT=/srv/waiggle-deploy/depot.git
GH_DIR=/root/.config/waiggle-deploy/gh
NTFY=/root/.config/waiggle-deploy/ntfy.curl
CLE=/root/.ssh/waiggle-prod
CLE_RETOUR=/root/.ssh/waiggle-retour
HOTES_CONNUS=/root/.ssh/known_hosts
PRODUCTION=louis@<IPv4 de la production>
VERROU=/run/waiggle-deploy.lock
ETAT=/var/lib/waiggle-deploy
JOURNAL=/var/log/waiggle-deploy.log
TRAVAIL=/run/waiggle-deploy
# --- chemins : fin ---
```

Dans les tests, `GIT` reste le vrai `git`, et `ORIGINE` est un dépôt nu fait dans un dossier temporaire (I-3).

**Le code commun** de `waiggle-deployer` et `waiggle-retour` (journal, notification, vérifications) est recopié
dans les deux fichiers, entre `# --- commun : début ---` et `# --- commun : fin ---`. Il n'y a ni `source` ni
fichier partagé à l'exécution. Un test prouve que les deux blocs sont identiques.

**Les appels de programmes**, mot pour mot (les faux programmes des tests n'acceptent que ceux-là) :

- Le `fetch` (M5, m7) : `$GIT -C $DEPOT -c credential.helper= -c "credential.helper=!/usr/bin/env GH_CONFIG_DIR=$GH_DIR $GH auth git-credential" fetch --quiet --no-tags --prune $ORIGINE +refs/heads/main:refs/remotes/origin/main`.
  `$DEPOT` est créé par `git init --quiet --bare` s'il manque.
- Une lecture de GitHub : `/usr/bin/env GH_CONFIG_DIR=$GH_DIR $GH api <chemin> --jq <filtre>`.
- L'attestation, pour `<part>` = `api` puis `web` (les options de `deploy-from-pc.sh:61-67`) :
  `/usr/bin/env GH_CONFIG_DIR=$GH_DIR $GH attestation verify oci://<préfixe>-<part>:<commit> --repo EthogramHQ/Waiggle --signer-workflow EthogramHQ/Waiggle/.github/workflows/ci.yml --source-ref refs/heads/main --source-digest <commit> --deny-self-hosted-runners --format json --jq .[0].verificationResult.statement.subject[0].digest.sha256`.
- `ssh` avec la clé de déploiement : `$TIMEOUT <délai> $SSH -F /dev/null -4 -i $CLE -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$HOTES_CONNUS -o BatchMode=yes -o ConnectTimeout=20 $PRODUCTION <commande>`.
  Le délai vaut `60` pour `version`, `900` pour `deploy`. Aucune option ne vient de l'appelant.
- `ssh` avec la clé de retour : la même ligne, avec `-i $CLE_RETOUR` et `-o BatchMode=no`. La phrase de passe est
  demandée sur le terminal d'`admin`, et rien ne la fournit à sa place.
- La notification (I1) : `$CURL -fsS --max-time 10 -K $NTFY -H "Title: waiggle-deployer" --data-binary @-`, le
  texte sur l'entrée standard.
- Les Mentions légales (I-5) : `$SYSTEMD_RUN --wait --pipe --collect --quiet -p DynamicUser=yes -p PrivateNetwork=yes -p ProtectHome=yes -p ProtectSystem=strict -p PrivateTmp=yes -p NoNewPrivileges=yes -p RuntimeMaxSec=60 -p WorkingDirectory=<dossier> /usr/bin/node scripts/legal-placeholders.mjs`.

## A4. `waiggle-deployer <commit>`, dans l'ordre

Codes de sortie : `0` déployé ; `2` refusé (la production n'a reçu, au plus, que `version`) ; `3` trop tôt (verrou,
écart ou plafond : rien n'a été examiné) ; `4` échec ou délai dépassé du côté de la production ; `5` notification
de début impossible (rien n'a été examiné).

0. **Démarrage** (A3) : l'appelant est lu, l'environnement est vidé. `$ID -u` doit valoir `0`, sinon code 2, sans
   journal. Le verrou se prend par `$FLOCK -n` sur `$VERROU`. S'il est pris : une ligne `fin` (raison `verrou`),
   **pas** de notification (celle de l'essai en cours suffit), code 3. `$TRAVAIL` est créé en 0755.
1. **L'argument** : un seul, conforme à `^[0-9a-f]{40}$`. Sinon (m2) : une ligne `fin` (raison `argument`, commit
   `-`, rien de l'argument recopié), une notification soumise à la fenêtre d'alerte (étape 2), code 2. Un argument
   mal formé ne compte pas dans l'écart ni dans le plafond.
2. **La cadence** (I2), avant tout autre examen. `$ETAT/essais` a une ligne `<secondes depuis 1970> <commit>` par
   essai compté.
   - **Écart** : refus si le dernier essai compté date de moins de 600 secondes ;
   - **plafond** : refus s'il y a déjà 6 essais comptés dans le jour UTC.

   Un refus donne une ligne `fin` (raison `ecart` ou `plafond`) et le code 3. Il donne aussi une notification,
   **au plus une toutes les 600 secondes** (m3), comptée dans `$ETAT/derniere-alerte`. Sinon, la ligne de l'essai
   s'ajoute à `essais` avant l'étape suivante : un essai refusé plus loin compte quand même.
3. **Le début** : une ligne `debut` au journal, puis la notification de début. Si elle ne part pas (code de `curl`
   non nul), une ligne `fin` (raison `notification`) et le code 5 (m3).
4. **Sur `main`** : le `fetch` ; `rev-parse --verify --quiet "<commit>^{commit}"` doit rendre le commit ; puis
   `merge-base --is-ancestor <commit> refs/remotes/origin/main`. Sinon : raison `pas-sur-main`, code 2.
5. **La version en service** : `ssh … version`, délai de 60 s. La réponse est une seule ligne conforme à
   `^[0-9a-f]{40}$`, sinon raison `version-illisible` (pas de premier déploiement depuis vps-dev). Puis :
   - égale au commit : raison `deja-en-service` ;
   - absente du dépôt, ou pas un ancêtre du commit (`merge-base --is-ancestor <en service> <commit>`) : raison
     `plus-ancien`.
6. **(D2) Fusionné par Louis**, pour chaque commit `c` de `rev-list --first-parent <en service>..<commit>` :
   - au plus 50 commits, sinon raison `intervalle-trop-long` ;
   - `api repos/EthogramHQ/Waiggle/commits/<c>/pulls`, filtré par
     `[.[] | select(.merged_at != null and .merge_commit_sha == "<c>" and .base.ref == "main" and .base.repo.full_name == "EthogramHQ/Waiggle") | .number]`.
     Il faut exactement un numéro, conforme à `^[0-9]{1,9}$`. Sinon raison `sans-pr` : un commit poussé sans PR,
     ou GitHub en retard juste après la fusion, d'où le message « réessaie dans quelques minutes » ;
   - `api repos/EthogramHQ/Waiggle/pulls/<n>`, filtré par
     `[.merged, .merge_commit_sha, .base.ref, .base.repo.full_name, .merged_by.id] | @tsv`. Il faut exactement
     `true`, `<c>`, `main`, `EthogramHQ/Waiggle`, `ID_LOUIS`. Sinon raison `pas-louis`.

   Le numéro de PR ne se lit **jamais** dans le message du commit. `<c>` est validé (40 hex) avant d'entrer dans
   le filtre.
7. **Le préfixe** : `git show <commit>:infra/site.env`, exactement une ligne qui commence par `IMAGE_PREFIX=`, et une
   valeur conforme. Sinon raison `site-env`.
8. **Les Mentions légales** (I4, I-5) : root extrait cinq fichiers de l'arbre du commit, par `git show`, dans un
   dossier neuf de `$TRAVAIL` (0755, fichiers en 0644), à leurs chemins relatifs :
   - `scripts/legal-placeholders.mjs` ;
   - `packages/brand/src/legal.ts` ;
   - `apps/api/src/env.ts` ;
   - `packages/i18n/src/locales/fr.ts` et `en.ts`.

   Le script se lance **sans commit**, sous `systemd-run` (A3), dans ce dossier. Une sortie non nulle donne la
   raison `mentions`. Le dossier est effacé à la fin, dans tous les cas.
9. **Les images** : l'attestation pour `api`, puis pour `web`. Chaque empreinte rendue doit être conforme à
   `^[0-9a-f]{64}$`. Sinon raison `attestation` ou `empreinte`, et la production n'est jamais appelée.
10. **Le déploiement** : `ssh … deploy <commit> <préfixe>-api@sha256:<empreinte> <préfixe>-web@sha256:<empreinte>`,
    délai de 900 s. La sortie du gardien passe telle quelle. Un code non nul donne la raison `production`, un délai
    dépassé la raison `delai`, et le code 4 dans les deux cas.
11. **La fin** : une ligne `fin` (résultat, durée, empreintes), puis la notification de fin. Un échec de cette
    dernière notification ne change pas le code.

**Les signaux** (`TERM`, `INT`, `HUP`) donnent une ligne `fin` (résultat `interrompu`) et le code 4. Une fois
l'étape 10 commencée, la production continue (A6).

## A5. `waiggle-retour <commit>`

Lancé par `admin` : `ssh admin@vps-dev`, puis `/usr/bin/sudo /usr/local/sbin/waiggle-retour <commit>`. Il prend le
chemin de A4, avec ces différences :
- le verrou s'attend au lieu de refuser : `$FLOCK -w 900`, puis code 3 si l'attente dépasse 900 s ;
- **ni écart ni plafond** (m4) : `essais` n'est ni lu ni écrit ;
- **ni l'étape 5 ni l'étape 6** : un commit plus ancien que celui en service est permis, comme le commit en service
  lui-même, pour réparer ;
- l'étape 10 se fait avec la **clé de retour**, jamais avec la clé de déploiement. Le gardien en mode `--retour`
  répond d'abord `avant <version en service>`, ce qui évite un second appel et une seconde phrase de passe ;
- le titre de la notification est `waiggle-retour`.

## A6. `waiggle-deploy-force` (production)

Il est lancé par `sshd`, en commande forcée, sous `louis`. Ses arguments sont soit aucun (clé de déploiement), soit
exactement `--retour` (clé de retour) ; tout autre argument donne un refus. Il lit `SSH_ORIGINAL_COMMAND` et
**ne le passe jamais à un shell** (ni `eval`, ni `bash -c` avec ce texte, ni expansion sans guillemets) : il le
compare entier, par `[[ … =~ … ]]`, puis se sert de `BASH_REMATCH`.

Codes : `0` réussi ; `2` refusé (rien n'est lancé) ; sinon le code de `deploy.sh`.

Son bloc de chemins :

```
# --- chemins : début ---
GIT=/usr/bin/git
DOCKER=/usr/bin/docker
LOGGER=/usr/bin/logger
SETSID=/usr/bin/setsid
TAIL=/usr/bin/tail
DEPLOYE=/srv/ruche/deployed.env
DEPOT=/srv/ruche/repo
JOURNAUX=/srv/ruche/waiggle-deploy-force
# --- chemins : fin ---
```

Les commandes acceptées, comme chaînes entières :

- **`version`** : rend `RUCHE_VERSION` de `$DEPLOYE` sur une ligne, et rien d'autre. Si elle manque ou si elle est mal
  formée, rien n'est écrit et le code vaut 2.
- **`deploy <commit> <préfixe>-api@sha256:<64 hex> <préfixe>-web@sha256:<64 hex>`**, selon
  `^deploy ([0-9a-f]{40}) (ghcr\.io/[a-z0-9._/-]+)-api@sha256:([0-9a-f]{64}) (ghcr\.io/[a-z0-9._/-]+)-web@sha256:([0-9a-f]{64})$`.
  Les deux préfixes doivent être égaux. Dans l'ordre :
  1. **la version en service** : `RUCHE_VERSION` de `$DEPLOYE`, 40 hex. Sans elle, le mode normal refuse ; le mode
     `--retour` continue ;
  2. **`main`** : `$GIT -C $DEPOT fetch --quiet --no-tags origin main`, puis
     `merge-base --is-ancestor <commit> origin/main`. Sinon, refus ;
  3. **(D4) le sens**, en mode normal seulement : le commit diffère de la version en service, et
     `merge-base --is-ancestor <en service> <commit>`. Sinon, refus. Le mode `--retour` accepte un commit plus
     ancien, ou le même ;
  4. **(D4, I-1) les empreintes liées au commit** : pour `api` et `web`,
     `$DOCKER buildx imagetools inspect <préfixe>-<part>:<commit> --format '{{json .Manifest.Digest}}'` doit rendre
     exactement `"sha256:<l'empreinte reçue>"`. Sinon, refus ;
  5. **le lancement détaché** (I2) : une ligne `avant <en service ou ->` sur la sortie. Puis `deploy.sh` est lancé
     par `$SETSID nohup /bin/bash -c '"$0" "$1" "$2" "$3"; printf "fin %s\n" "$?"'`, avec
     `$DEPOT/infra/deploy.sh <commit> <image api> <image web>` en arguments. Les valeurs passent en arguments,
     jamais dans le texte du `-c`. L'entrée vient de `/dev/null`, et la sortie va dans
     `$JOURNAUX/<AAAAMMJJTHHMMSSZ>-<commit 7>.log` ;
  6. **le suivi** : `$TAIL -n +1 -f --pid=<pid> <journal>` jusqu'à la fin de `deploy.sh`, puis le code lu sur la
     ligne `fin <code>`. Une connexion fermée n'arrête que le suivi, pas `deploy.sh`.
- **Tout le reste** est refusé sans rien lancer : un mot en plus, des guillemets, `;`, `|`, `&`, `$`, `` ` ``, un
  retour à la ligne, une commande vide, une session interactive (aucune commande).

**Chaque commande** donne une ligne `$LOGGER -t waiggle-deploy`, au format
`<normal|retour> <accepte|refuse> <raison> commit=<40 hex|-> client=<adresse>`. L'adresse est le premier mot de
`SSH_CLIENT`, gardée seulement si elle est faite de chiffres, de points et de deux-points, sinon `-`. Une
commande refusée n'est jamais recopiée.

## A7. Le journal et les notifications

**Le journal** (`$JOURNAL`) a une ligne par événement, avec des champs `clé=valeur` sans espace, dans cet ordre :

```
<AAAA-MM-JJTHH:MM:SSZ> <debut|fin> script=<waiggle-deployer|waiggle-retour> appelant=<nom> commit=<40 hex|-> service=<40 hex|-> api=<64 hex|-> web=<64 hex|-> etape=<0-11> resultat=<ok|refus|tard|echec|interrompu> raison=<code> duree=<secondes>
```

- Une ligne `debut` ne porte que l'horodatage, `script`, `appelant` et `commit`.
- **Chaque essai a exactement une ligne `fin`**. Un essai qui passe la cadence a aussi une ligne `debut`, avant.
- **Les raisons** forment une liste fermée : `ok`, `argument`, `verrou`, `ecart`, `plafond`, `notification`,
  `pas-sur-main`, `version-illisible`, `deja-en-service`, `plus-ancien`, `intervalle-trop-long`, `sans-pr`,
  `pas-louis`, `site-env`, `mentions`, `attestation`, `empreinte`, `production`, `delai`, `interrompu`.
- Le journal ne contient jamais le jeton, une clé, le sujet ntfy, ni le contenu d'un fichier de `/root`.

**Les notifications** se font en une ligne de texte, par exemple :

```
déployé : 1a2b3c4 (avant 9f8e7d6), demandé par louis, 212 s
refusé (pas-louis) : 1a2b3c4, demandé par louis, étape 6
début : 1a2b3c4, demandé par louis
```

Chaque essai envoie le début et la fin. Les refus de cadence et d'argument envoient au plus une notification toutes
les 600 s. Le refus du verrou n'en envoie pas.

## A8. `installer.sh` (vps-dev)

`infra/vps-dev/installer.sh <commit>`, lancé par root (Louis, sous `admin`). Le script lui-même est lu **dans le
dépôt nu de root**, jamais dans une copie de `louis` (M4) :

```
sudo bash -c 'git -C /srv/waiggle-deploy/depot.git show "$1:infra/vps-dev/installer.sh" > /root/waiggle-installer.sh && bash /root/waiggle-installer.sh "$1"' _ <commit>
```

Dans l'ordre :
1. il vérifie l'uid 0, un seul argument de 40 hex, et que le commit est sur `refs/remotes/origin/main` du dépôt nu ;
2. il installe **seulement** les fichiers nommés, lus par `git show <commit>:<chemin>` :
   - `infra/vps-dev/waiggle-deployer` et `waiggle-retour` vers `/usr/local/sbin/` (root:root 0755) ;
   - `infra/vps-dev/waiggle-deploy.logrotate` vers `/etc/logrotate.d/waiggle-deploy` (root:root 0644) ;
3. chaque fichier installé est relu et comparé au blob du commit (`git hash-object` contre
   `git rev-parse <commit>:<chemin>`). Une différence efface le fichier posé et donne un refus ;
4. il crée `/var/lib/waiggle-deploy` (0700) et `/root/.config/waiggle-deploy` (0700), s'ils manquent ;
5. il ne touche ni au `sudoers`, ni aux clés, ni au jeton, ni au sujet ntfy, ni à `known_hosts` : ce sont des gestes
   de Louis, que le script rappelle à la fin, dans l'ordre.

Le premier `fetch` du dépôt nu, avant la première installation, se fait à la main (`infra/vps-dev/README.md`) :
créer le dépôt nu, poser le jeton (`gh auth login --with-token`, collé au terminal, jamais dans un tube ni un
argument), puis faire le `fetch` de A3.

## A9. La CI (`ci.yml`)

Deux ajouts dans la tâche `check` (`contents: read`, sans secret) :
- une étape `node --test infra/vps-dev/*.test.mjs infra/production/*.test.mjs` ;
- `shellcheck -x` sur la liste nommée `infra/vps-dev/waiggle-deployer`, `infra/vps-dev/waiggle-retour`,
  `infra/vps-dev/installer.sh`, `infra/production/waiggle-deploy-force` (pas de motif qui prendrait les `.mjs` ou
  ce contrat, m8).

Les tests ne tournent que sous Linux (`flock`, `setsid`, bash).

## A10. Les tests à exiger

Les faux programmes sont posés par la copie de test, jamais par l'environnement. Le vrai `git` vérifie
l'ascendance, contre un faux dépôt distant (un dépôt nu dans un dossier temporaire). Les faux `gh`, `ssh`, `curl`,
`systemd-run`, `docker` et `id` ne réussissent qu'avec leurs arguments exacts (A3, A6). L'aide commune est
`infra/faux-programmes.mjs`.

Les titres qui suivent sont **recopiés mot pour mot** des deux relectures de sécurité (v0 puis v1). Les marques
de la relecture (« (D2) », « (si Louis retient I3) ») sont retirées des titres ; D2 et D4 sont retenus.

**`waiggle-deployer`** (`infra/vps-dev/waiggle-deployer.test.mjs`)

De la relecture v0 :
- refuses an argument that is not exactly 40 lowercase hexadecimal characters (39, 41, uppercase, `--upload-pack=x`, a trailing newline, two arguments)
- refuses to run when the user id is not 0
- ignores PATH, HOME, GIT_*, GH_*, SSH_* and RUCHE_* from the caller's environment
- refuses a commit that is not on main of the GitHub repository
- refuses a commit that does not descend from the version in production
- refuses the commit already in production
- refuses when production answers a version that is not 40 hexadecimal characters
- reads infra/site.env from the commit tree, never from a working copy of louis
- runs the legal check as an unprivileged user that cannot read /root
- refuses when an image has no provenance attestation from main's CI for this commit, and never calls production
- refuses a digest that is not 64 hexadecimal characters
- calls production with exactly: deploy <commit> <prefix>-api@sha256:<64 hex> <prefix>-web@sha256:<64 hex>
- refuses a second run while one is in progress
- refuses a run sooner than the minimum interval after the previous attempt, counted before any other check
- writes one log line per attempt, accepted or refused, with the caller, the commit and the result
- never prints or logs the token, the key or the content of a file under /root
- never puts the token on a command line
- sends one notification per attempt, accepted or refused
- production keeps deploying when the caller sends SIGTERM after the deploy step started

De la relecture v1 :
- calls gh attestation verify, for each image, with exactly the repository, the signer workflow ci.yml, --source-ref refs/heads/main, --source-digest <commit> and --deny-self-hosted-runners
- calls ssh with the root key, IdentitiesOnly, StrictHostKeyChecking=yes and BatchMode, and no option from the caller
- checks ancestry with the real git against a local copy of main, never with a fake git
- differs from the installed script only in the block of paths
- has no default taken from the environment and no test switch
- records the calling user given by sudo before clearing the environment
- logs and notifies a malformed argument without copying it
- refuses to deploy when the start notification cannot be sent
- runs the legal check in a transient unit without network, /home or /root, stopped after its time limit
- refuses a commit pushed on main without a pull request
- refuses a merge commit whose pull request was merged by another account, compared by numeric id
- refuses a pull request that is not merged, or whose base is not main, even when merge_commit_sha matches
- refuses when a first-parent commit between the version in production and the commit was not merged by Louis
- never reads the pull request number from the commit message

Ajoutés par ce contrat (ses choix, partie D) :
- refuses a run when the daily cap of attempts is reached
- notifies a refusal for the interval or the daily cap at most once every ten minutes
- does not count a malformed argument as an attempt
- keeps the common block identical in waiggle-deployer and waiggle-retour
- refuses more than 50 first-parent commits between the version in production and the commit

**`waiggle-retour`** (même fichier de test)

- deploys a commit of main older than the version in production
- is refused without a password : ce n'est pas un test, c'est une vérification de Louis (A11)
- is not blocked by the interval or the daily cap of waiggle-deployer
- uses the return key, never the deploy key
- ajouté par ce contrat : waits for a running deployment to finish, up to fifteen minutes

**`waiggle-deploy-force`** (`infra/production/waiggle-deploy-force.test.mjs`)

De la relecture v0 :
- answers version with the commit of deployed.env and nothing else
- accepts only "deploy <40 hex> <prefix>-api@sha256:<64 hex> <prefix>-web@sha256:<64 hex>" as the whole command
- refuses extra words, quotes, ; | & $ ` and a newline, an empty command and an interactive session, without running anything (fichier témoin absent)
- runs deploy.sh detached, so that a closed connection does not stop it
- refuses a commit that does not descend from the version in production

De la relecture v1 :
- refuses an image digest that is not the one of the tags <prefix>-api:<commit> and <prefix>-web:<commit>
- accepts a commit older than the version in production only under the return key's forced command
- never hands SSH_ORIGINAL_COMMAND to a shell

Ajoutés par ce contrat :
- refuses two images whose prefixes differ
- prints the version it replaces before following the deploy log
- exits with the exit code of deploy.sh
- logs every command with the client address, without copying a refused command

**`installer.sh`** (`infra/vps-dev/installer.test.mjs`)

- installs only the named files, from root's bare repository at the named commit, and refuses a file that differs from that commit

## A11. Les vérifications de Louis, après l'installation

Ce que les tests ne peuvent pas montrer : le vrai `sudo`, le vrai bac à sable, les vraies clés.

Sur vps-dev, sous `louis` :
- `sudo -k; sudo -n /usr/local/sbin/waiggle-deployer x; echo $?` → le refus du script (code 2), et non
  « a password is required » ;
- `sudo -n /usr/local/sbin/waiggle-retour <commit>` → refusé (pas dans ses droits) ;
- `sudo -n true` → refusé ;
- `cat /root/.ssh/waiggle-prod` et `ls /srv/waiggle-deploy` → refusés.

Sur vps-dev, sous `admin` :
- `sudo -l -U louis` → l'aperçu, `pilote-deployer` et `waiggle-deployer`, rien d'autre ; ni `SETENV`, ni
  `env_keep` ajouté, ni `!env_reset` ; `secure_path` présent (B2, m1) ;
- `namei -l /usr/bin/git /usr/bin/gh /usr/bin/node /usr/bin/ssh /usr/bin/curl /usr/bin/systemd-run /usr/bin/flock /usr/bin/timeout`
  → chaque maillon est à root et non inscriptible par le groupe ni par les autres ;
- `sysctl kernel.yama.ptrace_scope` → 1 au moins ;
- `sudo ssh -F /dev/null -4 -i /root/.ssh/waiggle-prod <production> id` → refusé par le gardien ;
  `… -N -L 1:127.0.0.1:22 <production>` → refusé ;
- `sudo ssh-keygen -y -f /root/.ssh/waiggle-retour` → demande la phrase de passe.

Depuis une autre machine : la clé de déploiement → refusée par `from=`.

Sur GitHub (B-2, D1 (a), D2) :
- `gh api repos/EthogramHQ/Waiggle/collaborators/<compte machine>/permission --jq .permission` → `read` ;
- « Fork pull request workflows » : ni jeton en écriture, ni secrets envoyés aux PR de fork, sans approbation à
  chaque exécution ;
- la fusion par rebase est désactivée ;
- `gh api user --jq .id`, sous le compte de Louis → la valeur de `ID_LOUIS` ;
- l'inventaire des identités de vps-dev qui écrivent sur Waiggle est vide.
