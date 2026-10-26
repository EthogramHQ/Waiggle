# La modération : signalements, retraits, procédure

Depuis la tranche 7a, un membre peut signaler un projet, une note, un commentaire (ou une réponse)
ou un profil. Un administrateur lit la file dans l'appli (écran « Modération », visible des seuls
administrateurs), puis retire le contenu ou classe le signalement. Chaque décision est gardée :
qui, quand, quoi, pourquoi. Ce document dit comment faire, et ce qu'il faut faire dans les cas
graves. Les commandes se lancent depuis le PC, comme celles de [`serveur.md`](serveur.md).

Durées et procédure à faire valider par un professionnel (liste de conformité).

## 1. Le rôle d'administrateur

Le rôle ne se donne que par un script du dépôt, directement en base : aucune route de l'API ne
l'écrit, et Better Auth ne connaît pas la table `admin_member`.

```bash
ssh waiggle '/srv/ruche/repo/infra/grant-admin.sh louis@example.com'            # donner
ssh waiggle '/srv/ruche/repo/infra/grant-admin.sh louis@example.com --revoke'   # retirer
```

- L'adresse doit être celle d'un compte **vérifié** ; sinon le script échoue sans rien écrire.
- Retirer le rôle garde la ligne, datée de la révocation : l'historique des administrateurs survit
  à la rotation des journaux. Le rôle cesse aussitôt, même pour une session ouverte (l'API le relit
  à chaque requête).
- Le journal du système note l'identifiant du membre, jamais son adresse :
  `ssh waiggle 'journalctl -t ruche-admin'`.
- Pour la liste des administrateurs en fonction :

  ```bash
  ssh waiggle 'source /srv/ruche/repo/infra/lib.sh && echo "select user_id, granted_at from admin_member where revoked_at is null;" | db_query'
  ```

## 2. Traiter la file

L'écran « Modération » montre les cibles signalées, de la plus ancienne à la plus récente, avec
les motifs comptés, les précisions des membres et la copie **au moment du signalement** : chaque
texte, champ par champ (titre, pitch, bio…). Les images ne sont pas copiées : la copie garde leur
nom de fichier, et la file dit, pour chacune, « Photo : toujours affichée » ou « Photo : supprimée
ou remplacée depuis » (de même pour « Couverture » et « Photo de profil » ; « Photo 2 », « Photo 3 »
quand il y en a plusieurs) (tranche 7b). Il ne dit jamais qui a signalé. Les blocages entre membres n'y changent rien (section 8).

Pour chaque cible, trois décisions :

| Décision | Effet |
| --- | --- |
| **Retirer** (projet, note, commentaire) | Le contenu n'est plus visible que de son auteur, avec le fondement (la loi, ou les règles de l'appli) et l'explication. L'auteur reçoit une notification ; la personne qui a signalé aussi (« il a été retiré »), sans aucun détail. |
| **Classer** | Le contenu reste. Les signalements sont clos ; la personne qui a signalé est prévenue (« nous ne l'avons pas retiré »). C'est la seule décision possible sur un profil. |
| **Rétablir** (onglet « Retirés ») | Le contenu redevient visible comme avant (privé s'il l'était). La notification de retrait disparaît. |

Règles :

- **L'explication est montrée à l'auteur.** Dire quelle règle ou quelle loi, en une ou deux
  phrases. Ne jamais nommer qui a signalé, ni recopier sa précision.
- **Délai visé** : 24 heures pour les motifs graves (« illégal », « violence ou contenu sexuel »,
  un danger) ; 7 jours pour les autres.
- **« Te concerne »** : un administrateur ne décide jamais de son propre contenu ni de son profil
  (l'API refuse). Un autre administrateur tranche. S'il n'y en a qu'un, Louis donne le rôle à une
  personne de confiance le temps de la décision (`grant-admin.sh`), puis le lui retire
  (`--revoke`) ; le contenu reste visible en attendant.
- Une cible supprimée par son auteur entre-temps quitte la file d'elle-même (« sans objet ») ; la
  personne qui l'a signalée n'est pas prévenue.

### Quand les e-mails sont coupés

L'alerte « Signalements en attente » (au plus un e-mail par heure et par administrateur) est
coupée avec les autres e-mails par `EMAIL_JOBS=off`. Il faut alors relever la file à la main,
chaque jour : l'écran « Modération », ou le nombre en attente :

```bash
ssh waiggle 'source /srv/ruche/repo/infra/lib.sh && db_query' <<'SQL'
select count(*) from content_report where status = 'open';
SQL
```

## 3. Un signalement reçu par e-mail

L'adresse de contact (`contact@waiggle.com`, écrite dans « Mon compte », sur la page de connexion
et au pied de chaque e-mail) reçoit aussi des signalements, de personnes qui n'ont pas de compte
(une personne photographiée, une autorité).

1. **Accuser réception** le jour même : « Nous avons bien reçu votre signalement, nous le
   regardons. »
2. Si le contenu est sur Waiggle : l'administrateur le **signale lui-même** depuis l'appli (motif le
   plus proche, la demande résumée en précision, sans données personnelles inutiles), puis le
   **retire ou classe** depuis la file. La trace est ainsi la même que pour un signalement d'un
   membre, et l'auteur lit « Après un signalement, une personne de la modération a décidé de
   retirer ce contenu. » : une demande reçue par e-mail est un signalement. L'explication commence
   par « À la suite d'un signalement reçu par e-mail, … » (l'auteur doit savoir d'où vient la
   décision, article 17 du DSA).
