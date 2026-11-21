# 0007 — Un serveur de développement privé, machine principale du développement

- Statut : accepté
- Date : 2026-11-21 (serveur mis en place le 18/11/2026, machine principale depuis le 20/11/2026)
- Complète : 0003 (la production reste sur son serveur, sans Node ni code source)

## Contexte

Jusqu'au 18 novembre 2026, tout le développement se faisait sur un seul PC (15 Go de mémoire) :
plusieurs copies de travail, leurs tests et typechecks, les captures (Chromium), le serveur de
l'appli, et l'assistant de code. Trois limites en sortaient :

- **la mémoire** : une copie de Metro prend 1,5 à 3 Go, une suite de tests plusieurs Go. Le PC a
  déjà gelé faute de mémoire, et les commandes lourdes passaient les unes après les autres ;
- **voir l'appli pendant qu'elle se construit** : seulement par les captures, une fois la tranche
  assemblée. Rien ne montrait l'état d'une branche depuis un téléphone ;
- **la dépendance au PC allumé** : PC éteint ou en veille, plus rien n'avançait, déploiement compris.

La production (0003) ne peut pas servir à ça : elle n'a volontairement ni Node, ni pnpm, ni code
source, et rien de ce qui est en cours ne doit l'approcher.

## Décision

1. **Un second serveur, `vps-dev`, séparé de la production** : un VPS (OVH VPS-3, 6 vCPU, 12 Go,
   100 Go, Debian 13), sans engagement. Il sert à plusieurs projets, pas seulement à Waiggle. Il
   n'a **aucune donnée réelle** (sa base est une base PGlite à lui, les e-mails ne partent jamais)
   et **aucun nom public**.
2. **Joignable seulement par Tailscale** : le pare-feu ferme tout sauf l'interface `tailscale0`
   (le port 22 public compris ; la console du fournisseur reste le secours). SSH par clé, sans mot
   de passe ni connexion root, mises à jour de sécurité automatiques.
3. **Il est la machine principale du développement.** Le travail de l'assistant de code et de ses
   agents y vit, et le PC en reçoit la copie. Quand il est allumé, le PC vient en renfort : il
   prend des tâches selon le mode que choisit Louis (travail, nuit, jeu, serveur seul). Les
   captures, le parcours d'un membre et la vérification complète restent sur `vps-dev`.
4. **L'aperçu suit une branche à la fois** : l'API (`tsx watch`, base PGlite du serveur) et le
   serveur de développement d'Expo (Metro, rechargement à chaud, environ 6 s entre le fichier
   changé et l'écran), derrière Caddy en local puis `tailscale serve` en HTTPS. Une seule origine,
   comme en production : `/v1`, `/api/auth`, `/media`, `/health` vont à l'API, le reste à Metro. Une
   seule branche, parce que le téléphone n'a que le port 443 et que deux Metro prendraient 3 à 6 Go.
5. **GitHub par un compte machine, sans écriture sur le dépôt** : `vps-dev` pousse vers une fork
   (`ethogram-machine/Waiggle`) et ouvre les pull requests depuis elle. `main` demande une
   approbation que seul Louis peut donner : c'est lui qui approuve et fusionne.
6. **Le déploiement peut partir de `vps-dev`** (`infra/vps-dev/contrat.md`, `installation.md`) :
   après la fusion par Louis, `waiggle-deployer` met en ligne le commit de fusion. Sa clé ne peut
   lancer qu'une commande sur la production, le gardien `infra/production/waiggle-deploy-force`,
   qui vérifie la provenance de chaque image par son empreinte avant d'appeler `infra/deploy.sh`.
   Le retour en arrière, c'est Louis seul, sous un autre compte et avec une phrase de passe.
   `infra/deploy-from-pc.sh` reste possible depuis le PC.
7. **L'installation du serveur lui-même vit hors de ce dépôt** : le serveur sert à plusieurs
   projets, et ses scripts d'installation (compte, Tailscale, pare-feu, outils, aperçu) sont gardés
   avec l'outil qui le gère. Ce dépôt ne garde que ce qui touche Waiggle et sa production : les
   scripts du déploiement, relus par pull request et testés par la CI.

## Conséquences

- La production ne change pas : ni Node, ni code source. Ce qui peut l'atteindre depuis `vps-dev`
  est une seule commande, refusée si le commit n'est pas sur `main`, fusionné par Louis, et construit
  par la CI de `main`.
- `vps-dev` porte désormais une clé vers la production : c'est la raison des points 2 et 6
  (Tailscale seulement, clé limitée à une commande et à l'adresse de `vps-dev`).
- Le PC peut être éteint : le développement, l'aperçu et le déploiement continuent.
- Coût : de l'ordre de 12 € HT par mois sans engagement.
- Une commande lancée sur le serveur tourne sous Linux : un test qui dépendrait de Windows (chemins,
  fins de ligne) peut s'y comporter autrement. La CI (Linux) reste la référence.
