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
les motifs comptés, les précisions des membres et le texte **au moment du signalement** (les
images, elles, sont celles d'aujourd'hui). Il ne dit jamais qui a signalé.

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
| Date de la dernière alerte d'un administrateur (`admin_member.alerted_at`) | tant que le rôle existe |
