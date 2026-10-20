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
  UNREAD_COUNT_MAX,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { mediaUrl } from '../profile/me'
import { visibleTo } from '../projects/load'

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
const utc = (date: Date | string) =>
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
 * « `me` lit le commentaire c (du projet p), et n'en est pas l'auteur » : la règle de `sees`
 * (comments/load.ts), écrite pour un lecteur qui n'a pas écrit le commentaire, et pour des
 * commentaires de plusieurs projets à la fois (seesSql, elle, sert un projet déjà connu) :
 * - ni supprimé, ni sans auteur : « author_id <> me » écarte aussi les null (null n'est différent
 *   de rien) ;
 * - sur un projet public seulement : sur un projet privé, seul l'auteur d'un commentaire le lit
 *   (et ce n'est pas `me`) ;
 * - pas masqué, sauf pour l'auteur du projet, qui lit encore ce qu'il a masqué.
 * Une mention ne notifie ainsi que qui peut lire (scénario de la tranche 6b).
 */
const readable = (me: string) => sql`(c.deleted_at is null and c.author_id <> ${me}
  and p.visibility = 'public' and (c.hidden_at is null or p.author_id = ${me}))`

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
 *   6. son pseudo : la clé primaire de notification_state.
 */
const sources = (me: string, since: Date): SQL => {
  const after = utc(since)
  return sql`
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
    from project p
    join project_reaction r on r.project_id = p.id
    cross join lateral (select ${parisDay('r.created_at')} as day) d
    where p.author_id = ${me} and p.visibility = 'public'
      and r.member_id <> ${me} and r.created_at > ${after}
    group by r.project_id, d.day

    union all

    -- 2. Les abonnés à ses projets publics, par projet et par jour.
    select 'project_follows', 'project_follows:' || f.project_id || ':' || d.day,
      max(f.created_at), f.project_id, null, null, null, d.day,
      null, null, null, null, null, count(*)::int
    from project p
    join project_follow f on f.project_id = p.id
    cross join lateral (select ${parisDay('f.created_at')} as day) d
    where p.author_id = ${me} and p.visibility = 'public'
      and f.follower_id <> ${me} and f.created_at > ${after}
    group by f.project_id, d.day

    union all

    -- 3. Les abonnés à son compte, par jour (on ne peut pas se suivre soi-même : la base le refuse).
    select 'member_follows', 'member_follows:' || d.day,
      max(f.created_at), null, null, null, null, d.day,
      null, null, null, null, null, count(*)::int
    from member_follow f
    cross join lateral (select ${parisDay('f.created_at')} as day) d
    where f.member_id = ${me} and f.created_at > ${after}
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
        join project p on p.id = c.project_id
        where m.member_id = ${me} and m.created_at > ${after} and ${readable(me)}
        union all
        select c.id, c.project_id, c.author_id, 'reply', 2, c.created_at
        from project_comment root
        join project_comment c on c.root_id = root.id
        join project p on p.id = c.project_id
        where root.author_id = ${me} and root.root_id is null and c.created_at > ${after}
          and ${readable(me)}
        union all
        select c.id, c.project_id, c.author_id, 'comment', 3, c.created_at
        from project p
        join project_comment c on c.project_id = p.id
        where p.author_id = ${me} and c.created_at > ${after} and ${readable(me)}
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
    where c.author_id = ${me} and c.deleted_at is null and c.hidden_at > ${after}
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
    where s.user_id = ${me} and s.created_at > ${after} and s.handle_chosen_at is null
  `
}

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
  kind: z.enum(['reactions', 'project_follows', 'member_follows', 'comment', 'hidden', 'handle']),
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
})
type ListRow = z.infer<typeof ListRow>

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
const present = (row: ListRow, seenAt: Date | null, publicApiUrl: string): Notification | null => {
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
  }
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
  const query = sql`
    select n.kind, n.key, to_char(n.at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at, n.day, n.reason,
      n.amazing, n.inspiring, n.useful, n.funny, n.bravo, n.total,
      project.id as project_id, project.title as project_title,
      c.id as comment_id, c.body,
      a.id as author_id, a.name as author_name, ap.avatar_key as author_avatar_key,
      ah.handle as author_handle, mh.handle as my_handle
    from (
      select kind, key, date_trunc('milliseconds', at) as at, project_id, comment_id, reason,
        author_id, day, amazing, inspiring, useful, funny, bravo, total
      from (${sources(me, notificationCutoff(now))}) u
      ${cursor ? sql`where (date_trunc('milliseconds', at), key) < (${utc(cursor.at)}, ${cursor.key})` : sql``}
      order by at desc, key desc
      limit ${NOTIFICATION_PAGE_SIZE + 1}
    ) n
    left join project on project.id = n.project_id
    left join project_comment c on c.id = n.comment_id
    left join "user" a on a.id = n.author_id
    left join profile ap on ap.user_id = n.author_id
    left join member_handle ah on ah.user_id = n.author_id and ah.released_at is null
    left join member_handle mh on n.kind = 'handle' and mh.user_id = ${me} and mh.released_at is null
    order by n.at desc, n.key desc
  `
  const { rows } = z.object({ rows: z.array(ListRow) }).parse(await db.execute(query))
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
    from (select 1 from (${sources(me, since)}) s limit ${UNREAD_COUNT_MAX}) x
  `
  const { rows } = z
    .object({ rows: z.array(z.object({ count: z.number().int() })) })
    .parse(await db.execute(query))
  return rows[0]?.count ?? 0
}
