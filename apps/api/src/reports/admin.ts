// Qui est administrateur (tranche 7a). Le rôle se donne et se retire par un script du dépôt
// (infra/grant-admin.sh), directement en base : aucune route ne l'écrit. Il est relu à chaque
// requête (règle 9 de la relecture du plan) : un rôle retiré cesse aussitôt, même pour une session
// déjà ouverte.
import { type Database, schema } from '@ruche/db'
import { and, eq, isNull } from 'drizzle-orm'

/**
 * Vrai si ce membre est administrateur en fonction : une ligne dans admin_member, non révoquée.
 * Servie par la clé primaire de admin_member (user_id) : une seule ligne lue.
 */
export const isActiveAdmin = async (db: Pick<Database, 'select'>, userId: string) => {
  const [row] = await db
    .select({ userId: schema.adminMember.userId })
    .from(schema.adminMember)
    .where(and(eq(schema.adminMember.userId, userId), isNull(schema.adminMember.revokedAt)))
  return row !== undefined
}
