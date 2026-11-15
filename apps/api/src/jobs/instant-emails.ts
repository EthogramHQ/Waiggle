// L'e-mail « tout de suite » (R8), que l'ordonnanceur lance toutes les 5 minutes ; il remplace
// l'e-mail de mentions de 6c (mention-emails.ts). Scénario : docs/scenarios/refonte.md, « Les
// e-mails tout de suite ». Rien ne part sans l'avoir demandé : chaque type est « Dans le récap » par
// défaut ; seuls les commentaires sur ses projets, les réponses et mentions, et le coin des
// testeurs peuvent être réglés sur « Tout de suite ». R10 : les invitations dans une ruche
// (« Ruches »), seul type « Tout de suite » par défaut, entrent dans le même e-mail (ligne
// `hive_invited`, sans le nom de la ruche).
//
// Pour chacun (compte vérifié, au moins un type sur « Tout de suite », le précédent e-mail il y a
// plus d'une heure) :
// 1. ses notifications de ces types, comme l'écran Activité (droits, blocages, masquage, projet
//    privé), arrivées après le plus récent de sa dernière visite d'Activité, du dernier e-mail
//    « tout de suite », du dernier récap et d'il y a 24 heures (un même événement ne part jamais
//    deux fois par e-mail, et jamais une nouveauté ancienne après une sauvegarde restaurée) ;
// 2. rien, ou rien qui attend depuis 15 minutes : pas d'e-mail (il partira à un prochain passage,
//    avec tout ce qui est arrivé entre-temps) ;
// 3. sinon, « prendre » l'envoi (une seule requête note la date et rend l'adresse et les types,
//    si les conditions tiennent encore), retirer ce qu'un récap parti entre-temps contenait déjà et
//    les types qui ont quitté « Tout de suite », puis envoyer, dans la langue du membre.
import {
  INSTANT_EMAIL_DELAY_MINUTES,
  INSTANT_EMAIL_MIN_INTERVAL_MINUTES,
  type InstantEmailType,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Language } from '@ruche/i18n'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { type InstantLine, instantEmail } from '../email/instant'
import { languageOfMember } from '../email/language'
import { defangLinks, linkPlaceholder } from '../email/links'
import { excerptOf, loadNotificationsSince, utc } from '../notifications/load'
import {
  BATCH_SIZE,
  isDeletedMember,
  isoDate,
  type JobDeps,
  latest,
  linksFor,
  logMemberFailure,
} from './shared'

const MINUTE = 60 * 1000
/** Jamais une nouveauté vieille de plus de 24 heures dans un e-mail. */
const WINDOW_MS = 24 * 60 * MINUTE
const ISO = 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'

/** Les quatre types « Tout de suite » possibles (R10 : « Ruches »), dans l'ordre de l'écran des réglages. */
const TYPES = [
  'comments',
  'replies',
  'testers',
  'hives',
] as const satisfies readonly InstantEmailType[]

/** Les colonnes des quatre choix, lues avec le membre : quels types partent tout de suite. */
const Choices = z.object({
  email_comments: z.string(),
  email_replies: z.string(),
  email_testers: z.string(),
  email_hives: z.string(),
})
const instantTypes = (row: z.infer<typeof Choices>) =>
  new Set<InstantEmailType>(TYPES.filter((type) => row[`email_${type}`] === 'now'))

const Candidate = Choices.extend({
  id: z.string(),
  instant_sent_at: isoDate,
  recap_sent_at: isoDate,
  seen_at: isoDate,
})
type Candidate = z.infer<typeof Candidate>

/** « Le précédent e-mail il y a plus d'une heure » : la date limite, pour `now`. */
const intervalCutoff = (now: Date) =>
  utc(new Date(now.getTime() - INSTANT_EMAIL_MIN_INTERVAL_MINUTES * MINUTE))

/**
 * « Au moins un type sur « Tout de suite » », écrit exactement comme la condition de l'index
 * partiel email_preference_instant_idx : PostgreSQL ne se sert d'un index partiel que s'il peut
 * prouver que la condition de la requête l'implique, et la même expression le prouve à coup sûr.
 */
