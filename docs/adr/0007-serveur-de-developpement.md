# 0007 — Un serveur de développement, privé, pour l'aperçu en direct et les commandes lourdes

- Statut : proposé
- Date : 2026-11-18
- Ne change rien à : 0003 (la production reste sur son serveur, sans Node ni code source)

## Contexte

Le développement se fait sur un seul PC (15 Go de mémoire), qui fait tourner en même temps
plusieurs copies de travail, leurs tests, leurs typechecks, les captures (Chromium) et le
serveur de l'appli. Deux limites en sortent :

- **la mémoire** : une copie de Metro prend 1,5 à 3 Go, une suite de tests plusieurs Go ; le PC a
  déjà gelé faute de mémoire, et les commandes lourdes passent les unes après les autres ;
- **voir l'appli pendant qu'elle se construit** : aujourd'hui, seulement par les captures, une
  fois la tranche assemblée. Rien ne montre, depuis un téléphone, l'état d'une branche au fil des
  commits.

La production (0003) ne peut pas servir à ça : elle n'a volontairement ni Node, ni pnpm, ni code
source, et rien de ce qui est en cours ne doit l'approcher.

## Décision

1. **Un second serveur, `ruche-dev`, séparé de la production** : un VPS (OVH VPS-3, 6 vCPU, 12 Go,
   100 Go, Debian 13), sans engagement. Il n'a **aucune donnée réelle** (sa base est une base
   PGlite à lui, les e-mails ne partent jamais), **aucun secret** de production, et **aucun nom
   public**.
2. **Joignable seulement par Tailscale** : le pare-feu ferme tout sauf l'interface `tailscale0`
   (le port 22 public compris ; la console du fournisseur reste le secours). SSH par clé, sans mot
   de passe ni connexion root. La politique du tailnet ouvre tout le serveur au PC, et seulement le
   443 (l'aperçu) au téléphone.
3. **Le PC y pousse par SSH, sans passer par GitHub** : un dépôt nu (`/srv/ruche-dev/waiggle.git`),
   remote `ruche-dev`. Le serveur ne reçoit aucune clé GitHub. Un hook `post-commit` local (non
   versionné) pousse chaque commit en arrière-plan ; il ne bloque ni ne fait échouer un commit.
4. **L'aperçu suit une branche à la fois** : l'API (`tsx watch`, base PGlite du serveur) et le
   serveur de développement d'Expo (Metro, rechargement à chaud), derrière Caddy en local puis
   `tailscale serve` en HTTPS. Une seule origine, comme en production : `/v1`, `/api/auth`,
   `/media`, `/health` vont à l'API, le reste à Metro. Après chaque push de la branche suivie, la
   copie de travail est mise au commit ; Metro voit les fichiers changer et recharge l'appli
   (mesuré : environ 6 s entre le fichier changé et l'écran). Une seule branche, parce que le
   téléphone n'a que le port 443 et que deux Metro prendraient 3 à 6 Go.
5. **Les commandes lourdes peuvent y tourner** : tests, typecheck, captures, sur un **instantané
   exact de la copie de travail du PC**, changements non commités compris (un commit construit
   dans un index temporaire, poussé sous `refs/instantanes/<branche>`, jamais référencé ailleurs).
   La sortie et le code de retour reviennent au PC. Un verrou par branche fait passer deux
   commandes l'une après l'autre. Les dépendances ne se réinstallent que si `pnpm-lock.yaml` a
   changé.
6. **Tout se reconstruit depuis le dépôt** : `infra/vps-dev/bootstrap.sh` (étapes `user`,
   `tailscale`, `lock`, `tools`, `services`, chacune relançable) et `infra/vps-dev/ruche-dev.sh`
   (l'outil installé sur le serveur). Le serveur ne garde rien qui ne soit ailleurs : on peut le
   réinstaller à tout moment.

## Conséquences

- La production ne change pas, ni son déploiement : rien ne part du serveur de développement
  vers elle.
- Un commit poussé par le hook rend la branche visible au serveur, pas à GitHub : `origin`, les
  pull requests et la CI restent la seule voie vers `main`.
- Coût : de l'ordre de 12 € HT par mois sans engagement (10,40 € avec un engagement d'un an).
- Une commande lancée sur le serveur tourne sous Linux : un test qui dépendrait de Windows (chemins,
  fins de ligne) peut s'y comporter autrement. La CI (Linux) reste la référence.
- Le serveur de développement est une cible de moindre valeur (aucune donnée réelle), mais il a
  le code : d'où Tailscale seulement, SSH par clé, et des mises à jour de sécurité automatiques.

## Commandes

```sh
# Mettre un serveur neuf en état (depuis le PC ; voir l'en-tête de bootstrap.sh)
ssh ruche-dev 'sudo bash -s -- user louis' < infra/vps-dev/bootstrap.sh
ssh ruche-dev 'sudo bash -s -- tailscale'  < infra/vps-dev/bootstrap.sh
ssh ruche-dev 'sudo bash -s -- lock louis' < infra/vps-dev/bootstrap.sh
ssh ruche-dev 'sudo bash -s -- tools louis' < infra/vps-dev/bootstrap.sh
scp -r infra/vps-dev ruche-dev:/tmp/ && ssh ruche-dev 'sudo bash /tmp/vps-dev/bootstrap.sh services louis'

# Au quotidien
git push ruche-dev <branche>                        # (le hook post-commit le fait seul)
ssh ruche-dev ruche-dev apercu <branche>            # l'aperçu suit cette branche
ssh ruche-dev ruche-dev etat                        # ce qui tourne, adresse, code d'invitation
ssh ruche-dev ruche-dev mails                       # les liens de vérification de l'aperçu
```