3. **Répondre** avec la décision et le recours : « Vous pouvez contester cette décision en
   répondant à cet e-mail. »

## 4. Les cas graves

### Un danger pour la vie ou la sécurité de quelqu'un

Menace de suicide, de violence, d'attentat : **prévenir tout de suite les autorités** (le 112, ou
le 17), puis retirer le contenu si besoin. Les signalements sont gardés au moins 30 jours, même
si l'auteur supprime son compte : le temps de transmettre ce qu'il faut (article 18 du règlement
européen sur les services numériques, DSA).

### La pédocriminalité

- **Ne rien télécharger, ne rien copier, ne rien transférer**, pas même pour le montrer : détenir
  ces images est un délit, même pour les signaler.
- **Signaler à Pharos** (<https://www.internet-signalement.gouv.fr>), avec l'adresse de la page.
- **Retirer** le contenu dans l'appli, fondement « la loi ». Ne pas supprimer le compte ni les
  données soi-même : les enquêteurs peuvent en avoir besoin. La décision reste comme trace.
- **Ne rien restaurer** : une image supprimée depuis le signalement ne reste que dans les
  sauvegardes : 14 jours pour les quotidiennes ; les 5 dernières d'avant déploiement (et les 5
  dernières d'avant restauration), quel que soit leur âge (rotation de `infra/backup.sh`). Ne jamais la rechercher ni la restaurer pour la voir : Pharos et les
  enquêteurs savent la demander.

### Une photo ou un pseudo illicite sur un profil

Un profil ne se « retire » pas dans l'appli (seul « classer » est possible). Pour une photo de
profil, une bio ou un nom illicite :

1. une sauvegarde (`infra/backup.sh avant-moderation`) ;
2. dans **une seule transaction** :
   - une ligne de trace dans `moderation_decision` (sorte `member`, `target_id` = l'id du membre,
     action `remove`, fondement, explication, `admin_id`, `created_at` en UTC) ;
   - la correction : `profile.avatar_key` à null, ou `profile.bio` vidée ; pour un nom, le
     remplacer dans `user.name` par un nom neutre (« Membre ») ; pour un pseudo, ne rien écrire à
     la main : demander au membre d'en changer, et classer en attendant ;
   - **clore les signalements ouverts du profil**, comme le fait l'appli (sinon ils restent dans la
     file et la personne qui a signalé n'est jamais prévenue, article 16 du DSA) :
     `update content_report set status = 'removed', decided_at = <date UTC>, decision_id = <id de
     la décision> where target_kind = 'member' and target_id = <id du membre> and status = 'open'`.
     La notification « ton signalement a été traité » se calcule à partir de ces lignes ;
3. un e-mail au membre pour l'en informer, avec le fondement, l'explication et le recours.

Cette décision n'apparaît ni dans l'onglet « Retirés » ni dans l'export du membre : à reprendre
avec le script dédié (liste de conformité).

Un script dédié reste à écrire (à reprendre) : d'ici là, tester la requête sur une copie de la
sauvegarde (`serveur.md`, « Sauvegardes »), jamais directement.

## 5. Contestations et demandes sur les données

- **Une contestation** d'un retrait (« Pour contester : contact@… » dans la notification et le
  bandeau) : relire la décision, rétablir si elle était mal fondée, et répondre dans tous les cas.
