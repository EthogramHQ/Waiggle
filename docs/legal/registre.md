# Le registre des traitements

Ce document est le registre des activités de traitement de Waiggle, au sens de l'article 30.1 du
RGPD : pour chaque usage des données des membres, pourquoi on les garde, sur quelle base, qui les
reçoit, combien de temps, et comment elles sont protégées. Il est tiré de l'inventaire réel des
données (relecture juridique complète du 15/11/2026, tranche R11), et suit le code : une durée
écrite ici est celle que le fichier cité applique.

- **Le dépôt est public** : aucune donnée d'un membre ne s'écrit ici, ni nom, ni adresse, ni
  identifiant.
- **Rien n'est validé par un professionnel** (juriste ou avocat). Les bases légales sont
  _probables_ ; celles marquées « à vérifier » le sont plus encore. La validation vient avant
  l'ouverture au public.
- **Mise à jour** : à chaque tranche qui ajoute une donnée, une durée ou un destinataire, dans la
  même pull request. La page « Confidentialité » de l'appli (`packages/i18n`) dit la même chose aux
  membres : les deux changent ensemble.

Dernière mise à jour : 23/11/2026 (tranche R19, la récolte).

## 1. Le responsable du traitement

- **L'éditeur**, entrepreneur individuel (micro-entreprise). Ses coordonnées (nom, adresse
  professionnelle, SIREN, e-mail) s'écrivent à un seul endroit, `packages/brand/src/legal.ts`, et
  s'affichent dans les Mentions légales (`/legal`). Ce sont des emplacements jusqu'au déploiement.
- **Pour le joindre** : l'adresse `contact@` du domaine (voir « La boîte contact@ » plus bas).
- **Délégué à la protection des données** : aucun. Une micro-entreprise qui ne fait pas de suivi
  régulier et systématique à grande échelle n'est probablement pas tenue d'en désigner un (art. 37,
  à vérifier).
- **Les administrateurs** (rôle `admin_member`) agissent pour l'éditeur : aujourd'hui, l'éditeur
  seul.

## 2. Les traitements

Pour chacun : la finalité, la base légale (article 6.1 du RGPD), les personnes et les données, les
destinataires, la durée et le fichier qui l'applique, la sécurité propre (la sécurité commune est
au § 5). « Le membre » désigne la personne qui a un compte ; « les membres », ceux qui le voient
selon les règles de visibilité de l'appli.

### 2.1 Le compte et la connexion

- **Finalité** : ouvrir un compte sur invitation, se connecter, garder sa session, retrouver son
  mot de passe, changer d'adresse.
- **Base** : l'exécution du contrat (6.1.b), c'est-à-dire les Règles acceptées à l'inscription.
- **Personnes et données** : les membres. Tables `user` (nom, adresse, adresse vérifiée, langue,
  dates, dernière activité), `account` (empreinte du mot de passe), `session` (jeton, adresse IP,
  navigateur, dates), `verification` (empreintes des jetons), `member_handle` (pseudo actuel,
  ancien, retiré), `notification_state`.
- **Destinataires** : le nom et le pseudo, les membres connectés (sauf blocage) ; l'adresse, aucun
  membre et aucun écran de modération ; le reste, personne.
- **Durées** :
  - le compte : sa vie ; une inscription jamais vérifiée, 30 jours (31 au plus), sauf un compte qui
    a déjà eu un pseudo (`apps/api/src/jobs/nightly-purge.ts`) ; un compte sans visite depuis
    3 ans, voir 2.12 ;
  - la session : 7 jours après sa dernière utilisation, renouvelée au plus une fois par jour, puis
    effacée la nuit suivante, 8 jours au plus (Better Auth, `apps/api/src/auth/auth.ts` ; purge :
    `nightly-purge.ts`). Une session utilisée chaque jour garde l'adresse IP de sa création ;
  - les jetons de vérification : 1 heure, effacés la nuit, 25 heures au plus (`nightly-purge.ts`) ;
  - l'ancien pseudo et le pseudo retiré : 30 jours (`apps/api/src/handles/claim.ts`, au démarrage et
    la nuit).
