# Les données des membres : fuite, demandes, adresse perdue

Ce document dit quoi faire quand quelque chose arrive aux données des membres : une fuite, une
demande d'un membre sur ses données, un membre qui a perdu l'accès à son adresse. Les commandes se
lancent depuis le PC, comme celles de [`serveur.md`](serveur.md). Ce que l'on garde, pourquoi et
combien de temps est dans le [registre des traitements](../legal/registre.md).

Procédures et délais à faire valider par un professionnel (liste de conformité). Aucune donnée d'un
membre ne s'écrit dans ce document ni dans le dépôt : ce qui nomme quelqu'un vit hors du dépôt.

## 1. Une fuite de données

Une fuite (une « violation de données », art. 4.12 du RGPD) : une donnée d'un membre perdue,
détruite, modifiée, lue ou copiée par quelqu'un qui n'aurait pas dû. Par exemple : le serveur
piraté, une sauvegarde copiée, un contenu privé visible d'autres membres à cause d'un bug, un
e-mail parti vers la mauvaise personne, le PC de l'éditeur volé.

1. **Arrêter la fuite** : couper ce qui la cause (une version qui montre trop : revenir en arrière,
   `serveur.md`, « Revenir en arrière » ; un serveur piraté : `serveur.md`, « En cas de problème »).
   Avant de toucher aux données, une sauvegarde (`infra/backup.sh manuel`).
2. **Noter tout de suite** l'heure à laquelle on l'a apprise : le délai part de là.
3. **Évaluer** : quelles données, combien de membres, depuis quand, qui a pu les voir, et le risque
   pour les personnes (une adresse e-mail ou un contenu privé n'ont pas le même poids qu'un nom
   affiché, déjà visible des membres).
4. **Prévenir la CNIL sous 72 heures** (art. 33), sauf si la fuite ne présente probablement
   **aucun risque** pour les personnes (par exemple une copie chiffrée perdue, dont la clé est
   sûre). Par le téléservice de notification de la CNIL. Si tout n'est pas connu à 72 heures, on
   notifie ce qu'on sait, puis on complète. Une notification tardive dit pourquoi.
5. **Prévenir les membres touchés** si le risque est **élevé** (art. 34) : un e-mail clair, dans
   leur langue, qui dit ce qui s'est passé, ce qui est touché, ce qu'on a fait, ce qu'ils peuvent
   faire (changer leur mot de passe, se méfier d'un e-mail), et comment nous joindre. Sans attendre
   la CNIL. Si un e-mail à chacun est impossible, un message visible de tous dans l'appli.
6. **Consigner toute fuite, même sans notification** (art. 33.5) : la CNIL peut demander ce
   registre. Il vit **hors du dépôt**, dans un document privé de l'éditeur, parce qu'il peut nommer
   des membres. Pour chaque fuite :
   - la date de la fuite et celle où on l'a apprise ;
   - ce qui s'est passé, les données et le nombre de personnes touchées ;
   - les conséquences probables ;
   - ce qui a été fait pour l'arrêter et pour éviter qu'elle revienne ;
   - si la CNIL et les membres ont été prévenus, quand, ou pourquoi pas.

   **Durée** : 5 ans après la fuite (proposition, à vérifier).
7. **Corriger la cause** par une pull request, avec le test qui reproduit le problème.

Si le compte Hostinger ou GitHub est en cause : changer ses mots de passe et vérifier sa double
authentification d'abord (l'éditeur, lui-même).

## 2. Une demande d'un membre sur ses données

Les droits du membre (art. 15 à 22) : accès, rectification, effacement, limitation, portabilité,
opposition. L'essentiel se fait déjà dans l'appli : l'export (« Télécharger mes données »),
« Mes commentaires », « Mes retours envoyés », la modification du profil, la suppression du compte,
les réglages des e-mails. Une demande peut aussi arriver à `contact@`.

