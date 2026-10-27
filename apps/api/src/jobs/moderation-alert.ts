// L'alerte aux administrateurs (tranche 7a), que l'ordonnanceur lance toutes les 10 minutes.
// Plan 7a, « Tâche et e-mail », et règle 15 de la relecture du plan.
//
// S'il y a des signalements ouverts créés après le dernier e-mail d'un administrateur, et que
// celui-ci date d'au moins une heure (ou n'a jamais eu lieu), il reçoit un e-mail : le nombre de
// signalements en attente et un lien vers « Modération », rien de plus (aucun extrait ne part chez
// l'envoyeur d'e-mails). Un administrateur révoqué, ou dont l'adresse n'est pas vérifiée, ne reçoit
// rien. Coupée par EMAIL_JOBS=off, comme les autres e-mails (scheduler.ts).
import type { Database } from '@ruche/db'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { languageOfMember } from '../email/language'
import { moderationAlertEmail } from '../email/templates'
import { utc } from '../notifications/load'
import { activeSuspensionSql } from '../suspension/load'
import { type JobDeps, logMemberFailure } from './shared'

const HOUR = 60 * 60 * 1000

const Taken = z.object({ email: z.string(), name: z.string(), language: z.string() })

/**
 * La prise atomique des envois, comme take() dans mention-emails.ts : une seule requête note la
 * date d'envoi (`now`) de chaque administrateur qui doit être prévenu, et rend son adresse. Les
 * conditions, relues au moment d'écrire :
 * - administrateur en fonction (revoked_at is null), compte vérifié ;
 * - pas suspendu à `now` (tranche 7c, règle S19 : la même règle que isActiveAdmin de
 *   reports/admin.ts, écrite par activeSuspensionSql de suspension/load.ts). Un administrateur
 *   suspendu ne reçoit rien ; sa suspension finie, il est prévenu de nouveau, sans rien rétablir ;
 * - dernier e-mail il y a au moins une heure, ou jamais ;
 * - au moins un signalement ouvert créé après ce dernier e-mail, et au plus tard à `now` (ce qui
 *   arrive pendant le passage partira au suivant).
 * Une seconde exécution au même moment attend la fin de la première (verrou des lignes), relit la
 * condition, et ne prend rien : deux passages n'envoient qu'un e-mail. La date est notée avant
 * l'envoi : un envoi qui échoue n'est pas retenté au passage suivant (pas de rafale vers un
 * envoyeur en panne).
 *
 * admin_member est minuscule (un ou deux administrateurs) ; le « exists » lit l'index partiel des
 * signalements ouverts (content_report_open_idx, rangé par created_at) et s'arrête au premier. Le
 * « not exists » de la suspension cherche, pour chacun de ces quelques administrateurs, sa
 * suspension ouverte dans l'index unique partiel account_suspension_open_idx (une ligne au plus).
 */
const take = async (db: Database, now: Date) => {
  const query = sql`
    update admin_member am set alerted_at = ${utc(now)}
    from "user" u
    where u.id = am.user_id and am.revoked_at is null and u.email_verified
      and not exists (
        select 1 from account_suspension s
        where s.user_id = am.user_id and ${activeSuspensionSql('s', now)}
      )
      and (am.alerted_at is null or am.alerted_at <= ${utc(new Date(now.getTime() - HOUR))})
      and exists (
        select 1 from content_report r
        where r.status = 'open' and r.created_at <= ${utc(now)}
          and (am.alerted_at is null or r.created_at > am.alerted_at)
      )
    returning u.email, u.name, u.language
  `
  return z.object({ rows: z.array(Taken) }).parse(await db.execute(query)).rows
}

/**
 * Le nombre de signalements en attente à `now` : un « count » sur l'index partiel des signalements
 * ouverts, sans lire les signalements clos.
 */
const pendingCount = async (db: Database, now: Date) => {
  const query = sql`
    select count(*)::int as count from content_report
    where status = 'open' and created_at <= ${utc(now)}
  `
  const [row] = z
    .object({ rows: z.array(z.object({ count: z.coerce.number() })) })
    .parse(await db.execute(query)).rows
  return row?.count ?? 0
}

/** Envoie l'alerte aux administrateurs qui doivent la recevoir, à l'heure `now`. */
export const moderationAlert = async (deps: JobDeps, now: Date) => {
  const admins = await take(deps.db, now)
  if (admins.length === 0) return { sent: 0, failed: 0 }
  const count = await pendingCount(deps.db, now)
  const url = new URL('/moderation', deps.appUrl).toString()
  let sent = 0
  let failed = 0
  for (const admin of admins) {
    try {
      await deps.mailer.send({
        to: admin.email,
        ...moderationAlertEmail(languageOfMember(admin), { name: admin.name, count, url }),
      })
      sent++
    } catch (error) {
      // Un envoi qui échoue n'arrête pas les autres ; le journal ne garde ni l'adresse ni le message.
      failed++
      logMemberFailure('moderation-alert', error)
    }
  }
  console.log(`Moderation alert: ${sent} sent, ${failed} failed`)
  return { sent, failed }
}
