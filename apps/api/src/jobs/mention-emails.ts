// L'e-mail de mentions et de réponses (tranche 6c), que l'ordonnanceur lance toutes les 5 minutes.
// Scénario : docs/scenarios/phase-1.md, « Précisions (tranche 6c) », « L'e-mail de mention ou de
// réponse ». Désactivé par défaut : seuls les membres qui l'ont activé le reçoivent.
//
// Pour chacun (compte vérifié, option activée, le précédent e-mail il y a plus d'une heure) :
// 1. les mentions et réponses qui le concernent, comme l'écran des notifications (droits,
//    masquage, projet privé), arrivées après le plus récent de sa dernière visite de l'écran, du
//    dernier e-mail de mentions, du dernier récap et d'il y a 24 heures (un même événement ne part
//    jamais deux fois par e-mail, et jamais une mention ancienne après une sauvegarde restaurée) ;
// 2. rien, ou rien qui attend depuis 15 minutes : pas d'e-mail (il partira à un prochain passage,
//    15 à 20 minutes après la première mention, avec tout ce qui est arrivé entre-temps) ;
// 3. sinon, « prendre » l'envoi (une seule requête note la date et rend l'adresse, si les
//    conditions tiennent encore), retirer ce qu'un récap parti entre-temps contenait déjà, puis
//    envoyer, dans la langue du membre.
import { MENTION_EMAIL_DELAY_MINUTES, MENTION_EMAIL_MIN_INTERVAL_MINUTES } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { languageOfMember } from '../email/language'
import { defangLinks, linkPlaceholder } from '../email/links'
import { mentionEmail } from '../email/templates'
import { excerptOf, loadNotificationsSince, utc } from '../notifications/load'
import { BATCH_SIZE, isoDate, type JobDeps, latest, linksFor, logMemberFailure } from './shared'

const MINUTE = 60 * 1000
/** Jamais une mention vieille de plus de 24 heures dans un e-mail. */
const MENTION_WINDOW_MS = 24 * 60 * MINUTE
const ISO = 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'

const Candidate = z.object({
  id: z.string(),
  mention_sent_at: isoDate,
  recap_sent_at: isoDate,
  seen_at: isoDate,
})
type Candidate = z.infer<typeof Candidate>

/** « Le précédent e-mail il y a plus d'une heure » : la date limite, pour `now`. */
const intervalCutoff = (now: Date) =>
  utc(new Date(now.getTime() - MENTION_EMAIL_MIN_INTERVAL_MINUTES * MINUTE))

/**
 * Un lot de membres qui ont activé l'e-mail et peuvent le recevoir maintenant, après `after` :
 *
 *   select ep.user_id, ep.mention_sent_at, ep.recap_sent_at, ns.seen_at
 *   from email_preference ep join "user" u … left join notification_state ns …
 *   where ep.mention_emails and u.email_verified and ep.user_id > $after
 *     and (ep.mention_sent_at is null or ep.mention_sent_at <= $il_y_a_une_heure)
 *   order by ep.user_id limit 100
 *
 * La tâche passe toutes les 5 minutes : l'index partiel email_preference_mentions_idx (les seules
 * lignes où mention_emails est vrai, rangées par user_id) donne ces membres dans l'ordre, sans lire
 * ceux qui ne l'ont pas activé ; "user" et notification_state par leur clé primaire.
 */
const candidates = async (db: Database, now: Date, after: string): Promise<Candidate[]> => {
  const query = sql`
    select ep.user_id as id,
      to_char(ep.mention_sent_at, ${ISO}) as mention_sent_at,
      to_char(ep.recap_sent_at, ${ISO}) as recap_sent_at,
      to_char(ns.seen_at, ${ISO}) as seen_at
    from email_preference ep
    join "user" u on u.id = ep.user_id
    left join notification_state ns on ns.user_id = ep.user_id
    where ep.mention_emails and u.email_verified and ep.user_id > ${after}
      and (ep.mention_sent_at is null or ep.mention_sent_at <= ${intervalCutoff(now)})
    order by ep.user_id
    limit ${BATCH_SIZE}
  `
  return z.object({ rows: z.array(Candidate) }).parse(await db.execute(query)).rows
}

const Taken = z.object({
  email: z.string(),
  name: z.string(),
  language: z.string(),
  // La date du dernier récap, relue au moment de la prise (voir mentionsOne).
  recap_sent_at: isoDate,
})

