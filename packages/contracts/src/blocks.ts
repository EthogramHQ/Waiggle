// Bloquer un membre (tranche 7b). Quand Malik bloque Inès, ils ne voient plus les contenus l'un de
// l'autre et ne peuvent plus interagir ; Inès n'est pas prévenue. Le blocage joue dans les deux
// sens, mais seule la personne qui a bloqué le voit (sa liste « Membres bloqués », et l'en-tête de
// la page d'Inès). Un blocage ne sert qu'à cacher : ni compteur, ni signal pour la modération.
import { z } from 'zod'
import { FeedCursor } from './feed'

/** Au plus 100 blocages, et 100 déblocages, par membre et par jour (anti-abus). */
export const BLOCKS_PER_DAY = 100
export const UNBLOCKS_PER_DAY = 100
/** La liste « Membres bloqués » se lit 50 par 50. */
export const BLOCKS_PAGE_SIZE = 50

/**
 * Un membre que j'ai bloqué (GET /v1/me/blocks) : ce qu'il faut pour le reconnaître et le
 * débloquer. `.strict()` : aucun autre champ ne peut s'y glisser (ni bio, ni projets).
 */
export const BlockedMember = z
  .object({
    member: z
      .object({
        id: z.string(),
        name: z.string(),
        handle: z.string(),
        avatarUrl: z.url().nullable(),
      })
      .strict(),
    blockedAt: z.iso.datetime(),
  })
  .strict()
  .meta({ id: 'BlockedMember' })
export type BlockedMember = z.infer<typeof BlockedMember>

/** Les membres que j'ai bloqués, du plus récent au plus ancien. */
export const BlockedPage = z
  .object({
    items: z.array(BlockedMember).max(BLOCKS_PAGE_SIZE),
    nextCursor: FeedCursor.nullable(),
  })
  .meta({ id: 'BlockedPage' })
export type BlockedPage = z.infer<typeof BlockedPage>

/** Les paramètres d'adresse de la liste : sans curseur, la première page. */
export const BlocksQuery = z.object({ cursor: FeedCursor.optional() })
export type BlocksQuery = z.infer<typeof BlocksQuery>

/**
 * Un blocage dans l'export des données : ceux que le membre a posés, jamais ceux qui le visent. Le
 * pseudo est celui du moment de l'export (null si le membre bloqué n'en a pas).
 */
export const BlockExport = z.object({
  memberId: z.string(),
  handle: z.string().nullable(),
  blockedAt: z.iso.datetime(),
})
export type BlockExport = z.infer<typeof BlockExport>
