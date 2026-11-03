// La place fixe du haut de l'écran (tranche RF, « La barre du haut reste en place ») : la barre de
// navigation de la tablette et de l'ordinateur (navigation/TopNav.tsx), et, dessous, la place
// `belowBar` (le bouton des nouveautés du Fil, une fois le titre passé sous la barre).
//
// Elle est posée **par-dessus** la zone qui défile, et non dedans : le contenu passe dessous, flouté
// par le verre de la capsule. Elle mesure sa hauteur et la rend à Screen (`onSpace`), qui la réserve
// en haut du contenu : rien n'est caché derrière elle au repos.
//
// Fixe, ou dans le flux ? (relecture du plan RF : ui-3, ui-10, jur-RF4, S4)
// - fixe seulement hors du miel, sur tablette et ordinateur (`sizeClass !== 'compact'`), et si la
//   barre prend au plus un quart de la hauteur de la fenêtre. Un téléphone couché, un texte à 200 %
//   ou le bandeau de suspension déplié la rendent plus haute : fixée, elle mangerait l'écran
//   (WCAG 1.4.10) ;
// - sinon, elle suit le contenu comme avant : elle remonte avec lui quand on fait défiler.
// Dans les deux cas, la barre reste **à la même place dans l'arbre** ; seul son style change (son
// décalage, le voile). Passer de l'un à l'autre ne remonte donc pas TopNav : le champ de recherche
// ou le bouton du bandeau gardent le focus (ui-10). Tout le `header` est fixé, la capsule et le
// bandeau de suspension ensemble, jamais la capsule seule (S4).
//
// Le voile (ui-9, S5) : autour de la capsule, le contenu qui monte passerait net au-dessus et à côté
// d'elle. Un dégradé de la couleur du fond, derrière la capsule, l'efface en douceur. Pas de masque
// ni de filtre sur la zone qui défile : posés sur un parent, ils empêchent les verres du contenu de
// flouter la lumière. Le dégradé est écrit en CSS (aucun `url(#…)` : la pile garde les pages
// quittées montées, et un dégradé SVG nommé pointerait vers celui d'une page cachée).
//
// Sur le web, le navigateur fait défiler un contrôle qui reçoit le focus (Tab, Maj+Tab) ou un lien
// vers un endroit de la page jusque sous cette place : Screen la donne à la zone qui défile
// (`scrollPaddingTop`, rendu par `onSpace`, jur-RF3).
import { layout, space } from '@ruche/brand'
import { type ReactNode, type Ref, useContext, useEffect, useRef, useState } from 'react'
import { type LayoutChangeEvent, Platform, StyleSheet, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScreenScrollContext } from './scrollLight'
import { useLayout } from './theme/layout'
import { useTheme } from './theme/ThemeProvider'

/** Ce que la place du haut rend à Screen, à chaque changement. */
export type TopBarSpace = {
  /** Vrai si la barre est fixée par-dessus la zone qui défile ; faux si elle suit le contenu. */
  pinned: boolean
  /**
   * La hauteur à réserver en haut du contenu, du bord de l'écran au bas de la barre (zone sûre du
   * téléphone et marge du haut comprises, `belowBar` non compris : il flotte sur le contenu). Le
   * contenu commence `space.xl` plus bas, l'écart d'avant entre la barre et le titre. 0 tant que la
   * barre n'est pas mesurée.
   */
  height: number
  /**
   * Sur le web, la marge du haut de la zone qui défile (`scrollPaddingTop`) : barre, `belowBar` et
   * bande du voile. 0 quand la barre suit le contenu (elle ne cache alors rien).
   */
  scrollPaddingTop: number
}

type Props = {
  /** La barre (le `header` de Screen : TopNav, la capsule et le bandeau de suspension). */
  children: ReactNode
  /**
   * Ce qui se pose sous la barre fixe (le bouton des nouveautés du Fil, R4 et RF ui-5), centré. Il
   * flotte sur le contenu : sa hauteur n'est pas réservée. Screen ne le donne que quand la barre est
   * fixe (`TopBarSpace.pinned`) ; sinon, il suivrait la barre et le contenu.
   */
  belowBar?: ReactNode
  /** La largeur maximale de la barre (celle de la page) ; la même partout par défaut. */
  width?: number
  /** Sur le miel, la barre n'est jamais fixe (elle se poserait hors de la feuille). */
  brand?: boolean
  /**
   * Reçoit la hauteur mesurée de la barre seule (`belowBar` non compris), quand elle change. Jamais
   * 0 : une page cachée mesure 0, et la dernière mesure non nulle reste (ui-6).
   */
  onHeight?: (height: number) => void
  /** Reçoit toute la place prise (voir TopBarSpace) quand elle change : fixe ou non, la marge web. */
  onSpace?: (space: TopBarSpace) => void
  /** La place de `belowBar`, pour Screen, qui y rend le focus quand l'élément y arrive (ui-5). */
  belowRef?: Ref<View>
}

/** La longueur du dégradé du voile, sous la barre (ou sous `belowBar`). */
const VEIL_FADE = space.xxl

