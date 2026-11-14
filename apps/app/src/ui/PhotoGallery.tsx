// La galerie de photos d'un projet (R5a, F-Pr6, F-Pr7 ; planches `R5a-Projet` et
// `R5a-Projet-Desktop`). Les photos glissent l'une après l'autre sous le doigt et s'arrêtent
// toujours sur une photo entière (« aimantées ») ; des points et « 1 sur 3 » disent où l'on en est
// (rien pour une seule photo). Sur téléphone, avec `bleed`, la galerie va d'un bord à l'autre de
// l'écran et monte sous la barre d'état ; sur ordinateur, ses coins sont arrondis, et deux flèches
// de verre et les flèches du clavier (quand le focus est dans la galerie) passent d'une photo à
// l'autre.
//
// Pour le lecteur d'écran, la galerie est un élément « réglable », comme un curseur : il l'entend
// « Photos du projet, Photo 2 sur 3 », et passe d'une photo à l'autre sans glisser (balayer vers le
// haut ou le bas sur iOS, les flèches sur le web). `onIndexChange` prévient la page de la photo
// montrée : elle en donne la couleur à la lumière d'ambiance (`Screen thumbhash`). Depuis R6a, une
// photo décrite par son auteur est lue par sa description, avec sa place (« Le ciel de ce soir,
// photo 1 sur 3 ») ; « 1 sur 3 » reste affiché à côté pour l'œil. Depuis R9, une photo peut porter
// une marque (`mark`, « Retiré par la modération ») : écrite au milieu de la photo, dite après sa place.
//
// `overlay` : une couche posée sur la galerie, pour les boutons de verre (`CoverControls`) et ce qui
// se pose à cheval sur son bas (`CoverStraddle`, la capsule sur ordinateur), tous deux dans
// ProjectCover.tsx : l'écran ne donne aucune position. Dans un `CoverArrival` (la carte du fil qui
// devient la page), seule la photo vole ; cette couche, les flèches et les points arrivent en fondu
// (`CoverDecor`).
//
// Elle reprend de `Carousel` (Explorer) l'aimant, les flèches qui s'éteignent au bout, le focus
// passé à l'autre flèche, et le calme : elle ne bouge jamais seule, et « Réduire les animations » la
// fait sauter d'une photo à l'autre sans glisser.
import { layout, radii, space } from '@ruche/brand'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CoverDecor } from './coverTransition'
import { focusWithoutScroll } from './focus'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import type { ImageSource } from './image'
import {
  COVER_OVERLAP,
  type CoverPlace,
  CoverPlaceProvider,
  type CoverShape,
  ProjectCover,
} from './ProjectCover'
import { Surface } from './Surface'
import { Text } from './Text'
import { insetFocus } from './theme/document'
import { useLayout } from './theme/layout'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/** Une photo de la galerie : sa clé (l'identifiant du visuel), son adresse et son résumé flou. */
export type GalleryPhoto = {
  key: string
  /** L'adresse de la photo ; absente un instant (session pas prête) : le résumé flou s'affiche. */
  source: ImageSource | null
  /** Le résumé flou (ThumbHash), affiché le temps que la photo arrive. */
  thumbhash?: string | null
  /**
   * R6a : la description écrite par l'auteur (`ProjectVisual.description`), lue par les lecteurs
   * d'écran à la place de « Photo 1 sur 3 ». Du texte brut, lu tel quel : jamais du Markdown, ni un
   * texte à remplir (sec-M3). Absente, null ou vide : la photo n'est pas décrite.
   */
  description?: string | null
  /**
   * R9 : une marque écrite sur la photo, au milieu, dans une pastille de verre avec un bouclier
   * (« Retiré par la modération », que seul l'auteur voit encore). Le lecteur d'écran l'entend
   * après la place de la photo. Absente ou null : la photo n'est pas marquée.
   */
  mark?: string | null
}

