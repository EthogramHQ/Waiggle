// Le calcul des notifications d'un membre (tranche 6b). Rien n'est recopié dans une table « X a
// réagi » : la liste se calcule à chaque lecture, à partir des réactions, abonnements, commentaires
// et mentions qui existent. Une réaction retirée, un commentaire supprimé ou masqué, un projet
// devenu privé, un compte supprimé font donc disparaître leur notification sans code de plus, et
// rien n'est montré au-delà de 90 jours. Ce que le membre a déjà vu (seen_at) et la date de son
// pseudo sont lus dans notification_state (state.ts). R7a : les mises à jour des projets qu'il suit
// ou qu'il teste s'y ajoutent, et remplacent les notes du Journal dans les sources de la modération.
// R7b : le coin des testeurs ajoute trois sortes (un appel à tester, un message d'un fil, un retour
// réglé), et le retrait d'un appel ou d'un message par la modération. R8 : les deux notifications
// du catalogue (projet rangé, outil rattaché), seules écrites dans une table (`catalogue_notice`) et
// seules absentes des e-mails ; la miniature de chaque projet nommé ; le nombre des autres lignes
// d'une mise à jour.
import {
  EXCERPT_MAX,
  NOTIFICATION_DAYS,
  NOTIFICATION_PAGE_SIZE,
  type Notification,
  RemovalGround,
  ReportPartField,
  StoredReportTargetKind,
  UNREAD_COUNT_MAX,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { blockedWith, notBlockedWith } from '../blocks/visibility'
import { avatarUrlOf, mediaUrl } from '../profile/me'
import { visibleTo } from '../projects/load'
import { mediaOnCoversSql } from '../projects/media-visibility'
import { listedProject, listedProjectFor } from '../projects/visibility'
import { afterReportSql, toRemoval } from '../removals/load'
import { photoRankSql } from '../reports/part-rank'
// suspension/load.ts lit aussi `utc` dans ce fichier : les deux modules s'importent l'un l'autre.
// C'est sans risque ici, car chacun n'utilise l'autre que dans ses fonctions, jamais au chargement.
import { activeSuspensionSql } from '../suspension/load'
import { excerptOf as testerExcerptOf } from '../testers/threads'
import { hasReadableLines, readLines, updateOnCards } from '../updates/load'

const DAY = 24 * 60 * 60 * 1000

/** La limite des 90 jours : un geste daté de cet instant ou d'avant n'est plus montré. */
export const notificationCutoff = (now: Date) => new Date(now.getTime() - NOTIFICATION_DAYS * DAY)

// ─── Les dates dans le SQL ──────────────────────────────────────────────────────────────────────
//
// Les colonnes de dates sont des « timestamp » sans fuseau, qui contiennent l'heure UTC (écrite
// par l'API). Une date de JavaScript entre dans la requête comme un texte ISO (« …Z »), en
// paramètre lié : « ::timestamptz » la lit comme un instant, et « at time zone 'UTC' » la
// ramène à l'heure UTC sans fuseau, comme les colonnes. Ainsi rien ne dépend du fuseau de la
// base ni du pilote (un objet Date passé tel quel pourrait être écrit en heure locale).
export const utc = (date: Date | string) =>
  sql`(${typeof date === 'string' ? date : date.toISOString()}::timestamptz at time zone 'UTC')`

/**
 * Le jour d'une date, en heure de Paris (« 2026-06-16 ») : les groupes vont par jour, et une
 * réaction à 0 h 30 à Paris (22 h 30 UTC la veille) compte pour le lendemain. Le premier « at time
 * zone » dit que la colonne est en UTC, le second donne l'heure qu'il est alors à Paris (heure d'été
 * comprise).
 */
const parisDay = (column: string) =>
  sql.raw(`to_char((${column} at time zone 'UTC') at time zone 'Europe/Paris', 'YYYY-MM-DD')`)

// ─── Les six sources ────────────────────────────────────────────────────────────────────────────

/**
 * « `me` lit le commentaire c (du projet `project`), et n'en est pas l'auteur » : la règle de
 * `sees` (comments/load.ts), écrite pour un lecteur qui n'a pas écrit le commentaire, et pour des
 * commentaires de plusieurs projets à la fois (seesSql, elle, sert un projet déjà connu) :
 * - ni supprimé, ni sans auteur : « author_id <> me » écarte aussi les null (null n'est différent
 *   de rien) ;
 * - pas retiré par la modération (tranche 7a, règle 1 : sans exception, pas même pour l'auteur du
 *   projet) ;
 * - sur un projet public et pas retiré seulement (listedProject) : sur un projet privé, seul
 *   l'auteur d'un commentaire le lit (et ce n'est pas `me`) ;
 * - pas masqué, sauf pour l'auteur du projet, qui lit encore ce qu'il a masqué ;
 * - (tranche 7b, règle 4 de la relecture du plan) pas écrit par un membre bloqué avec `me`, dans
 *   un sens ou dans l'autre : le filtre porte sur l'auteur du geste (`notBlockedWith`, deux
 *   « exists » par les index de member_block). Et pas sur le projet d'un membre bloqué avec lui
 *   (`listedProjectFor`) : la notification nommerait un projet qu'il ne peut plus ouvrir.
 *   Débloquer fait revenir ces notifications (règle 3) : rien n'est effacé, tout est recalculé.
 * Une mention ne notifie ainsi que qui peut lire (scénario de la tranche 6b).
 */
const readable = (me: string) => sql`(c.deleted_at is null and c.removed_at is null
  and c.author_id <> ${me} and ${listedProjectFor(me)}
  and ${notBlockedWith(me, sql.raw('c.author_id'))}
  and (c.hidden_at is null or project.author_id = ${me}))`

/**
 * Toutes les notifications de `me` dont le geste est postérieur à `since`, une ligne par
 * notification, toutes avec les mêmes colonnes (c'est ce qu'exige « union all », qui met bout à
 * bout les lignes de plusieurs requêtes sans chercher les doublons) :
 *   kind, key (la clé stable du groupe), at (le geste le plus récent), project_id, comment_id,
 *   reason, author_id, day, les cinq nombres de réactions, total (réactions ou abonnés).
 * « null::uuid » : une colonne vide, mais du bon type, pour les sources qui n'en ont pas l'usage.
 *
 * Règles communes : rien ne vient de ses propres gestes (« <> me ») ; un projet privé ne produit
 * rien venant des autres (« visibility = 'public' »). Chaque source part de ce qui appartient au
 * membre, et chacune a son index (voir le rapport d'EXPLAIN dans notifications.test.ts) :
 *   1. réactions à ses projets : project_author_created_idx (ses projets), puis la clé primaire de
 *      project_reaction (project_id, …) ;
 *   2. abonnés à ses projets : ses projets, puis project_follow_project_idx ;
 *   3. abonnés à son compte : member_follow_member_idx ;
 *   4. commentaires : trois façons d'être concerné (mentionné : comment_mention_member_idx ;
 *      réponse dans son fil : project_comment_author_idx puis project_comment_root_created_idx ;
 *      commentaire sur son projet : ses projets puis project_comment_project_idx) ;
 *   5. ses commentaires masqués : project_comment_author_idx ;
 *   6. son pseudo : la clé primaire de notification_state ;
 *   7. ses contenus retirés par la modération (tranche 7a) ;
 *   8. ses signalements traités (tranche 7a) ;
 *   9. la suspension de son compte (tranche 7c) : account_suspension_user_idx, avec la date dans
 *      la condition de l'index (« user_id = me and starts_at > since ») ;
 *  10. la fin de cette suspension, à sa date ou par une levée (tranche 7c) : le même index, sur
 *      user_id seul, puis un filtre sur ses quelques suspensions. Mesuré par EXPLAIN ANALYZE avec
 *      5 000 autres suspensions en base (26/10/2026) : une recherche d'index chacune, trois pages
 *      lues ; la jointure finale (account_suspension sus) passe par la clé primaire ;
 *  11. les mises à jour des projets qu'il suit ou qu'il teste (R7a) : la clé primaire de
 *      project_follow (follower_id, …) et celle de project_tester (member_id, …), puis
 *      project_update_project_created_idx (project_id, created_at desc), voir projectUpdates.
 *  12 à 14. le coin des testeurs (R7b) : les appels des projets qu'il teste, les messages de l'autre
 *      personne d'un fil, ses retours réglés ; voir testerSources.
 *  15 et 16. les notifications du catalogue (R8), sans `until` seulement : voir catalogueSources.
 * Les sources 7 à 11 ajoutent six colonnes : target_kind (la sorte de contenu), update_id (une mise
 * à jour retirée, ou celle qui est annoncée), decision_id (la décision de retrait, de suspension ou
 * de levée), outcome (l'issue d'un signalement), member_id (le membre visé par un signalement, pour
 * le lien) et suspension_id (la ligne account_suspension) ; null pour les six premières. R7b en
 * ajoute une vingt et unième, item_id : l'appel ou le message dont parle la notification (un
 * appel ou un message retiré, pour la source 7 ; null partout ailleurs).
 *
 * `now` (tranche 7c) : l'heure de l'API, pour dire si une suspension a pris fin (source 10). C'est
 * la règle unique de suspension/load.ts (activeSuspensionSql, S10), qui compare à cette heure et
 * jamais à now() de SQL : la fin arrive à la milliseconde, quel que soit le fuseau de la connexion.
 *
 * `until` (les e-mails seulement, tranche 6c, suite de la relecture de sécurité A7) : rien de daté
 * après cet instant. Une tâche lit ses membres l'un après l'autre, parfois pendant des minutes,
 * mais note `now` comme date d'envoi : un geste arrivé entre `now` et la lecture ne doit pas partir
 * maintenant, puisqu'il est après la date notée et repartirait au passage suivant. Cette borne
 * haute ne change pas l'index de chaque source : elle écarte des lignes déjà trouvées par lui (ou
 * resserre l'intervalle lu dans project_comment_root_created_idx, qui porte la date).
 */
const sources = (me: string, since: Date, now: Date, until?: Date): SQL => {
  const after = utc(since)
  const upTo = until ? utc(until) : null
  /**
   * « Le geste daté par `column` est dans la fenêtre » : après `since`, et pas après `until`.
   * `column` est toujours un nom écrit ici (« r.created_at »), jamais une entrée du client :
   * sql.raw le recopie tel quel ; les dates, elles, restent des paramètres liés (utc).
   */
  const during = (column: string) =>
    upTo
      ? sql`${sql.raw(column)} > ${after} and ${sql.raw(column)} <= ${upTo}`
      : sql`${sql.raw(column)} > ${after}`
  // Les sources 1 à 6 (tranche 6b) ont quatorze colonnes ; celles de la modération (tranches 7a et
  // 7c) en ont besoin de six de plus, et le coin des testeurs (R7b) d'une septième. Plutôt que
  // d'ajouter sept « null » à chacune des six, on les ajoute une fois autour d'elles (« select
  // u.*, null… from (…) u »), et les sources 7 à 14 donnent les vingt et une colonnes elles-mêmes.
  // PostgreSQL déplie ce « select » : chaque source garde son index.
  return sql`
    select u.*, null::text as target_kind, null::uuid as update_id, null::uuid as decision_id,
      null::text as outcome, null::text as member_id, null::uuid as suspension_id,
      null::uuid as item_id
    from (${socialSources(me, during)}) u

    union all

    ${projectUpdates(me, during)}

    union all

    ${testerSources(me, during, now)}

    union all

    -- 7. Ses contenus retirés par la modération (tranche 7a) : ses projets, les mises à jour de ses
    --    projets (R7a, à la place des notes), ses commentaires. Datés du retrait, et repérés par la
    --    décision (« removed:<id> »)
    --    : rétabli, le contenu n'a plus de removed_at, et la notification disparaît d'elle-même.
    --    Un commentaire ne vient que d'un projet qu'il voit encore (règle 3 de la relecture du
    --    plan, comme la source 5) : sur un projet devenu privé ou retiré, rien, pas même le titre.
    --    Mais un blocage ne coupe jamais une notification de modération (tranche 7b, règle 9) :
    --    d'où listedProject(), sans visiteur, plutôt que visibleTo. Sur le projet d'un membre
    --    bloqué avec lui, la motivation reste, et le titre est vidé (loadDetailedRows).
    --    Index : ses projets par project_author_created_idx (puis les mises à jour de chacun par
    --    project_update_project_created_idx) ; ses commentaires par project_comment_author_idx. Les
    --    contenus retirés sont rares : ces lectures écartent presque tout aussitôt.
    --    R7b : ses appels à tester (ses projets, puis tester_call_project_created_idx) et ses
    --    messages d'un fil de testeur. Un message se cherche par le fil, des deux côtés : ses fils
    --    de testeur (tester_thread_tester_idx), même après son départ (l'auteur d'un contenu retiré
    --    est toujours prévenu), sur un projet encore listé comme pour un commentaire ; et les fils
    --    de ses projets, pour une réponse de l'auteur. Puis tester_message_thread_created_idx.
    select 'removed', 'removed:' || x.removal_id, x.removed_at, x.project_id, x.comment_id,
      null, null, null, null, null, null, null, null, null,
      x.target_kind, x.update_id, x.removal_id, null, null, null, x.item_id
    from (
      select 'project' as target_kind, project.id as project_id, null::uuid as comment_id,
        null::uuid as update_id, project.removal_id, project.removed_at, null::uuid as item_id
      from project
      where project.author_id = ${me} and project.removed_at is not null
        and ${during('project.removed_at')}
      union all
      select 'update', project.id, null, pu.id, pu.removal_id, pu.removed_at, null
      from project
      join project_update pu on pu.project_id = project.id
      where project.author_id = ${me} and pu.removed_at is not null
        and ${during('pu.removed_at')}
      union all
      select 'comment', c.project_id, c.id, null, c.removal_id, c.removed_at, null
      from project_comment c
      join project on project.id = c.project_id
      where c.author_id = ${me} and c.deleted_at is null and c.removed_at is not null
        and ${during('c.removed_at')}
        and (${listedProject()} or project.author_id = ${me})
      union all
      select 'call', project.id, null, null, tc.removal_id, tc.removed_at, tc.id
      from project
      join tester_call tc on tc.project_id = project.id
      where project.author_id = ${me} and tc.removed_at is not null
        and ${during('tc.removed_at')}
      union all
      select 'message', project.id, null, null, m.removal_id, m.removed_at, m.id
      from tester_thread th
      join tester_message m on m.project_id = th.project_id and m.tester_id = th.tester_id
      join project on project.id = th.project_id
      where th.tester_id = ${me} and m.sender_id = ${me} and m.removed_at is not null
        and ${during('m.removed_at')} and ${listedProject()}
      union all
      select 'message', project.id, null, null, m.removal_id, m.removed_at, m.id
      from project
      join tester_message m on m.project_id = project.id
      where project.author_id = ${me} and m.sender_id = ${me} and m.removed_at is not null
        and ${during('m.removed_at')}
      union all
      -- R9 : une seule partie retirée (la 2e photo, la description…) d'un projet, d'une mise à jour,
      -- d'un appel ou d'un message. La ligne content_part_removal vit tant que le retrait dure :
      -- rétablie (ou remplacée par l'auteur), elle s'efface, et la notification avec elle. Datée du
      -- retrait, repérée par sa décision. Index content_part_removal_author_idx (author_id), puis les
      -- clés primaires de l'objet. Un message sur le projet d'un autre : seulement sur un projet
      -- encore listé, comme un message retiré entier.
      select cpr.object_kind, project.id, null, cpr.update_id, cpr.removal_id, cpr.created_at,
        coalesce(cpr.call_id, cpr.message_id)
      from content_part_removal cpr
      left join project_update pu on pu.id = cpr.update_id
      left join tester_call tc on tc.id = cpr.call_id
      left join tester_message m on m.id = cpr.message_id
      join project on project.id = coalesce(cpr.project_id, pu.project_id, tc.project_id, m.project_id)
      where cpr.author_id = ${me} and cpr.object_kind <> 'member'
        and ${during('cpr.created_at')}
        and (project.author_id = ${me} or ${listedProject()})
    ) x
    where x.removal_id is not null

    union all

    -- 7 bis (R9, 7d). Une partie de son profil retirée : la bio, les outils favoris, la photo (leur
    --    ligne content_part_removal, index content_part_removal_author_idx), le nom ou le pseudo
    --    (remplacés d'office, sans ligne de retrait : la décision elle-même, index
    --    moderation_decision_member_idx), tant qu'aucun rétablissement de ce champ ne l'a suivie
    --    (« not exists », par moderation_decision_target_idx ; la cible d'un profil est le membre,
    --    passé comme valeur connue). La partie, le nom provisoire, le fondement et l'explication se
    --    lisent ensuite par la décision (loadDetailedRows).
    select 'profile_removed', 'profile_removed:' || pr.removal_id, pr.removed_at,
      null, null, null, null, null, null, null, null, null, null, null,
      'member', null, pr.removal_id, null, null, null, null
    from (
      select cpr.removal_id, cpr.created_at as removed_at
      from content_part_removal cpr
      where cpr.author_id = ${me} and cpr.object_kind = 'member' and ${during('cpr.created_at')}
      union all
      select d.id, d.created_at
      from moderation_decision d
      where d.target_member_id = ${me} and d.target_kind = 'member' and d.action = 'remove'
        and d.part_field in ('name', 'handle') and ${during('d.created_at')}
        and not exists (
          select 1 from moderation_decision rs
          where rs.target_kind = 'member' and rs.target_id = ${me}
            and rs.part_field = d.part_field and rs.action = 'restore'
            and rs.created_at > d.created_at)
    ) pr

    union all

    -- 7 ter (R9). Un de ses contenus, ou une partie, rétabli par la modération : chaque décision
    --    « restore » qui le vise (décision de la tranche : toujours notifiée), signée par l'équipe.
    --    Index moderation_decision_member_idx (target_member_id, created_at). Le projet, comme pour
    --    la source 8 : seulement s'il le voit encore (« case » ne lance que la branche de la sorte ;
    --    l'identifiant n'est converti en uuid que pour ces sortes, jamais pour un profil).
    select 'restored', 'restored:' || d.id, d.created_at,
      case d.target_kind
        when 'project' then (
          select project.id from project
          where project.id = d.target_id::uuid and ${visibleTo(me)})
        when 'update' then (
          select project.id from project_update pu
          join project on project.id = pu.project_id
          where pu.id = d.target_id::uuid and ${visibleTo(me)})
        when 'comment' then (
          select project.id from project_comment c
          join project on project.id = c.project_id
          where c.id = d.target_id::uuid and c.deleted_at is null and ${visibleTo(me)})
        when 'call' then (
          select project.id from tester_call tc
          join project on project.id = tc.project_id
          where tc.id = d.target_id::uuid and ${visibleTo(me)})
        when 'message' then (
          select project.id from tester_message m
          join project on project.id = m.project_id
          where m.id = d.target_id::uuid and ${visibleTo(me)})
      end,
      null, null, null, null, null, null, null, null, null, null,
      d.target_kind, null, d.id, null, null, null, null
    from moderation_decision d
    where d.target_member_id = ${me} and d.action = 'restore' and ${during('d.created_at')}

    union all

    -- 8. Ses signalements traités (tranche 7a) : la sorte de cible et l'issue, rien d'autre (règle
    --    2). Un signalement « sans objet » (void : la cible a disparu) ne prévient personne (règle
    --    29). Le lien se calcule ici, à la lecture : le projet de la cible, seulement si ce membre
    --    la voit encore (projet visible, mise à jour ou commentaire ni retiré, ni supprimé, ni
    --    masqué pour lui), et le membre visé, seulement si son compte existe encore. « case » ne
    --    lance que la sous-requête de la sorte de cible : l'identifiant y est converti en uuid
    --    (« ::uuid ») seulement pour un projet, une mise à jour ou un commentaire, dont
    --    l'identifiant est un uuid (vérifié par POST /v1/reports) ; chacune passe par la clé
    --    primaire de sa table. R7a (relecture de sécurité B1) : un ancien signalement d'une note du
    --    Journal (target_kind = 'note') n'a pas de branche : sa cible est effacée, le lien est null,
    --    et la ligne reste lisible (StoredReportTargetKind, plus bas).
    --    Tranche 7b, règle 9 : la ligne reste malgré un blocage ; seul le lien vers un projet
    --    d'un membre bloqué avec lui disparaît (visibleTo le cache), comme pour un projet privé.
    --    Index : content_report_reporter_idx (ses signalements).
    select 'report_handled', 'report:' || r.id, r.decided_at,
      case r.target_kind
        when 'project' then (
          select project.id from project
          where project.id = r.target_id::uuid and ${visibleTo(me)})
        when 'update' then (
          select project.id from project_update pu
          join project on project.id = pu.project_id
          where pu.id = r.target_id::uuid and pu.removed_at is null and ${visibleTo(me)})
        when 'comment' then (
          select project.id from project_comment c
          join project on project.id = c.project_id
          where c.id = r.target_id::uuid and c.deleted_at is null and c.removed_at is null
            and c.author_id is not null and (c.hidden_at is null or project.author_id = ${me})
            and ${visibleTo(me)})
      end,
      null, null, null, null, null, null, null, null, null, null,
      r.target_kind, null, null, r.status,
      case when r.target_kind = 'member' then (select u.id from "user" u where u.id = r.target_id) end,
      null, null
    from content_report r
    where r.reporter_id = ${me} and r.status in ('removed', 'dismissed')
      and ${during('r.decided_at')}

    union all

    -- 9. La suspension de son compte (tranche 7c), datée de sa pose, repérée par sa ligne
    --    (« suspended:<id> »). Elle reste après la fin de la suspension. La fin prévue, le fondement
    --    et l'explication se lisent ensuite par la ligne et par sa décision (loadDetailedRows) ;
    --    jamais l'administrateur qui a décidé (S17). Seul le membre visé la reçoit (« user_id = me »),
    --    et aucun blocage ne la coupe (pas de notBlockedWith : la modération n'est pas un geste
    --    social, comme la source 7). Index : account_suspension_user_idx (user_id, starts_at), qui
    --    donne ses suspensions dans la fenêtre de dates.
    select 'suspended', 'suspended:' || s.id, s.starts_at,
      null, null, null, null, null, null, null, null, null, null, null,
      null, null, s.decision_id, null, null, s.id, null
    from account_suspension s
    where s.user_id = ${me} and ${during('s.starts_at')}

    union all

    -- 10. La fin de sa suspension (tranche 7c) : une suspension qui n'est plus active à l'heure de
    --     l'API (« not » de la règle unique, S10). Datée de sa fin réelle : « coalesce » prend
    --     lifted_at s'il est noté (une levée, ou la clôture à la date), sinon la fin prévue, déjà
    --     passée. Aucune tâche ne la crée : elle apparaît d'elle-même à l'instant de la fin. Une
    --     levée se reconnaît à lift_decision_id (J6), dont la décision donne l'explication ; une fin à
    --     la date n'en a pas. Même index que la source 9 (ses suspensions, quelques lignes).
    select 'suspension_ended', 'suspension_ended:' || s.id, coalesce(s.lifted_at, s.ends_at),
      null, null, null, null, null, null, null, null, null, null, null,
      null, null, s.lift_decision_id, null, null, s.id, null
    from account_suspension s
    where s.user_id = ${me} and not ${activeSuspensionSql('s', now)}
      and ${during('coalesce(s.lifted_at, s.ends_at)')}

    ${upTo ? sql`` : sql`union all ${catalogueSources(me, during)}`}
  `
}

/**
 * Les sources 15 et 16 (R8) : les notifications du catalogue, les seules qui s'écrivent
 * (`catalogue_notice`, posées par catalogue/admin.ts dans la transaction de l'administrateur). Elles
 * ne vont qu'à l'écran et à la cloche, jamais dans un e-mail : `sources` ne les ajoute que sans
 * borne `until` (la liste et la cloche ; les e-mails, eux, passent toujours `until`). La colonne
 * item_id porte la notice ; loadDetailedRows la relit par sa clé primaire.
 *
 * Index : catalogue_notice_member_idx (member_id, created_at desc), qui donne ses notices dans la
 * fenêtre de dates ; puis la clé primaire du projet ou de l'outil. Ce qui reste montré se calcule
 * encore à la lecture, comme ailleurs :
 *   15. un projet rangé : encore à lui, public et pas retiré (listedProject) ; privé, il disparaît,
 *       et revient s'il redevient public ; supprimé, la notice part avec lui (clé « cascade ») ;
 *   16. un outil admis (`tool_added`) ou rattaché (`tool_merged`, la notice vise l'outil cible) :
 *       encore au catalogue. Les deux sortes de la base n'en font qu'une pour l'appli (`merged`).
 * Aucun filtre de blocage : la notification n'est le geste d'aucun membre (signée par l'équipe).
 */
const catalogueSources = (me: string, during: (column: string) => SQL): SQL => sql`
    select 'project_category', 'project_category:' || cn.id, cn.created_at,
      cn.project_id, null, null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, cn.id
    from catalogue_notice cn
    join project on project.id = cn.project_id
    where cn.member_id = ${me} and cn.kind = 'project_category' and ${during('cn.created_at')}
      and project.author_id = ${me} and ${listedProject()}

    union all

    select 'tool_added', 'tool_added:' || cn.id, cn.created_at,
      null, null, null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, cn.id
    from catalogue_notice cn
    join tool on tool.id = cn.tool_id
    where cn.member_id = ${me} and cn.kind in ('tool_added', 'tool_merged')
      and ${during('cn.created_at')} and tool.status = 'catalogue'`

/**
 * La source 11 (R7a) : une ligne par mise à jour d'un projet que `me` suit OU teste, avec les vingt
 * et une colonnes (kind, key, at, project_id, … update_id …, item_id). La clé « project_update:<id> » est la même
 * pour qui suit et pour qui teste : la notification ne dit jamais lequel des deux (relecture de
 * sécurité A6).
 *
 * En SQL :
 *   select 'project_update', 'project_update:' || project_update.id, project_update.created_at, …
 *   from (
 *     select sub.project_id, min(sub.created_at) as since from (
 *       select project_id, created_at from project_follow where follower_id = $me
 *       union all
 *       select project_id, created_at from project_tester where member_id = $me
 *     ) sub group by sub.project_id
 *   ) mine
 *   join project on project.id = mine.project_id
 *   join project_update on project_update.project_id = mine.project_id
 *     and project_update.created_at > mine.since
 *   where <dans la fenêtre> and <les règles ci-dessous>
 *
 * - « mine » : les projets qu'il suit ou teste, UNE ligne par projet (« group by ») : un abonné qui
 *   est aussi testeur ne reçoit qu'une notification par mise à jour, et la cloche (countUnread, qui
 *   additionne les lignes sans regrouper) n'en compte qu'une. La clé primaire de project_follow
 *   (follower_id, project_id) et celle de project_tester (member_id, project_id) les donnent.
 * - « since », le plus ancien des deux gestes : seules les mises à jour publiées après
 *   l'abonnement ou l'inscription comptent (décision, sécurité S1), jamais celles
 *   d'avant, qu'il n'a pas demandé à suivre.
 * - Les mises à jour de chaque projet viennent de project_update_project_created_idx
 *   (project_id, created_at desc), qui borne aussi la date (« > since », la fenêtre).
 * - Pas retirée (updateOnCards : une mise à jour retirée ne prévient personne, B4), au moins une
 *   ligne lisible (hasReadableLines : la liste ne pourrait pas la montrer, la cloche ne la compte
 *   pas), pas sur son propre projet (aucune route ne le fait testeur de son projet, la condition le
 *   redit), sur un projet listé pour lui (listedProjectFor : public, pas retiré, aucun blocage dans
 *   un sens ou dans l'autre avec l'auteur, par les index de member_block).
 * - Aucun filtre sur la suspension de l'auteur (relecture de sécurité R7a, B1) : un compte suspendu
 *   ne publie plus (la garde de suspension), son projet ne prévient donc plus personne. Filtrer à
 *   la lecture effacerait les mises à jour d'avant la suspension de la cloche et du récap, alors
 *   que la frise et le fil les montrent : la différence trahirait la suspension, qui ne se devine
 *   nulle part (décision du 31/10/2026).
 * - Une mise à jour publiée pendant que le projet était privé est notifiée s'il redevient public
 *   dans les 90 jours : calculée à la lecture, comme le reste (décision écrite au contrat, A6).
 *
 * Le nom de la table project_update est écrit sans alias : hasReadableLines le cite en toutes
 * lettres. `during` : la fenêtre de dates (voir sources).
 */
const projectUpdates = (me: string, during: (column: string) => SQL): SQL => sql`
    select 'project_update', 'project_update:' || project_update.id, project_update.created_at,
      project.id, null, null, project.author_id, null, null, null, null, null, null, null,
      null, project_update.id, null, null, null, null, null
    from (
      select sub.project_id, min(sub.created_at) as since
      from (
        select f.project_id, f.created_at from project_follow f where f.follower_id = ${me}
        union all
        select t.project_id, t.created_at from project_tester t where t.member_id = ${me}
      ) sub
      group by sub.project_id
    ) mine
    join project on project.id = mine.project_id
    join project_update on project_update.project_id = mine.project_id
      and project_update.created_at > mine.since
    where ${during('project_update.created_at')}
      and ${updateOnCards()} and ${hasReadableLines()}
      and project.author_id <> ${me} and ${listedProjectFor(me)}`

/**
 * Les sources 12 à 14 (R7b) : le coin des testeurs, avec les vingt et une colonnes. La colonne
 * item_id porte l'appel ou le message ; loadDetailedRows le relit par sa clé primaire.
 *
 * Ce qui prévient un testeur part toujours de ses inscriptions actuelles (la clé primaire de
 * project_tester, member_id en tête) : quitter les testeurs, ou en être retiré, efface la ligne, et
 * la notification disparaît d'elle-même (décision 2 de Louis : un ancien testeur ne reçoit plus
 * rien du coin). Puis trois conditions du coin ouvert, celles de cornerAccess (testers/access.ts) :
 * - le projet est listé pour lui (listedProjectFor : public, pas retiré, aucun blocage avec
 *   l'auteur, dans un sens ou dans l'autre) ;
 * - l'auteur n'est pas suspendu (décision 1 de Louis : la suspension ferme le coin, même à ce qui
 *   l'a précédée) : « (select 1 … limit 1) is null », une recherche dans l'index partiel
 *   account_suspension_open_idx (user_id) where lifted_at is null, puis la fin comparée à l'heure
 *   de l'API (la règle unique, activeSuspensionSql) ;
 * - il n'est pas l'auteur du projet (aucune route ne le fait testeur du sien, la condition le redit).
 *
 * L'auteur, lui, reste prévenu des messages de ses testeurs même quand son coin est fermé : il le
 * relit (R7b, 11/11/2026), et un fil d'un ancien testeur lui reste lisible.
 *
 * Jamais le texte d'un message : le fil est privé ; seul l'extrait d'un appel (que tous les
 * testeurs lisent) est montré. `during` : la fenêtre de dates (voir sources) ; `now` : l'heure de
 * l'API, pour la suspension.
 */
const testerSources = (me: string, during: (column: string) => SQL, now: Date): SQL => {
  const authorActive = sql`(select 1 from account_suspension author_sus
      where author_sus.user_id = project.author_id and ${activeSuspensionSql('author_sus', now)}
      limit 1) is null`
  return sql`
    -- 12. Les appels à tester des projets qu'il teste, lancés après son inscription (comme R7a,
    --     sécurité S1 : il n'a pas demandé à être prévenu de ceux d'avant), ni retirés ni supprimés.
    --     Index : la clé primaire de project_tester (ses inscriptions), puis
    --     tester_call_project_created_idx (project_id, created_at desc), qui borne la date.
    select 'tester_call', 'tester_call:' || tc.id, tc.created_at,
      project.id, null, null, project.author_id, null, null, null, null, null, null, null,
      null, null, null, null, null, null, tc.id
    from project_tester t
    join project on project.id = t.project_id
    join tester_call tc on tc.project_id = t.project_id and tc.created_at > t.created_at
    where t.member_id = ${me} and tc.removed_at is null and ${during('tc.created_at')}
      and project.author_id <> ${me} and ${listedProjectFor(me)} and ${authorActive}

    union all

    -- 13. Les messages de l'autre personne d'un fil, non retirés (un retrait ne prévient que son
    --     expéditeur, source 7). Deux côtés :
    --     - testeur actuel : les réponses de l'auteur dans son propre fil. Index : ses
    --       inscriptions, puis tester_message_thread_created_idx (project_id, tester_id,
    --       created_at desc), qui borne la date ;
    --     - auteur : les retours et réponses de chaque testeur dans les fils de ses projets
    --       (expéditeur = le testeur du fil), sauf d'un membre bloqué avec lui (notBlockedWith, par
    --       les index de member_block). Index : project_author_created_idx (ses projets), puis le
    --       même index des messages, par project_id.
    --     author_id porte l'expéditeur : la notification le nomme (« from »).
    select 'tester_message', 'tester_message:' || m.id, m.created_at,
      project.id, null, null, m.sender_id, null, null, null, null, null, null, null,
      null, null, null, null, null, null, m.id
    from project_tester t
    join project on project.id = t.project_id
    join tester_message m on m.project_id = t.project_id and m.tester_id = t.member_id
    where t.member_id = ${me} and m.sender_id = project.author_id and m.removed_at is null
      and ${during('m.created_at')}
      and project.author_id <> ${me} and ${listedProjectFor(me)} and ${authorActive}

    union all

    select 'tester_message', 'tester_message:' || m.id, m.created_at,
      project.id, null, null, m.sender_id, null, null, null, null, null, null, null,
      null, null, null, null, null, null, m.id
    from project
    join tester_message m on m.project_id = project.id
    where project.author_id = ${me} and m.sender_id = m.tester_id and m.sender_id <> ${me}
      and m.removed_at is null and ${during('m.created_at')}
      and ${notBlockedWith(me, sql.raw('m.sender_id'))}

    union all

    -- 14. Ses retours réglés, datés du réglage (settled_at) : à la main, ou par une mise à jour
    --     (settled_update_id, dans la colonne update_id : loadDetailedRows la relit). « Remettre à
    --     traiter » efface settled_at : la notification disparaît ; réglé de nouveau, elle revient
    --     à la nouvelle date. Mêmes index que le premier côté de la source 13.
    select 'feedback_settled', 'feedback_settled:' || m.id, m.settled_at,
      project.id, null, null, project.author_id, null, null, null, null, null, null, null,
      null, m.settled_update_id, null, null, null, null, m.id
    from project_tester t
    join project on project.id = t.project_id
    join tester_message m on m.project_id = t.project_id and m.tester_id = t.member_id
    where t.member_id = ${me} and m.sender_id = ${me} and m.kind = 'feedback'
      and m.settled_at is not null and m.removed_at is null and ${during('m.settled_at')}
      and project.author_id <> ${me} and ${listedProjectFor(me)} and ${authorActive}
  `
}

/**
 * Les six sources de la tranche 6b (réactions, abonnés, commentaires, masquages, pseudo), avec
 * leurs quatorze colonnes. `during` : la fenêtre de dates (voir sources).
 */
const socialSources = (me: string, during: (column: string) => SQL): SQL => {
  return sql`
    -- Tranche 7b (règle 4 de la relecture du plan) : dans les sources 1 à 4, rien ne vient d'un
    -- membre bloqué avec lui, dans un sens ou dans l'autre ; le filtre porte sur l'auteur du
    -- geste (r.member_id, f.follower_id, c.author_id), par deux « exists » indexés
    -- (notBlockedWith). Bloquer efface déjà les abonnements entre eux : le filtre des sources 2
    -- et 3 ne fait que redire la règle.
    --
    -- 1. Les réactions à ses projets publics, par projet et par jour de Paris, sans aucun nom :
    --    « count(*) filter (where …) » compte seulement les lignes qui remplissent la condition.
    --    « cross join lateral (select … as day) » calcule le jour une fois par ligne, pour s'en
    --    servir dans la clé et dans le « group by ».
    select 'reactions' as kind,
      'reactions:' || r.project_id || ':' || d.day as key,
      max(r.created_at) as at, r.project_id, null::uuid as comment_id, null::text as reason,
      null::text as author_id, d.day,
      (count(*) filter (where r.kind = 'amazing'))::int as amazing,
      (count(*) filter (where r.kind = 'inspiring'))::int as inspiring,
      (count(*) filter (where r.kind = 'useful'))::int as useful,
      (count(*) filter (where r.kind = 'funny'))::int as funny,
      (count(*) filter (where r.kind = 'bravo'))::int as bravo,
      count(*)::int as total
    from project
    join project_reaction r on r.project_id = project.id
    cross join lateral (select ${parisDay('r.created_at')} as day) d
    where project.author_id = ${me} and ${listedProject()}
      and r.member_id <> ${me} and ${during('r.created_at')}
      and ${notBlockedWith(me, sql.raw('r.member_id'))}
    group by r.project_id, d.day

    union all

    -- 2. Les abonnés à ses projets publics, par projet et par jour.
    select 'project_follows', 'project_follows:' || f.project_id || ':' || d.day,
      max(f.created_at), f.project_id, null, null, null, d.day,
      null, null, null, null, null, count(*)::int
    from project
    join project_follow f on f.project_id = project.id
    cross join lateral (select ${parisDay('f.created_at')} as day) d
    where project.author_id = ${me} and ${listedProject()}
      and f.follower_id <> ${me} and ${during('f.created_at')}
      and ${notBlockedWith(me, sql.raw('f.follower_id'))}
    group by f.project_id, d.day

    union all

    -- 3. Les abonnés à son compte, par jour (on ne peut pas se suivre soi-même : la base le refuse).
    select 'member_follows', 'member_follows:' || d.day,
      max(f.created_at), null, null, null, null, d.day,
      null, null, null, null, null, count(*)::int
    from member_follow f
    cross join lateral (select ${parisDay('f.created_at')} as day) d
    where f.member_id = ${me} and ${during('f.created_at')}
      and ${notBlockedWith(me, sql.raw('f.follower_id'))}
    group by d.day

    union all

    -- 4. Les commentaires des autres qui le concernent, une seule fois chacun. La sous-requête
    --    « candidate » liste les trois raisons possibles, avec leur rang ; « distinct on
    --    (comment_id) … order by comment_id, rank » ne garde, pour chaque commentaire, que la
    --    première : mention, sinon réponse dans son fil, sinon commentaire sur son projet. Une
    --    mention est datée de son écriture (celle du commentaire, ou de la modification qui l'a
    --    ajoutée) ; les autres, de la publication du commentaire.
    --    Chaque raison lit le commentaire (c) et son projet (p) elle-même, par son propre index,
    --    et applique la règle de lecture (readable, plus bas) : ainsi PostgreSQL ne relit jamais
    --    toute la table des commentaires pour les retrouver après coup (EXPLAIN l'a montré).
    select 'comment', 'comment:' || best.id, best.at, best.project_id, best.id, best.reason,
      best.author_id, null, null, null, null, null, null, null
    from (
      select distinct on (candidate.id) candidate.id, candidate.project_id, candidate.author_id,
        candidate.reason, candidate.at
      from (
        select c.id, c.project_id, c.author_id, 'mention' as reason, 1 as rank, m.created_at as at
        from comment_mention m
        join project_comment c on c.id = m.comment_id
        join project on project.id = c.project_id
        -- Une mention retirée par l'auteur à la modification (withdrawn_at, tranche 7b) ne prévient
        -- plus : ni la cloche, ni l'e-mail de mentions, qui lit cette même source.
        where m.member_id = ${me} and m.withdrawn_at is null and ${during('m.created_at')}
          and ${readable(me)}
        union all
        select c.id, c.project_id, c.author_id, 'reply', 2, c.created_at
        from project_comment root
        join project_comment c on c.root_id = root.id
        join project on project.id = c.project_id
        where root.author_id = ${me} and root.root_id is null and ${during('c.created_at')}
          and ${readable(me)}
        union all
        select c.id, c.project_id, c.author_id, 'comment', 3, c.created_at
        from project
        join project_comment c on c.project_id = project.id
        where project.author_id = ${me} and ${during('c.created_at')} and ${readable(me)}
      ) candidate
      order by candidate.id, candidate.rank
    ) best
    -- Un auteur sans pseudo actuel (un compte d'avant la tranche 6a, pas encore servi par le
    -- rattrapage) : present() écarte la notification, faute de pseudo à montrer. La jointure
    -- l'écarte dès ici, pour que la cloche (countUnread) compte exactement ce que la liste montre.
    -- Un seul pseudo actuel par membre : l'index unique partiel member_handle_current_idx le trouve.
    join member_handle author_handle
      on author_handle.user_id = best.author_id and author_handle.released_at is null

    union all

    -- 5. Ses commentaires masqués par l'auteur d'un projet qu'il voit (démasqué ou supprimé : plus
    --    rien). Pas les siens sur ses propres projets : ce serait son geste.
    select 'hidden', 'hidden:' || c.id, c.hidden_at, c.project_id, c.id, null, null,
      null, null, null, null, null, null, null
    from project_comment c
    join project on project.id = c.project_id
    where c.author_id = ${me} and c.deleted_at is null and ${during('c.hidden_at')}
      and project.author_id <> ${me} and ${visibleTo(me)}

    union all

    -- 6. Le pseudo qu'il a reçu, daté de la naissance de sa ligne notification_state ; seulement
    --    tant qu'il le garde : dès qu'il en choisit un lui-même (handle_chosen_at), elle ne serait
    --    plus vraie. Et seulement s'il a un pseudo actuel (member_handle_current_idx), comme le
    --    demande present() : la cloche ne compte pas une ligne que la liste ne montrerait pas.
    select 'handle', 'handle', s.created_at, null, null, null, null,
      null, null, null, null, null, null, null
    from notification_state s
    join member_handle mine on mine.user_id = s.user_id and mine.released_at is null
    where s.user_id = ${me} and ${during('s.created_at')} and s.handle_chosen_at is null
  `
}

/** Les six colonnes des sources 7 à 11, et item_id (R7b), à reprendre dans chaque lecture. */
const moderationColumns = sql.raw(
  'target_kind, update_id, decision_id, outcome, member_id, suspension_id, item_id',
)

// ─── Le marque-page ─────────────────────────────────────────────────────────────────────────────

/**
 * Le curseur des notifications : la date et la clé de la dernière notification de la page. Le même
 * principe que celui des fils (cursor.ts), mais la clé d'un groupe n'est pas un uuid
 * (« reactions:<projet>:<jour> ») : elle a sa propre forme, vérifiée ici. Elle n'entre dans la
 * requête que comme paramètre lié.
 */
const NotificationCursor = z.strictObject({
  at: z.iso.datetime().refine((at) => at >= '2000', 'date trop ancienne'),
  key: z
    .string()
    .max(200)
    .regex(/^[a-z_]+(:[0-9a-f-]{1,36})*$/),
})
type NotificationCursor = z.infer<typeof NotificationCursor>

const encodeCursor = (content: NotificationCursor) =>
  Buffer.from(JSON.stringify(content), 'utf8').toString('base64url')

/** null sans curseur (la première page) ; 'invalid' pour un curseur qui ne veut rien dire. */
export const readNotificationCursor = (
  cursor: string | undefined,
): NotificationCursor | null | 'invalid' => {
  if (cursor === undefined) return null
  try {
    const parsed = NotificationCursor.safeParse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    )
    return parsed.success ? parsed.data : 'invalid'
  } catch {
    return 'invalid' // pas du JSON
  }
}

