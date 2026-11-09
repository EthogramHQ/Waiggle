// Vérifier que les catégories d'un projet existent (tranche R6b) : depuis R6b, le contrat accepte
// tout code bien formé (« jardinage »), parce que les administrateurs peuvent en créer ; c'est donc
// la table `category` qui dit si un code existe. Les routes répondent 400 `unknown_category` sinon.
import { type Database, schema } from '@ruche/db'
import { inArray } from 'drizzle-orm'

/**
 * Vrai si chacun de ces codes est une catégorie en base. Une requête « in (…) » sur la clé
 * primaire (`category.code`), quel que soit le nombre de codes ; une liste vide est vraie.
 */
export const categoriesExist = async (
  db: Pick<Database, 'select'>,
  codes: readonly (string | null | undefined)[],
): Promise<boolean> => {
  const wanted = [...new Set(codes.filter((code): code is string => typeof code === 'string'))]
  if (wanted.length === 0) return true
  const rows = await db
    .select({ code: schema.category.code })
    .from(schema.category)
    .where(inArray(schema.category.code, wanted))
  return rows.length === wanted.length
}