1. **Accuser réception** au membre, en lui disant le délai.
2. **Vérifier que c'est bien lui** : la demande vient de **l'adresse de son compte**, et la réponse
   part vers cette adresse. Sinon, on lui demande d'écrire depuis cette adresse, ou de se connecter
   pour utiliser l'appli. Pas de pièce d'identité, sauf doute sérieux (à vérifier). Une demande pour
   un tiers (un parent, un proche) : seulement avec un mandat écrit de la personne.
3. **Répondre sous un mois** à partir de la réception (art. 12.3). Une demande complexe, ou
   plusieurs à la fois : le délai peut être **prolongé de deux mois**, à condition de le dire au
   membre **dans le premier mois**, avec la raison. Gratuitement, sauf demande manifestement
   abusive (art. 12.5).
4. **Ce qu'on fait** :
   - **accès, portabilité** : l'export de l'appli, en lui disant où le trouver ; ce qu'il ne
     contient pas, on l'explique (les signalements qui le visent n'y sont jamais :
     `moderation.md`, § 5) ;
   - **rectification** : il corrige lui-même dans l'appli ; son adresse, voir le § 3 ;
   - **effacement** : « Supprimer mon compte » dans l'appli ; ce qui reste et combien de temps
     (copies dans la modération, sauvegardes) est écrit sur l'écran de suppression et dans le
     registre ;
   - **opposition à un e-mail** : les réglages des e-mails, ou la désinscription faite pour lui ;
   - **un contenu à retirer à la main** : [`moderation.md`](moderation.md) (§ 4 pour un profil).
5. **Refuser, si on refuse**, par écrit, avec la raison et le droit de saisir la CNIL.

**Ce qu'on garde de la demande**, hors du dépôt : la date de réception, le droit exercé,
l'identifiant du compte, la date et le sens de la réponse. Jamais une copie des données envoyées.
**Durée** : 1 an après la réponse, plus en cas de litige (proposition, à vérifier). Le message
lui-même suit la durée de la boîte `contact@` (registre, 2.13).

## 3. Un membre a perdu l'accès à son adresse

Changer d'adresse dans l'appli demande un lien envoyé à l'ancienne. Un membre qui n'y a plus accès
écrit à `contact@` : l'écran le lui dit, et le changement se fait à la main.

1. **S'assurer que c'est bien lui**, sans son ancienne adresse : le cercle de Waiggle est fait de
   proches invités. L'éditeur confirme la demande par un autre moyen qu'il connaît déjà (de vive
   voix, par téléphone). Sans cette confirmation, on ne change rien : on lui propose un nouveau
   compte. Méthode à vérifier.
2. **Vérifier que le compte a un pseudo** : sinon la purge de nuit effacerait, au bout de 30 jours,
   un compte redevenu non vérifié.
3. **Changer l'adresse** : l'éditeur tape lui-même la commande (l'adresse est une donnée du
   membre), après une sauvegarde :

   ```bash
   ssh waiggle /srv/ruche/repo/infra/backup.sh manuel
   ssh waiggle 'source /srv/ruche/repo/infra/lib.sh && db_query' <<'SQL'
   select count(*) from member_handle where user_id = '<identifiant>';
   update "user" set email = lower('<nouvelle adresse>'), email_verified = false,
     updated_at = now() at time zone 'UTC'
   where id = '<identifiant>';
   SQL
   ```

   Le premier nombre doit valoir au moins 1. L'adresse marquée non vérifiée : à sa prochaine
   connexion, avec la nouvelle adresse et son mot de passe, le membre reçoit un lien de
   vérification à cette adresse ; il prouve ainsi qu'elle est à lui. Une adresse déjà prise par un
   autre compte : la requête échoue, rien ne change.
4. **Noter le changement** avec les demandes (§ 2) : il ne laisse aucune ligne `Email changed`
   dans les journaux de l'API. Une restauration le perdrait : on le traite alors comme une ligne
   `Email changed` (`serveur.md`, « Les e-mails de notification pendant une restauration »).

## 4. Retirer un contenu à la main

Un contenu, une photo de profil, une bio ou un nom illicite : [`moderation.md`](moderation.md), § 4.