// ─── La liste ───────────────────────────────────────────────────────────────────────────────────

// Une ligne de la requête de la liste. db.execute rend des lignes sans type : Zod les vérifie (et
// les type) plutôt qu'un « as » qui croirait la base sur parole.
const count = z.number().int().nullable()
const ListRow = z.object({
  kind: z.enum([
    'reactions',
    'project_follows',
    'member_follows',
    'comment',
    'hidden',
    'handle',
    'removed',
    'report_handled',
    'suspended',
    'suspension_ended',
    'project_update',
    'tester_call',
    'tester_message',
    'feedback_settled',
    'project_category',
    'tool_added',
    // R9 : une partie du profil retirée, et un contenu ou une partie rétablis.
    'profile_removed',
    'restored',
  ]),
  key: z.string(),
  at: z.string(),
  day: z.string().nullable(),
  reason: z.enum(['mention', 'reply', 'comment']).nullable(),
  amazing: count,
  inspiring: count,
  useful: count,
  funny: count,
  bravo: count,
  total: count,
  project_id: z.string().nullable(),
  project_title: z.string().nullable(),
  comment_id: z.string().nullable(),
  body: z.string().nullable(),
  author_id: z.string().nullable(),
  author_name: z.string().nullable(),
  author_avatar_key: z.string().nullable(),
  author_handle: z.string().nullable(),
  my_handle: z.string().nullable(),
  // Tranche 7a : les sources de la modération. R7a (relecture de sécurité B1) : la sorte « telle
  // que gardée en base », avec 'note' pour un ancien signalement d'une note du Journal : le schéma
  // d'entrée (ReportTargetKind, sans 'note') ferait répondre 500 à toute la liste de ce membre.
  target_kind: StoredReportTargetKind.nullable(),
  outcome: z.string().nullable(),
  member_id: z.string().nullable(),
  // R7a : la mise à jour annoncée (source 11) ou retirée (source 7). `update_lines` est le jsonb
  // tel qu'en base, relu sans confiance par readLines (relecture de sécurité A7).
  update_id: z.string().nullable(),
  update_title: z.string().nullable(),
  update_version: z.string().nullable(),
  update_lines: z.unknown(),
  ground: z.string().nullable(),
  explanation: z.string().nullable(),
  after_report: z.boolean().nullable(),
  // Tranche 7c : le projet d'un commentaire retiré, caché par un blocage ; la fin prévue d'une
  // suspension ; sa levée par un administrateur.
  project_hidden: z.boolean(),
  ends_at: z.string().nullable(),
  lifted: z.boolean(),
  // R7b : la mise à jour qui a réglé un retour (sa date, et si elle est retirée) ; l'appel (son
  // texte, que tous ses testeurs lisent) ; le message (sa sorte et son fil ; son texte seulement
  // pour la notification de son retrait, que seul son expéditeur reçoit).
  update_created_at: z.string().nullable(),
  update_removed: z.boolean(),
  call_id: z.string().nullable(),
  call_text: z.string().nullable(),
  message_id: z.string().nullable(),
  message_kind: z.enum(['feedback', 'reply']).nullable(),
  message_tester_id: z.string().nullable(),
  message_text: z.string().nullable(),
  // R8 : la miniature du projet nommé (la clé de son fichier et son ThumbHash) ; la notice du
  // catalogue (la catégorie, ou l'outil et le nom tapé).
  cover_key: z.string().nullable(),
  cover_thumbhash: z.string().nullable(),
  notice_category: z.string().nullable(),
  notice_merged: z.boolean().nullable(),
  notice_typed_name: z.string().nullable(),
  tool_slug: z.string().nullable(),
  tool_name: z.string().nullable(),
  // R9 : la partie d'une décision (son champ, le rang de sa photo), le nom ou pseudo mis d'office,
  // la raison d'une levée, et si la valeur d'un nom ou d'un pseudo rétabli est revenue.
  part_field: z.string().nullable(),
  part_position: z.number().int().positive().nullable(),
  provisional_value: z.string().nullable(),
  lift_cause: z.string().nullable(),
  value_back: z.boolean().nullable(),
})
export type ListRow = z.infer<typeof ListRow>

