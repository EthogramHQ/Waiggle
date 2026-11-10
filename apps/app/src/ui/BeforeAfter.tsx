// L'avant / après d'une mise à jour (R7a, scénario « L'avant / après », F-Pr7) : deux photos
// superposées, l'« Avant » à gauche d'un trait et l'« Après » à droite, avec une poignée ronde de
// verre au milieu du trait. On fait glisser la poignée (ou on touche la photo) pour montrer plus de
// l'une ou de l'autre ; des étiquettes de verre « Avant » et « Après » disent quel côté est lequel.
//
// Pour un lecteur d'écran et au clavier, la comparaison est un curseur « Comparer avant et après » :
// sa valeur est la place du trait, en pour cent (50 au départ) ; les flèches la déplacent de 10 %,
// Début et Fin vont aux bords ; sur téléphone, le lecteur d'écran la règle d'un glissé vers le haut
// ou le bas. Un curseur cache ce qu'il contient : les deux photos sont donc posées à côté de lui,
// chacune nommée par sa description (« Avant : la fusée de jour »).
//
// Rien ne bouge seul : ni animation, ni retour au milieu. Le trait suit le doigt sans délai, et une
// tape le pose où l'on a touché, d'un coup.
//
// Pré-rendu (web) : la place du trait est un pourcentage, la largeur n'est jamais lue avant d'être
// mesurée ; la page pré-rendue et le navigateur dessinent donc la même chose (pas d'écart
// d'hydratation).
import { borders, layout, radii, space } from '@ruche/brand'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  PanResponder,
  type PanResponderGestureState,
  Platform,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native'
import { describedBy } from './aria'
import { Icon } from './Icon'
import type { GalleryPhoto } from './PhotoGallery'
import { type CoverShape, ProjectCover } from './ProjectCover'
import { Surface } from './Surface'
import { Text } from './Text'
import { insetFocus } from './theme/document'
import { useLayout } from './theme/layout'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** La photo d'avant, à gauche du trait. */
  before: GalleryPhoto
  /** La photo d'après, à droite du trait. */
  after: GalleryPhoto
  /**
   * La hauteur des photos (jetons `layout.cover`, ou en points). Par défaut : `medium` sur
   * ordinateur et tablette, `band` sur téléphone.
   */
  height?: number | CoverShape
  /** Le nom lu du curseur ; par défaut « Comparer avant et après ». */
  label?: string
  /**
   * La place du trait au départ, en pour cent (50 par défaut). Pour le catalogue, qui montre la
   * comparaison à 0, 50 et 100 % ; la page laisse le trait au milieu.
   */
  initialValue?: number
}

/** Ce que les flèches du clavier et les gestes du lecteur d'écran font avancer le trait. */
const STEP = 10
/** En deçà de ce déplacement (en points), un doigt posé puis levé est une tape, pas un glissé. */
const TAP_SLOP = 8
/** L'épaisseur du trait entre les deux photos. */
const LINE = borders.hairline * 3
/**
 * La place qu'une étiquette demande sur sa photo, marge du bord comprise : l'étiquette (~70 points,
 * « Avant », « Before », « Après ») plus `space.md` du bord et un souffle avant le trait.
 */
const TAG_ROOM = 96
/** La largeur supposée de la zone tant qu'elle n'est pas mesurée : un petit téléphone (320 - marges). */
const NARROW_ZONE = 288

type KeyEvent = { key: string; preventDefault: () => void }

/** Les styles du web que les types de React Native ne connaissent pas (`touch-action`, curseur). */
const webOnly = (style: Record<string, string | number>): ViewStyle =>
  (Platform.OS === 'web' ? style : {}) as unknown as ViewStyle

/** Une valeur ramenée entre 0 et 100, en entier. */
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

/** La description d'une photo, si elle en a une (des blancs seuls ne décrivent rien). */
const describedOf = (photo: GalleryPhoto): string | null =>
  photo.description?.trim() ? photo.description : null