type Props = {
  photos: GalleryPhoto[]
  /** La photo montrée a changé (doigt, flèche, clavier, lecteur d'écran) : son rang, depuis 0. */
  onIndexChange?: (index: number) => void
  /** Ce qui se pose sur la galerie : `CoverControls`, `CoverStraddle` (ProjectCover.tsx). */
  overlay?: ReactNode
  /** Sans photo : le titre écrit sur la lumière miel (la couverture d'aujourd'hui). */
  title?: string
  /**
   * La hauteur des photos (jetons `layout.cover`, ou en points). Par défaut : `hero` sur ordinateur,
   * `medium` sur tablette, `band` sur téléphone.
   */
  height?: number | CoverShape
  /**
   * Sur téléphone : la galerie va jusqu'aux bords de l'écran et monte sous la barre d'état, et son
   * bas est laissé à la feuille qui la chevauche (`CoverSheet`). À donner seulement quand la
   * galerie ouvre l'écran (elle reprend les marges de `Screen`). Sans effet sur ordinateur.
   */
  bleed?: boolean
  /**
   * R7a : le nom lu de la galerie ; par défaut « Photos du projet ». La page projet en montre deux
   * (celle du projet et celle de sa dernière mise à jour) : la seconde se nomme « Photos de la mise
   * à jour », sinon le lecteur d'écran entendrait deux fois le même nom.
   */
  label?: string
}

/** Les styles du web que les types de React Native ne connaissent pas (aimantation CSS). */
const webOnly = (style: Record<string, string | number>): ViewStyle =>
  (Platform.OS === 'web' ? style : {}) as unknown as ViewStyle

/** Un délai au bout duquel un saut demandé (flèche, clavier) est tenu pour fini, même sans fin lue. */
const JUMP_MAX = 1000

/** La taille des points : le point de la photo montrée s'allonge. */
const DOT = space.sm - space.xxs
const DOT_ACTIVE = space.lg

type KeyEvent = { key: string; preventDefault: () => void }

/** La description d'une photo, si elle en a une (des blancs seuls ne décrivent rien). */
const describedBy = (photo: GalleryPhoto | undefined): string | null =>
  photo?.description?.trim() ? photo.description : null

/** La taille du bouclier de la marque d'une photo (R9) : celle d'une ligne de légende. */
const MARK_ICON = 16