- **Sécurité** : mot de passe gardé en empreinte scrypt, jamais en clair ; jetons gardés en
  empreinte ; changement d'adresse confirmé depuis l'ancienne puis la nouvelle, mot de passe exigé.

### 2.2 L'accord aux règles et la déclaration d'âge (R11)

- **Finalité** : prouver que le membre a accepté la version en cours des Règles et déclaré avoir
  15 ans ou plus ; rouvrir l'accord à chaque nouvelle version.
- **Base** : l'exécution du contrat (6.1.b) ; la conservation de la preuve, l'intérêt légitime
  (6.1.f) : à vérifier.
- **Personnes et données** : les membres. Table `rules_acceptance` : version, date, « 15 ans ou
  plus » (toujours vrai). Jamais de date de naissance.
- **Destinataires** : le membre, dans son export.
- **Durée** : la vie du compte ; elle part avec lui (clé `on delete cascade`).
- **Sécurité** : la version vient du serveur (`RULES_VERSION`, `packages/contracts/src/rules.ts`),
  jamais de l'appli.

### 2.3 Le profil

- **Finalité** : se présenter aux proches ; depuis R12, à tout internaute par une page publique.
- **Base** : 6.1.b ; la diffusion publique, le choix du membre (6.1.a ou 6.1.b, à vérifier), qu'il
  retire à tout moment.
- **Données** : `profile`, `profile_tool` (bio, photo, outils favoris, « Ne pas me proposer ») ;
  la page publique et ses cases : `profile.public_page`, `public_bio`, `public_tools`,
  `public_projects`, `public_follower_count`.
- **Destinataires** : les membres ; pour une page publique, tout internaute et les moteurs de
  recherche (nom, photo, cases cochées) ; le nom et la photo de l'auteur d'un projet public, même
  sans page publique. Le pseudo n'est jamais montré sans compte.
- **Durée** : la vie du compte, jusqu'au changement ; la photo est effacée avec le compte.
- **Sécurité** : la photo est ré-encodée, sans ses métadonnées.

### 2.4 Les projets et leurs mises à jour

- **Finalité** : publier un projet, le décrire, le faire évoluer ; depuis R12, le montrer à tout
  internaute si l'auteur choisit « Public ».
- **Base** : 6.1.b ; la diffusion publique, le choix du membre (6.1.a ou 6.1.b, à vérifier), qu'il
  retire à tout moment.
- **Données** : `project`, `project_tool`, `project_media` et ses fichiers, `project_update`.
- **Destinataires** : un projet `public` (« Membres »), les membres ; un projet `web`
  (« Public »), tout internaute, et les moteurs de recherche, qui en gardent une copie sous leur
  propre responsabilité ; d'une ruche, ses membres ; privé ou retiré, son auteur et la modération.
- **Durées** : jusqu'à la suppression du projet ou du compte ; une photo de mise à jour restée « en
  attente », 24 heures (48 au plus, `nightly-purge.ts`). Hors de Waiggle, les copies des moteurs
  restent jusqu'à leur nouvelle lecture (`noindex`, 404 et sortie du plan du site, à l'instant du
  retour en arrière ou de la suppression).
- **Sécurité** : images ré-encodées ; liens externes par une page d'avertissement.

### 2.5 Les échanges entre membres

- **Finalité** : commenter, mentionner, réagir, suivre, lire son fil, recevoir des suggestions,
  bloquer.
- **Base** : 6.1.b.
- **Données** : `project_comment`, `comment_mention`, `project_reaction`, `member_follow`,
  `project_follow`, `feed_state`, `member_suggestion_dismissal`, `member_block`.
- **Destinataires** : les commentaires, les lecteurs du projet ; les réactions et les abonnés, en
  nombres seulement, jamais qui ; une mention, le mentionné ; un blocage, celui qui le pose.
- **Durées** : jusqu'au retrait par le membre ou à la suppression du compte. Un commentaire
  supprimé qui a des réponses garde seulement son identifiant, son projet et ses dates, sans auteur
  ni texte, tant qu'il a des réponses. La ligne de pollen d'un geste reste après son retrait (2.15).

### 2.6 Le coin des testeurs

