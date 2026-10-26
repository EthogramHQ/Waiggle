// Qui est administrateur (tranche 7a). Le rôle se donne et se retire par un script du dépôt
// (infra/grant-admin.sh), directement en base : aucune route ne l'écrit. Il est relu à chaque
// requête (règle 9 de la relecture du plan) : un rôle retiré cesse aussitôt, même pour une session
// déjà ouverte.
//
// Tranche 7c (relecture de sécurité S19) : un administrateur suspendu n'en est plus un, le temps de
// sa suspension. Un membre suspendu qu'on nommerait administrateur n'a donc pas accès à la
// modération : les routes lui répondent le 404 d'une adresse inconnue, et le rôle revient seul à
// la fin de la suspension (aucune ligne à rétablir).
import { type Database, schema } from '@ruche/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { activeSuspensionSql } from '../suspension/load'

/**
 * Vrai si ce membre est administrateur en fonction à l'heure `now` : une ligne dans admin_member,
 * non révoquée, et aucune suspension active (la règle unique de suspension/load.ts, S10).
 *
 * Une seule requête : la clé primaire de admin_member (user_id) donne la ligne du rôle ; le « not
 * exists » cherche une suspension ouverte du même membre dans l'index unique partiel
 * account_suspension_open_idx (« (user_id) where lifted_at is null » : la condition de la
 * sous-requête contient celle de l'index), une ligne au plus. L'identifiant y entre comme valeur
 * liée, pas comme colonne de la ligne lue (pièges de la charte : pas de « hashed SubPlan »).
 *
 * `now` vaut par défaut l'heure de l'appel (la fausse horloge des tests la suit) ; `db` peut être
 * une transaction (S6).
 */
export const isActiveAdmin = async (
  db: Pick<Database, 'select'>,
  userId: string,
  now: Date = new Date(),
) => {
  const [row] = await db
    .select({ userId: schema.adminMember.userId })
    .from(schema.adminMember)
    .where(
      and(
        eq(schema.adminMember.userId, userId),
        isNull(schema.adminMember.revokedAt),
        sql`not exists (select 1 from account_suspension s
          where s.user_id = ${userId} and ${activeSuspensionSql('s', now)})`,
      ),
    )
  return row !== undefined
}
