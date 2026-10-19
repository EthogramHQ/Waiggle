// Les réactions à un projet (tranche 5) : cinq façons de dire « j'aime », une par type (Bluffant,
// Inspirant, Utile, Drôle, Bravo). Un membre pose ou retire chacune d'elles sur le projet d'un autre ;
// tous les membres voient les nombres par type, jamais qui a réagi (comme pour les abonnés).
import { z } from 'zod'

/**
 * Les types de réaction, dans l'ordre d'affichage. Les noms sont en anglais dans le code et dans
 * les adresses (PUT /v1/projects/{id}/reactions/bravo) ; les libellés affichés viennent de
 * packages/i18n (« Bluffant », « Inspirant »…).
 */
export const REACTION_KINDS = ['amazing', 'inspiring', 'useful', 'funny', 'bravo'] as const

/** Un type de réaction : l'une des cinq valeurs ci-dessus, et rien d'autre. */
export const ReactionKind = z.enum(REACTION_KINDS)
export type ReactionKind = z.infer<typeof ReactionKind>

// Un nombre de réactions : un entier, jamais négatif.
const Count = z.int().nonnegative()

/** Le nombre de réactions par type. Chaque type est présent, même à zéro : l'appli n'a rien à deviner. */
export const ReactionCounts = z.object({
  amazing: Count,
  inspiring: Count,
  useful: Count,
  funny: Count,
  bravo: Count,
})
export type ReactionCounts = z.infer<typeof ReactionCounts>

/**
 * Les réactions d'un projet, telles que le membre qui regarde les voit : les nombres par type, et
 * les types qu'il a lui-même posés (`mine`, sans doublon ; vide pour l'auteur, qui ne réagit pas à
 * son propre projet). Fait partie de `Project`.
 */
export const ReactionState = z
  .object({
    counts: ReactionCounts,
    mine: z
      .array(ReactionKind)
      .max(REACTION_KINDS.length)
      .refine((kinds) => new Set(kinds).size === kinds.length, { message: 'duplicate reaction' }),
  })
  .meta({ id: 'ReactionState' })
export type ReactionState = z.infer<typeof ReactionState>

/** Aucune réaction : l'état d'un projet tout neuf (sert aux fixtures et aux tests). */
export const NO_REACTIONS: ReactionState = {
  counts: { amazing: 0, inspiring: 0, useful: 0, funny: 0, bravo: 0 },
  mine: [],
}
