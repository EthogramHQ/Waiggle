// Le récap de la semaine (tranche 6c), que l'ordonnanceur lance le lundi à 9 h, heure de Paris.
// Scénario : docs/scenarios/phase-1.md, « Précisions (tranche 6c) », « Le récap ».
//
// Pour chaque membre qui peut le recevoir (compte vérifié, récap activé, le précédent il y a plus
// de 6 jours, moins de 3 récaps de suite sans visite, ou une visite depuis) :
// 1. calculer ce qui est nouveau pour lui, comme l'écran des notifications (droits, masquage,
//    projet privé) : ses commentaires, réponses et mentions non vus, ses réactions et ses nouveaux
//    abonnés, depuis le plus récent de sa dernière visite de l'écran, du dernier récap et d'il y a
//    7 jours ; sans ce qui est déjà parti dans un e-mail de mentions ;
// 2. rien de nouveau : aucun e-mail ;
// 3. sinon, « prendre » l'envoi : une seule requête note la date d'envoi, si et seulement si les
//    conditions tiennent encore à cet instant, et rend l'adresse. Aucune ligne rendue (désinscrit
//    ou compte supprimé entre-temps, autre exécution passée avant) : rien ne part. La date est
//    notée AVANT l'envoi : un envoi qui échoue est perdu plutôt que doublé ;
// 4. retirer ce qu'un e-mail de mentions parti entre-temps contenait déjà (la prise relit sa date),
//    puis envoyer, dans la langue du membre.
import { RECAP_MAX_LINES, RECAP_UNVISITED_MAX } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { languageOfMember } from '../email/language'
import { type RecapLine, recapEmail } from '../email/templates'
import { loadNotificationsSince, utc } from '../notifications/load'
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

const Candidate = z.object({
  id: z.string(),
  recap_sent_at: isoDate,
  mention_sent_at: isoDate,
  seen_at: isoDate,
})
type Candidate = z.infer<typeof Candidate>

/**
 * Un lot de membres qui peuvent recevoir le récap, après `after` dans l'ordre des identifiants (une
 * pagination par « clé » : le lot suivant repart du dernier identifiant lu, jamais d'un rang).
 *
 *   select u.id, ep.recap_sent_at, ep.mention_sent_at, ns.seen_at
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
 * email_preference : les valeurs par défaut (récap activé, jamais envoyé).
 */
