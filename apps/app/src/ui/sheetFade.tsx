// Le fondu au bas de la zone qui défile d'une feuille (R7b, relecture de design, correction 15) :
// tant qu'il reste du contenu plus bas, le bas de la zone pâlit dans la couleur de la feuille. Sans
// lui, rien ne disait que « Ton retour » continuait sous le pied (à 1 280 × 720, 249 points cachés,
// et une barre de défilement de 0 point sur le web). Il sert à toutes les feuilles : « Ton retour »,
// « Nouvel appel », « Nouvelle mise à jour »…
import { space } from '@ruche/brand'
import { useCallback, useRef, useState } from 'react'
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  View,
  type ViewStyle,
} from 'react-native'
import { useTheme } from './theme/ThemeProvider'

/** La hauteur du fondu : celle d'une ligne de texte et demie, assez pour se voir sans rien cacher. */
const FADE_HEIGHT = space.xxxl

/** Ce qui peut rester sous le bas de la zone sans compter (les arrondis des mesures). */
const SLACK = 1

/**
 * Suit la zone qui défile : vrai (`more`) tant qu'une partie du contenu est cachée sous son bas.
 * Trois mesures : la hauteur de la zone (`onLayout`), celle du contenu (`onContentSizeChange`), et
 * le défilement (`onScroll`, qui redonne aussi les deux autres). L'état ne change que lorsque la
 * réponse change : défiler ne redessine pas la feuille à chaque image.
 */
export const useBelowFold = () => {
  const zone = useRef({ viewport: 0, content: 0, offset: 0 })
  const [more, setMore] = useState(false)
  const decide = useCallback(() => {
    const { viewport, content, offset } = zone.current
    // Hauteur de la zone pas encore connue : rien à dire (la feuille vient de s'ouvrir).
    setMore(viewport > 0 && content - offset - viewport > SLACK)
  }, [])
  return {
    more,
    onLayout: useCallback(
      ({ nativeEvent }: LayoutChangeEvent) => {
        zone.current.viewport = nativeEvent.layout.height
        decide()
      },
      [decide],
    ),
    onContentSizeChange: useCallback(
      (_width: number, height: number) => {
        zone.current.content = height
        decide()
      },
      [decide],
    ),
    onScroll: useCallback(
      ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = nativeEvent
        zone.current.offset = contentOffset.y
        if (contentSize?.height) zone.current.content = contentSize.height
        if (layoutMeasurement?.height) zone.current.viewport = layoutMeasurement.height
        decide()
      },
      [decide],
    ),
  }
}

/**
 * Le fondu lui-même, posé juste après la zone qui défile : une marge négative de sa hauteur le
 * remonte sur le bas de la zone sans rien déplacer (il ne prend aucune place). Il ne prend aucune
 * tape (`pointerEvents="none"` : le doigt, la souris et la molette passent à ce qui est dessous)
 * et n'est pas lu : il ne dit rien qu'on ne puisse atteindre en défilant. Il part au bout du
 * contenu : la dernière ligne se lit sans voile.
 */
export function SheetFade() {
  const { colors, scheme } = useTheme()
  // La couleur de la feuille, de jour comme de nuit (`Surface variant="sheet"`) : opaque de jour ;
  // de nuit, un verre presque opaque sur la surface, dont `surface` est la teinte pleine.
  const sheet = scheme === 'day' ? colors.sheet : colors.surface
  // Un dégradé vertical, sans `url(#…)` (comme le voile de ScreenTopBar) : `backgroundImage` sur
  // le web, `experimental_backgroundImage` sur téléphone. Le transparent est la même couleur à
  // l'opacité nulle (« #RRGGBB00 ») : pas de gris au milieu du dégradé.
  const gradient = `linear-gradient(to bottom, ${sheet.slice(0, 7)}00 0%, ${sheet} 100%)`
  const look: ViewStyle =
    Platform.OS === 'web'
      ? ({ backgroundImage: gradient } as ViewStyle)
      : { experimental_backgroundImage: gradient }
  return (
    <View
      testID="sheet-fade"
      pointerEvents="none"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height: FADE_HEIGHT,
        marginTop: -FADE_HEIGHT,
        alignSelf: 'stretch',
        flexShrink: 0,
        ...look,
      }}
    />
  )
}