- **Finalité** : s'inscrire comme testeur, recevoir les appels, échanger des retours privés avec
  l'auteur.
- **Base** : 6.1.b.
- **Données** : `project_tester`, `project_tester_removal`, `tester_call`, `tester_thread`,
  `tester_message`, `tester_media` (captures).
- **Destinataires** : les deux personnes du fil ; la modération si un message est signalé.
- **Durées** : la vie du projet et du compte du testeur ; le fil reste chez l'auteur après le départ,
  le retrait ou le blocage du testeur ; une capture restée « en attente », 24 heures (48 au plus,
  `nightly-purge.ts`).

### 2.7 Les ruches

- **Finalité** : des groupes de proches, sur invitation.
- **Base** : 6.1.b.
- **Données** : `hive`, `hive_member`, `hive_invitation`, `hive_notice`.
- **Destinataires** : les membres de la ruche ; l'invité, pour le nom de la ruche.
- **Durées** : une ruche, jusqu'au départ de son dernier membre ; une invitation, 30 jours, refusées
  comprises (31 au plus) ; une trace de ruche, 90 jours (`nightly-purge.ts`).

### 2.8 Le catalogue des outils

- **Finalité** : nommer les outils d'un projet, ajouter un « Autre », tenir le catalogue.
- **Base** : 6.1.b ; le journal des administrateurs, 6.1.f.
- **Données** : `tool` (« Autre » tapé, créé par), `catalogue_change`, `catalogue_notice`.
- **Destinataires** : les administrateurs.
- **Durées** : un « Autre » que plus rien ne cite, effacé ; laissé hors du catalogue, 1 an ; le
  journal, 1 an ; une notification du catalogue, 90 jours (`nightly-purge.ts`). Au départ du
  membre, `created_by` est remis à nul.

### 2.9 Les e-mails et les notifications

- **Finalité** : les e-mails du compte (vérification, mot de passe, adresse), le récap du dimanche,
  les e-mails « tout de suite », les invitations, l'avertissement d'un compte inactif (2.12).
- **Base** : les e-mails de service, 6.1.b ; les notifications et le récap, 6.1.b ou 6.1.f, à
  vérifier. Aucun e-mail marketing aujourd'hui : son consentement viendra avec lui.
- **Données** : `email_preference` (choix par type, « Découvertes », dates d'envoi, récaps sans
  visite) ; le contenu des e-mails (nom, liens, titres, extraits de 80 caractères, vignettes).
- **Destinataires** : Scaleway (§ 3) ; les messageries des destinataires, qui ne sont pas des
  sous-traitants.
- **Durée** : la vie du compte pour les choix ; chez Scaleway, à vérifier (§ 3).
- **Sécurité** : aucun lien ni domaine venu d'un membre dans un e-mail ; aucun traqueur.

### 2.10 Les signalements et la modération

- **Finalité** : recevoir les signalements, décider, motiver, permettre le recours ; suspendre un
  compte.
- **Base** : l'obligation légale (6.1.c : règlement sur les services numériques, art. 16 et 17) ;
  l'historique et la lutte contre les abus, 6.1.f. À vérifier.
- **Personnes** : les membres ; depuis R12, toute personne sans compte qui signale un contenu
  public (projet, mise à jour, page publique).
- **Données** : `content_report` (signaleur, motif, précision, copie des textes),
  `moderation_decision`, `account_suspension`, `content_part_removal`, `admin_member`. Le
  signalement sans compte : `reporter_id` nul, et `content_report.reporter_email`, facultative ;
  son adresse IP sert seulement au quota (2.11).
- **Destinataires** : les administrateurs ; l'auteur, pour la motivation ; le signaleur n'est jamais
  montré ; les autorités sur réquisition, ou par un signalement à Pharos (`docs/ops/moderation.md`).
  L'adresse d'un signalement sans compte : Scaleway, pour deux e-mails au plus (accusé de réception,
  décision) ; jamais l'assistant de code (§ 4) ; elle n'entre dans aucun export.
- **Base du signalement sans compte** : 6.1.c (règlement sur les services numériques, art. 16.4 et
  16.5), à vérifier.
