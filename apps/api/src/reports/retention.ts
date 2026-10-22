// Combien de temps on garde les signalements et les décisions de modération (tranche 6d, règles
// 16, 17 et 32 de la relecture du plan ; durées à faire valider par un professionnel). Appelé par
// la purge de nuit (jobs/nightly-purge.ts) :
// - d'abord le rattrapage du « sans objet » : les signalements ouverts d'une cible disparue, et
//   ceux, ouverts ou classés, dont l'auteur visé a supprimé son compte ;
// - un signalement sans objet est effacé 30 jours après (le temps de prévenir les autorités,
//   article 18 du DSA), jamais la nuit même ;
// - un signalement clos (retiré, classé), un an après la décision ;
// - une décision, un an après la dernière décision sur la même cible, sauf si son contenu est
//   encore retiré (removal_id la cite) : sinon l'auteur perdrait l'explication du retrait.
//
// L'heure vient du paramètre `now` et entre dans le SQL par utc() (voir nightly-purge.ts).
import { REPORT_RETENTION_DAYS, VOID_REPORT_RETENTION_DAYS } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { utc } from '../notifications/load'
import { voidReportsOfDepartedAuthors, voidReportsOfGoneTargets } from './queue'
import { targetUuid } from './target'

const DAY = 24 * 60 * 60 * 1000
const r = schema.contentReport
const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * DAY)

export const purgeModeration = async (db: Database, now: Date) => {
  const voided =
    (await voidReportsOfGoneTargets(db, now)) + (await voidReportsOfDepartedAuthors(db, now))

  // Les signalements clos sont peu nombreux à la fois (une purge par nuit) : la table est lue en
  // entier, une fois par nuit. Un index sur decided_at le jour où elle grandira (à surveiller).
  const voidReports = await db
    .delete(r)
    .where(
      and(
        eq(r.status, 'void'),
        sql`${r.decidedAt} <= ${utc(daysBefore(now, VOID_REPORT_RETENTION_DAYS))}`,
      ),
    )
    .returning({ id: r.id })
  const closedReports = await db
    .delete(r)
    .where(
      and(
        inArray(r.status, ['removed', 'dismissed']),
        sql`${r.decidedAt} <= ${utc(daysBefore(now, REPORT_RETENTION_DAYS))}`,
      ),
    )
    .returning({ id: r.id })

  // Les décisions : la plus récente décision sur la même cible date d'un an ou plus (le premier
  // « not exists » cherche une décision plus récente, dans l'index moderation_decision_target_idx),
  // et aucun contenu ne la cite encore comme son retrait (chaque contenu est cherché par la clé
  // primaire de sa table, targetUuid). On écrit "moderation_decision".<colonne> en toutes lettres :
  // la colonne visée est bien celle de la décision à effacer, pas celle de la sous-requête.
  const cutoff = utc(daysBefore(now, REPORT_RETENTION_DAYS))
  const id = targetUuid('moderation_decision')
  const decisions = await db
    .delete(schema.moderationDecision)
    .where(
      sql`moderation_decision.created_at <= ${cutoff}
        and not exists (
          select 1 from moderation_decision later
          where later.target_kind = moderation_decision.target_kind
            and later.target_id = moderation_decision.target_id
            and later.created_at > ${cutoff})
        and not exists (
          select 1 from project p where p.id = ${id} and p.removal_id = moderation_decision.id)
        and not exists (
          select 1 from project_note n where n.id = ${id} and n.removal_id = moderation_decision.id)
        and not exists (
          select 1 from project_comment c where c.id = ${id} and c.removal_id = moderation_decision.id)`,
    )
    .returning({ id: schema.moderationDecision.id })

  return {
    voidedReports: voided,
    voidReports: voidReports.length,
    closedReports: closedReports.length,
    decisions: decisions.length,
  }
}