- **Une demande sur ses données** (accès, rectification, effacement, RGPD) : réponse **sous un
  mois**. L'export de « Mon compte » contient les signalements faits par le membre et les retraits
  de ses contenus ; jamais les signalements qui le visent.

## 6. Repérer les signalements abusifs

Les membres qui signalent beaucoup, et dont les signalements sont souvent classés, sur 30 jours :

```bash
ssh waiggle 'source /srv/ruche/repo/infra/lib.sh && db_query' <<'SQL'
select reporter_id, count(*) as total,
  count(*) filter (where status = 'dismissed') as classes
from content_report
where reporter_id is not null
  and created_at > (now() at time zone 'UTC') - interval '30 days'
group by reporter_id
having count(*) >= 10
order by classes desc;
SQL
```

Le quota de l'API (20 signalements par jour et par membre) limite déjà les rafales. Un abus
manifeste se traite comme un contenu : un rappel, puis la suppression du compte en dernier
recours.

## 7. Durées de conservation

La purge de nuit (`apps/api/src/reports/retention.ts`) applique ces durées :

| Donnée | Gardée |
| --- | --- |
| Signalement ouvert | jusqu'à la décision |
| Signalement classé ou suivi d'un retrait | un an après la décision |
| Signalement « sans objet » (cible disparue, compte de l'auteur supprimé) | 30 jours |
| Décision | un an après la dernière décision sur la même cible, et tant que le contenu reste retiré |
| Signalements faits par un compte supprimé | gardés, sans son nom, jusqu'à leur terme |
| Rôle d'administrateur révoqué | gardé (historique), effacé avec le compte |
| Blocage entre deux membres | jusqu'au déblocage (la ligne s'efface, sans historique) ou à la suppression d'un des deux comptes |
| Date de la dernière alerte d'un administrateur (`admin_member.alerted_at`) | tant que le rôle existe |

## 8. Les blocages

Un membre peut en bloquer un autre (tranche 7b) : aucun des deux ne voit plus les contenus de
l'autre (projets, notes, commentaires, réactions, notifications, suggestions après « @ »), et ils
ne peuvent plus interagir. La personne bloquée n'est pas prévenue. Deux exceptions, à connaître
pour répondre juste à un membre :

- **L'auteur d'un projet garde la modération de son espace** (règle 1) : sur son projet, il lit
  encore le commentaire d'un membre bloqué avec lui, dans un sens ou dans l'autre, avec son nom ;
  il peut le masquer et le signaler.
- **Un commentaire qui me mentionne reste lisible pour moi** (règle 2), même si son auteur m'a
  bloqué depuis, et même s'il retire ensuite la mention : je peux le signaler. Pas si c'est moi
  qui ai bloqué l'auteur. (Mentionner un membre qu'on a bloqué est refusé ; mentionner un membre
  qui nous a bloqués donne du texte simple, sans lien ni notification.)

- **Un blocage ne sert qu'à cacher.** Il ne prévient pas la modération, ne compte nulle part et
  ne dit rien du comportement de la personne bloquée. Un membre qui veut qu'on agisse doit
  signaler ; l'appli le lui dit avant de bloquer.
- **La modération ignore les blocages.** La file, la copie et les décisions sont les mêmes, que
  l'auteur visé ait bloqué l'administrateur ou non : sinon, bloquer l'administrateur ferait
  échapper à la modération. Un seul effet : le lien « Voir » d'une cible peut répondre
  « introuvable ». Cela veut dire que **l'auteur a bloqué l'administrateur** ; la copie complète
  de la file suffit à décider.
- **« Te concerne »** apparaît aussi quand l'administrateur a lui-même bloqué l'auteur visé : un
  autre administrateur doit alors trancher, comme pour son propre contenu (section 2). L'appli
  refuse sa décision (retirer, classer, rétablir), dans la file comme dans « Retirés ». L'inverse
  (l'auteur a bloqué l'administrateur) ne change rien.
