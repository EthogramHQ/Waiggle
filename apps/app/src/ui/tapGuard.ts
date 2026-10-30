// La garde contre la double tape, commune aux couches qui s'ouvrent sous le doigt (Dialog depuis la
// tranche 7b, Sheet depuis R2) : la couche paraît souvent là où l'on vient de toucher (« Bloquer »
// d'un menu, « Modifier » d'une rubrique), et la seconde tape d'une double tape tombait sur sa
// confirmation, ou sur le voile qui la refermait aussitôt.
import { useEffect, useState } from 'react'

/**
 * Le temps, après l'ouverture, pendant lequel une couche gardée ignore les tapes (décision du
 * 25/10/2026) : la seconde tape d'une double tape arrive vers 150 à 250 ms ; une tape vers 700 ms
 * est un geste à part, qui passe.
 */
export const TAP_GUARD_MS = 600

/**
 * Hook : vrai quand la couche peut recevoir une tape. Sans garde, toujours ; avec, à partir de
 * TAP_GUARD_MS après chaque ouverture (la garde repart à la réouverture).
 */
export function useTapsAllowed(visible: boolean, guarded: boolean) {
  const [allowed, setAllowed] = useState(false)
  // useEffect : un minuteur posé à l'ouverture, et retiré si la couche se ferme avant (ou si le
  // composant quitte l'écran), pour ne pas changer l'état d'une couche déjà fermée.
  useEffect(() => {
    if (!visible || !guarded) {
      setAllowed(false)
      return
    }
    const timer = setTimeout(() => setAllowed(true), TAP_GUARD_MS)
    return () => clearTimeout(timer)
  }, [visible, guarded])
  return !guarded || allowed
}
