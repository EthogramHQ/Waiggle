// La page publique d'un membre (tranche R12, « Rendre sa page publique ») : la seule règle qui dit si
// un visiteur sans compte peut lire la page d'un membre, et ce qu'elle montre. Comme
// `visitorVisibleProject` pour un projet (projects/visibility.ts), elle est écrite une fois ici,
// en SQL, et toutes les surfaces sans compte la lisent : la page elle-même (public/load.ts), le nom
// de l'auteur sur un projet public (`publicPage`), sa photo (routes/media.ts), la tête des pages.
//
// Une page est ouverte si les deux sont vrais :
// - le membre a coché « Rendre ma page publique » (`profile.public_page`, faux par défaut : rien
//   n'est public sans son accord) ;
// - son compte est vérifié (un compte jamais vérifié n'existe pour personne, R3). Un compte supprimé
//   n'a plus de ligne : il ne répond rien, comme un membre inconnu.
import { MemberId, type PublicAuthor, type PublicPageSettings } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, type SQL, sql } from 'drizzle-orm'
import { avatarUrlOf } from './me'

type Reader = Pick<Database, 'select'>

/**
 * La condition « sa page est ouverte aux visiteurs », pour une requête qui lit `profile` et `user`
 * (joints par `profile.user_id = user.id`). `is true` : faux aussi quand une colonne vaut nul (un
 * membre sans ligne de profil, lu par une jointure externe).
 */
export const publicPageOpen = (): SQL =>
  sql`(${schema.profile.publicPage} and ${schema.user.emailVerified}) is true`

/**
 * Les cases de la page publique de ce membre, ou null si elle est fermée, s'il est inconnu, jamais
 * vérifié ou supprimé (la même réponse : le visiteur ne sait pas lequel). Un identifiant mal formé
 * répond null sans lire la base. Une lecture : la clé primaire de "user", puis celle de `profile`
 * (`user_id`) ; l'identifiant entre comme paramètre lié.
 */
export const publicPageOf = async (
  db: Reader,
  userId: string,
): Promise<PublicPageSettings | null> => {
  if (!MemberId.safeParse(userId).success) return null
  const [row] = await db
    .select({
      showBio: schema.profile.publicBio,
      showFavoriteTools: schema.profile.publicTools,
      showProjects: schema.profile.publicProjects,
      showFollowerCount: schema.profile.publicFollowerCount,
    })
    .from(schema.user)
    .innerJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
    .where(and(eq(schema.user.id, userId), publicPageOpen()))
    .limit(1)
  return row ? { publicPage: true, ...row } : null
}

/**
 * L'auteur d'un projet public tel qu'un visiteur le voit (contrat `PublicAuthor`) : son nom, sa
 * photo (null si elle est retirée par la modération : `avatarUrlOf`), et si sa page est ouverte (son
 * nom mène alors à elle). Jamais son pseudo (Q8). Null pour un membre inconnu ou jamais vérifié :
 * l'appelant a déjà vérifié le projet (`visitorVisibleProject`), qui l'exige. Une lecture par les
 * clés primaires de "user" et de `profile`.
 */
export const authorCardForVisitor = async (
  db: Reader,
  userId: string,
  publicApiUrl: string,
): Promise<PublicAuthor | null> => {
  if (!MemberId.safeParse(userId).success) return null
  const [row] = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      avatarKey: schema.profile.avatarKey,
      publicPage: sql<boolean>`${publicPageOpen()}`,
    })
    .from(schema.user)
    .leftJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
    .where(and(eq(schema.user.id, userId), eq(schema.user.emailVerified, true)))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    avatarUrl: avatarUrlOf(publicApiUrl, row.avatarKey),
    publicPage: row.publicPage === true,
  }
}
