// Le passage de niveau vu à l'arrivée sur une page de la récolte (« Ma récolte » et le panneau de
// sa propre page), partagé pour que les deux écrans le gardent de la même façon.
import type { Harvest } from '@ruche/contracts'
import { useRef, useState } from 'react'
import { useGameSettings } from './api'

/** Le niveau d'avant la dernière visite et le niveau atteint. */
export type LevelRise = { from: number; level: number }

/**
 * Hook : le passage de niveau (`levelSeen < level`) vu quand la récolte arrive.
 *
 * - `risen` est figé pour toute la visite : l'écriture du niveau vu change `levelSeen` dans le
 *   cache, mais « Nouveau » doit rester jusqu'à la visite suivante (option a10), pas partir une
 *   seconde après l'arrivée. `null` sans passage ; `null` aussi tant que la récolte n'est pas là.
 * - `markSeen` écrit le niveau vu (PATCH /v1/me/game) une seule fois par visite, même si
 *   l'alvéole prévient deux fois à la fin de son mouvement.
 *
 * Changer un état pendant le rendu est permis par React pour suivre une donnée qui arrive : il
 * rejoue le rendu aussitôt, sans image intermédiaire.
 */
export function useLevelRise(harvest: Harvest | undefined): {
  risen: LevelRise | null
  markSeen: () => void
} {
  const settings = useGameSettings()
  // `undefined` : la récolte n'est pas encore là ; `null` : elle est là, sans passage.
  const [risen, setRisen] = useState<LevelRise | null | undefined>(undefined)
  if (harvest && risen === undefined)
    setRisen(
      harvest.levelSeen < harvest.level ? { from: harvest.levelSeen, level: harvest.level } : null,
    )
  const marked = useRef(false)
  const markSeen = () => {
    if (!risen || marked.current) return
    marked.current = true
    settings.mutate({ levelSeen: risen.level })
  }
  return { risen: risen ?? null, markSeen }
}
