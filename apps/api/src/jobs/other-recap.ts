// Le récap des « Autre » aux administrateurs (tranche R6b), que l'ordonnanceur lance le lundi à 8 h,
// heure de Paris. Plan R6b, B3, et décisions 1, 4, 7 et 8 de la relecture du plan.
//
// S'il y a eu des « Autre » dans les sept jours (un outil absent du catalogue, cité par un projet
// visible des membres, ou un projet visible classé dans la catégorie « Autre »), chaque
// administrateur en fonction, à l'adresse vérifiée et non suspendu, reçoit dans sa langue des
// nombres et deux liens (« Outils », « Catégories »), rien de plus : aucun nom d'outil, titre ou
// auteur ne part chez l'envoyeur d'e-mails (relecture juridique jur-T1, option A). Coupé par
// EMAIL_JOBS=off, comme les autres e-mails (scheduler.ts).
import { OTHER_CATEGORY } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { languageOfMember } from '../email/language'
import { otherRecapEmail } from '../email/templates'
import { utc } from '../notifications/load'
import { activeSuspensionSql } from '../suspension/load'
import { type JobDeps, logMemberFailure } from './shared'

const DAY = 24 * 60 * 60 * 1000
/** La fenêtre du récap : les sept jours avant le passage. */
const WINDOW_DAYS = 7
/** Un administrateur prévenu il y a moins de six jours ne l'est pas de nouveau (un récap manqué
 * rattrapé le mardi ne fait pas partir un second e-mail le lundi suivant trop tôt). */
const RESEND_DAYS = 6

/**
 * Un projet que les membres peuvent voir (public, pas retiré, d'un auteur vérifié), sans filtre de
 * blocage (décision 1) : la même règle que `listedVerifiedProject` de projects/visibility.ts, écrite
 * ici en SQL brut sur l'alias `p`, parce que les requêtes de cette tâche sont en SQL brut.
 */
const listed = (p: string) =>
  sql.raw(`${p}.visibility = 'public' and ${p}.removed_at is null
    and (select u.email_verified from "user" u where u.id = ${p}.author_id) is true`)

const Count = z.object({ rows: z.array(z.object({ n: z.coerce.number() })) })

const countOf = async (db: Database, query: SQL) =>
  Count.parse(await db.execute(query)).rows[0]?.n ?? 0

/**
 * Les « Autre » en attente cités par au moins un projet visible, ou par les outils favoris d'un
 * compte vérifié (décision de Louis du 9/11/2026 au soir ; la règle `memberWithPage` de
 * blocks/write.ts, écrite ici en SQL brut comme `listed`), créés dans la période donnée. Les mêmes
 * que l'onglet « À vérifier » (catalogue/pages.ts). Chaque sous-requête s'arrête à la première
 * ligne trouvée (`(select 1 … limit 1) is not null` plutôt qu'un `exists` dans un `or`, charte de
 * l'API) : un projet par l'index project_tool_tool_idx puis la clé primaire du projet, un profil
 * par profile_tool_tool_idx puis la clé primaire de "user". La liste des « Autre » vient de l'index
 * tool_status_created_idx (status = 'other', rangé par created_at). Jamais un « Autre » écarté
 * (décision 8).
 */
const pendingTools = (period: SQL) => sql`
  select count(*)::int as n from tool t
  where t.status = 'other' and ${period}
    and (
      (select 1 from project_tool pt join project p on p.id = pt.project_id
        where pt.tool_id = t.id and ${listed('p')} limit 1) is not null
      or (select 1 from profile_tool pf join "user" u on u.id = pf.user_id
        where pf.tool_id = t.id and u.email_verified limit 1) is not null
    )`

/**
 * Les projets visibles classés « Autre » (en principale ou en seconde), publiés dans la période,
 * sauf ceux qu'un administrateur a déjà rangés et que leur auteur a remis en « Autre » (jur-T4 : son
 * choix l'emporte). Les index project_primary_category_idx et project_secondary_category_idx
 * servent les deux conditions sur la catégorie ; le « not exists » lit le journal du catalogue,
 * quelques lignes par jour.
 */
