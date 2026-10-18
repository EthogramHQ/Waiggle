// Le mouvement de l'appli, réglé par les jetons de @ruche/brand. Les animations utilisent
// Reanimated : elles tournent sur un fil séparé de l'appareil, donc restent fluides même quand
// l'appli travaille (chargement, calcul).
import { durations, type SpringName, springs } from '@ruche/brand'
import { useReducedMotion, withSpring, withTiming } from 'react-native-reanimated'

/**
 * Hook : faut-il remplacer les grands déplacements par des fondus ? Vrai seulement si la personne a
 * activé « Réduire les animations » dans les réglages de son appareil. Les petits mouvements
 * (appui sur un bouton) et la lumière d'ambiance restent, comme prévu dans le scénario.
 */
export const useCalmMotion = (): boolean => useReducedMotion()

/** Anime une valeur vers `to` avec un ressort de la marque (« honey » par défaut). */
export const spring = (to: number, name: SpringName = 'honey') => {
  'worklet' // cette fonction peut tourner sur le fil des animations
  return withSpring(to, springs[name])
}

/** Anime une valeur vers `to` en un temps fixe (fondus). */
export const fade = (to: number, duration: keyof typeof durations = 'base') => {
  'worklet'
  return withTiming(to, { duration: durations[duration] })
}
