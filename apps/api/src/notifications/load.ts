// Le calcul des notifications d'un membre (tranche 6b). Rien n'est recopié dans une table « X a
// réagi » : la liste se calcule à chaque lecture, à partir des réactions, abonnements, commentaires
// et mentions qui existent. Une réaction retirée, un commentaire supprimé ou masqué, un projet
// devenu privé, un compte supprimé font donc disparaître leur notification sans code de plus, et
// rien n'est montré au-delà de 90 jours. Ce que le membre a déjà vu (seen_at) et la date de son
// pseudo sont lus dans notification_state (state.ts).
import {
  EXCERPT_MAX,
  NOTIFICATION_DAYS,
  NOTIFICATION_PAGE_SIZE,
  type Notification,
  RemovalGround,
  ReportTargetKind,
  UNREAD_COUNT_MAX,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { blockedWith, notBlockedWith } from '../blocks/visibility'
import { mediaUrl } from '../profile/me'
import { visibleTo } from '../projects/load'
import { listedProject, listedProjectFor } from '../projects/visibility'
import { afterReportSql, toRemoval } from '../removals/load'
// suspension/load.ts lit aussi `utc` dans ce fichier : les deux modules s'importent l'un l'autre.
// C'est sans risque ici, car chacun n'utilise l'autre que dans ses fonctions, jamais au chargement.
import { activeSuspensionSql } from '../suspension/load'

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
 *      lues ; la jointure finale (account_suspension sus) passe par la clé primaire.
 * Les sources 7 à 10 ajoutent six colonnes : target_kind (la sorte de contenu), note_id (une note
 * retirée), decision_id (la décision de retrait, de suspension ou de levée), outcome (l'issue d'un
 * signalement), member_id (le membre visé par un signalement, pour le lien) et suspension_id (la
 * ligne account_suspension) ; null pour les six premières.
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
  // 7c) en ont besoin de six de plus. Plutôt que d'ajouter six « null » à chacune des six, on les
  // ajoute une fois autour d'elles (« select u.*, null… from (…) u »), et les sources 7 à 10
  // donnent les vingt colonnes elles-mêmes. PostgreSQL déplie ce « select » : chaque source
  // garde son index.
  return sql`
    select u.*, null::text as target_kind, null::uuid as note_id, null::uuid as decision_id,
      null::text as outcome, null::text as member_id, null::uuid as suspension_id
    from (${socialSources(me, during)}) u

    union all

    -- 7. Ses contenus retirés par la modération (tranche 7a) : ses projets, les notes de ses
    --    projets, ses commentaires. Datés du retrait, et repérés par la décision (« removed:<id> »)
    --    : rétabli, le contenu n'a plus de removed_at, et la notification disparaît d'elle-même.
    --    Un commentaire ne vient que d'un projet qu'il voit encore (règle 3 de la relecture du
    --    plan, comme la source 5) : sur un projet devenu privé ou retiré, rien, pas même le titre.
    --    Mais un blocage ne coupe jamais une notification de modération (tranche 7b, règle 9) :
    --    d'où listedProject(), sans visiteur, plutôt que visibleTo. Sur le projet d'un membre
    --    bloqué avec lui, la motivation reste, et le titre est vidé (loadDetailedRows).
    --    Index : ses projets par project_author_created_idx (puis les notes de chacun par
    --    project_note_project_created_idx) ; ses commentaires par project_comment_author_idx. Les
    --    contenus retirés sont rares : ces lectures écartent presque tout aussitôt.
    select 'removed', 'removed:' || x.removal_id, x.removed_at, x.project_id, x.comment_id,
      null, null, null, null, null, null, null, null, null,
      x.target_kind, x.note_id, x.removal_id, null, null, null
    from (
      select 'project' as target_kind, project.id as project_id, null::uuid as comment_id,
        null::uuid as note_id, project.removal_id, project.removed_at
      from project
      where project.author_id = ${me} and project.removed_at is not null
        and ${during('project.removed_at')}
      union all
      select 'note', project.id, null, nt.id, nt.removal_id, nt.removed_at
      from project
      join project_note nt on nt.project_id = project.id
      where project.author_id = ${me} and nt.removed_at is not null
        and ${during('nt.removed_at')}
      union all
      select 'comment', c.project_id, c.id, null, c.removal_id, c.removed_at
      from project_comment c
      join project on project.id = c.project_id
      where c.author_id = ${me} and c.deleted_at is null and c.removed_at is not null
        and ${during('c.removed_at')}
        and (${listedProject()} or project.author_id = ${me})
    ) x
    where x.removal_id is not null

    union all

    -- 8. Ses signalements traités (tranche 7a) : la sorte de cible et l'issue, rien d'autre (règle
    --    2). Un signalement « sans objet » (void : la cible a disparu) ne prévient personne (règle
    --    29). Le lien se calcule ici, à la lecture : le projet de la cible, seulement si ce membre
    --    la voit encore (projet visible, note ou commentaire ni retiré, ni supprimé, ni masqué pour
    --    lui), et le membre visé, seulement si son compte existe encore. « case » ne lance que la
    --    sous-requête de la sorte de cible : l'identifiant y est converti en uuid (« ::uuid »)
    --    seulement pour un projet, une note ou un commentaire, dont l'identifiant est un uuid
    --    (vérifié par POST /v1/reports) ; chacune passe par la clé primaire de sa table.
    --    Tranche 7b, règle 9 : la ligne reste malgré un blocage ; seul le lien vers un projet
    --    d'un membre bloqué avec lui disparaît (visibleTo le cache), comme pour un projet privé.
    --    Index : content_report_reporter_idx (ses signalements).
    select 'report_handled', 'report:' || r.id, r.decided_at,
      case r.target_kind
        when 'project' then (
          select project.id from project
          where project.id = r.target_id::uuid and ${visibleTo(me)})
        when 'note' then (
          select project.id from project_note nt
          join project on project.id = nt.project_id
          where nt.id = r.target_id::uuid and nt.removed_at is null and ${visibleTo(me)})
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
      null
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
      null, null, s.decision_id, null, null, s.id
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
      null, null, s.lift_decision_id, null, null, s.id
    from account_suspension s
    where s.user_id = ${me} and not ${activeSuspensionSql('s', now)}
      and ${during('coalesce(s.lifted_at, s.ends_at)')}
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

/** Les six colonnes des sources de la modération (7 à 10), à reprendre dans chaque lecture. */
const moderationColumns = sql.raw(
  'target_kind, note_id, decision_id, outcome, member_id, suspension_id',
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
  // Tranche 7a : les sources de la modération.
  target_kind: ReportTargetKind.nullable(),
  outcome: z.string().nullable(),
  member_id: z.string().nullable(),
  note_body: z.string().nullable(),
  ground: z.string().nullable(),
  explanation: z.string().nullable(),
  after_report: z.boolean().nullable(),
  // Tranche 7c : le projet d'un commentaire retiré, caché par un blocage ; la fin prévue d'une
  // suspension ; sa levée par un administrateur.
  project_hidden: z.boolean(),
  ends_at: z.string().nullable(),
  lifted: z.boolean(),
})
export type ListRow = z.infer<typeof ListRow>

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
  const project =
    row.project_id !== null && row.project_title !== null
      ? { id: row.project_id, title: row.project_title }
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
          avatarUrl: row.author_avatar_key ? mediaUrl(publicApiUrl, row.author_avatar_key) : null,
          handle: row.author_handle,
        },
      }
    case 'hidden':
      if (!project || !comment) return null
      return { ...common, kind: 'hidden', project, comment }
    case 'handle':
      if (row.my_handle === null) return null
      return { ...common, kind: 'handle', handle: row.my_handle }
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
      if (!project || !removal || row.target_kind === null || row.target_kind === 'member') {
        return null
      }
      // L'extrait d'une note ou d'un commentaire retiré : son texte actuel, que son auteur lit
      // encore. Disparu entre-temps : plus de notification.
      const text =
        row.target_kind === 'note' ? row.note_body : row.target_kind === 'comment' ? row.body : null
      if (row.target_kind !== 'project' && text === null) return null
      return {
        ...common,
        kind: 'removed',
        targetKind: row.target_kind,
        project,
        excerpt: text === null ? null : excerptOf(text),
        ground: removal.ground,
        explanation: removal.explanation,
        afterReport: removal.afterReport,
        // Calculé dans la requête (loadDetailedRows), avec le titre vidé : plus de devinette.
        projectHidden: row.project_hidden,
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
      n.target_kind, n.outcome, n.member_id, nt.body as note_body,
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
      (sus.lift_decision_id is not null) as lifted
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
    left join member_handle mh on n.kind = 'handle' and mh.user_id = ${me} and mh.released_at is null
    -- Tranche 7a : le texte d'une note retirée, et la décision d'un retrait (clés primaires).
    left join project_note nt on nt.id = n.note_id
    left join moderation_decision md on md.id = n.decision_id
    -- Tranche 7c : la suspension d'une notification de suspension ou de fin (clé primaire).
    left join account_suspension sus on sus.id = n.suspension_id
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