/** La part de la hauteur de la fenêtre au-delà de laquelle la barre ne reste plus fixe. */
const MAX_PINNED_SHARE = 0.25

// La dernière place mesurée de la barre, pour une largeur de fenêtre (correction du 3/11) : sur le
// web, une page qui s'ouvre se dessinait d'abord avec la place d'une barre vide, puis descendait
// d'environ 63 points à la mesure. Une page neuve part de cette place ; sa propre mesure la
// corrige si la barre diffère. Une autre largeur ne la reprend pas : la barre peut s'y replier.
let remembered: { windowWidth: number; space: TopBarSpace } | null = null

/** La place de la barre déjà mesurée dans une fenêtre de cette largeur, sinon null. */
export const rememberedTopBarSpace = (windowWidth: number): TopBarSpace | null =>
  remembered && remembered.windowWidth === windowWidth ? remembered.space : null

/** Pour les tests : oublier la place mesurée. */
export const forgetTopBarSpace = () => {
  remembered = null
}

export function ScreenTopBar({
  children,
  belowBar,
  width = layout.maxContentWidth,
  brand = false,
  onHeight,
  onSpace,
  belowRef,
}: Props) {
  const { colors } = useTheme()
  const { padding, sizeClass, height: windowHeight, width: windowWidth } = useLayout()
  const insets = useSafeAreaInsets()

  // Les hauteurs mesurées : la dernière mesure non nulle (ui-6). Sur le web, une page quittée reste
  // montée, cachée (`display: none`), et mesure 0 : la garder ferait sauter le contenu à son retour.
  // Avant sa propre mesure, la barre d'une page neuve reprend la place déjà mesurée (plus haut).
  const [barHeight, setBarHeight] = useState(() =>
    brand ? 0 : (rememberedTopBarSpace(windowWidth)?.height ?? 0),
  )
  const [belowHeight, setBelowHeight] = useState(0)
  const keepHeight = (set: (height: number) => void) => (event: LayoutChangeEvent) => {
    const height = Math.ceil(event.nativeEvent.layout.height)
    if (height > 0) set(height)
  }

  // Fixe ? Avant la mesure (0), oui si la largeur le permet : la plupart des barres tiennent, et le
  // premier dessin ne bascule pas. Avant l'hydratation, `sizeClass` vaut « compact » : dans le flux,
  // comme la page pré-rendue.
  const pinned =
    !brand &&
    sizeClass !== 'compact' &&
    windowHeight > 0 &&
    barHeight <= windowHeight * MAX_PINNED_SHARE
  // Screen ne donne `belowBar` que quand il a lieu d'être (la barre fixe, le titre passé dessous).
  const showBelow = belowBar !== undefined && belowBar !== null && belowBar !== false
  const below = showBelow ? belowHeight : 0
  const scrollPaddingTop = pinned && barHeight > 0 ? barHeight + below + VEIL_FADE : 0

  // Rendre la place à Screen, seulement quand elle change (un rendu de Screen de plus sinon).
  const reported = useRef<TopBarSpace | null>(null)
  useEffect(() => {
    const next: TopBarSpace = { pinned, height: barHeight, scrollPaddingTop }
    const last = reported.current
    if (
      last &&
      last.pinned === next.pinned &&
      last.height === next.height &&
      last.scrollPaddingTop === next.scrollPaddingTop
    )
      return
    reported.current = next
    if (!brand && next.height > 0) remembered = { windowWidth, space: next }
    onSpace?.(next)
  }, [pinned, barHeight, scrollPaddingTop, onSpace, brand, windowWidth])

  // La hauteur de la barre seule, rendue à Screen quand elle change (jamais 0 : voir plus haut).
  useEffect(() => {
    if (barHeight > 0) onHeight?.(barHeight)
  }, [barHeight, onHeight])

  // Dans le flux, la barre remonte avec le contenu : son décalage suit le défilement de l'écran (le
  // canal de Screen, ui/scrollLight.ts). Le dernier défilement est toujours noté (`lastScroll`),
  // mais la bande n'est redessinée qu'en suivant le contenu : fixe, défiler ne lui coûte rien. Seule
  // la bande se redessine : la barre reçue (`children`) est le même élément, React ne la refait pas.
  const scroll = useContext(ScreenScrollContext)
  const lastScroll = useRef(0)
  const [follow, setFollow] = useState(0)
  const pinnedNow = useRef(pinned)
  pinnedNow.current = pinned
  useEffect(() => {
    if (!scroll) return
    return scroll.subscribe((event) => {
      lastScroll.current = Math.max(0, event.nativeEvent.contentOffset.y)
      if (!pinnedNow.current) setFollow(lastScroll.current)
    })
  }, [scroll])
  // En repassant dans le flux (barre grandie, fenêtre rétrécie), elle reprend la place du contenu.
  useEffect(() => {
    if (!pinned) setFollow(lastScroll.current)
  }, [pinned])
  const shift = pinned ? 0 : follow
  const shiftNow = useRef(shift)
  shiftNow.current = shift

  // Le focus dans la barre qui suit le contenu (correction après relecture, WCAG 2.4.11). Avant RF,
  // la barre était dans la zone qui défile : un contrôle qui y recevait le focus (Maj+Tab depuis le
  // contenu, Tab depuis la barre d'adresse) était ramené à l'écran par le navigateur. Posée hors de
  // cette zone et seulement décalée, elle reste au-dessus de la fenêtre : le navigateur ne sait pas
  // l'y ramener. La bande écoute donc le focus de ses enfants (il remonte jusqu'à elle, sur le web)
  // et, si le contrôle est sorti par le haut, fait redescendre la page juste assez pour qu'il
  // reparaisse, avec l'air de son anneau, d'un saut, comme le navigateur. Fixe, la barre ne quitte
  // jamais l'écran : rien à faire.
  const reveal = (event: { target?: unknown }) => {
    if (Platform.OS !== 'web' || pinnedNow.current || !scroll) return
    const target = event.target as { getBoundingClientRect?: () => { top: number } } | undefined
    const top = target?.getBoundingClientRect?.().top
    if (top === undefined || top >= 0) return
    scroll.jumpTo(Math.max(0, shiftNow.current + top - space.sm))
  }

  // Le voile : de la couleur du fond, presque plein en haut (au-dessus de la capsule), puis qui
  // s'efface jusqu'à rien, `VEIL_FADE` sous la barre (ou sous `belowBar`).
  const veilHeight = barHeight + below + VEIL_FADE
  const veilStyle: ViewStyle | null =
    pinned && barHeight > 0 ? veilGradient(colors.background, barHeight / veilHeight) : null

  return (
    // La bande : par-dessus la zone qui défile (`zIndex` : sur le web, toute vue est positionnée,
    // et la zone qui défile, venue après, se dessinerait dessus). Elle laisse passer les touchers à
    // côté de la capsule vers le contenu et la barre de défilement (`box-none`, ui-4).
    <View
      pointerEvents="box-none"
      onFocus={reveal}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1,
        // Dans le flux : remontée d'autant que le contenu a défilé.
        transform: [{ translateY: -shift }],
      }}
    >
      {veilStyle ? (
        <View
          pointerEvents="none"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            { position: 'absolute', top: 0, left: 0, right: 0, height: veilHeight },
            veilStyle,
          ]}
        />
      ) : null}
      {/* La barre, à la place qu'elle avait en tête du contenu : la marge du haut de l'écran (zone
          sûre comprise), les marges des côtés, la largeur de la page. */}
      <View
        pointerEvents="box-none"
        style={{
          paddingTop: insets.top + space.lg,
          paddingHorizontal: padding,
          alignItems: 'center',
        }}
      >
        <View pointerEvents="box-none" style={{ width: '100%', maxWidth: width }}>
          {children}
        </View>
        {/* La mesure, sur une vue vide qui épouse la barre : un `onLayout` posé sur la barre
            elle-même serait intercepté par une mesure de son contenu. */}
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          onLayout={keepHeight(setBarHeight)}
        />
      </View>
      {showBelow ? (
        <View
          pointerEvents="box-none"
          style={{ paddingTop: space.sm, paddingHorizontal: padding, alignItems: 'center' }}
        >
          <View ref={belowRef} pointerEvents="box-none" style={{ maxWidth: '100%' }}>
            {belowBar}
          </View>
          <View
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            onLayout={keepHeight(setBelowHeight)}
          />
        </View>
      ) : null}
    </View>
  )
}