const anyInstant = sql`(ep.email_comments = 'now' or ep.email_replies = 'now' or ep.email_testers = 'now' or ep.email_hives = 'now')`

/** Les trois types d'avant R10, ceux qui suffisent seuls à faire entrer un membre dans le lot. */
const anyOtherInstant = sql`(ep.email_comments = 'now' or ep.email_replies = 'now' or ep.email_testers = 'now')`

/**
 * « Il a une invitation récente » (R10, plan « Ce qui change au plan », point 6) : ni refusée, et
 * datée des 24 dernières heures (aucune nouveauté plus ancienne ne part dans cet e-mail), jusqu'à
 * `now`. `invitee` : la colonne du membre, écrite ici (sql.raw, jamais une entrée du client).
 */
const recentInvitationOf = (invitee: string, now: Date) => sql`(select 1 from hive_invitation hi
    where hi.invitee_id = ${sql.raw(invitee)} and hi.refused_at is null
      and hi.created_at > ${utc(new Date(now.getTime() - WINDOW_MS))}
      and hi.created_at <= ${utc(now)}
    limit 1) is not null`

/**
 * Un lot de membres qui peuvent recevoir l'e-mail maintenant, après `after`. Deux sortes de membres
 * (R10), réunies par « union all » (les deux branches ne se recoupent pas : la seconde n'a que des
 * membres sans ligne de réglages) :
 *
 *   select … from (
 *     (select ep.user_id … from email_preference ep join "user" u …
 *      where (au moins un type à 'now') and u.email_verified and ep.user_id > $after
 *        and (ep.instant_sent_at is null or ep.instant_sent_at <= $il_y_a_une_heure)
 *        and (un type d'avant R10 à 'now' or une invitation récente)
 *      order by ep.user_id limit 100)
 *     union all
 *     (select distinct hi.invitee_id … from hive_invitation hi join "user" u …
 *      where (invitation récente) and u.email_verified and hi.invitee_id > $after
 *        and aucune ligne email_preference
 *      order by hi.invitee_id limit 100)
 *   ) c left join notification_state ns …
 *   order by c.id limit 100
 *
 * 1. Ceux qui ont une ligne de réglages : la tâche passe toutes les 5 minutes, l'index partiel
 *    email_preference_instant_idx (les seules lignes qui ont un type à « now », rangées par user_id)
 *    les donne dans l'ordre, sans lire les autres. Mais « Ruches » vaut « Tout de suite » par
 *    défaut : la plupart des lignes y entrent. Un membre dont le seul type « Tout de suite » est
 *    « Ruches » n'est donc pris que s'il a une invitation récente (index hive_invitation_invitee_idx,
 *    invitee_id puis created_at) : sinon il n'aurait rien à recevoir, et on ne lit rien pour lui.
 * 2. Ceux qui n'ont jamais touché à leurs réglages (pas de ligne : « Ruches » à « Tout de suite »)
 *    et qui ont une invitation récente. Sans index par date sur hive_invitation, la lecture parcourt
 *    la table, petite (20 invitations par jour et par membre au plus, effacées à 30 jours) : à
 *    surveiller, un index (created_at) le jour où elle grandit.
 * Chaque branche est triée et bornée à 100 elle-même, ses filtres compris : les 100 premiers des deux
 * listes réunies sont bien les 100 premiers de l'ensemble, et un lot de moins de 100 dit vraiment
 * qu'il n'y a plus personne après. "user" et notification_state par leur clé primaire.
 */
