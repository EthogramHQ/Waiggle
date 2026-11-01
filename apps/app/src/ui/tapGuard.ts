// La garde contre la double tape, commune aux couches qui s'ouvrent sous le doigt (Dialog depuis la
// tranche 7b, Sheet depuis R2) : la couche paraît souvent là où l'on vient de toucher (« Bloquer »
// d'un menu, « Modifier » d'une rubrique), et la seconde tape d'une double tape tombait sur sa
// confirmation, ou sur le voile qui la refermait aussitôt.
import { useEffect, useRef, useState } from 'react'

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

/**
 * Hook : la garde contre la double tape (TAP_GUARD_MS, la même que les fenêtres), commune aux liens
 * d'une carte (R3 dans `TesterCard`, partagée en R4 par la carte du fil, `SuggestionRow` et
 * `TesterRow`). Une page s'ouvre sous le doigt, et la seconde tape l'ouvrirait une deuxième fois
 * (deux pages empilées, deux « Retour ») ; partagée, elle empêche aussi la seconde tape d'un
 * « Tester » de tomber, à côté, sur le lien de la carte. Un `ref` plutôt qu'un état : la seconde
 * tape arrive avant que React ait redessiné, et doit déjà trouver la garde levée.
 */
export function useTapGuard() {
  const guarded = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Le minuteur s'arrête si la carte quitte l'écran avant la fin de la garde.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  return (action: () => void) => () => {
    if (guarded.current) return
    guarded.current = true
    timer.current = setTimeout(() => {
      guarded.current = false
    }, TAP_GUARD_MS)
    action()
  }
}