const candidates = async (db: Database, now: Date, after: string): Promise<Candidate[]> => {
  const query = sql`
    select u.id,
      to_char(ep.recap_sent_at, ${ISO}) as recap_sent_at,
      to_char(ep.mention_sent_at, ${ISO}) as mention_sent_at,
      to_char(ns.seen_at, ${ISO}) as seen_at
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

/** Une ligne du récap, avec ce qu'il faut pour l'écarter si l'e-mail de mentions l'a déjà envoyée. */
type DatedLine = RecapLine & { at: number }

/**
 * Une mention ou une réponse déjà partie dans un e-mail de mentions (sa date n'est pas après celle
 * du dernier e-mail de mentions) : elle ne revient pas dans le récap. Un simple commentaire sur un
 * projet du membre ne part jamais en e-mail de mentions : il reste.
 */
const mailedBefore = (line: DatedLine, mentionSentAt: Date | null) =>
  line.kind !== 'comment' && mentionSentAt !== null && line.at <= mentionSentAt.getTime()

/** Ce que contient le récap d'un membre ; null s'il n'y a rien de nouveau. */
const contentOf = async (deps: JobDeps, member: Candidate, now: Date) => {
  const since = latest(
    member.seen_at,
    member.recap_sent_at,
    new Date(now.getTime() - RECAP_WINDOW_MS),
  )
  const notifications = await loadNotificationsSince(deps.db, member.id, since, deps.apiUrl)
  const lines: DatedLine[] = []
  let reactions = 0
  let follows = 0
  for (const { notification } of notifications) {
    switch (notification.kind) {
      case 'comment': {
        const line = {
          kind: notification.reason,
          name: notification.author.name,
          handle: notification.author.handle,
          title: notification.project.title,
          at: Date.parse(notification.at),
        }
        // Un premier tri avec la date lue au début du lot : il évite de prendre l'envoi pour rien.
        // Le tri qui compte se refait après la prise (recapOne), avec la date relue à cet instant.
        if (!mailedBefore(line, member.mention_sent_at)) lines.push(line)
        break
      }
      case 'reactions':
        reactions += notification.total
        break
      // Les nouveaux abonnés, à son compte et à ses projets (précision de la session du 21/10).
      case 'member_follows':
      case 'project_follows':
        follows += notification.count
        break
      // Un commentaire masqué ou le pseudo reçu : seulement dans l'appli.
      default:
        break
    }
  }
  if (lines.length === 0 && reactions === 0 && follows === 0) return null
  return { lines, reactions, follows }
}

const Taken = z.object({
  email: z.string(),
  name: z.string(),
  language: z.string(),
  recap_unvisited: z.number().int(),
  // La date du dernier e-mail de mentions, relue au moment de la prise (voir recapOne).
  mention_sent_at: isoDate,
})

/**
 * La prise atomique de l'envoi (relecture de sécurité S-B2) : une seule requête, qui note la date
 * d'envoi et rend l'adresse, ou ne rend rien.
 *
 * « insert … select … from "user" where id = $1 and email_verified » : la ligne à écrire n'existe
 * que si le compte existe encore et est vérifié (sinon rien, ni ligne recréée, ni erreur de clé
 * étrangère). Si le membre a déjà sa ligne (« on conflict »), elle n'est mise à jour que si les
 * conditions tiennent à cet instant (« do update … where ») : récap activé, le précédent il y a plus
 * de 6 jours, et moins de 3 sans visite ou une visite depuis. Deux exécutions en même temps : la
 * seconde trouve la date déjà notée par la première, et ne prend rien. « with taken as (…) » (une
 * requête nommée, dans la même instruction) permet de joindre "user" pour rendre l'adresse.
 */
const take = async (db: Database, userId: string, now: Date) => {
  const query: SQL = sql`
    with taken as (
      insert into email_preference (user_id, weekly_recap, mention_emails, recap_sent_at,
        recap_unvisited)
      select u.id, true, false, ${utc(now)}, 0 from "user" u
      where u.id = ${userId} and u.email_verified
      on conflict (user_id) do update set
        recap_sent_at = excluded.recap_sent_at,
        recap_unvisited = case when ${visitedSince('email_preference')} then 0
          else email_preference.recap_unvisited + 1 end
      where email_preference.weekly_recap
        and (email_preference.recap_sent_at is null
          or email_preference.recap_sent_at <= ${utc(new Date(now.getTime() - RECAP_MIN_INTERVAL_MS))})
        and (email_preference.recap_unvisited < ${RECAP_UNVISITED_MAX}
          or ${visitedSince('email_preference')})
      returning user_id, recap_unvisited, mention_sent_at
    )
    select u.email, u.name, u.language, taken.recap_unvisited,
      to_char(taken.mention_sent_at, ${ISO}) as mention_sent_at
    from taken join "user" u on u.id = taken.user_id
  `
  const [row] = z.object({ rows: z.array(Taken) }).parse(await db.execute(query)).rows
  return row ?? null
}

/** Le récap d'un membre : true s'il est parti. */
const recapOne = async (deps: JobDeps, member: Candidate, now: Date) => {
  const content = await contentOf(deps, member, now)
  if (!content) return false
  let taken: z.infer<typeof Taken> | null
  try {
    taken = await take(deps.db, member.id, now)
  } catch (error) {
    if (isDeletedMember(error)) return false
    throw error
  }
  if (!taken) return false
  // Le lundi à 9 h, l'e-mail de mentions tourne en même temps (relecture de sécurité A7). S'il a
  // envoyé une mention à ce membre après la lecture du lot, la date relue dans la prise le montre :
  // on retire cette mention ici. La prise de l'e-mail de mentions fait de même avec la date du récap
  // (mention-emails.ts) : celle des deux qui passe en second voit toujours la date de la première,
  // car les deux écrivent la même ligne, l'une après l'autre (verrou de la ligne).
  const lines = content.lines.filter((line) => !mailedBefore(line, taken.mention_sent_at))
  // Tout était déjà parti : rien n'est envoyé. La date du récap reste notée (cas rare, une course
  // entre les deux tâches) ; le récap suivant repart de là, sans rien perdre de nouveau.
  if (lines.length === 0 && content.reactions === 0 && content.follows === 0) return false
  const language = languageOfMember(taken)
  await deps.mailer.send({
    to: taken.email,
    ...recapEmail(language, {
      name: taken.name,
      lines: lines.slice(0, RECAP_MAX_LINES).map(({ at: _at, ...line }) => line),
      more: Math.max(0, lines.length - RECAP_MAX_LINES),
      reactions: content.reactions,
      follows: content.follows,
      first: member.recap_sent_at === null,
      last: taken.recap_unvisited >= RECAP_UNVISITED_MAX,
      links: linksFor(deps, member.id, 'recap'),
    }),
  })
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
