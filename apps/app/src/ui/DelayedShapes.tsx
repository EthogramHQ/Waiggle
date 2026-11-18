// Des formes vides qui attendent, comme `Loading`, avant de se montrer (R16, « Quand on le voit » :
// « si la page arrive en moins de 160 ms, aucun squelette ne s'affiche »), mais sans rien dire aux
// lecteurs d'écran : ni rôle, ni nom. Pour les formes qu'une page pose **hors** de son seul
// « Chargement… » :
// - l'en-tête d'un membre ouvert depuis une carte : son vrai nom et sa vraie photo se lisent tout de
//   suite, hors du `Loading` ; ses formes vides (pseudo, bio, outils, bouton) attendent avec lui ;
// - les colonnes de la seconde rangée de la page d'un projet, sur ordinateur, que le `Loading`
//   posé à côté de la galerie ne peut pas envelopper.
// Montées en même temps que le `Loading` de la page, elles se montrent au même instant que lui.
import { durations } from '@ruche/brand'
import { type ReactNode, useContext, useEffect, useState } from 'react'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { LoadingShownContext } from './Skeleton'
import { useHydrated } from './theme/hydration'
import { fade } from './theme/motion'

/** Caché aux lecteurs d'écran pendant l'attente, sur le web comme sur iOS et Android (`Loading`). */
const hiddenFromReaders = {
  'aria-hidden': true,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const

/**
 * Pose la place de ses formes tout de suite (rien ne saute), invisibles pendant 160 ms
 * (`durations.quick`), puis les montre en fondu (180 ms). La page web pré-rendue ne peut rien
 * attendre : là, elles sont montrées d'emblée, comme `Loading`. Une fois montrées, elles le disent
 * à la zone qui les entoure (`Reveal`), qui fondra alors vers son contenu.
 *
 * Elles s'étirent sur la largeur de leur parent (`alignSelf: 'stretch'`) : une forme en pourcentage
 * garde ainsi la largeur qu'elle avait sans elles, et une forme centrée reste centrée.
 */
export function DelayedShapes({ children }: { children: ReactNode }): ReactNode {
  const hydrated = useHydrated()
  // useState(() => …) : décidé une seule fois, au montage (l'hydratation qui suit ne change rien).
  const [atOnce] = useState(() => !hydrated)
  const [visible, setVisible] = useState(atOnce)
  const opacity = useSharedValue(atOnce ? 1 : 0)
  const onShown = useContext(LoadingShownContext)
  useEffect(() => {
    if (visible) return
    const timer = setTimeout(() => {
      setVisible(true)
      opacity.value = fade(1, 'page')
    }, durations.quick)
    return () => clearTimeout(timer)
  }, [visible, opacity])
  useEffect(() => {
    if (visible) onShown?.()
  }, [visible, onShown])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View
      {...(visible ? null : hiddenFromReaders)}
      style={[{ alignSelf: 'stretch' }, style]}
    >
      {children}
    </Animated.View>
  )
}