/** La partie d'une ligne, validée par le contrat ; null pour un contenu entier ou une valeur inconnue. */
const partOf = (row: ListRow) => {
  const field = ReportPartField.safeParse(row.part_field)
  return field.success ? { field: field.data, position: row.part_position } : null
}

/** Les parties d'un profil qu'une notification `profile_removed` peut nommer (contrat). */
const ProfilePartField = z.enum(['name', 'handle', 'bio', 'favoriteTools', 'avatar'])
/** Les sortes de contenu d'une notification `restored` (contrat) ; une ancienne note n'en est pas. */
const RestoredKind = z.enum(['project', 'update', 'comment', 'call', 'message', 'member'])

/**
 * L'extrait d'un commentaire : son texte actuel sur une ligne, 80 caractères au plus, suivi de
 * « … » s'il a été coupé. On ne coupe pas au milieu d'un emoji (deux « unités » de JavaScript).
 */
export const excerptOf = (body: string) => {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat.length <= EXCERPT_MAX) return flat
  let cut = flat.slice(0, EXCERPT_MAX)
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

/**
 * Le membre nommé par une notification du coin des testeurs (R7b) : son nom et sa photo, déjà
 * montrés dans le coin. À n'appeler qu'une fois `author_id` et `author_name` vérifiés non nuls.
 */
