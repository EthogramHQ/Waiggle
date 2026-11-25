// Les outils des tests du pollen (R19, « La gamification ») : lire le grand livre d'un membre, lire
// l'en-tête « Waiggle-Pollen » d'une réponse, marquer un compte d'exemple, suspendre un membre.
// Rien ici n'est utilisé en production.
//
// Le grand livre est lu en SQL brut, par les colonnes que fixe le plan (choix 1 : table
// `pollen_entry`, `member_id`, `gesture`, `family`, `amount`, `source_kind`, `counterpart_id`,
// `day`, `revoked_at`, `created_at`) : les tests ne dépendent ainsi ni du schéma Drizzle ni de la
// route « Ma récolte », écrits par d'autres. Tant que la table n'existe pas, la lecture échoue
// (« Failed query ») : c'est la bonne raison du rouge.
import { POLLEN_HEADER } from '@ruche/contracts'
import { sql } from 'drizzle-orm'
import type { activity } from './activity'
import type { TestContext } from './context'

/** Une entrée du grand livre, telle que les tests la comparent. */
export type LedgerRow = {
  gesture: string
  family: string
  amount: number
  sourceKind: string
  counterpartId: string | null
  day: string
  revoked: boolean
}

/**
 * Toutes les entrées d'un membre, révoquées comprises, de la plus ancienne à la plus récente.
 * `day::text` : le jour de Paris en `YYYY-MM-DD` (une colonne `date` reviendrait sinon en objet).
 */
export const ledgerOf = async (ctx: TestContext, memberId: string): Promise<LedgerRow[]> => {
  const result = await ctx.db.execute(
    sql`select gesture, family, amount::int as amount, source_kind as "sourceKind",
          counterpart_id as "counterpartId", day::text as day,
          revoked_at is not null as revoked
        from pollen_entry
        where member_id = ${memberId}
        order by created_at, id`,
  )
  return (result as unknown as { rows: LedgerRow[] }).rows
}

/** Les entrées d'un membre en paires [geste, montant] : ce que la plupart des tests comparent. */
export const gesturesOf = async (ctx: TestContext, memberId: string) =>
  (await ledgerOf(ctx, memberId)).map((row) => [row.gesture, row.amount] as const)

/** Le pollen qui compte (sans les entrées révoquées par la modération). */
export const pollenOf = async (ctx: TestContext, memberId: string) =>
  (await ledgerOf(ctx, memberId))
    .filter((row) => !row.revoked)
    .reduce((sum, row) => sum + row.amount, 0)

/** L'en-tête de gain d'une réponse, tel quel (null s'il est absent : le geste n'a rien rapporté). */
export const pollenHeader = (res: Response) => res.headers.get(POLLEN_HEADER)

/**
 * Fait de ce compte un compte d'exemples, comme `infra/mark-example.sh` (examples.test.ts) : une
 * ligne dans `example_account`. La date entre en texte ISO, lue en UTC.
 */
export const markExample = (ctx: TestContext, userId: string) =>
  ctx.db.execute(
    sql`insert into example_account (user_id, marked_at)
        values (${userId}, ${new Date().toISOString()}::timestamptz at time zone 'UTC')`,
  )

/** Un administrateur suspend ce membre pour 7 jours (la décision de la modération, tranche 7c). */
export const suspend = async (
  act: ReturnType<typeof activity>,
  adminCookie: string,
  memberId: string,
) => {
  const res = await act.send('POST', '/v1/moderation/decisions', adminCookie, {
    action: 'suspend',
    memberId,
    duration: '7d',
    ground: 'rules',
    explanation: 'Des messages insultants, plusieurs fois.',
  })
  if (res.status !== 201) throw new Error(`suspend ${memberId}: ${res.status}`)
}
