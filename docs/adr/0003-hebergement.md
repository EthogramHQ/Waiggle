# 0003 — Un VPS, des images construites par GitHub, un déploiement lancé à la main

- Statut : accepté
- Date : 2026-10-13
- Mis à jour : le 23/10/2026, le domaine principal devient waiggle.com (ADR 0006)

## Contexte

L'appli quitte l'ordinateur de développement pour être utilisée par les proches de Louis. Louis
a loué un VPS Hostinger KVM 2, hébergé à Paris, et acheté le domaine waiggle.io chez Hostinger.
Le serveur est modeste (2 processeurs, 8 Go de mémoire). Louis veut que l'assistant puisse le gérer pour lui, depuis
l'assistant de code installé sur son PC.

Le dépôt est public, et le serveur héberge les données des membres : la sécurité passe avant le
confort.

## Décision

1. **Un seul VPS, sous Debian 13, avec Docker Compose** : la base (PostgreSQL), l'API et une porte
   d'entrée « web » (Caddy et l'appli web déjà construite). Seuls les ports 22, 80 et 443 sont
   ouverts.
2. **Deux domaines du même site** : waiggle.io pour l'appli, api.waiggle.io pour l'API. Les cookies
   de connexion (SameSite=Lax) et la règle CORP de l'API exigent un même domaine principal.
3. **GitHub construit les images, le VPS les télécharge.**
   - Après chaque fusion sur main, et seulement si toute la CI est verte, GitHub publie
     `ruche-api` et `ruche-web` sur ghcr.io.
   - Chaque image est étiquetée avec le numéro de son commit et accompagnée d'une attestation de
     provenance.
   - Les domaines vivent dans `infra/site.env`, versionné et sans secret.
4. **Le déploiement est lancé à la main**, depuis le PC de Louis (`infra/deploy-from-pc.sh`). Ce
   n'est pas GitHub qui s'en charge. Le script :
   - vérifie avec `gh attestation verify` que chaque image a été construite par la CI de main,
     depuis ce commit ;
   - lance `infra/deploy.sh` sur le serveur par SSH, avec l'**empreinte** exacte des images
     vérifiées (`…@sha256:…`), jamais une étiquette.
5. **La procédure est versionnée dans le dépôt** :
   - la préparation du serveur (`infra/server/bootstrap.sh`), par étapes ;
   - la sauvegarde quotidienne (`infra/backup.sh`) et la restauration (`infra/restore.sh`) ;
   - le pas-à-pas complet dans `docs/ops/serveur.md`.
6. **Un compte d'administration `louis`** :
   - connexion par clé SSH seulement, root fermé ;
   - `sudo` sans mot de passe.

## Raisons

- **Des images construites ailleurs** :
  - Construire l'appli Expo prendrait de longues minutes sur un serveur aussi modeste, et beaucoup de
    mémoire, pendant que le site tourne.
  - Le serveur n'a besoin ni de Node, ni de pnpm, ni du code source pour construire : moins de
    logiciels installés, c'est moins de failles possibles.
  - Revenir en arrière consiste à relancer l'image précédente, déjà prête.
- **Un déploiement manuel** : pour déployer tout seul, GitHub devrait détenir une clé SSH du
  serveur. Une fuite de cette clé, ou une action GitHub piégée, donnerait alors le serveur entier.
  Lancer le déploiement depuis le PC de Louis garde cette clé chez lui. Et puisque l'assistant de code le
  fait pour lui, cela ne coûte qu'une phrase.
- **`sudo` sans mot de passe** :
  - le compte n'a pas de mot de passe (connexion par clé seulement) ;
  - il fait partie du groupe `docker`, ce qui équivaut déjà à être root : un mot de passe pour
    `sudo` n'ajouterait pas de vraie protection ;
  - en revanche, il empêcherait l'assistant de code de travailler seul, puisque l'assistant ne tape jamais de
    mot de passe.
  - La protection réelle est donc la clé SSH, sur le PC de Louis. Sa phrase de passe protège le
    fichier en cas de vol du PC. En revanche, une fois la clé chargée dans l'agent, tout programme
    lancé sous le compte de Louis peut s'en servir : d'où le conseil d'une clé physique
    (`ed25519-sk`) quand c'est possible.
- **Vérifier la provenance des images** : une étiquette (`ruche-api:<commit>`) peut être
  remplacée par n'importe quel workflow qui a le droit d'écrire les paquets, y compris celui
  d'une pull request venue d'une branche du dépôt. L'attestation, signée par GitHub, dit d'où vient
  l'image (dépôt, workflow, branche, commit). Déployer par empreinte garantit que l'image lancée
  est exactement celle qui a été vérifiée.
- **Caddy** : il obtient et renouvelle seul les certificats HTTPS, et sa configuration tient en
  une page. Il pose aussi les en-têtes de sécurité, dont une CSP stricte. Celle-ci est vérifiée
  à chaque construction (`infra/web/check-web.mjs`) et dans un vrai navigateur
  (`apps/app/scripts/site-check.mjs`).
- **Les sauvegardes** :
  - une sauvegarde chaque nuit sur le serveur, gardée 14 jours, plus une avant chaque déploiement ;
  - les sauvegardes hebdomadaires de Hostinger couvrent le serveur entier.
  - La CI vérifie la boucle « sauvegarder, puis restaurer » à chaque pull request : une
    sauvegarde jamais restaurée ne prouve rien.

## Conséquences

- Il faut deux étapes pour mettre en ligne une version : fusionner (Louis), puis déployer (l'assistant
  Code local, à la demande de Louis).
- Le PC qui déploie a besoin de GitHub CLI, connecté au compte de Louis.
- Les paquets ghcr.io doivent être publics. C'est cohérent avec un code public : les images ne
  contiennent aucun secret.
- Le domaine est écrit dans l'image web, au moment de la construction. Changer de domaine
  demande donc une nouvelle publication (`infra/site.env`).
- Les sauvegardes restent chez Hostinger : celles du serveur (14 jours) et la sauvegarde
  hebdomadaire du VPS entier, incluse dans l'offre. Risques acceptés par Louis :
  - si le VPS disparaît, on revient à la dernière sauvegarde hebdomadaire : jusqu'à 7 jours de
    données perdus ;
  - un compte Hostinger perdu ou piraté emporterait toutes les sauvegardes. La double
    authentification du compte réduit ce risque.

  Une copie chiffrée sur le PC a été écrite (ADR 0004, retirée, pull request #11), puis
  abandonnée au profit de la sauvegarde hebdomadaire de Hostinger.
- Le serveur n'a pas de surveillance automatique (disponibilité, disque). C'est à ajouter.
