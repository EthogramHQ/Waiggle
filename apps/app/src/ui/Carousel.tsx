// Un carrousel : une bande horizontale de cartes qui défile sous le doigt et s'arrête toujours sur
// une carte (« aimantée »). Refonte, tranche R3 : « Ils cherchent des testeurs » et « Outils
// populaires » d'Explorer. C'est une région nommée (« Projets qui cherchent des testeurs ») ; sur
// ordinateur, deux flèches nommées font défiler la bande d'une page ; au clavier, Tab rejoint
// chaque carte, et le navigateur fait défiler la bande jusqu'à elle.
// Il ne bouge jamais seul (relecture juridique de R3, jur-J7 : un carrousel qui défile seul attire
// l'œil malgré soi) : ni minuteur, ni défilement au montage ; seulement le doigt, une flèche, Tab.
// Il ressemble à Thumbnails, l'autre ScrollView horizontal de l'appli.
import { space } from '@ruche/brand'
import { Children, isValidElement, type ReactNode, useCallback, useRef, useState } from 'react'
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  View,
  type ViewStyle,
} from 'react-native'
import { IconButton } from './IconButton'
import { useLayout } from './theme/layout'
import { useCalmMotion } from './theme/motion'

type Props = {
  /** Le nom de la région, lu par les lecteurs d'écran (« Projets qui cherchent des testeurs »). */
  label: string
  /** Le nom de la flèche de gauche, sur ordinateur (« Projets précédents »). */
  previousLabel: string
  /** Le nom de la flèche de droite (« Projets suivants »). */
  nextLabel: string
  /** Les cartes, chacune avec sa `key`. */
  children: ReactNode
  /**
   * Ce qui se pose à gauche des flèches, sur la même ligne : le titre de la section (et un lien
   * « Tous les outils »). Sans lui, les flèches se rangent seules à droite, au-dessus de la bande.
   */
  header?: ReactNode
  /** cards : des cartes, bien espacées ; chips : des étiquettes, serrées comme une ligne de texte. */
  variant?: 'cards' | 'chips'
  /**
   * Sur téléphone, la bande va jusqu'aux bords de l'écran : la carte coupée au bord montre qu'on
   * peut faire défiler. À ne donner que si le carrousel est posé dans la colonne de l'écran (ses
   * marges sont celles de `useLayout`).
   */
  bleed?: boolean
}

/** Les styles du web que les types de React Native ne connaissent pas (aimantation CSS). */
const webOnly = (style: Record<string, string | number>): ViewStyle =>
  (Platform.OS === 'web' ? style : {}) as unknown as ViewStyle

