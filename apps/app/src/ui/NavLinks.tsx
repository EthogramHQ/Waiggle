// Les liens de la barre du haut sur ordinateur (refonte, tranche R3) : Fil, Explorer, Ruches (et
// Modération pour un administrateur). Le lien de la page ouverte est posé dans sa « goutte » : une
// pastille blanche en relief sur le verre de la barre (planches R3-*-Desktop).
//
// Depuis RF (« La barre du haut reste en place »), la goutte glisse d'une page à l'autre, comme
// celle de la barre d'onglets du téléphone (TabBar). Mais ici, chaque page a sa propre barre (une
// par écran, posée par Screen) : la goutte de la nouvelle page ne sait pas où était l'ancienne. Le
// module garde donc le cadre de la dernière goutte affichée (`lastDrop`) ; quand une page **devient
// affichée** (`useScreenShownCount`, ui/screenFocus.ts : à l'arrivée, et au retour sur une page
// restée montée), sa goutte part de ce cadre et glisse jusqu'à son lien (ressort `honey`). Pas au
// montage : une page montée cachée, ou qui finit de charger, ne doit rien faire glisser (ui-7). Les
// pages cachées mesurent 0 (`display: none`) : ces mesures sont ignorées. Avec « Réduire les
// animations », la goutte se pose directement sous le lien, comme avant.
//
// Avant la mesure (la page pré-rendue, le premier dessin), le lien actif porte lui-même la goutte :
// elle est là dès le HTML, sans attendre le navigateur.
//
// Pour les lecteurs d'écran, comme SettingsNav et TabBar :
// - une région de navigation nommée (`navigation`), sans `accessible` : sur iOS, `accessible`
//   regrouperait les liens en un seul bloc, et VoiceOver ne les atteindrait plus un par un ;
// - un lien par entrée, avec sa vraie adresse (`href`) : sur le web, react-native-web en fait un
//   `<a>`, que le navigateur sait ouvrir dans un nouvel onglet, et qu'Entrée active ;
// - le lien de la page ouverte dit « page actuelle » (`aria-current`, web) et « sélectionné »
//   (`accessibilityState`, VoiceOver et TalkBack, qui ignorent `aria-current`).
//
// Le composant ne navigue pas lui-même : il dit quel lien a été touché (`onPress`), et
// navigation/TopNav.tsx choisit la page. Ce fichier exporte aussi la photo « Moi » de la barre,
// un lien du même genre (adresse réelle, page actuelle).
import { borders, layout, radii, space, springs } from '@ruche/brand'
import { useEffect, useRef, useState } from 'react'
import { type LayoutChangeEvent, Platform, Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { Avatar } from './Avatar'
import type { ImageSource } from './image'
import type { PressEvent } from './ListGroup'
import { linkProps } from './SettingsNav'
import { useScreenFocused, useScreenShownCount } from './screenFocus'
import { Text } from './Text'
import { TAP_GUARD_MS } from './tapGuard'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/** Le cadre d'un lien dans la rangée des liens (position et taille, en points). */
type Frame = { x: number; y: number; width: number; height: number }

/**
 * Le cadre de la dernière goutte affichée, gardé dans le module : la goutte de la page suivante en
 * part (voir en tête du fichier). `null` au début de la visite, ou après une page sans lien actif
 * (un projet) : la goutte suivante apparaît alors directement.
 */
let lastDrop: Frame | null = null

/** Pour les tests et le catalogue : oublie la goutte de la page précédente. */
export const forgetNavDrop = () => {
  lastDrop = null
}

const sameFrame = (a: Frame, b: Frame) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/** Un lien de la barre : sa clé (stable), son libellé et son adresse. */
export type NavLinkEntry<K extends string> = { key: K; label: string; href: string }

type Props<K extends string> = {
  /** Le nom de la région, lu par les lecteurs d'écran (« Navigation principale »). */
  label: string
  links: readonly NavLinkEntry<K>[]
  /** La clé du lien de la page ouverte ; `null` sur une page qui n'est d'aucun lien. */
  active: K | null
  /** Un lien a été touché (jamais celui de la page ouverte, ni deux fois de suite). */
  onPress: (key: K) => void
}

export function NavLinks<K extends string>({ label, links, active, onPress }: Props<K>) {
  const { colors, shadows } = useTheme()
  // La garde contre la double tape : le dernier lien touché, et quand. La seconde tape d'une double
  // tape arrive avant que la page ait changé ; sans garde, la même page s'ouvrait deux fois (deux
  // `push`, et « Retour » ramenait sur elle-même). Même délai que les fenêtres (tapGuard.ts).
  const lastTap = useRef<{ key: K; at: number } | null>(null)

  // La goutte qui glisse (voir en tête du fichier). Le cadre mesuré de chaque lien, dans la rangée.
  const [frames, setFrames] = useState<Partial<Record<K, Frame>>>({})
  const measure = (key: K) => (event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout
    // Une page cachée mesure 0 : on garde la dernière vraie mesure.
    if (width <= 0 || height <= 0) return
    const frame = { x, y, width, height }
    setFrames((old) => {
      const known = old[key]
      return known && sameFrame(known, frame) ? old : { ...old, [key]: frame }
    })
  }
  const target = active === null ? undefined : frames[active]
  const focused = useScreenFocused()
  const shown = useScreenShownCount()
  const calm = useCalmMotion()

  // La goutte, en « valeurs partagées » de Reanimated (elles s'animent hors du fil de React). Au
  // montage, elle est déjà là où était celle de la page précédente : à l'arrivée, elle en part.
  const start = useRef(lastDrop).current
  const x = useSharedValue(start?.x ?? 0)
  const y = useSharedValue(start?.y ?? 0)
  const width = useSharedValue(start?.width ?? 0)
  const height = useSharedValue(start?.height ?? 0)
  const restX = useSharedValue(start?.x ?? 0)
  const restY = useSharedValue(start?.y ?? 0)
  // La goutte posée (dessinée à part) ; avant, c'est le lien actif qui la porte.
  const [placed, setPlaced] = useState(start !== null && active !== null)
  // La dernière arrivée traitée (le nombre d'affichages de la page et le lien actif).
  const handled = useRef<{ shown: number; active: K | null } | null>(null)

  const frameX = target?.x
  const frameY = target?.y
  const frameWidth = target?.width
  const frameHeight = target?.height
  useEffect(() => {
    // Une page cachée ne bouge pas sa goutte et ne touche pas au module : seule la page affichée
    // dit où est la goutte.
    if (!focused) {
      // Cachée, elle oublie sa dernière arrivée : son retour en sera une, qu'elle glisse.
      handled.current = null
      return
    }
    if (active === null) {
      // Une page sans lien actif (un projet) : la goutte suivante apparaîtra directement.
      lastDrop = null
      return
    }
    if (
      frameX === undefined ||
      frameY === undefined ||
      frameWidth === undefined ||
      frameHeight === undefined
    )
      return
    const frame = { x: frameX, y: frameY, width: frameWidth, height: frameHeight }
    // Une arrivée : la page vient de devenir affichée (le premier rendu affiché, un retour, ou un
    // nouvel affichage compté par `useScreenShownCount`), ou son lien actif a changé. Sinon (fenêtre
    // redimensionnée, texte agrandi), la goutte suit sans glisser.
    const last = handled.current
    const arriving = last === null || last.shown !== shown || last.active !== active
    handled.current = { shown, active }
    const from = lastDrop
    lastDrop = frame
    setPlaced(true)
    // La place où la goutte se pose : tout de suite (le mouvement est porté par le cadre autour).
    restX.value = frame.x
    restY.value = frame.y
    if (arriving && from && !calm && !sameFrame(from, frame)) {
      // Elle part de la goutte de la page précédente et glisse jusqu'à son lien.
      x.value = from.x
      y.value = from.y
      width.value = from.width
      height.value = from.height
      x.value = withSpring(frame.x, springs.honey)
      y.value = withSpring(frame.y, springs.honey)
      width.value = withSpring(frame.width, springs.honey)
      height.value = withSpring(frame.height, springs.honey)
      return
    }
    x.value = frame.x
    y.value = frame.y
    width.value = frame.width
    height.value = frame.height
  }, [
    focused,
    active,
    shown,
    calm,
    frameX,
    frameY,
    frameWidth,
    frameHeight,
    x,
    y,
    width,
    height,
    restX,
    restY,
  ])

  // Deux couches : la goutte elle-même est posée à sa place d'arrivée (`restX`, `restY`), et le
  // cadre autour d'elle porte l'écart qui reste à parcourir (la position animée moins l'arrivée,
  // qui tend vers 0). Ce qu'on voit est la position animée ; ce que la goutte dit de sa place est
  // celle où elle va, même pendant le glissement.
  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - restX.value }, { translateY: y.value - restY.value }],
  }))
  const dropStyle = useAnimatedStyle(() => ({
    width: width.value,
    height: height.value,
    transform: [{ translateX: restX.value }, { translateY: restY.value }],
  }))

  const press = (entry: NavLinkEntry<K>) => (event?: PressEvent) => {
    // Sur le web, le `<a>` ne recharge pas la page : c'est le routeur qui en change.
    if (Platform.OS === 'web') event?.preventDefault?.()
    // Déjà sur cette page : rien à empiler une seconde fois.
    if (entry.key === active) return
    const now = Date.now()
    const previous = lastTap.current
    lastTap.current = { key: entry.key, at: now }
    if (previous && previous.key === entry.key && now - previous.at < TAP_GUARD_MS) return
    onPress(entry.key)
  }

  return (
    <View
      role="navigation"
      aria-label={label}
      // À texte agrandi, les liens passent à la ligne plutôt que de sortir de la barre : sur le
      // web, une vue ne rétrécit (et donc ne replie ses enfants) qu'avec flexShrink et maxWidth.
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: space.xxs,
        flexShrink: 1,
        maxWidth: '100%',
      }}
    >
      {/* La goutte, derrière les liens : intouchable et muette (l'état est dit par les liens
          eux-mêmes). Sans lien actif, pas de goutte. */}
      {active !== null ? (
        <Animated.View
          pointerEvents="none"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[{ position: 'absolute', top: 0, left: 0 }, slideStyle]}
        >
          <Animated.View
            testID="nav-drop"
            style={[
              {
                borderRadius: radii.pill,
                backgroundColor: colors.surfaceRaised,
                boxShadow: shadows.soft,
                // Pas encore posée : le lien actif porte la goutte, celle-ci attend, invisible.
                opacity: placed ? 1 : 0,
              },
              dropStyle,
            ]}
          />
        </Animated.View>
      ) : null}
      {links.map((entry) => {
        const isActive = entry.key === active
        // Le lien actif porte lui-même la goutte tant qu'elle n'est pas posée à part (voir en tête).
        const carriesDrop = isActive && !placed
        return (
          <Pressable
            key={entry.key}
            accessibilityRole="link"
            accessibilityLabel={entry.label}
            {...linkProps(entry.href, isActive)}
            accessibilityState={{ selected: isActive }}
            onPress={press(entry)}
            onLayout={measure(entry.key)}
            style={({ pressed }) => ({
              minHeight: layout.touchTarget,
              minWidth: layout.touchTarget,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: space.lg,
              paddingVertical: space.xs,
              borderRadius: radii.pill,
              // La goutte : blanche et en relief sous le lien actif (comme TabBar) ; un lien
              // enfoncé passe sur le fond groupé, le temps du geste.
              backgroundColor: carriesDrop
                ? colors.surfaceRaised
                : pressed && !isActive
                  ? colors.surfaceGrouped
                  : 'transparent',
              ...(carriesDrop ? { boxShadow: shadows.soft } : null),
            })}
          >
            {/* Sur la goutte, l'encre (ton onHoney) : la goutte reste claire de nuit, comme le choix
                actif de Segmented et de TabBar (couple onHoney / surfaceRaised de contrastPairs). */}
            <Text
              weight={isActive ? 700 : 500}
              tone={isActive ? 'onHoney' : 'secondary'}
              selectable={false}
            >
              {entry.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

type PhotoLinkProps = {
  /** Le nom lu (« Moi ») : la photo n'a pas de texte à elle. */
  label: string
  href: string
  /** La page de ce lien est ouverte : la photo est cerclée, et le lien dit « page actuelle ». */
  current?: boolean
  onPress: () => void
  /** Le nom du membre, pour les initiales quand il n'a pas de photo. */
  name: string
  source: ImageSource | null
}

/**
 * La photo du membre dans la barre du haut, lien vers sa page (« Moi »). Sur sa page, la photo est
 * cerclée d'encre, comme l'onglet « Moi » actif du téléphone.
 */
export function NavPhotoLink({
  label,
  href,
  current = false,
  onPress,
  name,
  source,
}: PhotoLinkProps) {
  const { colors } = useTheme()
  const press = (event?: PressEvent) => {
    if (Platform.OS === 'web') event?.preventDefault?.()
    // Déjà sur sa page : rien à empiler.
    if (!current) onPress()
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      {...linkProps(href, current)}
      accessibilityState={{ selected: current }}
      onPress={press}
      style={{
        width: layout.touchTarget,
        height: layout.touchTarget,
        // Rond : l'anneau de focus du clavier suit la photo.
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: borders.strong,
        borderColor: current ? colors.text : 'transparent',
      }}
    >
      {/* Le nom de la photo est celui du lien : la photo elle-même ne se lit pas deux fois. */}
      <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Avatar
          name={name}
          source={source}
          label={name}
          // Deux points de moins de chaque côté : la place du cercle, sans changer la taille du lien.
          size={layout.touchTarget - 4}
        />
      </View>
    </Pressable>
  )
}