const candidates = async (db: Database, now: Date, after: string): Promise<Candidate[]> => {
  const query = sql`
    select c.id, c.email_comments, c.email_replies, c.email_testers, c.email_hives,
      to_char(c.instant_sent_at, ${ISO}) as instant_sent_at,
      to_char(c.recap_sent_at, ${ISO}) as recap_sent_at,
      to_char(ns.seen_at, ${ISO}) as seen_at
    from (
      (select ep.user_id as id, ep.email_comments, ep.email_replies, ep.email_testers,
        ep.email_hives, ep.instant_sent_at, ep.recap_sent_at
      from email_preference ep
      join "user" u on u.id = ep.user_id
      where ${anyInstant} and u.email_verified and ep.user_id > ${after}
        and (ep.instant_sent_at is null or ep.instant_sent_at <= ${intervalCutoff(now)})
        and (${anyOtherInstant} or ${recentInvitationOf('ep.user_id', now)})
      order by ep.user_id
      limit ${BATCH_SIZE})
      union all
      (select distinct hi.invitee_id, 'digest', 'digest', 'digest', 'now',
        null::timestamp, null::timestamp
      from hive_invitation hi
      join "user" u on u.id = hi.invitee_id
      where hi.refused_at is null
        and hi.created_at > ${utc(new Date(now.getTime() - WINDOW_MS))}
        and hi.created_at <= ${utc(now)}
        and u.email_verified and hi.invitee_id > ${after}
        and not exists (select 1 from email_preference ep where ep.user_id = hi.invitee_id)
      order by hi.invitee_id
      limit ${BATCH_SIZE})
    ) c
    left join notification_state ns on ns.user_id = c.id
    order by c.id
    limit ${BATCH_SIZE}
  `
  return z.object({ rows: z.array(Candidate) }).parse(await db.execute(query)).rows
}

const Taken = Choices.extend({
  email: z.string(),
  name: z.string(),
  language: z.string(),
  // La date du dernier récap, relue au moment de la prise (voir instantOne).
  recap_sent_at: isoDate,
})

/**
 * La prise atomique de l'envoi (relecture de sécurité S-B2 de 6c) : « update … from "user" …
 * returning » note la date d'envoi et rend l'adresse et les choix, en une seule requête, seulement
 * si à cet instant le compte existe, est vérifié, a encore un type à « now » et n'a rien reçu depuis
 * une heure. Une seconde exécution au même moment attend la fin de la première (verrou de la
 * ligne), relit la condition, et ne prend rien. Un compte supprimé n'a plus de ligne : rien n'est
 * recréé. `mention_sent_at` reçoit la même date (copie jusqu'à R9, sec-A1) : après un retour à la
 * version d'avant R8, l'ancienne tâche ne renvoie pas ce qui vient de partir.
 */
const take = async (db: Database, userId: string, now: Date) => {
  // R10 : un membre sans ligne de réglages (« Ruches » à « Tout de suite » par défaut) reçoit
  // l'e-mail d'une invitation ; la prise crée alors sa ligne, avec les valeurs par défaut (comme le
  // récap, weekly-recap.ts), et `updated_at` reste nul : ce n'est pas lui qui a choisi. D'où
  // « insert … select from "user" … on conflict do update … where » : la ligne naît seulement si le
  // compte existe et est vérifié ; si elle existe, la mise à jour ne se fait que si les conditions
  // tiennent encore (« as ep » nomme la ligne existante dans le `where`). Le `with` rend la ligne
  // prise, puis la requête principale lit l'adresse du compte.
  const query = sql`
    with taken as (
      insert into email_preference as ep (user_id, instant_sent_at, mention_sent_at)
      select u.id, ${utc(now)}, ${utc(now)} from "user" u
      where u.id = ${userId} and u.email_verified
      on conflict (user_id) do update set
        instant_sent_at = excluded.instant_sent_at, mention_sent_at = excluded.mention_sent_at
      where ${anyInstant}
        and (ep.instant_sent_at is null or ep.instant_sent_at <= ${intervalCutoff(now)})
      returning ep.user_id, ep.email_comments, ep.email_replies, ep.email_testers, ep.email_hives,
        ep.recap_sent_at
    )
    select u.email, u.name, u.language, taken.email_comments, taken.email_replies,
      taken.email_testers, taken.email_hives, to_char(taken.recap_sent_at, ${ISO}) as recap_sent_at
    from taken join "user" u on u.id = taken.user_id
  `
  const [row] = z.object({ rows: z.array(Taken) }).parse(await db.execute(query)).rows
  return row ?? null
}