- **Un administrateur seul** qui a bloqué un membre ne peut donc plus rien décider sur lui : ses
  contenus signalés restent dans la file. Pour décider, il doit d'abord le débloquer (page du
  membre ou « Mon compte », « Membres bloqués »), ou donner le rôle à un second administrateur
  (section 1).
- **Ce que le blocage ne garantit pas** (à dire si un membre demande) :
  - **la confidentialité** : ce qui est public reste lisible par la personne bloquée si elle se
    déconnecte, prend un autre compte, ou si celle qui a bloqué débloque, lit, puis rebloque. Pour
    cacher un projet, il faut le rendre privé ;
  - **le secret du blocage** : il reste devinable (une page qui répond « introuvable », des
    abonnements qui disparaissent). La seule promesse est qu'aucun avis ne part, et que la page
    répond comme celle d'un membre inconnu ;
  - **un mur instantané** : un commentaire ou une réaction écrit pendant qu'un blocage se pose est
    rattrapé à la lecture (il n'est pas montré), pas refusé à l'écriture.
- **Les données** : l'export de « Mon compte » contient les blocages que le membre a posés (pseudo
  et date), jamais ceux qui le visent. Supprimer un compte efface les blocages qu'il a posés et
  ceux qui le visaient.

## 9. Suspendre un compte

Depuis la tranche 7c, un administrateur suspend un compte depuis l'appli : sur la page du membre
(menu « … », « Suspendre le compte »), ou depuis une carte de la file. Il choisit une durée
(7 jours, 30 jours, sans fin), un fondement (la loi ou les règles) et une explication, montrée au
membre. La décision est gardée dans l'historique (onglet « Historique » de « Modération »).

- **Ce que fait la suspension** : le compte passe en lecture seule. Le membre lit tout, supprime
  ses contenus, exporte ses données, supprime son compte, règle ses e-mails et sa langue, change
  d'adresse, bloque et signale. Il ne publie plus, ne modifie plus, ne commente plus, ne réagit
  plus, ne suit plus. L'API refuse ces actions (`suspended`), même si l'appli les montrait.
- **Ce qu'elle ne fait pas** : ses contenus restent visibles des autres (sauf ce qui a été
  retiré) ; rien ne montre aux autres qu'il est suspendu. Elle ne clôt aucun signalement : chacun
  reçoit sa propre décision.
- **Le membre est prévenu** par un e-mail et une notification : la durée, le fondement,
  l'explication, et l'adresse de contact pour contester. À la fin (date atteinte, ou levée), une
  notification le lui dit.
- **Lever** : même page, « Lever la suspension », avec une phrase d'explication.
- **Garde-fous** : 50 décisions par administrateur et par jour ; le mot de passe est redemandé
  pour une suspension sans fin, au-delà de 3 suspensions dans la journée, et au-delà de 10 retraits
  dans l'heure ; 5 mots de passe faux par jour, puis plus rien de ce qui le demande jusqu'au
  lendemain. Un administrateur ne se suspend pas lui-même, ni un membre qu'il a bloqué ; on ne
  suspend pas un administrateur en fonction : retirer d'abord son rôle (section 1). Un membre
  suspendu nommé administrateur n'a pas accès à la modération tant que dure la suspension.
- **Si le quota est épuisé par un tiers** (un compte d'administrateur volé qui a suspendu à tour
  de bras) : d'abord changer le mot de passe et fermer les sessions de ce compte, ou retirer son
  rôle (section 1). Puis, pour lever tout de suite, remettre son compteur à zéro sur le serveur,
  après une sauvegarde : effacer ses lignes de `api_rate_limit` dont la clé commence par
  `moderation-decision:` suivi de l'identifiant de l'administrateur (le nom exact de la clé est
  dans `apps/api/src/rate-limit.ts`, `memberCounterKeys`). Rien d'autre ne s'efface.
- **Une contestation** (section 5) : relire la décision, la lever si elle était injustifiée, et
  répondre par e-mail.
- **Si l'appli est en panne** : ne rien écrire à la main en base. Attendre le retour de l'appli,
  ou suivre la procédure de la section 4 pour un cas grave.
- **Les données** : la suspension est gardée un an après sa fin ; une suspension sans fin, tant
  qu'elle dure. L'export du membre la contient, sans le nom de l'administrateur. Supprimer le
  compte efface la suspension ; la décision reste un an, sans le nom du membre.
