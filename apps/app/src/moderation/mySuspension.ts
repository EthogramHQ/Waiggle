// La suspension du membre connecté, lue dans son profil (GET /v1/me, `Me.suspension`, tranche 7c).
// Les écrans des projets s'en servent pour retirer ce qu'un compte suspendu ne peut plus faire
// (publier, modifier, commenter, réagir, suivre) ; l'API le refuse de toute façon (403 `suspended`).
//
// Une lecture locale, provisoire : `useSuspension()` de `moderation/suspension.ts` (le bandeau) dit
// la même chose ; à l'assemblage, les écrans passent à celui-là et ce fichier disparaît. D'ici là,
// les deux lisent la même entrée du cache (`['me']`) : une seule requête.
import type { Suspension } from '@ruche/contracts'
import { useMe } from '../profile/hooks'

/**
 * La suspension en cours du membre connecté, ou null (pas suspendu, ou profil pas encore lu).
 * Tant que le profil n'est pas là, rien n'est retiré : l'écran s'affiche tout de suite, et un geste
 * tenté pendant ce court instant serait refusé par l'API.
 * `retryOnMount: false` : un profil en panne n'est pas relu à chaque écran qui apparaît (la boucle
 * décrite dans TopNav).
 */
export const useMySuspension = (): Suspension | null =>
  useMe(true, { retryOnMount: false }).data?.suspension ?? null
