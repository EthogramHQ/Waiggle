// La place collée de Screen (tranche R10 : les pastilles des ruches du Fil, F-Fil13). Ce que l'écran
// y pose (`Screen sticky`) commence en tête du contenu, puis, sur téléphone, reste collé en haut de
// l'écran pendant que le contenu défile dessous : la barre du haut, elle, suit le contenu et s'en va.
// Sur ordinateur et tablette, où la barre du haut reste fixe, la place reste simplement en tête du
// contenu et défile avec lui (plan R10, « API au contrat »).
//
// Comment elle colle :
// - sur le web, par le CSS `position: sticky` : le navigateur la garde en haut de la zone qui
//   défile. Elle est un enfant direct du contenu de la zone qui défile (Screen la pose ainsi), sinon
//   elle ne collerait que le temps de traverser son parent ;
// - sur iOS et Android, par `stickyHeaderIndices` de la zone qui défile, que Screen lui donne.
// Ce choix ne change que des styles : la place et son contenu restent au même endroit de l'arbre,
// collés ou non, et une pastille qui a le focus le garde (comme ui/ScreenTopBar.tsx).
//
// Une fois collée, le contenu qui passe dessous serait net à côté du verre des pastilles : un voile
// de la couleur du fond, celui de la barre du haut (`veilGradient`), l'efface en douceur. Il
// n'apparaît que collé : au repos, la place est posée sur la lumière, sans bande.
import { space } from '@ruche/brand'
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { type LayoutChangeEvent, Platform, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScreenFade } from './ScreenFade'
import { VEIL_FADE, veilGradient } from './ScreenTopBar'
import { ScreenScrollContext } from './scrollLight'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  children: ReactNode
  /** Vrai : la place colle en haut de l'écran pendant le défilement ; faux : elle suit le contenu. */
  stick: boolean
  /** La largeur maximale du contenu de l'écran (la place est centrée, comme lui). */
  maxWidth: number
  /** Les marges des côtés de l'écran : le voile les couvre aussi, d'un bord à l'autre. */
  bleed: number
  /** Le fondu des pages (ui/ScreenFade.tsx) : la place apparaît avec le reste du contenu. */
  fade: boolean
  /** Sa hauteur mesurée, rendue à Screen (qui ne colle pas une place trop haute, et la réserve). */
  onHeight: (height: number) => void
}

export function ScreenSticky({ children, stick, maxWidth, bleed, fade, onHeight }: Props) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const scroll = useContext(ScreenScrollContext)
  // La hauteur de la place, et sa position au repos dans le contenu (mesurée quand elle n'est pas
  // collée : collée, le navigateur la déplace, et sa mesure dirait la position du moment).
  const [height, setHeight] = useState(0)
  const restY = useRef<number | null>(null)
  // Collée en ce moment ? Le contenu a défilé au-delà de sa position de repos.
  const [stuck, setStuck] = useState(false)
  const stuckNow = useRef(false)
  stuckNow.current = stuck
  // Sur iOS et Android, la place collée commence sous l'encoche et l'heure (sa marge du haut, prise
  // sur l'écart au-dessus d'elle au repos) ; sur le web, la zone sûre vaut 0.
  const safeTop = Platform.OS === 'web' ? 0 : insets.top

  useEffect(() => {
    if (!stick || !scroll) {
      setStuck(false)
      return
    }
    return scroll.subscribe((event) => {
      const at = restY.current
      // setState à la même valeur ne redessine rien : un appel par image reste léger.
      setStuck(at !== null && event.nativeEvent.contentOffset.y > at)
    })
  }, [stick, scroll])

  const onLayout = (event: LayoutChangeEvent) => {
    const layout = event.nativeEvent.layout
    if (!stuckNow.current) restY.current = layout.y
    setHeight(layout.height)
    onHeight(layout.height)
  }

  // Collée : sur le web, le CSS (react-native-web transmet `sticky`, que les types de React Native
  // ignorent) ; au-dessus du contenu qui défile dessous (`zIndex`).
  const stickStyle: ViewStyle | null =
    stick && Platform.OS === 'web'
      ? ({ position: 'sticky', top: 0, zIndex: 2 } as unknown as ViewStyle)
      : stick
        ? { zIndex: 2, paddingTop: safeTop, marginTop: -safeTop }
        : null
  const veilHeight = height + VEIL_FADE
  const showVeil = stick && stuck && height > 0

  return (
    // `box-none` : à côté des pastilles, le toucher passe au contenu.
    <View
      pointerEvents="box-none"
      onLayout={onLayout}
      style={[{ width: '100%', maxWidth, alignItems: 'stretch' }, stickStyle]}
    >
      {showVeil ? (
        <View
          pointerEvents="none"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            {
              position: 'absolute',
              // Le voile part du haut de l'écran (au-dessus de la place quand l'encoche la pousse)
              // et couvre les marges des côtés.
              top: -space.sm,
              left: -bleed,
              right: -bleed,
              height: veilHeight + space.sm,
            },
            veilGradient(colors.background, height / veilHeight),
          ]}
        />
      ) : null}
      <ScreenFade fade={fade}>{children}</ScreenFade>
    </View>
  )
}