- **Durées** (`apps/api/src/reports/retention.ts`, lancé par `nightly-purge.ts`) : un signalement
  ouvert, jusqu'à la décision ; classé ou suivi d'un retrait, 1 an après la décision ; sans objet,
  30 jours ; une décision, 1 an après la dernière décision sur la même cible, et tant que le contenu
  reste retiré ; une suspension, 1 an après sa fin (sans fin : la vie du compte, puis 1 an après le
  départ) ; une partie retirée, tant que le retrait dure ; un rôle révoqué, la vie du compte.
  L'adresse d'un signalement sans compte est effacée à la clôture, quelle qu'elle soit (décision,
  que l'e-mail parte ou non ; sans objet). Détail : `docs/ops/moderation.md`, § 7.

### 2.11 La sécurité et l'anti-abus

- **Finalité** : limiter les essais de mot de passe, les inscriptions et les envois en rafale ;
  depuis R12, les lectures et les signalements sans compte.
- **Base** : l'intérêt légitime (6.1.f) et la sécurité (art. 32).
- **Données** : `rate_limit` (adresse IP et route, en clair), `api_rate_limit` (identifiant,
  empreinte d'adresse, ou adresse IP en clair pour trois compteurs, dont le signalement sans compte :
  5 par jour et par adresse IP ; et, pour ce signalement, un compteur par empreinte de l'adresse
  e-mail donnée : un accusé de réception par adresse et par jour au plus). Les lectures sans compte
  des pages publiques : un compteur par réseau (adresse IP, /64), tenu **en mémoire** de l'API,
  jamais écrit en base.
- **Destinataires** : personne.
- **Durées** : `rate_limit`, 25 heures au plus après la dernière demande ; `api_rate_limit`,
  49 heures au plus après le début de la fenêtre, adresses IP comprises
  (`nightly-purge.ts`, `apps/api/src/rate-limit.ts`). Un compteur repris sans arrêt reste tant
  qu'on s'en sert. Le compteur des lectures sans compte : oublié au bout de 10 minutes, et perdu à
  chaque redémarrage de l'API.

### 2.12 Les comptes inactifs (R11)