const authorOf = (row: ListRow, publicApiUrl: string) => ({
  id: row.author_id ?? '',
  name: row.author_name ?? '',
  avatarUrl: avatarUrlOf(publicApiUrl, row.author_avatar_key),
})

/**
 * Une ligne en notification du contrat ; null si ce qu'elle montre a disparu entre-temps (le
 * projet, l'auteur, un pseudo). `seenAt` : la dernière ouverture de l'écran (null : jamais).
 */
export const present = (
  row: ListRow,
  seenAt: Date | null,
  publicApiUrl: string,
): Notification | null => {
  const common = {
    id: row.key,
    at: row.at,
    isNew: seenAt === null || Date.parse(row.at) > seenAt.getTime(),
  }
  // R8 : chaque notification qui nomme un projet porte sa miniature (choisie par loadDetailedRows),
  // à la même adresse que les médias du projet ; null sans photo.
  const cover =
    row.cover_key !== null && row.cover_thumbhash !== null
      ? { url: mediaUrl(publicApiUrl, row.cover_key), thumbhash: row.cover_thumbhash }
      : null
  const project =
    row.project_id !== null && row.project_title !== null
      ? { id: row.project_id, title: row.project_title, cover }
      : null
  const comment =
    row.comment_id !== null && row.body !== null
      ? { id: row.comment_id, excerpt: excerptOf(row.body) }
      : null
  switch (row.kind) {
    case 'reactions':
      if (!project || row.day === null || !row.total) return null
      return {
        ...common,
        kind: 'reactions',
        project,
        day: row.day,
        counts: {
          amazing: row.amazing ?? 0,
          inspiring: row.inspiring ?? 0,
          useful: row.useful ?? 0,
          funny: row.funny ?? 0,
          bravo: row.bravo ?? 0,
        },
        total: row.total,
      }
    case 'project_follows':
      if (!project || row.day === null || !row.total) return null
      return { ...common, kind: 'project_follows', project, day: row.day, count: row.total }
    case 'member_follows':
      if (row.day === null || !row.total) return null
      return { ...common, kind: 'member_follows', day: row.day, count: row.total }
    case 'comment':
      if (!project || !comment || row.reason === null) return null
      if (row.author_id === null || row.author_name === null || row.author_handle === null) {
        return null
      }
      return {
        ...common,
        kind: 'comment',
        reason: row.reason,
        project,
        comment,
        author: {
          id: row.author_id,
          name: row.author_name,
          avatarUrl: avatarUrlOf(publicApiUrl, row.author_avatar_key),
          handle: row.author_handle,
        },
      }
    case 'hidden':
      if (!project || !comment) return null
      return { ...common, kind: 'hidden', project, comment }
    case 'handle':
      if (row.my_handle === null) return null
      return { ...common, kind: 'handle', handle: row.my_handle }
    case 'project_update': {
      // R7a : le projet, son auteur, puis la mise à jour (titre, version, première ligne). Rien ne
      // dit si le membre suit ou teste (A6). La source n'a gardé que des mises à jour qui ont une
      // ligne lisible ; si elle a changé entre-temps, rien n'est montré.
      const lines = readLines(row.update_lines)
      const firstLine = lines[0]
      if (!project || !firstLine || row.update_id === null) return null
      if (row.author_id === null || row.author_name === null) return null
      return {
        ...common,
        kind: 'project_update',
        project,
        author: {
          id: row.author_id,
          name: row.author_name,
          avatarUrl: avatarUrlOf(publicApiUrl, row.author_avatar_key),
        },
        update: {
          id: row.update_id,
          title: row.update_title,
          version: row.update_version,
          firstLine,
          // R8 : « et 2 autres changements » : les autres lignes lisibles, comptées comme la
          // première (readLines écarte ce qui ne se lit pas).
          moreLines: lines.length - 1,
        },
      }
    }
    // R8, le catalogue : signées par l'équipe, elles ne nomment aucun membre. La catégorie, ou
    // l'outil, disparus entre-temps : rien n'est montré.
    case 'project_category':
      if (!project || row.notice_category === null) return null
      return { ...common, kind: 'project_category', project, category: row.notice_category }
    case 'tool_added':
      if (row.notice_typed_name === null || row.tool_slug === null || row.tool_name === null) {
        return null
      }
      return {
        ...common,
        kind: 'tool_added',
        merged: row.notice_merged === true,
        typedName: row.notice_typed_name,
        toolSlug: row.tool_slug,
        toolName: row.tool_name,
      }
    // R7b, le coin des testeurs. `author_id` est l'auteur du projet (un appel, un retour réglé) ou
    // l'expéditeur du message ; son compte supprimé entre-temps : rien n'est montré.
    case 'tester_call': {
      // L'appel supprimé entre-temps (la jointure ne le trouve plus) : rien n'est montré.
      const excerpt = row.call_text === null ? null : testerExcerptOf(row.call_text)
      if (!project || row.author_id === null || row.author_name === null) return null
      if (row.call_id === null || excerpt === null) return null
      const call = { id: row.call_id, excerpt }
      return { ...common, kind: 'tester_call', project, author: authorOf(row, publicApiUrl), call }
    }
    case 'tester_message': {
      if (!project || row.author_id === null || row.author_name === null) return null
      if (row.message_id === null || row.message_kind === null || row.message_tester_id === null) {
        return null
      }
      return {
        ...common,
        kind: 'tester_message',
        project,
        from: authorOf(row, publicApiUrl),
        // L'expéditeur est le testeur du fil, ou bien l'auteur du projet.
        role: row.author_id === row.message_tester_id ? 'tester' : 'author',
        message: { id: row.message_id, kind: row.message_kind, testerId: row.message_tester_id },
      }
    }
    case 'feedback_settled': {
      if (!project || row.author_id === null || row.author_name === null) return null
      if (row.message_id === null) return null
      // Réglé par une mise à jour : sa version et sa date. Réglé à la main, mise à jour supprimée
      // (la clé étrangère passe à null) ou retirée par la modération (comme dans le fil, relecture
      // de sécurité A10) : null, la notification dit seulement « réglé ».
      const update =
        row.update_id !== null && row.update_created_at !== null && !row.update_removed
          ? { id: row.update_id, version: row.update_version, createdAt: row.update_created_at }
          : null
      return {
        ...common,
        kind: 'feedback_settled',
        project,
        author: authorOf(row, publicApiUrl),
        update,
      }
    }
    case 'removed': {
      // Le fondement, l'explication et « après un signalement », lus avec la décision ; jamais qui
      // a décidé ni qui a signalé (règle 14).
      const removal =
        row.ground === null
          ? null
          : toRemoval({
              ground: row.ground,
              explanation: row.explanation,
              createdAt: new Date(row.at),
              afterReport: row.after_report ?? false,
            })
      const targetKind = row.target_kind
      if (
        !project ||
        !removal ||
        (targetKind !== 'project' &&
          targetKind !== 'update' &&
          targetKind !== 'comment' &&
          targetKind !== 'call' &&
          targetKind !== 'message')
      ) {
        return null
      }
      // R7b : un appel ou un message retiré. Supprimé entre-temps par son auteur (la jointure ne le
      // trouve plus) : plus de notification. Un retour sans texte (« Ça a marché ? » suffit) n'a
      // pas d'extrait : la notification reste, sans extrait.
      if (targetKind === 'call' || targetKind === 'message') {
        const text = targetKind === 'call' ? row.call_text : row.message_text
        if (targetKind === 'call' ? row.call_id === null : row.message_id === null) return null
        return {
          ...common,
          kind: 'removed',
          targetKind,
          // R9 : la photo retirée seule (son rang), ou null pour tout l'appel ou tout le message.
          part: partOf(row),
          project,
          excerpt: text === null ? null : testerExcerptOf(text),
          ground: removal.ground,
          explanation: removal.explanation,
          afterReport: removal.afterReport,
          projectHidden: row.project_hidden,
        }
      }
      // L'extrait d'une mise à jour (sa première ligne lisible, R7a) ou d'un commentaire retiré :
      // son texte actuel, que son auteur lit encore. Disparu entre-temps : plus de notification.
      const text =
        targetKind === 'update'
          ? (readLines(row.update_lines)[0]?.text ?? null)
          : targetKind === 'comment'
            ? row.body
            : null
      if (targetKind !== 'project' && text === null) return null
      return {
        ...common,
        kind: 'removed',
        targetKind,
        // R9 : la partie retirée seule (« La 2e photo de Météo ») ; null : le contenu entier. Une
        // partie d'une mise à jour garde l'extrait de celle-ci : il dit de quelle mise à jour il
        // s'agit.
        part: partOf(row),
        project,
        excerpt: text === null ? null : excerptOf(text),
        ground: removal.ground,
        explanation: removal.explanation,
        afterReport: removal.afterReport,
        // Calculé dans la requête (loadDetailedRows), avec le titre vidé : plus de devinette.
        projectHidden: row.project_hidden,
      }
    }
    case 'profile_removed': {
      // R9 (7d) : la partie du profil, et ce qui a été mis à la place d'un nom ou d'un pseudo
      // (« Membre », « membre_4f2a ») ; jamais l'ancienne valeur, qui est retirée.
      const field = ProfilePartField.safeParse(row.part_field)
      const removal =
        row.ground === null
          ? null
          : toRemoval({
              ground: row.ground,
              explanation: row.explanation,
              createdAt: new Date(row.at),
              afterReport: row.after_report ?? false,
            })
      if (!field.success || !removal) return null
      const replaced = field.data === 'name' || field.data === 'handle'
      return {
        ...common,
        kind: 'profile_removed',
        part: { field: field.data },
        replacedBy: replaced ? row.provisional_value : null,
        ground: removal.ground,
        explanation: removal.explanation,
        afterReport: removal.afterReport,
      }
    }
    case 'restored': {
      // R9 : signée par l'équipe, sans l'administrateur. Le projet, s'il le voit encore ; la
      // partie ; et, pour un pseudo, celui qu'il porte aujourd'hui.
      const targetKind = RestoredKind.safeParse(row.target_kind)
      if (!targetKind.success) return null
      const part = partOf(row)
      return {
        ...common,
        kind: 'restored',
        targetKind: targetKind.data,
        project,
        part,
        valueBack: row.value_back ?? true,
        handle: part?.field === 'handle' ? row.my_handle : null,
      }
    }
    case 'suspended': {
      // Sans sa décision (elle est gardée tant que la suspension l'est, J7), la notification ne
      // saurait dire ni le fondement ni l'explication : elle n'est pas montrée.
      const ground = RemovalGround.safeParse(row.ground)
      if (!ground.success) return null
      return {
        ...common,
        kind: 'suspended',
        endsAt: row.ends_at,
        ground: ground.data,
        explanation: row.explanation ?? '',
        afterReport: row.after_report ?? false,
      }
    }
    case 'suspension_ended':
      // Une levée donne son explication ; une fin à la date prévue n'en a pas (null).
      return {
        ...common,
        kind: 'suspension_ended',
        lifted: row.lifted,
        // R9 (jur-R6) : la cause, lue sur la décision de levée (lift_cause) : une levée pour erreur
        // le dit ; toute autre levée est « plus tôt » ; sans levée, la fin prévue est arrivée.
        cause: row.lifted ? (row.lift_cause === 'error' ? 'error' : 'early') : 'end',
        explanation: row.lifted ? (row.explanation ?? '') : null,
      }
    case 'report_handled': {
      // La sorte de cible et l'issue, rien d'autre (règle 2) : la ligne porte aussi le titre du
      // projet (jointure commune à toutes les sources), qui n'est volontairement pas repris ici.
      const outcome = z.enum(['removed', 'dismissed']).safeParse(row.outcome)
      if (row.target_kind === null || !outcome.success) return null
      const link =
        row.project_id !== null || row.member_id !== null
          ? { projectId: row.project_id, memberId: row.member_id }
          : null
      return {
        ...common,
        kind: 'report_handled',
        targetKind: row.target_kind,
        outcome: outcome.data,
        link,
      }
    }
  }
}