/**
 * La prise atomique de l'envoi (relecture de sécurité S-B2) : « update … from "user" … returning »
 * note la date d'envoi et rend l'adresse, en une seule requête, seulement si à cet instant le compte
 * existe, est vérifié, a l'option activée et n'a rien reçu depuis une heure. Une seconde exécution
 * au même moment attend la fin de la première (verrou de la ligne), relit la condition, et ne prend
 * rien. Un compte supprimé n'a plus de ligne : rien n'est recréé.
 */
const take = async (db: Database, userId: string, now: Date) => {
  const query = sql`
    update email_preference ep set mention_sent_at = ${utc(now)}
    from "user" u
    where ep.user_id = ${userId} and u.id = ep.user_id and u.email_verified and ep.mention_emails
      and (ep.mention_sent_at is null or ep.mention_sent_at <= ${intervalCutoff(now)})
    returning u.email, u.name, u.language, to_char(ep.recap_sent_at, ${ISO}) as recap_sent_at
  `
  const [row] = z.object({ rows: z.array(Taken) }).parse(await db.execute(query)).rows
  return row ?? null
}

/** L'e-mail de mentions d'un membre : true s'il est parti. */
const mentionsOne = async (deps: JobDeps, member: Candidate, now: Date) => {
  const since = latest(
    member.seen_at,
    member.mention_sent_at,
    member.recap_sent_at,
    new Date(now.getTime() - MENTION_WINDOW_MS),
  )
  const items = (await loadNotificationsSince(deps.db, member.id, since, deps.apiUrl)).flatMap(
    ({ row, notification }) =>
      notification.kind === 'comment' && notification.reason !== 'comment'
        ? [{ row, notification, reason: notification.reason }]
        : [],
  )
  // Rien n'attend depuis 15 minutes : on laisse le temps aux suivantes d'arriver.
  const oldest = Math.min(...items.map(({ notification }) => Date.parse(notification.at)))
  if (items.length === 0 || oldest > now.getTime() - MENTION_EMAIL_DELAY_MINUTES * MINUTE) {
    return false
  }
  const taken = await take(deps.db, member.id, now)
  if (!taken) return false
  // Le lundi à 9 h, le récap tourne en même temps (relecture de sécurité A7). S'il est parti pour ce
  // membre après la lecture du lot, il contenait déjà ces mentions : la date relue dans la prise le
  // montre, et on les retire. Le récap fait de même avec la date de cet e-mail (weekly-recap.ts).
  const recapAt = taken.recap_sent_at?.getTime() ?? Number.NEGATIVE_INFINITY
  const fresh = items.filter(({ notification }) => Date.parse(notification.at) > recapAt)
  // Tout est parti dans le récap : rien n'est envoyé (la date reste notée, cas rare d'une course).
  if (fresh.length === 0) return false
  const language = languageOfMember(taken)
  await deps.mailer.send({
    to: taken.email,
    ...mentionEmail(language, {
      name: taken.name,
      // Les plus anciennes d'abord : l'e-mail se lit comme la conversation.
      items: fresh.reverse().map(({ row, notification, reason }) => ({
        kind: reason,
        name: notification.author.name,
        handle: notification.author.handle,
        title: notification.project.title,
        // Les adresses retirées du texte entier AVANT de le couper : une adresse coupée en deux
        // par l'extrait ne serait plus reconnue.
        excerpt: excerptOf(defangLinks(row.body ?? '', linkPlaceholder(language))),
      })),
      links: linksFor(deps, member.id, 'mentions'),
    }),
  })
  return true
}

/** Envoie les e-mails de mentions en attente, à l'heure `now`. Rend les nombres envoyés et échoués. */
export const mentionEmails = async (deps: JobDeps, now: Date) => {
  let sent = 0
  let failed = 0
  let after = ''
  for (;;) {
    const batch = await candidates(deps.db, now, after)
    for (const member of batch) {
      try {
        if (await mentionsOne(deps, member, now)) sent++
      } catch (error) {
        // Un membre qui échoue (rendu, envoi) n'arrête pas les autres.
        failed++
        logMemberFailure('mention-emails', error)
      }
    }
    const last = batch.at(-1)
    if (batch.length < BATCH_SIZE || !last) break
    after = last.id
  }
  if (sent > 0 || failed > 0) console.log(`Mention e-mails: ${sent} sent, ${failed} failed`)
  return { sent, failed }
}
