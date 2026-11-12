// Le récap de la semaine (tranche 6c), que l'ordonnanceur lance le dimanche à 10 h, heure de Paris
// (R8 : avant, le lundi à 9 h). Scénarios : docs/scenarios/phase-1.md, « Précisions (tranche 6c) »,
// « Le récap » ; docs/scenarios/refonte.md, « Le récap de la semaine, habillé » (R8).
//
// Pour chaque membre qui peut le recevoir (compte vérifié, récap activé, le précédent il y a plus
// de 6 jours, moins de 3 récaps de suite sans visite, ou une visite depuis) :
// 1. calculer ce qui est nouveau pour lui :
//    - comme l'écran Activité (droits, masquage, projet privé), depuis le plus récent de sa dernière
//      visite d'Activité, du dernier récap et d'il y a 7 jours : les commentaires, réactions et
//      abonnés de ses projets (« Tes projets », en pastilles), ses réponses et mentions, ses
//      nouveaux abonnés, (R7a) les projets qu'il suit ou teste mis à jour, (R7b) le coin des
//      testeurs ; R8 : seulement les types réglés « Dans le récap », et ceux réglés « Tout de
//      suite » qui ne sont pas déjà partis par l'e-mail « tout de suite » ;
//    - R8 : les projets publiés cette semaine par les membres qu'il suit (« Nouveaux projets de tes
//      proches »), et un projet « Testable » de l'un d'eux qu'il ne teste pas encore (« Ils
//      cherchent des testeurs ») ;
// 2. rien de nouveau dans aucune partie : aucun e-mail ;
// 3. sinon, « prendre » l'envoi : une seule requête note la date d'envoi, si et seulement si les
//    conditions tiennent encore à cet instant, et rend l'adresse et les choix par type. Aucune
//    ligne rendue (désinscrit ou compte supprimé entre-temps, autre exécution passée avant) : rien
//    ne part. La date est notée AVANT l'envoi : un envoi qui échoue est perdu plutôt que doublé ;
// 4. refaire le tri avec les choix et la date du dernier e-mail « tout de suite » relus à la prise,
//    joindre les vignettes, puis envoyer, dans la langue du membre.
import {
  type EmailChoice,
  type EmailType,
  RECAP_FRIEND_PROJECTS_MAX,
  RECAP_IMAGES_MAX,
  RECAP_MAX_LINES,
  RECAP_UNVISITED_MAX,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { languageOfMember } from '../email/language'
import { categoryTile, recapThumb } from '../email/recap-images'
import { type Attachment, type RecapData, type RecapLine, recapEmail } from '../email/templates'
import { loadNotificationsSince, utc } from '../notifications/load'
import { listedVerifiedProjectFor } from '../projects/visibility'
import { activeSuspensionSql } from '../suspension/load'
import {
  BATCH_SIZE,
  isDeletedMember,
  isoDate,
  type JobDeps,
  latest,
  linksFor,
  logMemberFailure,
} from './shared'

const DAY = 24 * 60 * 60 * 1000
/** Ce qui entre dans un récap : 7 jours au plus. */
const RECAP_WINDOW_MS = 7 * DAY
/** Le récap suivant attend 6 jours au moins (filet après une sauvegarde restaurée, ou un retard). */
const RECAP_MIN_INTERVAL_MS = 6 * DAY
/** « Tes projets » : les deux premiers ont une vignette ; un proche, un projet à tester (4 en tout). */
const OWN_IMAGES = 2

const ISO = 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'

/**
 * « Le membre est venu depuis le dernier récap » : pas encore de récap (il vient de s'inscrire, ce
 * qui ouvre une session), ou l'écran des notifications ouvert depuis (notification_state.seen_at),
 * ou une session utilisée depuis (session.updated_at, que Better Auth met à jour au plus une fois
 * par jour). `ep` : la ligne email_preference du membre.
 *
 * « (select 1 … limit 1) is not null » plutôt que « exists (…) » : dans un « or », PostgreSQL
 * peut transformer un exists en une lecture de toute la table (pièges de code.md) ; cette forme
 * lit seulement les sessions du membre, par l'index session_userId_idx.
 */
const visitedSince = (ep: string) => sql`(
  ${sql.raw(ep)}.recap_sent_at is null
  or (select ns.seen_at from notification_state ns where ns.user_id = ${sql.raw(ep)}.user_id)
    > ${sql.raw(ep)}.recap_sent_at
  or (select 1 from session s
      where s.user_id = ${sql.raw(ep)}.user_id and s.updated_at > ${sql.raw(ep)}.recap_sent_at
      limit 1) is not null
)`

/** R8 : le choix de chaque type d'e-mail, comme il est rangé en base (`email_<type>`). */
const Choices = z.object({
  email_reactions: z.string(),
  email_comments: z.string(),
  email_replies: z.string(),
  email_follows: z.string(),
  email_updates: z.string(),
  email_testers: z.string(),
})
type Choices = z.infer<typeof Choices>
const choiceOf = (choices: Choices, type: EmailType) => choices[`email_${type}`] as EmailChoice

/** Les six choix lus dans la ligne `ep`, « Dans le récap » quand le membre n'a pas de ligne. */
const choiceColumns = sql`
  coalesce(ep.email_reactions, 'digest') as email_reactions,
  coalesce(ep.email_comments, 'digest') as email_comments,
  coalesce(ep.email_replies, 'digest') as email_replies,
  coalesce(ep.email_follows, 'digest') as email_follows,
  coalesce(ep.email_updates, 'digest') as email_updates,
  coalesce(ep.email_testers, 'digest') as email_testers`

const Candidate = Choices.extend({
  id: z.string(),
  recap_sent_at: isoDate,
  recap_v2_at: isoDate,
  instant_sent_at: isoDate,
  seen_at: isoDate,
})
type Candidate = z.infer<typeof Candidate>

/**
 * Un lot de membres qui peuvent recevoir le récap, après `after` dans l'ordre des identifiants (une
 * pagination par « clé » : le lot suivant repart du dernier identifiant lu, jamais d'un rang).
 *
 *   select u.id, ep.recap_sent_at, ep.recap_v2_at, ep.instant_sent_at, ns.seen_at, <les six choix>
 *   from "user" u
 *   left join email_preference ep on ep.user_id = u.id
 *   left join notification_state ns on ns.user_id = u.id
 *   where u.email_verified and u.id > $after
 *     and coalesce(ep.weekly_recap, true) and (ep.recap_sent_at is null or ep.recap_sent_at <= $6j)
 *     and (coalesce(ep.recap_unvisited, 0) < 3 or <venu depuis>)
 *   order by u.id limit 100
 *
 * La clé primaire de "user" donne l'ordre et la reprise ; les deux jointures passent par la clé
 * primaire de email_preference et de notification_state (user_id). Une ligne absente de
 * email_preference : les valeurs par défaut (récap activé, jamais envoyé, tout « Dans le récap »).
 */
const candidates = async (db: Database, now: Date, after: string): Promise<Candidate[]> => {
  const query = sql`
    select u.id,
      to_char(ep.recap_sent_at, ${ISO}) as recap_sent_at,
      to_char(ep.recap_v2_at, ${ISO}) as recap_v2_at,
      to_char(ep.instant_sent_at, ${ISO}) as instant_sent_at,
      to_char(ns.seen_at, ${ISO}) as seen_at,
      ${choiceColumns}
    from "user" u
    left join email_preference ep on ep.user_id = u.id
    left join notification_state ns on ns.user_id = u.id
    where u.email_verified and u.id > ${after}
      and coalesce(ep.weekly_recap, true)
      and (ep.recap_sent_at is null
        or ep.recap_sent_at <= ${utc(new Date(now.getTime() - RECAP_MIN_INTERVAL_MS))})
      and (ep.user_id is null or ep.recap_unvisited < ${RECAP_UNVISITED_MAX} or ${visitedSince('ep')})
    order by u.id
    limit ${BATCH_SIZE}
  `
  return z.object({ rows: z.array(Candidate) }).parse(await db.execute(query)).rows
}

type Loaded = Awaited<ReturnType<typeof loadNotificationsSince>>[number]['notification']

/** Une notification de l'Activité qui peut entrer au récap, avec son type d'e-mail et sa date. */
type Entry = { type: EmailType; at: number; notification: Loaded }

/**
 * Le type d'e-mail d'une notification (R8, les six lignes des réglages), ou null pour ce qui ne va
 * jamais au récap : un commentaire masqué, le pseudo reçu, la modération (un retrait, d'un appel ou
 * d'un message compris), le catalogue. Ceux-là restent dans l'appli.
 */
const typeOf = (notification: Loaded): EmailType | null => {
  switch (notification.kind) {
    case 'comment':
      // Un commentaire sur son projet ; une réponse ou une mention, partout.
      return notification.reason === 'comment' ? 'comments' : 'replies'
    case 'reactions':
      return 'reactions'
    // Les nouveaux abonnés, à son compte et à ses projets (précision du 21/10).
    case 'member_follows':
    case 'project_follows':
      return 'follows'
    case 'project_update':
      return 'updates'
    case 'tester_call':
    case 'tester_message':
    case 'feedback_settled':
      return 'testers'
    default:
      return null
  }
}

/**
 * Ce qui reste d'une nouveauté selon les choix du membre (R8) : « Jamais », jamais ; « Dans le
 * récap », toujours ; « Tout de suite », seulement si l'e-mail « tout de suite » ne l'a pas déjà
 * envoyée (sa date n'est pas après celle du dernier envoi). Une nouveauté réglée « Tout de suite »
 * mais pas encore partie (elle attend ses 15 minutes) reste : l'e-mail « tout de suite » ne
 * reprend rien d'avant le dernier récap.
 */
const kept = (entry: Entry, choices: Choices, instantSentAt: Date | null) => {
  const choice = choiceOf(choices, entry.type)
  if (choice === 'never') return false
  if (choice === 'now') return instantSentAt === null || entry.at > instantSentAt.getTime()
  return true
}

/** Un projet du membre dans « Tes projets », avant ses images. */
type OwnProject = {
  id: string
  title: string
  reactions: number
  comments: number
  follows: number
}

/**
 * Le contenu tiré de l'Activité, une fois les nouveautés triées. Le texte d'un appel, d'un
 * message, d'un commentaire ou d'une mise à jour n'en sort jamais : des titres, des noms et des
 * nombres seulement (relectures juridiques R5, P4, J12).
 */
const assemble = (appUrl: string, entries: Entry[]) => {
  // Une Map garde l'ordre d'arrivée : les notifications viennent de la plus récente à la plus
  // ancienne, le projet le plus récemment actif est donc le premier de chaque partie.
  const own = new Map<string, OwnProject>()
  const ownProject = (id: string, title: string) => {
    let project = own.get(id)
    if (project === undefined) {
      project = { id, title, reactions: 0, comments: 0, follows: 0 }
      own.set(id, project)
    }
    return project
  }
  const lines: RecapLine[] = []
  let follows = 0
  const updated = new Map<string, { title: string; count: number }>()
  const cornered = new Map<string, { title: string; count: number }>()
  const bump = (map: typeof updated, id: string, title: string) => {
    const project = map.get(id)
    if (project) project.count++
    else map.set(id, { title, count: 1 })
  }
  for (const { notification: n } of entries) {
    switch (n.kind) {
      case 'comment':
        // R8 : un commentaire sur son projet devient la pastille « N commentaires », sans nom ; une
        // réponse ou une mention reste une ligne qui dit qui a écrit, sur quel projet.
        if (n.reason === 'comment') ownProject(n.project.id, n.project.title).comments++
        else {
          lines.push({
            kind: n.reason,
            name: n.author.name,
            handle: n.author.handle,
            title: n.project.title,
          })
        }
        break
      case 'reactions':
        ownProject(n.project.id, n.project.title).reactions += n.total
        break
      case 'project_follows':
        ownProject(n.project.id, n.project.title).follows += n.count
        break
      case 'member_follows':
        follows += n.count
        break
      // R7a : une mise à jour d'un projet suivi ou testé compte pour son projet. La notification a
      // déjà passé toutes les règles de la source (visibilité relue maintenant, blocage, retrait,
      // date de l'abonnement) : les 5 projets et « Et N autres » se comptent après ce filtre (A9).
      case 'project_update':
        bump(updated, n.project.id, n.project.title)
        break
      // R7b : un appel, un message de l'autre personne d'un fil, un retour réglé comptent pour le
      // coin de leur projet, de même.
      case 'tester_call':
      case 'tester_message':
      case 'feedback_settled':
        bump(cornered, n.project.id, n.project.title)
        break
      default:
        break
    }
  }
  // Les liens : l'adresse de l'appli et l'identifiant du projet (un uuid), jamais un champ écrit
  // par un membre.
  const urlOf = (projectId: string, page: string) =>
    new URL(`/projects/${projectId}${page}`, appUrl).toString()
  const byProject = (map: typeof updated, page: string) =>
    [...map].map(([projectId, { title, count }]) => ({ title, count, url: urlOf(projectId, page) }))
  return {
    projects: [...own.values()],
    lines,
    follows,
    updates: byProject(updated, '/updates'),
    testers: byProject(cornered, '/testers'),
  }
}
type Assembled = ReturnType<typeof assemble>

const isEmpty = (content: Assembled) =>
  content.projects.length === 0 &&
  content.lines.length === 0 &&
  content.follows === 0 &&
  content.updates.length === 0 &&
  content.testers.length === 0

const FriendRow = z.object({
  id: z.string(),
  title: z.string(),
  author_name: z.string(),
})
type FriendRow = z.infer<typeof FriendRow>

/**
 * R8 : les projets des membres que `me` suit, publiés dans la fenêtre (après `since`, au plus
 * `now`), visibles pour lui (publics, pas retirés, pas d'un membre bloqué dans un sens ou l'autre,
 * auteur vérifié : listedVerifiedProjectFor) et dont l'auteur n'est pas suspendu ; le plus récent
 * d'abord. `wanted` : seulement un projet « Testable » dont `me` n'est ni testeur, ni retiré par
 * l'auteur (project_tester_removal), le plus récent (relectures du plan sec-B1, jur-4).
 *
 *   select project.id, project.title, author.name
 *   from member_follow f
 *   join project on project.author_id = f.member_id
 *   join "user" author on author.id = project.author_id
 *   where f.follower_id = $me and project.published_at > $since and project.published_at <= $now
 *     and <listedVerifiedProjectFor> and not <auteur suspendu>
 *     [and project.status = 'testable' and not <testeur> and not <retiré>]
 *   order by project.published_at desc, project.id desc limit 3 (ou 1)
 *
 * Index : la clé primaire de member_follow (follower_id, member_id) donne les membres suivis ;
 * project_author_published_idx (author_id, published_at) leurs projets de la fenêtre ; les
 * vérifications passent par des clés primaires (project_tester (member_id, project_id),
 * project_tester_removal (project_id, member_id), "user") et account_suspension_user_idx.
 * La date de publication tient lieu de date du passage à « Testable » : aucune colonne ne la garde
 * (« à défaut : publié », plan R8).
 */
const friendProjects = async (
  db: Database,
  me: string,
  since: Date,
  now: Date,
  wanted: boolean,
) => {
  const testable: SQL = wanted
    ? sql`and project.status = 'testable'
      and not exists (select 1 from project_tester pt
        where pt.member_id = ${me} and pt.project_id = project.id)
      and not exists (select 1 from project_tester_removal ptr
        where ptr.project_id = project.id and ptr.member_id = ${me})`
    : sql``
  const query = sql`
    select project.id, project.title, author.name as author_name
    from member_follow f
    join project on project.author_id = f.member_id
    join "user" author on author.id = project.author_id
    where f.follower_id = ${me}
      and project.published_at > ${utc(since)} and project.published_at <= ${utc(now)}
      and ${listedVerifiedProjectFor(me)}
      and not exists (select 1 from account_suspension s
        where s.user_id = project.author_id and ${activeSuspensionSql('s', now)})
      ${testable}
    order by project.published_at desc, project.id desc
    limit ${wanted ? 1 : RECAP_FRIEND_PROJECTS_MAX}
  `
  return z.object({ rows: z.array(FriendRow) }).parse(await db.execute(query)).rows
}

const ImageRow = z.object({
  id: z.string(),
  primary_category: z.string().nullable(),
  cover_key: z.string().nullable(),
  reported: z.boolean(),
})

/**
 * Ce qu'il faut pour la vignette de chaque projet montré avec une image, en une requête : sa
 * catégorie (la tuile), la clé de sa photo, et s'il a un signalement ouvert.
 *
 * La photo est celle de l'Activité (notifications/load.ts, « cover ») : la première de la galerie
 * dans l'ordre de l'auteur, sinon la couverture verticale ; l'index project_media_project_idx
 * (project_id, slot, position) la trouve. Le signalement : content_report_target_idx
 * (target_kind, target_id) ; `target_id` est un texte, d'où `project.id::text` (la conversion est
 * du côté du projet, l'index de la colonne reste utilisable). Le projet lui-même : sa clé primaire.
 */
const imageRows = async (db: Database, ids: string[]) => {
  if (ids.length === 0) return new Map<string, z.infer<typeof ImageRow>>()
  const query = sql`
    select project.id, project.primary_category,
      (select m.storage_key from project_media m
        where m.project_id = project.id and m.slot in ('gallery', 'portrait')
        order by m.slot = 'portrait', m.position, m.created_at
        limit 1) as cover_key,
      (select 1 from content_report r
        where r.target_kind = 'project' and r.target_id = project.id::text and r.status = 'open'
        limit 1) is not null as reported
    from project
    where project.id in (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})
  `
  const rows = z.object({ rows: z.array(ImageRow) }).parse(await db.execute(query)).rows
  return new Map(rows.map((row) => [row.id, row]))
}

const Taken = Choices.extend({
  email: z.string(),
  name: z.string(),
  language: z.string(),
  recap_unvisited: z.number().int(),
  // La date du dernier e-mail « tout de suite », relue au moment de la prise (voir recapOne).
  instant_sent_at: isoDate,
})

/**
 * La prise atomique de l'envoi (relecture de sécurité S-B2) : une seule requête, qui note la date
 * d'envoi et rend l'adresse et les choix, ou ne rend rien.
 *
 * « insert … select … from "user" where id = $1 and email_verified » : la ligne à écrire n'existe
 * que si le compte existe encore et est vérifié (sinon rien, ni ligne recréée, ni erreur de clé
 * étrangère). Si le membre a déjà sa ligne (« on conflict »), elle n'est mise à jour que si les
 * conditions tiennent à cet instant (« do update … where ») : récap activé, le précédent il y a plus
 * de 6 jours, et moins de 3 sans visite ou une visite depuis. Deux exécutions en même temps : la
 * seconde trouve la date déjà notée par la première, et ne prend rien. « with taken as (…) » (une
 * requête nommée, dans la même instruction) permet de joindre "user" pour rendre l'adresse.
 * R8 : `recap_v2_at` reçoit la date du premier récap habillé, une seule fois (coalesce).
 */
const take = async (db: Database, userId: string, now: Date) => {
  const query: SQL = sql`
    with taken as (
      insert into email_preference (user_id, weekly_recap, mention_emails, recap_sent_at,
        recap_unvisited, recap_v2_at)
      select u.id, true, false, ${utc(now)}, 0, ${utc(now)} from "user" u
      where u.id = ${userId} and u.email_verified
      on conflict (user_id) do update set
        recap_sent_at = excluded.recap_sent_at,
        recap_v2_at = coalesce(email_preference.recap_v2_at, excluded.recap_v2_at),
        recap_unvisited = case when ${visitedSince('email_preference')} then 0
          else email_preference.recap_unvisited + 1 end
      where email_preference.weekly_recap
        and (email_preference.recap_sent_at is null
          or email_preference.recap_sent_at <= ${utc(new Date(now.getTime() - RECAP_MIN_INTERVAL_MS))})
        and (email_preference.recap_unvisited < ${RECAP_UNVISITED_MAX}
          or ${visitedSince('email_preference')})
      returning user_id, recap_unvisited, instant_sent_at, email_reactions, email_comments,
        email_replies, email_follows, email_updates, email_testers
    )
    select u.email, u.name, u.language, taken.recap_unvisited,
      to_char(taken.instant_sent_at, ${ISO}) as instant_sent_at,
      taken.email_reactions, taken.email_comments, taken.email_replies, taken.email_follows,
      taken.email_updates, taken.email_testers
    from taken join "user" u on u.id = taken.user_id
  `
  const [row] = z.object({ rows: z.array(Taken) }).parse(await db.execute(query)).rows
  return row ?? null
}

/**
 * Les vignettes du récap (R8, décision A5), 4 au plus (RECAP_IMAGES_MAX) : les deux premiers de
 * « Tes projets », le premier proche, le projet à tester. La photo du projet réduite, sinon (pas de
 * photo, photo illisible, pas de stockage) la tuile de sa catégorie ; la tuile toujours pour le
 * projet d'un autre membre qui a un signalement ouvert (jur-5) : sa photo ne part pas chez
 * l'envoyeur d'e-mails tant que la modération n'a pas décidé. Chaque image reçoit un nom fabriqué et
 * unique (thumb-1, projet-1.jpg), jamais tiré d'un texte de membre ni de la clé du stockage.
 */
const imagesFor = async (
  deps: JobDeps,
  wanted: { id: string; own: boolean }[],
): Promise<(Attachment | null)[]> => {
  const rows = await imageRows(
    deps.db,
    wanted.map((project) => project.id),
  )
  const images: (Attachment | null)[] = []
  for (const project of wanted) {
    const row = rows.get(project.id)
    if (row === undefined || images.filter((image) => image !== null).length >= RECAP_IMAGES_MAX) {
      images.push(null)
      continue
    }
    const photo =
      row.cover_key !== null && deps.storage !== undefined && (project.own || !row.reported)
        ? await recapThumb(deps.storage, row.cover_key)
        : null
    const image = photo ?? categoryTile(row.primary_category)
    const n = images.filter((done) => done !== null).length + 1
    const extension = image.contentType === 'image/png' ? 'png' : 'jpg'
    images.push({ ...image, cid: `thumb-${n}`, filename: `projet-${n}.${extension}` })
  }
  return images
}

/** Le récap d'un membre : true s'il est parti. */
const recapOne = async (deps: JobDeps, member: Candidate, now: Date) => {
  // Rien d'après `now`, la date notée comme celle du récap (voir loadNotificationsSince).
  const since = latest(
    member.seen_at,
    member.recap_sent_at,
    new Date(now.getTime() - RECAP_WINDOW_MS),
  )
  const entries = (await loadNotificationsSince(deps.db, member.id, since, now, deps.apiUrl))
    .map(({ notification }) => {
      const type = typeOf(notification)
      return type === null ? null : { type, at: Date.parse(notification.at), notification }
    })
    .filter((entry): entry is Entry => entry !== null)
  // R8 : les projets des proches ne sont pas des notifications de l'Activité : leur fenêtre part du
  // dernier récap (ou d'il y a 7 jours), pas de la dernière visite d'Activité.
  const friendsSince = latest(member.recap_sent_at, new Date(now.getTime() - RECAP_WINDOW_MS))
  const friends = await friendProjects(deps.db, member.id, friendsSince, now, false)
  const [wanted] = await friendProjects(deps.db, member.id, friendsSince, now, true)
  // Un premier tri avec les choix lus au début du lot : il évite de prendre l'envoi pour rien. Le
  // tri qui compte se refait après la prise, avec les choix et la date relus à cet instant.
  const early = assemble(
    deps.appUrl,
    entries.filter((entry) => kept(entry, member, member.instant_sent_at)),
  )
  if (isEmpty(early) && friends.length === 0 && wanted === undefined) return false
  let taken: z.infer<typeof Taken> | null
  try {
    taken = await take(deps.db, member.id, now)
  } catch (error) {
    if (isDeletedMember(error)) return false
    throw error
  }
  if (!taken) return false
  // L'e-mail « tout de suite » peut tourner en même temps (relecture de sécurité A7 de 6c). S'il a
  // envoyé une nouveauté à ce membre après la lecture du lot, la date relue dans la prise le
  // montre : on la retire ici. Sa prise fait de même avec la date du récap (instant-emails.ts) :
  // celle des deux qui passe en second voit toujours la date de la première, car les deux écrivent
  // la même ligne, l'une après l'autre (verrou de la ligne). Un type passé à « Jamais » entre-temps
  // sort aussi.
  const content = assemble(
    deps.appUrl,
    entries.filter((entry) => kept(entry, taken, taken.instant_sent_at)),
  )
  // Tout était déjà parti : rien n'est envoyé. La date du récap reste notée (cas rare, une course
  // entre les deux tâches) ; le récap suivant repart de là, sans rien perdre de nouveau.
  if (isEmpty(content) && friends.length === 0 && wanted === undefined) return false

  const projects = content.projects
  const urlOf = (projectId: string) => new URL(`/projects/${projectId}`, deps.appUrl).toString()
  const withImage = [
    ...projects.slice(0, OWN_IMAGES).map(({ id }) => ({ id, own: true })),
    ...friends.slice(0, 1).map(({ id }) => ({ id, own: false })),
    ...(wanted ? [{ id: wanted.id, own: false }] : []),
  ]
  const images = await imagesFor(deps, withImage)
  const imageAt = (index: number) => images[index] ?? null
  const friendImageAt = Math.min(projects.length, OWN_IMAGES)
  const friendOf = (row: FriendRow, image: Attachment | null) => ({
    title: row.title,
    author: row.author_name,
    // « Voir le projet » et « Tester la démo » mènent à la page du projet dans l'appli, jamais à
    // la démo ni à la page de sortie (relecture du plan sec-A4).
    url: urlOf(row.id),
    image,
  })
  const data: RecapData = {
    name: taken.name,
    projects: projects.map((project, index) => ({
      title: project.title,
      reactions: project.reactions,
      comments: project.comments,
      follows: project.follows,
      url: urlOf(project.id),
      image: index < OWN_IMAGES ? imageAt(index) : null,
    })),
    lines: content.lines.slice(0, RECAP_MAX_LINES),
    more: Math.max(0, content.lines.length - RECAP_MAX_LINES),
    follows: content.follows,
    first: member.recap_sent_at === null,
    // La note unique : il recevait le récap avant R8, et n'a pas encore reçu le récap habillé.
    news: member.recap_sent_at !== null && member.recap_v2_at === null,
    last: taken.recap_unvisited >= RECAP_UNVISITED_MAX,
    friends: friends.map((row, index) =>
      friendOf(row, index === 0 ? imageAt(friendImageAt) : null),
    ),
    testersWanted: wanted
      ? friendOf(wanted, imageAt(friendImageAt + (friends.length > 0 ? 1 : 0)))
      : null,
    // 5 projets au plus, comme les lignes (RECAP_MAX_LINES), puis « Et N autres projets ».
    updates: content.updates.slice(0, RECAP_MAX_LINES),
    updatesMore: Math.max(0, content.updates.length - RECAP_MAX_LINES),
    testers: content.testers.slice(0, RECAP_MAX_LINES),
    testersMore: Math.max(0, content.testers.length - RECAP_MAX_LINES),
    links: linksFor(deps, member.id, 'recap'),
  }
  const language = languageOfMember(taken)
  const email = { to: taken.email, ...recapEmail(language, data) }
  try {
    await deps.mailer.send(email)
  } catch (error) {
    // Un transport qui ne sait pas joindre d'images refuse l'e-mail entier (mailer.ts) : le récap
    // repart une fois sans vignettes, plutôt que pas du tout. Sans image, l'erreur est une vraie
    // panne : elle remonte (le membre compte comme un échec).
    if ((email.attachments ?? []).length === 0) throw error
    console.warn('Weekly recap: attachments refused, sent again without images')
    const plain: RecapData = {
      ...data,
      projects: data.projects.map((project) => ({ ...project, image: null })),
      friends: data.friends.map((friend) => ({ ...friend, image: null })),
      testersWanted: data.testersWanted && { ...data.testersWanted, image: null },
    }
    await deps.mailer.send({ to: taken.email, ...recapEmail(language, plain) })
  }
  return true
}

/**
 * Envoie le récap de la semaine à tous ceux qui ont du nouveau, à l'heure `now`. Rend le nombre
 * d'e-mails partis et d'échecs (rien de personnel : pg-boss garde ce résultat dans sa table).
 */
export const weeklyRecap = async (deps: JobDeps, now: Date) => {
  let sent = 0
  let failed = 0
  let after = ''
  for (;;) {
    const batch = await candidates(deps.db, now, after)
    for (const member of batch) {
      try {
        if (await recapOne(deps, member, now)) sent++
      } catch (error) {
        // Un membre qui échoue (rendu, envoi) n'arrête pas les autres.
        failed++
        logMemberFailure('weekly-recap', error)
      }
    }
    const last = batch.at(-1)
    if (batch.length < BATCH_SIZE || !last) break
    after = last.id
  }
  if (sent > 0 || failed > 0) console.log(`Weekly recap: ${sent} sent, ${failed} failed`)
  return { sent, failed }
}