/**
 * Complète les lignes choisies par `chosen` (une requête sur les sources, déjà triée et bornée) :
 * le titre du projet, le texte du commentaire, l'auteur et les pseudos. Partagé par la liste de
 * l'appli et par les e-mails (tranche 6c), pour que les deux montrent exactement la même chose.
 */
const loadDetailedRows = async (db: Database, me: string, chosen: SQL) => {
  const query = sql`
    select n.kind, n.key, to_char(n.at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at, n.day, n.reason,
      n.amazing, n.inspiring, n.useful, n.funny, n.bravo, n.total,
      project.id as project_id,
      -- Tranche 7b, règle 9 : le retrait de son commentaire sur le projet d'un membre bloqué
      -- avec lui garde sa motivation, mais ne nomme plus ce projet (titre vide). Tranche 7c :
      -- l'appli le sait par project_hidden, calculé une fois (« hid », plus bas).
      case when hid.hidden then '' else project.title end as project_title,
      coalesce(hid.hidden, false) as project_hidden,
      c.id as comment_id, c.body,
      a.id as author_id, a.name as author_name, ap.avatar_key as author_avatar_key,
      ah.handle as author_handle, mh.handle as my_handle,
      n.target_kind, n.outcome, n.member_id,
      pu.id as update_id, pu.title as update_title, pu.version as update_version,
      pu.lines as update_lines,
      md.ground, md.explanation,
      -- Une suspension porte elle-même « après un signalement » (J2) ; un retrait le déduit des
      -- signalements de sa cible (afterReportSql). « case » ne lance que la branche utile.
      case when n.kind = 'suspended' then sus.after_report
        else (md.id is not null and ${afterReportSql({
          id: sql.raw('md.id'),
          targetKind: sql.raw('md.target_kind'),
          targetId: sql.raw('md.target_id'),
          adminId: sql.raw('md.admin_id'),
        })}) end as after_report,
      to_char(sus.ends_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as ends_at,
      (sus.lift_decision_id is not null) as lifted,
      -- R7b : la mise à jour qui a réglé un retour ; l'appel ; le message. Le texte d'un message
      -- ne sort que pour la notification de son retrait (son expéditeur seul la reçoit) : le fil
      -- est privé, rien d'autre n'en a besoin.
      to_char(pu.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as update_created_at,
      (pu.removed_at is not null) as update_removed,
      tc.id as call_id, tc.text as call_text,
      tm.id as message_id, tm.kind as message_kind, tm.tester_id as message_tester_id,
      case when n.kind = 'removed' then tm.text end as message_text,
      -- R8 : la miniature du projet (« cover », plus bas) ; la notice du catalogue et son outil.
      cover.storage_key as cover_key, cover.thumbhash as cover_thumbhash,
      cn.category_code as notice_category,
      case when cn.id is not null then cn.kind = 'tool_merged' end as notice_merged,
      cn.typed_name as notice_typed_name,
      notice_tool.slug as tool_slug, notice_tool.name as tool_name,
      -- R9 : la partie de la décision et le rang de sa photo (part-rank.ts), le nom ou pseudo mis
      -- d'office, la raison d'une levée. « valueBack » d'un nom ou d'un pseudo rétabli : le
      -- pseudo d'avant a été repris à l'instant du rétablissement (restoreHandle note cette date
      -- dans claimed_at), ou le nom d'avant est celui d'aujourd'hui ; toute autre partie revient
      -- toujours (rétablir échoue si l'auteur l'a remplacée entre-temps : sa ligne n'existe plus).
      md.part_field,
      case when md.part_media_id is not null then ${photoRankSql(sql.raw('md.part_media_id'))} end
        as part_position,
      md.provisional_value, md.lift_cause,
      case
        when n.kind <> 'restored' then null
        when md.part_field = 'handle' then exists (
          select 1 from member_handle vh
          where vh.handle = prev.previous_value and vh.user_id = ${me}
            and vh.claimed_at = md.created_at)
        when md.part_field = 'name' then a_me.name = prev.previous_value
        else true
      end as value_back
    from (${chosen}) n
    left join project on project.id = n.project_id
    -- « lateral » : une sous-requête qui lit les colonnes des tables déjà jointes (ici, l'auteur du
    -- projet), calculée une fois par ligne et réutilisée par deux colonnes. Deux « exists » par les
    -- index de member_block (blockedWith), seulement pour un retrait.
    left join lateral (
      select n.kind = 'removed' and ${blockedWith(me, sql.raw('project.author_id'))} as hidden
    ) hid on true
    left join project_comment c on c.id = n.comment_id
    left join "user" a on a.id = n.author_id
    left join profile ap on ap.user_id = n.author_id
    left join member_handle ah on ah.user_id = n.author_id and ah.released_at is null
    left join member_handle mh on n.kind in ('handle', 'restored') and mh.user_id = ${me}
      and mh.released_at is null
    -- Tranche 7a : la décision d'un retrait. R7a : la mise à jour annoncée ou retirée, à la place
    -- de la note (clés primaires).
    left join project_update pu on pu.id = n.update_id
    left join moderation_decision md on md.id = n.decision_id
    -- R9 : pour un nom ou un pseudo rétabli, le retrait qu'il défait (le dernier retrait de ce champ
    -- avant lui, index moderation_decision_target_idx) et son ancienne valeur ; et le nom actuel du
    -- membre (clé primaire de user).
    left join lateral (
      select rm.previous_value from moderation_decision rm
      where n.kind = 'restored' and md.part_field in ('name', 'handle')
        and rm.target_kind = 'member' and rm.target_id = ${me} and rm.part_field = md.part_field
        and rm.action = 'remove' and rm.created_at < md.created_at
      order by rm.created_at desc
      limit 1
    ) prev on true
    left join "user" a_me on n.kind = 'restored' and md.part_field = 'name' and a_me.id = ${me}
    -- Tranche 7c : la suspension d'une notification de suspension ou de fin (clé primaire).
    left join account_suspension sus on sus.id = n.suspension_id
    -- R7b : l'appel ou le message de item_id, par la clé primaire de sa table. La sorte de la
    -- notification dit dans quelle table chercher.
    left join tester_call tc on tc.id = n.item_id
      and (n.kind = 'tester_call' or n.target_kind = 'call')
    left join tester_message tm on tm.id = n.item_id
      and (n.kind in ('tester_message', 'feedback_settled') or n.target_kind = 'message')
    -- R8 : la miniature du projet nommé : la première photo de sa galerie (l'ordre choisi par
    -- l'auteur, comme selectMedia), sinon sa couverture verticale, sinon rien (« limit 1 » : une
    -- seule ligne). L'index project_media_project_idx (project_id, slot, position) donne les
    -- quelques photos du projet ; celles des mises à jour (slot 'update') ne comptent pas. Un projet
    -- que la notification ne nomme plus (titre vidé par un blocage, « hid ») n'a pas de miniature.
    left join lateral (
      select m.storage_key, m.thumbhash from project_media m
      where m.project_id = project.id and m.slot in ('gallery', 'portrait')
        -- R9 : jamais une photo retirée seule par la modération (projects/media-visibility.ts).
        and ${mediaOnCoversSql('m')}
        and not coalesce(hid.hidden, false)
      order by m.slot = 'portrait', m.position, m.created_at
      limit 1
    ) cover on true
    -- R8 : la notice du catalogue de item_id, puis l'outil qu'elle nomme (clés primaires).
    left join catalogue_notice cn on cn.id = n.item_id
      and n.kind in ('project_category', 'tool_added')
    left join tool notice_tool on notice_tool.id = cn.tool_id
    order by n.at desc, n.key desc
  `
  return z.object({ rows: z.array(ListRow) }).parse(await db.execute(query)).rows
}

