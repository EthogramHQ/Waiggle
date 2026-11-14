// « Remplacer » une partie retirée par la modération (R9, relecture de sécurité P5) : quand l'auteur
// écrit une nouvelle valeur dans la MÊME partie (une autre description, d'autres outils, une
// autre photo de profil), la marque du retrait en cours s'efface (sa ligne `content_part_removal`)
// et la nouvelle valeur se montre. Toute autre écriture la laisse : changer le titre ne rend pas la
// description, ajouter ou réordonner des photos ne rend pas la photo retirée. La décision, elle,
// reste dans l'historique et l'export. Une photo n'a rien ici : la supprimer efface sa ligne de
// retrait par la base (cascade) ; « Remplacer » une photo, c'est en ajouter une puis la supprimer.
//
// Écrire une valeur VIDE n'est pas remplacer : la colonne d'une partie retirée est déjà vide, et un
// formulaire qui renvoie tous les champs y renverrait ce vide ; la marque reste (et le
// rétablissement peut encore remettre l'ancienne valeur).
//
// Chaque requête cherche par l'auteur (index content_part_removal_author_idx) : ses retraits en
// cours sont peu nombreux, puis le contenu et le champ filtrent ces quelques lignes.
import type { ReportPartField } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, inArray } from 'drizzle-orm'

const cpr = schema.contentPartRemoval

/** Une écriture de projet, telle que PATCH /v1/projects/:id la reçoit (les champs qui comptent). */
type ProjectWrite = {
  description?: string | undefined
  demoUrl?: string | null | undefined
  prompts?: readonly string[] | undefined
  tools?: readonly string[] | undefined
}

/** Les parties d'un projet que cette écriture remplace par une valeur non vide. */
export const replacedProjectParts = (write: ProjectWrite): ReportPartField[] => [
  ...(write.description ? ['description' as const] : []),
  ...(write.demoUrl ? ['demoUrl' as const] : []),
  ...(write.prompts && write.prompts.length > 0 ? ['prompt' as const] : []),
  ...(write.tools && write.tools.length > 0 ? ['tools' as const] : []),
]

/** Les parties d'un profil que cette écriture remplace par une valeur non vide. */
export const replacedProfileParts = (write: {
  bio?: string | undefined
  favoriteTools?: readonly string[] | undefined
}): ReportPartField[] => [
  ...(write.bio ? ['bio' as const] : []),
  ...(write.favoriteTools && write.favoriteTools.length > 0 ? ['favoriteTools' as const] : []),
]

/** Efface les marques de ces parties du projet de cet auteur. Rien à faire sans partie. */
export const dropProjectPartRemovals = async (
  tx: Database,
  authorId: string,
  projectId: string,
  fields: ReportPartField[],
) => {
  if (fields.length === 0) return
  await tx
    .delete(cpr)
    .where(
      and(eq(cpr.authorId, authorId), eq(cpr.projectId, projectId), inArray(cpr.field, fields)),
    )
}

/** Efface les marques de ces parties de son profil (bio, outils favoris). */
export const dropProfilePartRemovals = async (
  tx: Database,
  userId: string,
  fields: ReportPartField[],
) => {
  if (fields.length === 0) return
  await tx
    .delete(cpr)
    .where(and(eq(cpr.authorId, userId), eq(cpr.objectKind, 'member'), inArray(cpr.field, fields)))
}

/** Efface la marque de la description retirée de cette photo (une nouvelle description l'a remplacée). */
export const dropPhotoDescriptionRemoval = async (
  tx: Database,
  authorId: string,
  mediaId: string,
) => {
  await tx
    .delete(cpr)
    .where(
      and(
        eq(cpr.authorId, authorId),
        eq(cpr.projectMediaId, mediaId),
        eq(cpr.field, 'photoDescription'),
      ),
    )
}

/**
 * La photo de profil retirée quitte le profil (remplacée par une autre, ou supprimée) : sa ligne de
 * retrait s'efface, et l'on rend la vraie clé du fichier gardé (`withheld/…` n'est qu'un nom
 * d'adresse : le fichier lui-même est rangé sous son ancienne clé, dans `hidden_value`), pour que
 * l'appelant l'efface du stockage après la transaction. `key` : la clé qui était au profil ; une
 * clé ordinaire est rendue telle quelle.
 */
export const releaseAvatarKey = async (
  tx: Database,
  userId: string,
  key: string,
): Promise<string | null> => {
  if (!key.startsWith('withheld/')) return key
  const [row] = await tx
    .delete(cpr)
    .where(and(eq(cpr.authorId, userId), eq(cpr.objectKind, 'member'), eq(cpr.field, 'avatar')))
    .returning({ hidden: cpr.hiddenValue })
  const hidden = row?.hidden
  return hidden && 'storageKey' in hidden ? hidden.storageKey : null
}