type Loaded = Awaited<ReturnType<typeof loadNotificationsSince>>[number]

/** Une nouveauté de l'e-mail, avant sa mise en forme : son type, sa date et de quoi l'écrire. */
type Pending = {
  type: InstantEmailType
  at: number
  /** La ligne, à écrire dans la langue du membre (le désarmement de l'extrait en dépend). */
  line: (language: Language) => InstantLine
}

/**
 * Une notification de l'Activité en nouveauté de l'e-mail, ou null si elle n'en est pas une (les
 * réactions, abonnés, mises à jour, modération : jamais tout de suite). Les adresses sont celles de
 * l'appli, faites d'identifiants (comme l'écran Activité y mène) ; aucun texte de membre n'y entre.
 */
const pendingOf = (appUrl: string, { row, notification: n }: Loaded): Pending | null => {
  const at = Date.parse(n.at)
  const page = (path: string) => new URL(path, appUrl).toString()
  const project = (id: string) => `/projects/${encodeURIComponent(id)}`
  switch (n.kind) {
    case 'comment': {
      const type = n.reason === 'comment' ? 'comments' : 'replies'
      const url = `${page(project(n.project.id))}?${new URLSearchParams({ comment: n.comment.id })}`
      return {
        type,
        at,
        line: (language) => ({
          kind: n.reason,
          who: n.author.name,
          handle: n.author.handle,
          title: n.project.title,
          // Les adresses retirées du texte entier AVANT de le couper : une adresse coupée en deux
          // par l'extrait ne serait plus reconnue.
          excerpt: excerptOf(defangLinks(row.body ?? '', linkPlaceholder(language))),
          at: new Date(at),
          url,
        }),
      }
    }
    case 'tester_call':
    case 'tester_message':
    case 'feedback_settled': {
      // Le coin des testeurs : qui, et sur quel projet ; jamais le texte (le fil est privé).
      // Le pseudo vient de la même ligne que l'écran Activité ; sans pseudo, pas de ligne.
      const handle = row.author_handle
      if (handle === null) return null
      const who = n.kind === 'tester_message' ? n.from.name : n.author.name
      const corner = page(`${project(n.project.id)}/testers`)
      const tab = (name: 'calls' | 'feedback') => `${corner}?${new URLSearchParams({ tab: name })}`
      const [kind, url]: [InstantLine['kind'], string] =
        n.kind === 'tester_call'
          ? ['tester_call', tab('calls')]
          : n.kind === 'feedback_settled'
            ? ['feedback_settled', tab('feedback')]
            : // Un message du testeur, pour l'auteur : son fil ; de l'auteur, pour le testeur : ses
              // retours (comme l'écran Activité, notifications/present.ts de l'appli).
              n.role === 'author'
              ? ['tester_reply_to_tester', tab('feedback')]
              : [
                  n.message.kind === 'feedback' ? 'tester_feedback' : 'tester_reply_to_author',
                  `${corner}/threads/${encodeURIComponent(n.message.testerId)}`,
                ]
      return {
        type: 'testers',
        at,
        line: () => ({
          kind,
          who,
          handle,
          title: n.project.title,
          excerpt: null,
          at: new Date(at),
          url,
        }),
      }
    }
    case 'hive_invited': {
      // R10 : une invitation dans une ruche. Le nom et le pseudo de l'inviteur (le pseudo de la même
      // ligne que l'écran Activité) ; jamais le nom de la ruche, écrit par un membre (choix 7 du
      // scénario), ni un lien vers l'inviteur ou la ruche : seulement l'onglet Ruches, où l'invité
      // lit le nom avant d'accepter. Sans inviteur (compte supprimé) ou sans pseudo : pas de ligne.
      const handle = row.author_handle
      if (n.inviter === null || handle === null) return null
      const who = n.inviter.name
      return {
        type: 'hives',
        at,
        line: () => ({
          kind: 'hive_invited',
          who,
          handle,
          title: '',
          excerpt: null,
          at: new Date(at),
          url: page('/hives'),
        }),
      }
    }
    default:
      return null
  }
}