export function Carousel({
  label,
  previousLabel,
  nextLabel,
  children,
  header,
  variant = 'cards',
  bleed = false,
}: Props) {
  const { sizeClass, padding } = useLayout()
  const calm = useCalmMotion()
  const scroller = useRef<ScrollView>(null)
  // Les flèches : sur ordinateur et petite fenêtre, où l'on n'a souvent qu'une souris. Sur
  // téléphone, le doigt suffit, et la place manque.
  const arrows = sizeClass !== 'compact'

  // Le débord : la bande sort un peu de sa colonne, et ses cartes y rentrent d'autant (marge
  // négative, puis même marge à l'intérieur). Au moins quelques points, pour que l'anneau du
  // clavier de la première carte ne soit pas rogné ; jusqu'au bord de l'écran avec `bleed`.
  const edge = bleed && sizeClass === 'compact' ? padding : space.xs
  const gap = variant === 'chips' ? space.sm : sizeClass === 'compact' ? space.md : space.xxl

  // Ce qu'on a mesuré : la largeur visible, celle de tout le contenu, la position de chaque carte,
  // et l'endroit où la bande est arrêtée. Des `ref`, lus seulement au moment d'une flèche ; seuls
  // les débuts et fins de bande, qui changent l'allure des flèches, passent par un état.
  const viewport = useRef(0)
  const content = useRef(0)
  const x = useRef(0)
  const items = useRef<{ x: number; width: number }[]>([])
  // Les positions où la bande s'arrête (téléphone : snapToOffsets). Sur le web, c'est le CSS
  // (scroll-snap) qui aimante, d'après chaque carte.
  const [offsets, setOffsets] = useState<number[]>([])
  const [ends, setEnds] = useState({ start: true, end: false, fits: false })

  const cards = Children.toArray(children)

  // Après chaque mesure ou chaque arrêt : la bande est-elle au début, au bout, ou tient-elle
  // entière ? Tant que rien n'est mesuré (premier rendu, tests), les deux flèches restent actives.
  const updateEnds = useCallback(() => {
    const measured = viewport.current > 0 && content.current > 0
    const next = {
      start: x.current <= 1,
      end: measured && x.current + viewport.current >= content.current - 1,
      fits: measured && content.current <= viewport.current + 1,
    }
    setEnds((prev) =>
      prev.start === next.start && prev.end === next.end && prev.fits === next.fits ? prev : next,
    )
  }, [])

  const measureItem = (index: number) => (event: LayoutChangeEvent) => {
    const { x: left, width } = event.nativeEvent.layout
    items.current[index] = { x: left, width }
    items.current.length = cards.length
    // Une carte s'arrête au bord de la page : son début, moins le débord.
    const next = items.current.filter(Boolean).map((item) => Math.max(0, item.x - edge))
    next.sort((a, b) => a - b)
    setOffsets((prev) =>
      prev.length === next.length && prev.every((value, i) => value === next[i]) ? prev : next,
    )
  }

  // Une flèche fait défiler d'une page : la première carte coupée à droite devient la première
  // visible (ou, vers la gauche, la bande recule d'autant). La position finale tombe sur une carte.
  const page = (direction: 1 | -1) => {
    const width = viewport.current - 2 * edge
    const starts = items.current.filter(Boolean).map((item) => ({
      at: Math.max(0, item.x - edge),
      right: item.x + item.width,
    }))
    let target: number
    if (direction === 1) {
      const cut = starts.find((item) => item.right > x.current + viewport.current - edge + 1)
      target = cut ? cut.at : x.current + width
    } else {
      const back = starts.filter(
        (item) => item.at < x.current - 1 && item.at >= x.current - width - 1,
      )
      target = back.length > 0 ? Math.min(...back.map((item) => item.at)) : x.current - width
    }
    const max = Math.max(0, content.current - viewport.current)
    target = Math.max(0, content.current > 0 ? Math.min(target, max) : target)
    // « Réduire les animations » : la bande saute à sa place, sans glisser.
    scroller.current?.scrollTo({ x: target, animated: !calm })
  }

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    x.current = event.nativeEvent.contentOffset.x
    updateEnds()
  }

  const showArrows = arrows && !ends.fits
  const top =
    header || showArrows ? (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: header ? 'space-between' : 'flex-end',
          gap: space.md,
        }}
      >
        {/* Le titre peut passer à la ligne (texte agrandi) sans pousser les flèches hors de l'écran. */}
        {header ? <View style={{ flexShrink: 1 }}>{header}</View> : null}
        {showArrows ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <IconButton
              icon="caret-left"
              label={previousLabel}
              disabled={ends.start}
              onPress={() => page(-1)}
            />
            <IconButton
              icon="caret-right"
              label={nextLabel}
              disabled={ends.end}
              onPress={() => page(1)}
            />
          </View>
        ) : null}
      </View>
    ) : null

  return (
    // Une région nommée : un lecteur d'écran peut y sauter et l'entend par son nom. Elle n'est pas
    // « accessible » (elle cacherait ses cartes à VoiceOver, qui en ferait un seul bloc).
    <View role="region" aria-label={label} style={{ gap: space.md }}>
      {top}
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        // L'aimantation sur téléphone : les positions mesurées des cartes, et un élan court, pour
        // que la bande s'arrête vite sur la suivante.
        snapToOffsets={offsets}
        decelerationRate="fast"
        onScroll={onScroll}
        // Une position lue au plus toutes les 16 ms (une image) pendant le défilement.
        scrollEventThrottle={16}
        onLayout={(event) => {
          viewport.current = event.nativeEvent.layout.width
          updateEnds()
        }}
        onContentSizeChange={(width) => {
          content.current = width
          updateEnds()
        }}
        style={[
          { marginHorizontal: -edge },
          // L'aimantation sur le web : le navigateur arrête la bande au début d'une carte, à
          // `edge` du bord (scroll-padding), y compris quand Tab y amène une carte cachée.
          webOnly({ scrollSnapType: 'x mandatory', scrollPaddingInline: edge }),
        ]}
        contentContainerStyle={{
          gap,
          paddingHorizontal: edge,
          // De l'air au-dessus et au-dessous : la bande rogne ce qui dépasse (anneau du clavier).
          paddingVertical: space.xs,
          alignItems: 'flex-start',
        }}
      >
        {cards.map((card, index) => (
          <View
            key={isValidElement(card) ? card.key : index}
            onLayout={measureItem(index)}
            style={webOnly({ scrollSnapAlign: 'start' })}
          >
            {card}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