- **Finalité** : ne pas garder sans fin le compte d'une personne partie sans le supprimer.
- **Base** : la limitation de la conservation (art. 5.1.e) ; la durée de 3 ans est à faire valider.
- **Données** : `user.last_active_at` (posée au plus une fois par jour), `user.inactive_notice_at`
  (l'avertissement envoyé).
- **Déroulé** : après 3 ans sans visite moins 30 jours, un e-mail de service, envoyé même si le
  membre a coupé les autres ; à 3 ans, la suppression complète, comme celle que fait le membre
  (`apps/api/src/jobs/inactive-accounts.ts`, `apps/api/src/account/delete.ts` ; durées :
  `INACTIVE_ACCOUNT_YEARS`, `INACTIVE_NOTICE_DAYS`, `packages/contracts/src/email.ts`). Une visite
  remet tout à zéro.
- **Destinataires** : Scaleway, pour l'e-mail.

### 2.13 Les demandes et la boîte `contact@`

- **Finalité** : répondre aux questions, aux demandes sur les données (art. 15 à 22), aux
  contestations d'un retrait, aux signalements par e-mail ; aux adresses perdues.
- **Base** : l'obligation légale (6.1.c) pour les droits et les recours ; 6.1.f pour le reste.
- **Données** : l'adresse de l'expéditeur, son message et ses pièces jointes.
- **Destinataires** : l'éditeur ; Hostinger, qui héberge la boîte (§ 3).
- **Durée** : **1 an après la clôture de l'échange**, puis effacé de la boîte (et de sa corbeille).
  Un signalement reçu par e-mail suit les durées de la modération (2.10). Ce qu'on garde d'une
  demande sur les données : `docs/ops/donnees.md`. Aucune purge automatique : l'éditeur fait le tri
  à la main, chaque trimestre. Durée proposée, à valider par l'éditeur et un professionnel.

### 2.14 La vitrine de l'accueil et « À la une » (R12)

- **Finalité** : montrer des projets publics sur l'accueil, à tout internaute, et en tête
  d'Explorer (« À la une ») pour les membres.
- **Critère** : le choix de l'éditeur, parmi les projets `web` visibles, sans contrepartie ; 4 au
  plus. L'auteur est prévenu (Activité) et peut en retirer son projet.
- **Base** : l'intérêt légitime (6.1.f), à vérifier.
- **Données** : `showcase` (projet, position, date, `added_by`), `showcase_notice` (l'avis à
  l'auteur).
- **Destinataires** : tout internaute (l'accueil) ; les membres (« À la une », selon les blocages).
- **Durées** : tant que le projet reste `web`, non retiré, et que ni l'auteur ni l'éditeur ne l'en
  retirent (un projet qui quitte `web` quitte la vitrine dans la même transaction) ; l'avis,
  90 jours (`nightly-purge.ts`).

### 2.15 La récolte : pollen, niveau, sceaux, miel, défis et classements (R19)

- **Finalité** : compter les gestes qui aident un proche ou font avancer un projet, en tirer un
  niveau, un titre et des sceaux, proposer des défis, tenir un solde de miel (sans valeur, qui ne
  s'achète pas), et montrer un classement de la semaine entre proches et par ruche.
- **Base** :
  - le décompte et ce que voit le membre : 6.1.b ;
  - l'affichage aux autres membres (niveau, titre, sceaux) et les classements, où chacun paraît
    d'office avec un réglage de retrait : 6.1.f, à vérifier. Un titre déduit des gestes peut être
    un profilage (article 4.4) ; il n'a pas d'effet juridique, donc l'article 22 ne s'appliquerait
    pas, à vérifier. Le retrait vaut opposition (article 21) ; il est annoncé une fois, par l'avis
    `intro` et le récap.
- **Personnes et données** : les membres, sauf les comptes d'exemple.
  - `pollen_entry` : le geste, la famille, le montant, la chose concernée, l'autre membre, le
    jour, la semaine, la révocation ;
  - `honey_entry`, `seal`, `personal_challenge`, `hive_challenge`, `game_notice` ;
  - `member_game` : la forme du titre, le titre épinglé, les classements, les avis, la
    décoration, le niveau vu ;
  - `email_preference.recap_harvest_at` : la date du premier récap qui a porté « Ta semaine ».
  - Le passé est rattrapé au lancement (`0030_game_backfill.sql`) ; les contenus déjà retirés y
    entrent révoqués.
- **Destinataires** :
  - le niveau, le titre, le rayon, les sceaux et la décoration : les membres connectés, sauf
    blocage, et jamais sur la page publique ;
  - le pollen de la semaine : les membres qui le suivent (leur classement « Ceux que je suis ») et
    les membres de ses ruches, sauf retrait ou blocage ;
  - le miel, les défis et les réglages : le membre seul ;
  - l'avancée d'un défi de ruche : les membres de la ruche, sans nom ;
  - le récap (Scaleway, 2.9) : le bloc « Ta semaine ».
- **Durées** :
  - tant que le compte existe (`on delete cascade`). La ligne d'un geste reste quand le membre le
    retire, pour qu'il ne paie qu'une fois ;
  - `counterpart_id` : remis à nul après la semaine suivante, et quand l'autre compte est
    supprimé (`set null`) ;
  - les défis : effacés après la semaine suivante ;
  - les avis : 90 jours (`nightly-purge.ts`).
- **Sécurité** : une seule fonction écrit le grand livre (`apps/api/src/game/award.ts`, vérifié
  par un test statique), avec un verrou par membre. L'export ne nomme pas l'autre membre.

## 3. Les sous-traitants

Un sous-traitant traite les données pour le compte de l'éditeur, selon un contrat (art. 28). Les
contrats sont ceux que chaque fournisseur propose à ses clients ; l'éditeur vérifie qu'ils sont
acceptés, et note ici où ils se trouvent.

| Sous-traitant | Ce qu'il reçoit | Lieu | Contrat | État |
| --- | --- | --- | --- | --- |
| Hostinger | tout : le serveur (base, fichiers, journaux, sauvegardes), sa sauvegarde hebdomadaire et ses instantanés, la boîte `contact@`, le nom de domaine et le DNS | UE (serveur à Paris) | l'accord de traitement des données de Hostinger, joint à ses conditions | **à vérifier** : accepté, et l'entité qui contracte (nom, adresse, pour les Mentions légales) ; durée de la sauvegarde hebdomadaire et des instantanés, à lire dans hPanel |
| Scaleway (Transactional Email, région `fr-par`) | l'adresse, le nom, la langue et le contenu des e-mails | UE (Paris) | l'accord de traitement des données de Scaleway, joint à ses conditions | **à vérifier** : accepté ; durée de conservation des e-mails et de leur journal d'envoi chez Scaleway |

Ne sont pas des sous-traitants pour les données des membres :

- **GitHub** : le code, la CI, les images du logiciel ; aucune donnée de membre (les tests
  utilisent des noms inventés). Hors UE.
- **Let's Encrypt** : les noms de domaine, pour les certificats ; rien de personnel.
- **Brevo** : le code existe, le service n'est pas en usage (ADR 0005). Il entre ici le jour où il
  sert, avec le consentement aux e-mails marketing.
- **Les messageries des destinataires** : ce qui reste dans les boîtes des membres.

## 4. Un destinataire à part : l'assistant de code (Anthropic, Claude)

L'éditeur construit et exploite Waiggle avec un assistant de code, Claude, fourni par Anthropic.
Il est écrit ici **tel qu'il est aujourd'hui** (décision de l'éditeur du 15/11/2026), comme dans la
page « Confidentialité ».

- **Ce qu'il reçoit** : ce que rendent les commandes lancées sur le serveur pour corriger une panne
  ou traiter un signalement : des extraits des journaux de l'API (identifiants, erreurs, parfois un
  texte écrit par un membre), des résultats de requêtes sur la base (`db_query`), les identifiants
  des fichiers `refus-*.txt` d'une restauration. Les sauvegardes ne quittent pas le serveur.
- **Son rôle** : l'offre utilisée est une offre pour les particuliers. Sous cette offre, Anthropic
  décide lui-même de l'usage de ces données : il en est **responsable de son côté**, selon sa
  propre politique de confidentialité (lien dans la page « Confidentialité »). Ce n'est pas un
  sous-traitant.
- **Lieu** : les données peuvent partir **hors de l'Union européenne**. La garantie du transfert
  (chapitre V du RGPD) : à vérifier.
- **Entraînement** : les données ne servent pas à entraîner ses modèles (réglage coupé le
  15/11/2026).
- **Durée** : **30 jours chez lui, sauf les exceptions de sa politique.**
- **Base de la transmission** : l'intérêt légitime de l'éditeur à maintenir le service (6.1.f) :
  à vérifier.
- **Minimisation** : les commandes rendent des nombres et des identifiants plutôt que des textes ;
  une adresse ou un nom, l'éditeur le lit lui-même. Aucune requête sur `content_report` ne
  sélectionne `reporter_email` (`docs/ops/moderation.md`).
- **Échéance** : le passage à une offre professionnelle, où Anthropic devient sous-traitant sous
  contrat (art. 28), viendra **au plus tard quand Waiggle deviendra commercial ou ouvrira les
  inscriptions**. Ce paragraphe et la page « Confidentialité » changeront alors.

## 5. Hors de la base

| Lieu | Ce qui s'y trouve | Durée | Où elle s'applique |
| --- | --- | --- | --- |
| Sauvegardes du serveur (`/srv/ruche/backups`) | la base et les fichiers | quotidiennes : 14 jours ; toute autre étiquette (`avant-deploi`, `avant-restauration`, `avant-moderation`, `manuel`, `essai`) : 30 jours au plus, les 5 dernières dans cette limite | `infra/backup.sh`, à chaque passage, quotidien compris |
| Fichiers `refus-*.txt` (restauration) | des identifiants de membres | effacés à la fin de la procédure, 30 jours au plus | `docs/ops/serveur.md` ; `infra/backup.sh` |
| Sauvegarde hebdomadaire et instantanés de Hostinger | le serveur entier | **à vérifier** dans hPanel ; la page « Confidentialité » écrit la plus longue | Hostinger |
| Journaux de l'API (Docker, pilote `local`) | identifiants, erreurs, refus d'e-mails ; aucune adresse ni nom (`apps/api/src/log.ts`) | 5 fichiers de 10 Mo ; perdus à chaque remplacement du conteneur (chaque déploiement) | `infra/docker-compose.yml` |
| Journaux de PostgreSQL | les erreurs, sans la valeur d'une donnée (`log_error_verbosity=terse`, `log_min_error_statement=panic`) | même rotation, 5 × 10 Mo | `infra/docker-compose.yml` |
| Journal du système (journald) | connexions SSH, `sudo`, attributions du rôle d'administrateur (identifiant seul), le minuteur des sauvegardes | 6 mois | `infra/server/bootstrap.sh` (`MaxRetentionSec`) |
| Caddy (le serveur web) | aucun journal d'accès | — | `infra/Caddyfile` |
| Fichiers des membres (volume `media`) | photos, avatars, captures | effacés avec leurs lignes ; un fichier peut rester orphelin après une panne | `apps/api/src/media/storage.ts` |
| Copies des moteurs de recherche | les projets et les pages publics, tels que les moteurs les ont lus | hors du contrôle de l'éditeur ; jusqu'à leur nouvelle lecture | `noindex`, 404 et sortie du plan du site dès le retour en arrière (`/v1/public/head`, `/v1/public/sitemap`) |
| Le PC de l'éditeur | les conversations de l'assistant de code et ses rapports, qui peuvent contenir des extraits lus sur le serveur ; jamais les sauvegardes | **à régler** (nettoyage de l'outil et du dossier des rapports), puis à écrire ici | — |

**Sur l'appareil du membre** :

| Clé | Contenu | Durée |
| --- | --- | --- |
| Cookie `ruche.session_token` (web) ; SecureStore (iOS, Android) | le jeton de session, strictement nécessaire | 7 jours glissants |
| Cookie `waiggle_member=1` (web, domaine de l'appli) | un repère sans identifiant : une session existe ; il sert seulement à ouvrir le Fil (`/` → `/feed`) et à garder la place de la barre pendant le chargement ; il ne donne aucun droit | 7 jours, reposé à chaque visite d'un membre connecté ; effacé à la déconnexion et sur un refus de session (`apps/app/src/accounts/memberMarker.ts`) |
| `appearance` | le thème choisi | jusqu'au changement |
| `once:reaction-fan-help` | une aide vue | sans fin |
| `suspension-seen` | les dates de la dernière suspension vue | sans fin, gardée à la déconnexion ; rien qui identifie |
| sessionStorage : l'adresse en attente de vérification | l'adresse tapée | jusqu'à la connexion, `/verified`, la déconnexion ou la fermeture de l'onglet |
| sessionStorage : `newVersion` | la version de l'appli | l'onglet |

Aucun outil de mesure d'audience, aucun cookie de publicité, aucun script ni police chargé d'un
tiers. **Sans compte, aucun cookie n'est posé** (l'appli peut garder le thème et la version dans le
navigateur, sans identifiant). La position de la souris et l'inclinaison de l'appareil (lumière d'ambiance) ne sont jamais
gardées.

## 6. La sécurité commune (art. 32)

- **Le serveur** : un VPS à Paris ; connexion SSH par clé seulement, root fermé ; pare-feu ouvert
  sur 22, 80 et 443 ; correctifs de sécurité chaque jour (`docs/ops/serveur.md`).
- **La base** : sur un réseau interne, jamais exposée à Internet.
- **Les échanges** : HTTPS partout, en-têtes de sécurité et CSP stricte (`infra/Caddyfile`).
- **Les comptes de l'éditeur** : double authentification chez Hostinger et GitHub.
- **Le logiciel** : images construites par la CI et vérifiées avant chaque déploiement
  (provenance) ; un test d'autorisation pour chaque route qui lit ou écrit une ressource ; aucune
  donnée de membre dans les journaux (identifiants seulement).
- **Les sauvegardes** : sur le serveur, non chiffrées, lisibles par le seul compte qui les fait
  (`umask 077`) ; la copie hebdomadaire chez Hostinger.
- **Une fuite** : `docs/ops/donnees.md`.
