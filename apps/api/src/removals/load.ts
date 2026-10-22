// Ce que l'auteur d'un contenu retiré lit du retrait (tranche 6d, contrat `Removal`) : le
// fondement, l'explication, la date, et si le retrait a suivi un signalement. Partagé par les
// projets, les notes, les commentaires et l'export, qui ne font chacun qu'appeler removalsOf avec
// les décisions de leurs contenus retirés. Jamais d'identifiant d'administrateur ni de signaleur :
// seules ces quatre informations sortent d'ici (règle 14 de la relecture du plan).
import { type Removal, RemovalGround } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { inArray, type SQLWrapper, sql } from 'drizzle-orm'

type Reader = Pick<Database, 'select'>

/**
 * « Le retrait a suivi un signalement » : au moins un signalement clos par cette décision vient
 * d'un autre que l'administrateur qui a décidé. Quand l'administrateur signale lui-même un contenu
 * (un retrait demandé par e-mail, précision 2 du plan), puis le retire, c'est faux.
 *
 * En SQL : exists (select 1 from content_report cr where cr.target_kind = d.target_kind
 *   and cr.target_id = d.target_id and cr.decision_id = d.id
 *   and cr.reporter_id is distinct from d.admin_id)
 * « exists » s'arrête au premier signalement trouvé. La cible (target_kind, target_id) mène à
 * l'index content_report_target_idx, qui donne les quelques signalements de cette cible ; il n'y a
 * pas d'index sur decision_id. « is distinct from » est un « <> » qui sait comparer à null : un
 * signaleur parti (reporter_id null) compte comme un autre que l'administrateur.
 *
 * Les colonnes de la décision sont passées en paramètre, en SQL brut avec le nom de leur table ou
 * de son alias (`sql.raw('md.id')`), jamais en colonnes Drizzle, qui peuvent sortir sans ce nom
 * (voir removalsOf). La règle n'est ainsi écrite qu'une fois.
 */
export const afterReportSql = (decision: {
  id: SQLWrapper
  targetKind: SQLWrapper
  targetId: SQLWrapper
  adminId: SQLWrapper
}) =>
  sql<boolean>`exists (select 1 from content_report cr
    where cr.target_kind = ${decision.targetKind} and cr.target_id = ${decision.targetId}
      and cr.decision_id = ${decision.id} and cr.reporter_id is distinct from ${decision.adminId})`

/** Une décision lue en base, telle que `toRemoval` la transforme. */
type DecisionRow = {
  ground: string | null
  explanation: string | null
  createdAt: Date
  afterReport: boolean
}

/**
 * Une décision en retrait du contrat. null si elle n'a pas de fondement (ce n'est alors pas un
 * retrait : la base le garantit pour un retrait, l'API ayant exigé le fondement à la décision).
 */
export const toRemoval = (row: DecisionRow): Removal | null => {
  const ground = RemovalGround.safeParse(row.ground)
  if (!ground.success) return null
  return {
    ground: ground.data,
    explanation: row.explanation ?? '',
    at: row.createdAt.toISOString(),
    afterReport: row.afterReport,
  }
}

/**
 * Les retraits de plusieurs contenus, en une requête quel que soit leur nombre : la décision citée
 * par le `removal_id` de chacun, rangée par son identifiant. Aucune requête quand la liste est vide
 * (le cas de presque toutes les pages : un contenu retiré ne se montre qu'à son auteur).
 *
 * En SQL : select id, ground, explanation, created_at, exists (…) from moderation_decision
 * where id in (…). La clé primaire de moderation_decision trouve chaque décision.
 */
export const removalsOf = async (
  db: Reader,
  decisionIds: (string | null)[],
): Promise<Map<string, Removal>> => {
  const ids = [...new Set(decisionIds.filter((id): id is string => id !== null))]
  const removals = new Map<string, Removal>()
  if (ids.length === 0) return removals
  const d = schema.moderationDecision
  const rows = await db
    .select({
      id: d.id,
      ground: d.ground,
      explanation: d.explanation,
      createdAt: d.createdAt,
      // Les colonnes de la décision écrites avec le nom de leur table, en toutes lettres : dans un
      // « select » sur une seule table, Drizzle les écrirait sans lui (« target_kind »), et dans la
      // sous-requête, ce nom désignerait la colonne de content_report (condition toujours vraie).
      afterReport: afterReportSql({
        id: sql.raw('moderation_decision.id'),
        targetKind: sql.raw('moderation_decision.target_kind'),
        targetId: sql.raw('moderation_decision.target_id'),
        adminId: sql.raw('moderation_decision.admin_id'),
      }),
    })
    .from(d)
    .where(inArray(d.id, ids))
  for (const row of rows) {
    const removal = toRemoval(row)
    if (removal) removals.set(row.id, removal)
  }
  return removals
}