/**
 * Toutes les notifications de `me` dont le geste est postérieur à `since` et pas postérieur à
 * `until` (le `now` de la tâche : voir sources), de la plus récente à la
 * plus ancienne, pour les e-mails (tranche 6c) : le récap de la semaine (depuis 7 jours au plus)
 * et l'e-mail de mentions (depuis 24 heures au plus). Le même calcul que l'écran des
 * notifications (les six sources, puis present() pour écarter ce qui a disparu), mais sans page :
 * la borne `since` limite déjà la lecture à l'activité récente autour du membre, par les index de
 * chaque source. Chaque élément garde sa ligne brute (`row.body` : le texte entier du commentaire,
 * que l'e-mail de mentions nettoie avant d'en tirer l'extrait).
 */
export const loadNotificationsSince = async (
  db: Database,
  me: string,
  since: Date,
  until: Date,
  publicApiUrl: string,
) => {
  const rows = await loadDetailedRows(
    db,
    me,
    sql`
      select kind, key, date_trunc('milliseconds', at) as at, project_id, comment_id, reason,
        author_id, day, amazing, inspiring, useful, funny, bravo, total, ${moderationColumns}
      from (${sources(me, since, until, until)}) u
    `,
  )
  return rows.flatMap((row) => {
    const notification = present(row, null, publicApiUrl)
    return notification ? [{ row, notification }] : []
  })
}