/** L'e-mail « tout de suite » d'un membre : true s'il est parti. */
const instantOne = async (deps: JobDeps, member: Candidate, now: Date) => {
  // R10 : le dernier récap ne borne pas la lecture elle-même, mais seulement les types qu'il
  // contenait : une invitation n'y entre que si « Ruches » vaut « Dans le récap » ; à « Tout de
  // suite », celle arrivée juste avant le récap partirait sinon nulle part.
  const recapSentAt = member.recap_sent_at?.getTime() ?? Number.NEGATIVE_INFINITY
  const since = latest(member.seen_at, member.instant_sent_at, new Date(now.getTime() - WINDOW_MS))
  const wanted = instantTypes(member)
  // Rien d'après `now`, la date qui sera notée comme celle de l'envoi : ce qui arrive pendant le
  // passage partira au suivant, une seule fois.
  const pending = (await loadNotificationsSince(deps.db, member.id, since, now, deps.apiUrl))
    .map((item) => pendingOf(deps.appUrl, item))
    .filter(
      (item): item is Pending =>
        item !== null && wanted.has(item.type) && (item.type === 'hives' || item.at > recapSentAt),
    )
  // Rien n'attend depuis 15 minutes : on laisse le temps aux suivantes d'arriver.
  const oldest = Math.min(...pending.map((item) => item.at))
  if (pending.length === 0 || oldest > now.getTime() - INSTANT_EMAIL_DELAY_MINUTES * MINUTE) {
    return false
  }
  let taken: z.infer<typeof Taken> | null
  try {
    taken = await take(deps.db, member.id, now)
  } catch (error) {
    // R10 : la prise peut créer la ligne ; un compte supprimé au même instant la refuse (clé
    // étrangère) : rien à envoyer, comme le récap.
    if (isDeletedMember(error)) return false
    throw error
  }
  if (!taken) return false
  // Les choix relus à la prise : un type passé « Dans le récap » depuis la lecture du lot ne part
  // pas. Et le récap peut tourner en même temps (relecture de sécurité A7 de 6c) : s'il est parti
  // pour ce membre après la lecture du lot, il contenait déjà ces nouveautés ; la date relue dans la
  // prise le montre, et on les retire. Le récap fait de même avec la date de cet e-mail.
  const stillWanted = instantTypes(taken)
  const recapAt = taken.recap_sent_at?.getTime() ?? Number.NEGATIVE_INFINITY
  const fresh = pending.filter(
    (item) => stillWanted.has(item.type) && (item.type === 'hives' || item.at > recapAt),
  )
  // Plus rien à envoyer : rien ne part (la date reste notée, cas rare d'une course).
  if (fresh.length === 0) return false
  const language = languageOfMember(taken)
  // Les plus anciennes d'abord : l'e-mail se lit comme la conversation.
  const ordered = fresh.reverse()
  const present = new Set(ordered.map((item) => item.type))
  await deps.mailer.send({
    to: taken.email,
    ...instantEmail(
      {
        name: taken.name,
        lines: ordered.map((item) => item.line(language)),
        types: TYPES.filter((type) => present.has(type)),
        links: linksFor(deps, member.id, 'instant'),
      },
      language,
      deps.appUrl,
    ),
  })
  return true
}

/** Envoie les e-mails « tout de suite » en attente, à l'heure `now`. Rend les nombres envoyés et échoués. */
export const instantEmails = async (deps: JobDeps, now: Date) => {
  let sent = 0
  let failed = 0
  let after = ''
  for (;;) {
    const batch = await candidates(deps.db, now, after)
    for (const member of batch) {
      try {
        if (await instantOne(deps, member, now)) sent++
      } catch (error) {
        // Un membre qui échoue (rendu, envoi) n'arrête pas les autres.
        failed++
        logMemberFailure('instant-emails', error)
      }
    }
    const last = batch.at(-1)
    if (batch.length < BATCH_SIZE || !last) break
    after = last.id
  }
  if (sent > 0 || failed > 0) console.log(`Instant e-mails: ${sent} sent, ${failed} failed`)
  return { sent, failed }
}
