// L'enveloppe qui fait défiler la photo d'un projet moins vite que la page (R17, scénario « La photo
// d'un projet qui défile moins vite ») : posée par PhotoGallery autour de ses seules photos (ni les
// points, ni « 1 sur 3 », ni les boutons de verre), à l'intérieur du cadre qui rogne. Quand la page
// monte, la photo descend dans son cadre de 45 % du défilement (ui/coverParallax.ts) : elle monte
// donc moins vite que le texte, et la feuille de la page, posée après elle, passe par-dessus. Tirée
// plus haut que le haut (iOS), elle s'agrandit depuis son bas, sans laisser de vide sous elle.
//
// Deux vues :
// - la vue extérieure porte la place (`style`) et se mesure : elle ne bouge jamais, sa mesure dit
//   donc où commence le décalage (`visibleStart`), même quand la photo est déjà décalée ;
// - la vue intérieure, de Reanimated, porte le décalage. `useAnimatedStyle` calcule son style à
//   partir de valeurs partagées (`offset`, le défilement de l'écran, et `start`) : sur téléphone,
//   ce calcul tourne sur le fil des animations à chaque image, sans redessiner React.
//
// Pourquoi « ParallaxCover » et pas « CoverParallax » : la fonction pure s'appelle déjà
// coverParallax.ts, et Windows et macOS ne distinguent pas les majuscules dans les noms de fichiers ;
// `import './CoverParallax'` y chargeait la fonction pure à la place du composant.
//
// Hors d'un Screen (le catalogue sans canal, un test d'un composant seul), rien ne défile : la photo
// reste à sa place. Sous « Réduire les animations », aucune transformation n'est posée (la photo
// défile avec la page, comme avant R17).
import { type ReactNode, useCallback, useContext, useEffect, useRef } from 'react'
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { coverParallax, scrolledPast, visibleStart } from './coverParallax'
import { ScreenScrollContext } from './scrollLight'
import { useCalmMotion } from './theme/motion'

type Props = {
  children: ReactNode
  /** La place de l'enveloppe (dans PhotoGallery : tout le cadre de la photo). */
  style?: StyleProp<ViewStyle>
}

export function ParallaxCover({ children, style }: Props) {
  const scroll = useContext(ScreenScrollContext)
  const offset = scroll?.offset
  const calm = useCalmMotion()
  const moving = offset !== undefined && !calm
  const frame = useRef<View>(null)
  // Le défilement à partir duquel la photo se décale (voir `visibleStart`) ; 0 tant que rien n'est
  // mesuré (pré-rendu, tests).
  const start = useSharedValue(0)
  // Vrai quand la mise en page a changé depuis la dernière mesure : le prochain défilement remesure
  // (pendant l'arrivée depuis une carte, la photo vole encore au moment de sa mise en page).
  const stale = useRef(true)

  const measure = useCallback(() => {
    const node = frame.current
    if (!node || !scroll || !offset) return
    stale.current = false
    node.measureInWindow((_x, y) => {
      start.value = visibleStart(y, offset.value, scroll.coveredTop.current ?? 0)
    })
  }, [scroll, offset, start])

  // useEffect : s'abonne aux défilements de l'écran tant que la photo bouge, et se désabonne au
  // démontage (ou sous « Réduire les animations »).
  useEffect(() => {
    if (!moving || !scroll) return
    return scroll.subscribe(() => {
      if (stale.current) measure()
    })
  }, [moving, scroll, measure])

  // Le style de la photo, recalculé à chaque changement du défilement. « worklet » implicite : la
  // fonction donnée à useAnimatedStyle tourne aussi sur le fil des animations.
  const shifted = useAnimatedStyle(() => {
    const shift = coverParallax(scrolledPast(offset ? offset.value : 0, start.value), calm)
    return { transform: [{ translateY: shift.translateY }, { scale: shift.scale }] }
  })

  return (
    <View
      ref={frame}
      style={style}
      onLayout={() => {
        stale.current = true
        if (moving) measure()
      }}
    >
      <Animated.View style={moving ? [styles.photo, styles.fromBottom, shifted] : styles.photo}>
        {children}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  photo: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  // L'agrandissement part du bas : tirée vers le bas, la photo grandit vers le haut et sur les
  // côtés, et son bas reste collé à la feuille de la page.
  fromBottom: { transformOrigin: 'bottom' },
})
