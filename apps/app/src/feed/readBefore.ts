// La date avant laquelle le fil est « déjà lu », pour poser « Tu es à jour » (R4, F-Fil5). Un
// fichier à part, sans requête : les tests des écrans remplacent feed/api.ts par de faux hooks, et
// ce hook-ci doit rester le vrai.
import type { FollowingFeedPage } from '@ruche/contracts'
import { useState } from 'react'

/** Encore inconnue : la première page n'est pas arrivée. */
type Unknown = { known: false }
/** Connue et gardée : la date lue sur la première page (null : le fil n'a jamais été lu). */
type Known = { known: true; at: string | null }

/**
 * Hook : `lastReadAt` de la **première** page du fil « Abonnements », figé pour toute la visite.
 *
 * - `undefined` tant que la première page n'est pas là ;
 * - ensuite, la date lue sur cette page (ou null), qui ne bouge plus tant que l'écran reste monté.
 *
 * Pourquoi figée : l'appli marque le fil lu dès qu'il s'affiche (`useMarkFeedRead`). Une relecture
 * du fil (le bouton des nouveautés) rapporterait alors la date tout juste écrite, et « Tu es à
 * jour » sauterait en haut, sous les yeux du membre, sans geste de sa part.
 *
 * Seule la première page porte la bonne date : les suivantes sont lues plus tard, après la marque.
 */
export const useReadBefore = (
  firstPage: Pick<FollowingFeedPage, 'lastReadAt'> | undefined,
): string | null | undefined => {
  // useState garde la valeur d'un rendu à l'autre. On la remplit au premier rendu où la page est
  // là, pendant le rendu même (React l'accepte pour un état qui ne dépend que des props, et
  // redessine aussitôt) : aucun rendu intermédiaire sans la sphère.
  const [kept, setKept] = useState<Unknown | Known>({ known: false })
  if (!kept.known && firstPage) {
    const next: Known = { known: true, at: firstPage.lastReadAt }
    setKept(next)
    return next.at
  }
  return kept.known ? kept.at : undefined
}
