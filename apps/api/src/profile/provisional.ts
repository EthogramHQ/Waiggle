// Le nom et le pseudo « provisoires » d'un membre (R9, 7d) : ceux que la modération a mis d'office
// en retirant les siens (« Membre », « membre_4f2a »), tant qu'il n'en a pas choisi d'autres. L'appli
// lui propose alors d'en choisir un (`Me.provisional`), et un compte suspendu garde le droit de le
// faire (relecture de sécurité du plan, P7). Rien n'est stocké pour cela : la décision de retrait
// garde la valeur qu'elle a mise (`moderation_decision.provisional_value`), et l'on compare.
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, inArray } from 'drizzle-orm'

const d = schema.moderationDecision

/** Ce qui peut être provisoire : le nom et le pseudo. */
type Identity = { name: string; handle: string | null }
export type Provisional = { name: boolean; handle: boolean }

/**
 * La valeur mise d'office par le DERNIER retrait du nom, et celle du dernier retrait du pseudo
 * (null s'il n'y en a jamais eu). Une requête : `distinct on (part_field)` ne garde que la première
 * ligne de chaque partie dans l'ordre demandé, donc la plus récente. Elle suit l'index
 * moderation_decision_target_idx (sorte, cible, date) : seules les décisions sur ce membre sont lues.
 * Seuls les retraits comptent : un classement ou un rétablissement ne met rien d'office.
 */
const lastProvisionalValues = async (db: Pick<Database, 'selectDistinctOn'>, userId: string) => {
  const rows = await db
    .selectDistinctOn([d.partField], { field: d.partField, value: d.provisionalValue })
    .from(d)
    .where(
      and(
        eq(d.targetKind, 'member'),
        eq(d.targetId, userId),
        eq(d.action, 'remove'),
        inArray(d.partField, ['name', 'handle']),
      ),
    )
    .orderBy(d.partField, desc(d.createdAt), desc(d.id))
  const lastOf = (field: string) => rows.find((row) => row.field === field)?.value ?? null
  return { name: lastOf('name'), handle: lastOf('handle') }
}

/**
 * Provisoires si la valeur actuelle est encore celle que le dernier retrait a mise. Un pseudo
 * provisoire est unique (tiré au hasard) : le garder après un rétablissement qui n'a pas pu rendre
 * l'ancien (pris entre-temps) le laisse provisoire, comme le veut la décision L3. Un nom choisi
 * depuis, ou rendu par un rétablissement, ne l'est plus. Limite connue : un membre qui se
 * renommerait lui-même « Membre » après un retrait de son nom passerait pour provisoire (il peut
 * alors en choisir un autre, même suspendu ; rien de plus).
 */
export const provisionalOf = async (
  db: Pick<Database, 'selectDistinctOn'>,
  userId: string,
  current: Identity,
): Promise<Provisional> => {
  const last = await lastProvisionalValues(db, userId)
  return {
    name: last.name !== null && last.name === current.name,
    handle: last.handle !== null && last.handle === current.handle,
  }
}