export function PhotoGallery({
  photos,
  onIndexChange,
  overlay,
  title,
  height: shape,
  bleed = false,
  label: named,
}: Props) {
  const { t } = useTranslation()
  const { sizeClass, padding } = useLayout()
  const { colors, shadows } = useTheme()
  const insets = useSafeAreaInsets()
  const calm = useCalmMotion()
  const desktop = sizeClass !== 'compact'
  const edge = bleed && !desktop
  const count = photos.length
  const several = count > 1
  const arrows = desktop && several

  const [index, setIndex] = useState(0)
  // Le rang montré, lu sans attendre un nouveau rendu (deux flèches touchées vite à la suite).
  const current = useRef(0)
  // La largeur d'une photo, mesurée sur la bande ; 0 tant que rien n'est mesuré (pré-rendu, tests).
  const [slideWidth, setSlideWidth] = useState(0)
  const width = useRef(0)
  const scroller = useRef<ScrollView>(null)
  // Un saut demandé (flèche, clavier, lecteur d'écran) : la bande glisse vers ce rang, et les
  // positions lues en chemin ne changent pas la photo annoncée (sinon « 1 sur 3 » repasserait par
  // les photos sautées, et la lumière avec).
  const jumping = useRef<{ to: number; at: number } | null>(null)
  const previousArrow = useRef<View>(null)
  const nextArrow = useRef<View>(null)
  // La flèche qui doit recevoir le focus quand la galerie arrive à un bout (comme Carousel).
  const handoff = useRef<'previous' | 'next' | null>(null)
  // La moitié de ce qui dépasse sous la galerie (`CoverStraddle`) : la place réservée sous elle.
  const [straddle, setStraddle] = useState(0)

  // La hauteur par défaut suit la taille de l'écran : grande sur ordinateur, moyenne sur tablette
  // (le titre et « Tester la démo » restent dans le premier écran), bande sur téléphone.
  const base = shape ?? (sizeClass === 'wide' ? 'hero' : sizeClass === 'medium' ? 'medium' : 'band')
  const photoHeight = typeof base === 'number' ? base : layout.cover[base]
  // Bord à bord : la photo monte sous la barre d'état, et la feuille en recouvre le bas ; la part
  // visible garde la hauteur demandée.
  const frameHeight = edge ? photoHeight + insets.top + COVER_OVERLAP : photoHeight
  // Ce qui est posé en bas de la photo reste au-dessus de la feuille (téléphone) ou de la capsule
  // (ordinateur).
  const bottom = (edge ? COVER_OVERLAP : 0) + straddle + space.md

  /** Montre la photo `next` : annonce le rang, et fait glisser la bande si on le demande. */
  const show = (next: number, slide: boolean) => {
    const target = Math.max(0, Math.min(count - 1, next))
    if (target === current.current) return
    current.current = target
    setIndex(target)
    onIndexChange?.(target)
    if (slide && width.current > 0) {
      jumping.current = { to: target, at: Date.now() }
      // « Réduire les animations » : la bande saute à sa place, sans glisser.
      scroller.current?.scrollTo({ x: target * width.current, animated: !calm })
    }
  }

  /** Une photo de plus ou de moins (flèches, clavier, lecteur d'écran). */
  const step = (direction: 1 | -1) => {
    const target = current.current + direction
    show(target, true)
    // Au bout, la flèche touchée s'éteint, et le navigateur retire le focus d'un bouton inactif :
    // au clavier, il passe à l'autre flèche dès qu'elle est active (l'effet plus bas).
    const reached = direction === 1 ? target >= count - 1 : target <= 0
    const pressed = direction === 1 ? nextArrow.current : previousArrow.current
    if (reached && Platform.OS === 'web' && globalThis.document?.activeElement === pressed) {
      handoff.current = direction === 1 ? 'previous' : 'next'
    }
  }

  // useEffect : après le rendu où la galerie a atteint un bout, l'autre flèche est redevenue
  // active ; le focus y passe, sans faire défiler la page.
  useEffect(() => {
    if (handoff.current === 'previous' && index > 0) {
      focusWithoutScroll(previousArrow.current)
      handoff.current = null
    } else if (handoff.current === 'next' && index < count - 1) {
      focusWithoutScroll(nextArrow.current)
      handoff.current = null
    }
  }, [index, count])

  // La position de la bande dit la photo montrée (le doigt, ou l'aimant du navigateur).
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent
    const seen = layoutMeasurement.width || width.current
    if (seen <= 0) return
    const at = Math.round(contentOffset.x / seen)
    const jump = jumping.current
    if (jump) {
      // Le saut est fini quand la bande est arrivée, ou après un délai (fin jamais lue).
      if (at !== jump.to && Date.now() - jump.at < JUMP_MAX) return
      jumping.current = null
    }
    show(at, false)
  }

  const onLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width
    if (measured === width.current) return
    width.current = measured
    setSlideWidth(measured)
    // La fenêtre a changé de largeur : la bande reste sur la même photo, sans glisser.
    if (current.current > 0) {
      scroller.current?.scrollTo({ x: current.current * measured, animated: false })
    }
  }

  // Les flèches du clavier, sur le web, seulement quand le focus est dans la galerie (onKeyDown sur
  // elle, jamais un écouteur sur toute la page : ces touches servent aussi à lire et à défiler).
  const keys =
    Platform.OS === 'web' && several
      ? {
          onKeyDown: (event: KeyEvent) => {
            const moves: Record<string, number> = {
              ArrowRight: current.current + 1,
              ArrowLeft: current.current - 1,
              Home: 0,
              End: count - 1,
            }
            const target = moves[event.key]
            if (target === undefined) return
            // La page ne défile pas de côté en même temps.
            event.preventDefault()
            show(target, true)
          },
        }
      : {}

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') step(1)
    else if (event.nativeEvent.actionName === 'decrement') step(-1)
  }

  // La place que la couche `overlay` partage avec ce qu'on y pose (ProjectCover.tsx). Mémorisée :
  // une valeur neuve à chaque rendu ferait remesurer la capsule sans fin.
  const place = useMemo<CoverPlace>(
    () => ({ top: edge ? insets.top : 0, reserve: setStraddle }),
    [edge, insets.top],
  )

  /** Le nom d'une photo, suivi de sa marque si elle en a une (« Photo 2 sur 3. Retiré par… »). */
  const withMark = (name: string, photo: GalleryPhoto | undefined) =>
    photo?.mark ? t(($) => $.gallery.marked, { photo: name, mark: photo.mark }) : name

  /**
   * Ce que le lecteur d'écran dit de la photo de rang `rank` : sa description et sa place
   * (« Le ciel de ce soir, photo 1 sur 3 », ui-M2), ou « Photo 2 sur 3 » sans description. La
   * description passe en paramètre de `t` : i18next la recopie telle quelle, sans y chercher de
   * `{{…}}` ; et le nom lu n'est jamais du Markdown ni du HTML (des astérisques restent des
   * astérisques).
   */
  const spokenPhoto = (rank: number) => {
    const description = describedBy(photos[rank])
    const photo = description
      ? t(($) => $.gallery.photoDescribed, { description, index: rank + 1, count })
      : t(($) => $.gallery.photoOf, { index: rank + 1, count })
    return withMark(photo, photos[rank])
  }

  const label = named ?? t(($) => $.gallery.label)
  const valueText = spokenPhoto(index)
  // Une seule photo décrite : son nom est sa description (le texte de remplacement d'une image),
  // sans « photo 1 sur 1 » ; pas décrite, « Photos du projet » comme avant. Marquée, la marque suit.
  const single = count === 1 ? describedBy(photos[0]) : null
  const singleName = count === 1 ? withMark(single ?? label, photos[0]) : label
  // Ce que le lecteur d'écran entend : à plusieurs photos, un élément réglable et sa valeur ; à une
  // seule, une image nommée ; sans photo (la lumière miel), un décor, que la page titre déjà.
  const reader = several
    ? {
        accessible: true,
        accessibilityRole: 'adjustable' as const,
        accessibilityLabel: label,
        accessibilityValue: { min: 1, max: count, now: index + 1, text: valueText },
        accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
        onAccessibilityAction,
        // Sur le web : la valeur lue (react-native-web ne lit pas `accessibilityValue`), le focus
        // au clavier (Tab), et l'anneau dessiné à l'intérieur, le cadre rognant ce qui dépasse.
        ...(Platform.OS === 'web'
          ? {
              'aria-valuetext': valueText,
              'aria-valuenow': index + 1,
              'aria-valuemin': 1,
              'aria-valuemax': count,
              tabIndex: 0 as const,
              ...insetFocus,
            }
          : null),
        ...keys,
      }
    : count === 1
      ? {
          accessible: true,
          accessibilityRole: 'image' as const,
          accessibilityLabel: singleName,
        }
      : {
          accessibilityElementsHidden: true,
          importantForAccessibility: 'no-hide-descendants' as const,
        }

  const slide = slideWidth > 0 ? { width: slideWidth } : { width: '100%' as const }
  const slides =
    count === 0 ? (
      <View style={[slide, { height: frameHeight }]}>
        <ProjectCover title={title} height={frameHeight} radius="none" image={null} />
      </View>
    ) : (
      photos.map((photo, rank) => (
        <View
          key={photo.key}
          style={[slide, { height: frameHeight }, webOnly({ scrollSnapAlign: 'start' })]}
        >
          <ProjectCover
            height={frameHeight}
            radius="none"
            image={{
              source: photo.source,
              thumbhash: photo.thumbhash ?? null,
              // Le nom de chaque photo, comme la valeur de la galerie. Une photo seule décrite :
              // la galerie porte déjà sa description, l'image n'a pas de nom à elle (sinon le
              // navigateur expose aussi « …, photo 1 sur 1 », vu dans `--explore`).
              label: single ? '' : spokenPhoto(rank),
            }}
          />
          {photo.mark ? (
            // La marque, au milieu de la part visible de la photo (loin des boutons de verre posés
            // dans les coins, des points et de « 1 sur 3 ») ; elle glisse avec sa photo. Le nom de
            // la galerie la dit déjà au lecteur d'écran.
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: edge ? insets.top : 0,
                bottom,
                alignItems: 'center',
                justifyContent: 'center',
                padding: space.lg,
              }}
            >
              <Surface variant="glass" radius="pill" padding="xs" fill={false}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.xs,
                    paddingHorizontal: space.sm,
                    maxWidth: '100%',
                  }}
                >
                  {/* Une vue autour du dessin : sur le web, un dessin seul rétrécit près d'un texte. */}
                  <View style={{ flexShrink: 0 }}>
                    <Icon name="shield-warning" size={MARK_ICON} tone="danger" />
                  </View>
                  <View style={{ flexShrink: 1, minWidth: 0 }}>
                    <Text variant="caption" weight={600}>
                      {photo.mark}
                    </Text>
                  </View>
                </View>
              </Surface>
            </View>
          ) : null}
        </View>
      ))
    )

  return (
    <View
      style={{
        alignSelf: 'stretch',
        // La moitié de la capsule qui dépasse sous la galerie : rien de la page ne passe dessous.
        marginBottom: straddle,
        ...(edge ? { marginHorizontal: -padding, marginTop: -(insets.top + space.lg) } : null),
      }}
    >
      <View
        style={{
          height: frameHeight,
          borderRadius: edge ? 0 : radii.tile,
          overflow: 'hidden',
          backgroundColor: colors.honeySoft,
        }}
      >
        <View {...reader} style={StyleSheet.absoluteFill}>
          <ScrollView
            ref={scroller}
            horizontal
            // L'aimant : la bande s'arrête toujours sur une photo entière, une à la fois.
            pagingEnabled
            disableIntervalMomentum
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            onScrollBeginDrag={() => {
              // Le doigt reprend la main : un saut en cours n'a plus de sens.
              jumping.current = null
            }}
            onMomentumScrollEnd={onScroll}
            // Une position lue au plus toutes les 16 ms (une image) pendant le glissé.
            scrollEventThrottle={16}
            onLayout={onLayout}
            // Sur le web, la bande elle-même n'est pas un arrêt de Tab (Chrome rend focalisable une
            // zone qui défile) : la galerie l'est déjà.
            {...(Platform.OS === 'web' ? { tabIndex: -1 as const } : null)}
            style={[StyleSheet.absoluteFill, webOnly({ scrollSnapType: 'x mandatory' })]}
          >
            {slides}
          </ScrollView>
          {several ? (
            <CoverDecor>
              {/* Les points, au milieu en bas : un décor (le lecteur entend « Photo 2 sur 3 »). */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: bottom + space.sm,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: space.xs,
                }}
              >
                {photos.map((photo, rank) => (
                  <View
                    key={photo.key}
                    style={{
                      width: rank === index ? DOT_ACTIVE : DOT,
                      height: DOT,
                      borderRadius: radii.pill,
                      backgroundColor: colors.knob,
                      opacity: rank === index ? 1 : 0.55,
                      boxShadow: shadows.float,
                    }}
                  />
                ))}
              </View>
              {/* « 1 sur 3 » : en bas à droite sur téléphone, en haut à gauche sur ordinateur
                  (planches), dans une pastille de verre. */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  ...(desktop ? { top: space.lg, left: space.lg } : { bottom, right: space.lg }),
                }}
              >
                <Surface variant="glass" radius="pill" padding="xs" fill={false}>
                  <View style={{ paddingHorizontal: space.sm }}>
                    <Text variant="caption" weight={600}>
                      {t(($) => $.gallery.count, { index: index + 1, count })}
                    </Text>
                  </View>
                </Surface>
              </View>
            </CoverDecor>
          ) : null}
        </View>
        {arrows ? (
          <CoverDecor>
            {/* Les flèches de verre, au milieu des côtés ; elles s'éteignent au bout. */}
            <View
              pointerEvents="box-none"
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: space.lg,
              }}
            >
              <IconButton
                ref={previousArrow}
                icon="caret-left"
                label={t(($) => $.gallery.previous)}
                disabled={index === 0}
                onPress={() => step(-1)}
              />
              <IconButton
                ref={nextArrow}
                icon="caret-right"
                label={t(($) => $.gallery.next)}
                disabled={index === count - 1}
                onPress={() => step(1)}
              />
            </View>
          </CoverDecor>
        ) : null}
      </View>
      {overlay ? (
        // Hors du cadre qui rogne : ce qui est à cheval sur le bas (la capsule) dépasse en entier.
        <CoverPlaceProvider value={place}>
          <CoverDecor>{overlay}</CoverDecor>
        </CoverPlaceProvider>
      ) : null}
    </View>
  )
}