// Les opacités du voile : presque plein tout en haut, léger au bas de la barre, puis rien. Au bas de
// la barre, 0,3 et non plus 0,55 (relecture de design RF, n° 5) : à 0,55, la rangée posée juste
// sous la barre (« Tester », un titre de carte) paraissait grisée, comme inactive.
const VEIL_TOP = 0.85
const VEIL_AT_BAR = 0.3

/** Une couleur `#RRGGBB` avec une opacité (`#RRGGBBAA`), comprise du web comme du téléphone. */
const withAlpha = (hex: string, alpha: number) =>
  `${hex.slice(0, 7)}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`

/**
 * Le style du voile : un dégradé vertical du fond, sans `url(#…)`. Sur le web, `backgroundImage`
 * (react-native-web le transmet au navigateur) ; sur téléphone, `experimental_backgroundImage` de
 * React Native. `barShare` : la part de la hauteur du voile prise par la barre.
 */
const veilGradient = (background: string, barShare: number): ViewStyle => {
  const at = Math.round(Math.min(Math.max(barShare, 0), 1) * 100)
  const gradient = `linear-gradient(to bottom, ${withAlpha(background, VEIL_TOP)} 0%, ${withAlpha(
    background,
    VEIL_AT_BAR,
  )} ${at}%, ${withAlpha(background, 0)} 100%)`
  return Platform.OS === 'web'
    ? ({ backgroundImage: gradient } as ViewStyle)
    : { experimental_backgroundImage: gradient }
}