const pendingProjects = (period: SQL) => sql`
  select count(*)::int as n from project p
  where (p.primary_category = ${OTHER_CATEGORY} or p.secondary_category = ${OTHER_CATEGORY})
    and ${listed('p')} and ${period}
    and not exists (
      select 1 from catalogue_change c
      where c.project_id = p.id and c.action = 'project_recategorize'
    )`

/** Les quatre nombres du récap, à l'heure `now` : deux lectures bornées des deux côtés. */
const counts = async (db: Database, now: Date) => {
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY)
  const recent = (column: string) =>
    sql`${sql.raw(column)} > ${utc(since)} and ${sql.raw(column)} <= ${utc(now)}`
  const older = (column: string) => sql`${sql.raw(column)} <= ${utc(since)}`
  return {
    tools: await countOf(db, pendingTools(recent('t.created_at'))),
    projects: await countOf(db, pendingProjects(recent('p.published_at'))),
    older:
      (await countOf(db, pendingTools(older('t.created_at')))) +
      (await countOf(db, pendingProjects(older('p.published_at')))),
  }
}

const Taken = z.object({ email: z.string(), name: z.string(), language: z.string() })

/**
 * La prise atomique des envois, comme celle de moderation-alert.ts : une seule requête note la date
 * d'envoi (`now`) de chaque administrateur à prévenir et rend son adresse. Conditions relues au
 * moment d'écrire : en fonction, adresse vérifiée, pas suspendu à `now` (la règle de
 * suspension/load.ts), et pas de récap depuis six jours. Un second passage au même moment attend
 * le verrou des lignes, relit la condition et ne prend rien. La date est notée avant l'envoi : un
 * envoi qui échoue n'est pas retenté au passage suivant.
 */
const take = async (db: Database, now: Date) => {
  const query = sql`
    update admin_member am set other_recap_at = ${utc(now)}
    from "user" u
    where u.id = am.user_id and am.revoked_at is null and u.email_verified
      and not exists (
        select 1 from account_suspension s
        where s.user_id = am.user_id and ${activeSuspensionSql('s', now)}
      )
      and (am.other_recap_at is null
        or am.other_recap_at <= ${utc(new Date(now.getTime() - RESEND_DAYS * DAY))})
    returning u.email, u.name, u.language
  `
  return z.object({ rows: z.array(Taken) }).parse(await db.execute(query)).rows
}

/** Envoie le récap des « Autre » aux administrateurs qui doivent le recevoir, à l'heure `now`. */
export const otherRecap = async (deps: JobDeps, now: Date) => {
  const numbers = await counts(deps.db, now)
  // Rien de nouveau cette semaine : aucun e-mail, et aucune date notée (le prochain « Autre »
  // partira au passage suivant). Les plus anciens seuls ne font pas partir le récap.
  if (numbers.tools === 0 && numbers.projects === 0) return { sent: 0, failed: 0 }
  const admins = await take(deps.db, now)
  const toolsUrl = new URL('/moderation/tools', deps.appUrl).toString()
  const projectsUrl = new URL('/moderation/categories', deps.appUrl).toString()
  let sent = 0
  let failed = 0
  for (const admin of admins) {
    try {
      await deps.mailer.send({
        to: admin.email,
        ...otherRecapEmail(languageOfMember(admin), {
          name: admin.name,
          ...numbers,
          toolsUrl,
          projectsUrl,
        }),
      })
      sent++
    } catch (error) {
      // Un envoi qui échoue n'arrête pas les autres ; le journal ne garde ni l'adresse ni le message.
      failed++
      logMemberFailure('other-recap', error)
    }
  }
  console.log(`Other recap: ${sent} sent, ${failed} failed`)
  return { sent, failed }
}