/**
 * Une page de notifications de `me`, de la plus récente à la plus ancienne (puis par clé, pour
 * départager deux groupes du même instant), après le curseur s'il y en a un. Une seule requête,
 * quelle que soit la longueur de la page :
 *
 *   select n.*, project.title, c.body, a.name, ap.avatar_key, ah.handle, mh.handle
 *   from (
 *     select … from (<les six sources, sur 90 jours>) u
 *     where (at, key) < ($date, $clé)          -- la suite, après le curseur
 *     order by at desc, key desc limit 21
 *   ) n
 *   left join project … left join project_comment … left join "user" … left join profile …
 *   left join member_handle …                   -- le titre, l'extrait, l'auteur, les pseudos
 *   order by n.at desc, n.key desc
 *
 * Les jointures ne sont faites que pour les 21 lignes gardées (après « limit »), par les clés
 * primaires et l'index partiel member_handle_current_idx. Les dates sont ramenées à la
 * milliseconde (« date_trunc ») : c'est la précision du curseur, qui passe par JavaScript ; sans
 * cela, une date plus fine (les anciens abonnements, datés par la base) ferait sauter des lignes.
 *
 * Le prix de « calculé, pas recopié » : chaque page recalcule les 90 derniers jours du membre
 * (toutes ses sources), puis trie. C'est proportionnel à l'activité autour de lui, pas à la taille
 * de la base.
 */