export function BeforeAfter({ before, after, height: shape, label, initialValue = 50 }: Props) {
  const { t } = useTranslation()
  const { sizeClass } = useLayout()
  const { colors, shadows } = useTheme()
  const desktop = sizeClass !== 'compact'

  const [value, setValue] = useState(() => clamp(initialValue))
  // La valeur du moment, lue sans attendre un nouveau rendu (deux flèches tapées vite à la suite,
  // le geste créé une seule fois plus bas).
  const current = useRef(value)
  const set = (next: number) => {
    const target = clamp(next)
    if (target === current.current) return
    current.current = target
    setValue(target)
  }

  // La largeur de la zone, mesurée (onLayout, ou au geste sur le web) ; 0 tant que rien n'est
  // mesuré : le pré-rendu et les tests ne lisent aucune largeur, et un geste n'y fait rien.
  const width = useRef(0)
  const zone = useRef<View>(null)
  // Recopiée en état, pour dessiner la poignée et les étiquettes (0 : pas encore mesurée, on dessine
  // alors en pourcentages, comme le pré-rendu).
  const [frameWidth, setFrameWidth] = useState(0)
  const onLayout = (event: LayoutChangeEvent) => {
    width.current = event.nativeEvent.layout.width
    setFrameWidth(event.nativeEvent.layout.width)
  }
  /** Sur le web, la largeur relue au début du geste (la fenêtre a pu changer depuis la mesure). */
  const measureNow = () => {
    if (Platform.OS !== 'web') return
    const node = zone.current as unknown as { getBoundingClientRect?: () => { width: number } }
    const box = node?.getBoundingClientRect?.()
    if (box && box.width > 0) width.current = box.width
  }
  /** Pose le trait à `x` points du bord gauche de la zone. */
  const placeAt = (x: number) => {
    if (width.current > 0) set((x / width.current) * 100)
  }
  // Recopiées pour le geste, créé une seule fois : il appelle toujours les fonctions du dernier rendu.
  const actions = useRef({ placeAt, measureNow })
  actions.current = { placeAt, measureNow }

  // PanResponder : le système de réponse au toucher de React Native (doigt, et souris sur le web).
  // La zone prend le doigt dès qu'il se pose, pour qu'une tape puisse placer le trait ; elle le
  // rend aussitôt qu'on le lui demande (`TerminationRequest`), si bien que la page défile encore
  // quand le doigt part vers le haut ou le bas. Seul un glissé franchement horizontal déplace le
  // trait : un glissé vertical ne le bouge jamais, même s'il dévie un peu de côté.
  const gesture = useRef<{ start: number; mode: 'pending' | 'drag' | 'scroll' }>({
    start: 0,
    mode: 'pending',
  })
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, move) => Math.abs(move.dx) > Math.abs(move.dy),
      onPanResponderTerminationRequest: () => gesture.current.mode !== 'drag',
      onPanResponderGrant: (event: GestureResponderEvent) => {
        actions.current.measureNow()
        // La place du doigt dans la zone : ses enfants ne reçoivent pas le toucher
        // (`pointerEvents="none"`), la position est donc toujours lue par rapport à elle.
        gesture.current = { start: event.nativeEvent.locationX, mode: 'pending' }
      },
      onPanResponderMove: (_event, move: PanResponderGestureState) => {
        const state = gesture.current
        if (state.mode === 'pending') {
          if (Math.abs(move.dx) < TAP_SLOP && Math.abs(move.dy) < TAP_SLOP) return
          // Le premier vrai mouvement décide : de côté, on compare ; sinon, on laisse défiler.
          state.mode = Math.abs(move.dx) > Math.abs(move.dy) ? 'drag' : 'scroll'
        }
        if (state.mode === 'drag') actions.current.placeAt(state.start + move.dx)
      },
      onPanResponderRelease: (_event, move: PanResponderGestureState) => {
        const state = gesture.current
        // Une tape : le trait va d'un coup où l'on a touché (rien à animer, rien à calmer).
        if (state.mode === 'pending') actions.current.placeAt(state.start)
        else if (state.mode === 'drag') actions.current.placeAt(state.start + move.dx)
        state.mode = 'pending'
      },
      onPanResponderTerminate: () => {
        gesture.current.mode = 'pending'
      },
    }),
  ).current

  // Le clavier : flèches ± 10 %, Début et Fin aux bords. Seules ces touches sont retenues
  // (`preventDefault`, sinon la page défilerait en même temps) ; Tab et les autres passent.
  const onKeyDown = (event: KeyEvent) => {
    const now = current.current
    const moves: Record<string, number> = {
      ArrowRight: now + STEP,
      ArrowUp: now + STEP,
      ArrowLeft: now - STEP,
      ArrowDown: now - STEP,
      Home: 0,
      End: 100,
    }
    const target = moves[event.key]
    if (target === undefined) return
    event.preventDefault()
    set(target)
  }

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') set(current.current + STEP)
    else if (event.nativeEvent.actionName === 'decrement') set(current.current - STEP)
  }

  // Les noms lus : la description de chaque photo, précédée de sa place ; sans description, la
  // place seule. La description passe en paramètre de `t` : i18next la recopie telle quelle.
  const beforeText = describedOf(before)
  const afterText = describedOf(after)
  const beforeName = beforeText
    ? t(($) => $.project.updates.beforeDescribed, { description: beforeText })
    : t(($) => $.project.updates.before)
  const afterName = afterText
    ? t(($) => $.project.updates.afterDescribed, { description: afterText })
    : t(($) => $.project.updates.after)
  const name = label ?? t(($) => $.project.updates.compare)
  const valueText = t(($) => $.project.updates.compareValue, { value })
  const hint = t(($) => $.project.updates.compareHint)
  // L'aide est écrite sous la comparaison sur ordinateur (planche) ; sur téléphone, le lecteur
  // d'écran la lit en indice. Sur le web, le curseur est décrit par le texte affiché.
  const hintId = `before-after-hint-${useId().replace(/[^\w-]/g, '')}`

  const base = shape ?? (desktop ? 'medium' : 'band')
  const frameHeight = typeof base === 'number' ? base : layout.cover[base]

  // Le curseur, tel que chaque plateforme le lit : `slider` et ses `aria-value*` sur le web (que
  // react-native-web transmet au navigateur), `adjustable` et `accessibilityValue` sur téléphone.
  const reader =
    Platform.OS === 'web'
      ? {
          role: 'slider' as const,
          'aria-valuenow': value,
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuetext': valueText,
          'aria-orientation': 'horizontal',
          tabIndex: 0 as const,
          ...describedBy(desktop ? hintId : undefined),
          // L'anneau du focus dessiné à l'intérieur : le cadre arrondi rogne ce qui dépasse.
          ...insetFocus,
        }
      : {
          accessibilityRole: 'adjustable' as const,
          accessibilityValue: { min: 0, max: 100, now: value, text: valueText },
          accessibilityHint: hint,
        }

  // La photo d'avant n'est visible qu'à gauche du trait : une fenêtre de `value` % de large, qui
  // rogne une photo de toute la largeur de la zone. Cette largeur se dit en pourcentage de la
  // fenêtre (100 / value fois sa largeur), sans rien mesurer ; à 0, la photo d'avant n'est pas
  // dessinée.
  const beforeWidth: `${number}%` | 0 = value > 0 ? `${(100 / value) * 100}%` : 0

  // Les étiquettes sont fixes (« Avant » à gauche, « Après » à droite) : quand le trait s'approche
  // d'un bord, celle de ce côté n'a plus la place de tenir sur sa photo et se poserait sur l'autre.
  // Elle se cache alors (c'est un dessin : le curseur dit déjà où est le trait). Tant que la largeur
  // n'est pas mesurée, on compte un téléphone étroit.
  const zoneWidth = frameWidth > 0 ? frameWidth : NARROW_ZONE
  const showBefore = (zoneWidth * value) / 100 >= TAG_ROOM
  const showAfter = (zoneWidth * (100 - value)) / 100 >= TAG_ROOM
  // La poignée de 44 points reste entière dans le cadre : à 0 et à 100 %, son centre s'arrête à une
  // demi-poignée du bord (le trait, lui, va jusqu'au bord). Non mesurée : en pourcentage.
  const half = layout.touchTarget / 2
  const handleCenter =
    frameWidth > 0
      ? Math.max(half, Math.min(frameWidth - half, (frameWidth * value) / 100))
      : (`${value}%` as const)

  return (
    <View style={{ alignSelf: 'stretch', gap: space.sm }}>
      <View
        style={{
          height: frameHeight,
          borderRadius: radii.tile,
          overflow: 'hidden',
          backgroundColor: colors.honeySoft,
        }}
      >
        {/* Les deux photos, nommées chacune par sa description. L'avant vient d'abord dans l'ordre
            de lecture, mais se dessine au-dessus de l'après (zIndex). */}
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={beforeName}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        >
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${value}%`,
              overflow: 'hidden',
            }}
          >
            {value > 0 ? (
              <View
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: beforeWidth }}
              >
                <Photo photo={before} height={frameHeight} />
              </View>
            ) : null}
          </View>
        </View>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={afterName}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { zIndex: 0 }]}
        >
          <Photo photo={after} height={frameHeight} />
        </View>

        {/* Le curseur, posé sur les photos : c'est lui que le doigt, la souris et le clavier
            touchent. Ce qu'il contient (trait, poignée, étiquettes) est un dessin, que le lecteur
            d'écran ne lit pas : il entend le nom et la valeur. */}
        <View
          ref={zone}
          accessible
          accessibilityLabel={name}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={onAccessibilityAction}
          {...reader}
          {...{ onKeyDown }}
          {...pan.panHandlers}
          onLayout={onLayout}
          style={[
            StyleSheet.absoluteFill,
            // Les coins du cadre : l'anneau du focus, dessiné à l'intérieur, les suit.
            { zIndex: 2, borderRadius: radii.tile },
            // Sur le web : le navigateur garde le défilement vertical de la page (pan-y) et laisse
            // le glissé de côté à la comparaison ; aucun texte ne se sélectionne en glissant.
            webOnly({ touchAction: 'pan-y', userSelect: 'none', cursor: 'ew-resize' }),
          ]}
        >
          {/* Le trait, à la place de la valeur ; les étiquettes passent par-dessus. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${value}%`,
              width: LINE,
              marginLeft: -LINE / 2,
              backgroundColor: colors.knob,
              boxShadow: shadows.float,
            }}
          />
          {/* Les étiquettes de verre, en haut de chaque côté. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: space.md,
              left: space.md,
              right: space.md,
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            {/* Une vue vide garde l'autre étiquette de son côté. */}
            {showBefore ? <Tag text={t(($) => $.project.updates.before)} /> : <View />}
            {showAfter ? <Tag text={t(($) => $.project.updates.after)} /> : <View />}
          </View>
          {/* La poignée ronde de 44 points, au milieu du trait : du verre, comme les boutons posés
              sur une photo. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: '50%',
              left: handleCenter,
              width: layout.touchTarget,
              height: layout.touchTarget,
              marginTop: -half,
              marginLeft: -half,
              borderRadius: radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.glass,
              borderWidth: borders.hairline,
              borderColor: colors.glassBorder,
              boxShadow: `${shadows.highlight}, ${shadows.float}`,
            }}
          >
            <Icon name="arrows-left-right" size={layout.touchTarget / 2} />
          </View>
        </View>
      </View>
      {desktop ? (
        <Text variant="caption" tone="muted" nativeID={hintId}>
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

/** Une photo de la comparaison, de toute la hauteur ; nommée par son cadre, pas par elle-même. */
function Photo({ photo, height }: { photo: GalleryPhoto; height: number }) {
  return (
    <ProjectCover
      height={height}
      radius="none"
      image={{ source: photo.source, thumbhash: photo.thumbhash ?? null, label: '' }}
    />
  )
}

/** Une étiquette de verre (« Avant », « Après »). */
function Tag({ text }: { text: string }) {
  return (
    <Surface variant="glass" radius="pill" padding="xs" fill={false}>
      <View style={{ paddingHorizontal: space.sm }}>
        <Text variant="caption" weight={600}>
          {text}
        </Text>
      </View>
    </Surface>
  )
}
