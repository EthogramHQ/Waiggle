// La place flottante de l'écran affiché (tranche R5a), partagée par un « contexte » React avec le
// fournisseur des toasts (ui/theme/toast.tsx). La page d'un projet pose sa capsule de réactions en
// bas de l'écran (`floating` de ui/Screen.tsx), là même où se pose un toast : le toast doit monter
// au-dessus d'elle, comme il monte au-dessus de la barre d'onglets (ui/tabBarSpace.ts).
//
// Le sens est inverse de celui de la barre : ici, c'est l'écran (plus bas dans l'arbre) qui
// renseigne le fournisseur (plus haut). Le fournisseur donne donc deux fonctions, et chaque écran
// « réserve » sa hauteur sous un jeton à lui, puis la « rend » quand sa place flottante disparaît,
// quand il n'est plus affiché (sur le web, la page quittée reste montée, cachée) ou quand il est
// démonté. Le fournisseur garde la plus haute des réserves en cours.
import { createContext, useContext, useEffect, useRef } from 'react'

export type FloatingSpace = {
  /**
   * Réserve, sous le jeton `owner`, la hauteur occupée en bas de l'écran : de son bord du bas au
   * haut de la place flottante, en points (le décalage de la place compris).
   */
  claim: (owner: object, top: number) => void
  /** Rend la réserve du jeton `owner` (sans effet s'il n'en a pas). */
  release: (owner: object) => void
}

/** Hors d'un fournisseur (un écran seul dans un test, le catalogue) : personne n'écoute. */
const nobody: FloatingSpace = { claim: () => {}, release: () => {} }

export const FloatingSpaceContext = createContext<FloatingSpace>(nobody)

/**
 * Hook (pour ui/Screen.tsx) : tient à jour la réserve de cet écran. `top` vaut 0 quand il n'a rien
 * à réserver (pas de place flottante, pas encore mesurée, ou écran caché) : la réserve est rendue.
 * Elle l'est aussi quand l'écran est démonté.
 */
export function useFloatingClaim(top: number): void {
  const { claim, release } = useContext(FloatingSpaceContext)
  // Le jeton de cet écran : un objet propre à lui, le même d'un rendu à l'autre.
  const owner = useRef({})
  useEffect(() => {
    const token = owner.current
    if (top > 0) claim(token, top)
    else release(token)
  }, [top, claim, release])
  useEffect(() => {
    const token = owner.current
    return () => release(token)
  }, [release])
}