export const loadNotificationPage = async (
  db: Database,
  me: string,
  seenAt: Date | null,
  cursor: NotificationCursor | null,
  now: Date,
  publicApiUrl: string,
) => {
  const rows = await loadDetailedRows(
    db,
    me,
    sql`
      select kind, key, date_trunc('milliseconds', at) as at, project_id, comment_id, reason,
        author_id, day, amazing, inspiring, useful, funny, bravo, total, ${moderationColumns}
      from (${sources(me, notificationCutoff(now), now)}) u
      ${cursor ? sql`where (date_trunc('milliseconds', at), key) < (${utc(cursor.at)}, ${cursor.key})` : sql``}
      order by at desc, key desc
      limit ${NOTIFICATION_PAGE_SIZE + 1}
    `,
  )
  const page = rows.slice(0, NOTIFICATION_PAGE_SIZE)
  // Le marque-page vient de la dernière ligne lue de la page, même si elle a été laissée de côté
  // (son projet venait de disparaître) : la page suivante repart exactement d'où celle-ci s'arrête.
  const last = page.at(-1)
  return {
    items: page.flatMap((row) => present(row, seenAt, publicApiUrl) ?? []),
    nextCursor:
      rows.length > NOTIFICATION_PAGE_SIZE && last
        ? encodeCursor({ at: last.at, key: last.key })
        : null,
    asOf: now.toISOString(),
  }
}

/**
 * Le nombre de la cloche : les notifications nouvelles (geste après `seenAt`, et dans les 90
 * jours), 10 au plus. En SQL :
 *   select count(*)::int from (select 1 from (<les six sources, depuis seenAt>) s limit 10) x
 *
 * Un groupe est nouveau si son geste le plus récent est après seenAt, c'est-à-dire s'il contient au
 * moins un geste après seenAt : chaque source peut donc ne lire que les gestes d'après seenAt (les
 * index ci-dessus portent aussi la date, ou la lisent dans peu de lignes). « limit 10 » arrête la
 * lecture au dixième groupe : au-delà, l'appli affiche « 9+ » de toute façon.
 */
export const countUnread = async (db: Database, me: string, seenAt: Date | null, now: Date) => {
  const cutoff = notificationCutoff(now)
  const since = seenAt && seenAt > cutoff ? seenAt : cutoff
  const query = sql`
    select count(*)::int as count
    from (select 1 from (${sources(me, since, now)}) s limit ${UNREAD_COUNT_MAX}) x
  `
  const { rows } = z
    .object({ rows: z.array(z.object({ count: z.number().int() })) })
    .parse(await db.execute(query))
  return rows[0]?.count ?? 0
}
