// Le fondu d'un squelette vers son contenu, dans une page (R16, « Quand on le voit » : « quand le
// contenu arrive, le squelette fond vers lui, environ 180 ms, au lieu d'être échangé d'un coup »).
// `ScreenFade` fait entrer une page entière ; `Reveal` joue dans une page, zone par zone.
//
// Les règles (plan R16, choix 9) :
// - le fondu dure 180 ms (`durations.page`) et reste sous « Réduire les animations » : un fondu
//   n'est pas un déplacement (règle du projet ; `fade()` le garde) ;
// - un contenu arrivé avant que le squelette se montre (160 ms, voir `Loading`) s'affiche d'un coup :
//   rien n'a été vu, rien ne fond ;
// - l'arbre du contenu ne change pas à la fin du fondu : ce qu'on y a tapé et le focus restent ;
// - dès que le contenu arrive, le squelette qui s'efface n'est plus lu (plus de « Chargement… ») ni
//   touchable : posé par-dessus le contenu le temps du fondu, il laisse passer les touchers.
import { durations } from '@ruche/brand'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { LoadingShownContext } from './Skeleton'
import { fade } from './theme/motion'

/**
 * Caché aux lecteurs d'écran (web : `aria-hidden` ; iOS et Android : leurs deux réglages) et aux
 * touchers (`pointerEvents` dans le style, comme le veut react-native-web).
 */
const leaving = {
  'aria-hidden': true,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const

export function Reveal({
  loading,
  skeleton,
  children,
}: {
  /** Vrai tant que le contenu n'est pas arrivé. */
  loading: boolean
  /** Le squelette de la zone (un `Loading` et ses pièces). */
  skeleton: ReactNode
  /** Le contenu, posé seulement une fois arrivé (`loading` faux). */
  children?: ReactNode
}): ReactNode {
  // Le squelette s'est-il montré ? `Loading` le dit par le contexte, au bout de ses 160 ms.
  const [seen, setSeen] = useState(false)
  const markSeen = useCallback(() => setSeen(true), [])
  // Le fondu fini : le squelette peut partir de l'arbre.
  const [faded, setFaded] = useState(false)
  // Le squelette reste pendant l'attente, puis le temps de son fondu s'il a été vu.
  const withSkeleton = loading || (seen && !faded)

  // useSharedValue : une valeur que Reanimated anime sur le fil des animations, sans redessiner
  // React à chaque image. L'opacité du contenu, puis celle du squelette.
  const contentOpacity = useSharedValue(1)
  const skeletonOpacity = useSharedValue(1)

  // Le squelette se montre pendant l'attente : la zone du contenu (encore vide) passe à 0, prête à
  // fondre. Un contenu arrivé avant reste donc à 1, d'un coup.
  useEffect(() => {
    if (seen && loading) contentOpacity.value = 0
  }, [seen, loading, contentOpacity])

  useEffect(() => {
    if (loading) {
      setFaded(false)
      skeletonOpacity.value = 1
      return
    }
    if (!seen) return
    contentOpacity.value = fade(1, 'page')
    skeletonOpacity.value = fade(0, 'page')
    // Le fondu fini, le squelette quitte l'arbre (un minuteur de React : la fin d'une animation de
    // Reanimated arrive sur un autre fil).
    const timer = setTimeout(() => setFaded(true), durations.page)
    return () => clearTimeout(timer)
  }, [loading, seen, contentOpacity, skeletonOpacity])

  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }))
  const skeletonStyle = useAnimatedStyle(() => ({ opacity: skeletonOpacity.value }))

  return (
    <View>
      {/* Le contenu d'abord, toujours à la même place dans l'arbre : quand le squelette s'en va
          après lui, il n'est jamais remonté. */}
      <Animated.View style={contentStyle}>{loading ? null : children}</Animated.View>
      {withSkeleton ? (
        <Animated.View
          {...(loading ? null : leaving)}
          style={[
            // Pendant l'attente, il tient la place de la zone ; pendant le fondu, il se pose
            // par-dessus le contenu, sans prendre aucun toucher.
            loading
              ? null
              : { position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none' },
            skeletonStyle,
          ]}
        >
          <LoadingShownContext.Provider value={markSeen}>{skeleton}</LoadingShownContext.Provider>
        </Animated.View>
      ) : null}
    </View>
  )
}
