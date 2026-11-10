// Les photos d'un projet dans la feuille de publication (R6a, planches R6-Publier et
// R6-Publier-Desktop) : une tuile par photo, dans l'ordre (la première sert de couverture et porte
// le badge « Couverture »), puis la tuile « + Ajouter » en pointillés, ou, sur ordinateur, la zone
// « Glisse tes images ici, ou choisis-les » où l'on dépose des fichiers.
// La feuille « Nouvelle mise à jour » (R7a) reprend les mêmes tuiles sans couverture (`cover={false}`)
// et avec des étiquettes par rang (`badges` : « Avant », « Après »).
//
// Chaque tuile a trois contrôles, côte à côte et jamais l'un dans l'autre (un bouton dans un bouton
// n'est pas lu, et sur iOS VoiceOver n'atteint plus le second) :
// - la tuile elle-même, un bouton : la toucher la choisit (anneau de miel, « appuyé »), et l'écran
//   montre dessous la description de cette photo ;
// - en haut à droite, « Retirer la photo N » ;
// - en haut à gauche, la poignée « Déplacer la photo N » (relecture du plan, ui-B1) : un bouton qui
//   ouvre un menu « Mettre en couverture », « Avancer », « Reculer ». Ainsi l'ordre se change sans
//   glisser, au clavier, au lecteur d'écran ou d'un doigt peu sûr ; le focus suit la photo
//   déplacée et sa nouvelle place est annoncée (« Photo déplacée en place 2. »).
// Glisser reste possible : au doigt (PanResponder de React Native, sur téléphone) et à la souris
// (glisser-déposer du navigateur). Sur téléphone, les mêmes trois gestes sont aussi des actions
// d'accessibilité de la tuile (le lecteur d'écran les propose sans ouvrir le menu).
//
// Une photo en cours d'envoi est nommée comme une barre de progression (« Envoi de la photo 2 ») ;
// une photo refusée dit pourquoi sous sa tuile, et le dit aussi aux lecteurs d'écran, les autres
// continuant. Le composant ne connaît ni l'API ni les traductions : l'écran lui donne les textes
// (`labels`) et les gestes (`onMove`, `onRemove`…).
import { borders, layout, radii, space } from '@ruche/brand'
import { Image } from 'expo-image'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  type AccessibilityActionEvent,
  ActivityIndicator,
  type LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  View,
} from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { ActionMenu, type ActionMenuItem } from './ActionMenu'
import { describedBy, pressed } from './aria'
import { focusWithoutScroll, holdsFocus, moveReaderTo } from './focus'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import { LiveStatus } from './LiveStatus'
import type { CoverImage } from './ProjectCover'
import { Text } from './Text'
import { TextLink } from './TextLink'
import { useTextScale } from './textScale'
import { useLayout } from './theme/layout'
import { useTheme } from './theme/ThemeProvider'

/** Une photo de la galerie, telle que l'écran la donne. */
export type PhotoTile = {
  /** Stable d'un rendu à l'autre (l'identifiant du visuel, ou celui d'une photo pas encore envoyée). */
  key: string
  image: CoverImage
  /** ready : en place ; uploading : en cours d'envoi ; failed : refusée (voir `error`). */
  state: 'ready' | 'uploading' | 'failed'
  /** Pourquoi la photo a été refusée (« elle dépasse 5 Mo. »), venu de t(). */
  error?: string
}

/**
 * Les textes, venus de t() : le composant n'en écrit aucun. Le titre « Photos », le compte
 * « 2 / 6 » et les aides (formats, ordre) sont posés par l'écran autour des tuiles.
 */
export type PhotoTilesLabels = {
  /** « Les photos du projet, dans l'ordre », le nom de la liste. */
  list: string
  /** « Ajouter », écrit sur la tuile en pointillés. */
  add: string
  /** « Ajouter des photos », son nom lu. */
  addLabel: string
  /** « Glisse tes images ici, ou », puis le bouton « choisis-les » (zone de dépôt, web). */
  dropZone: string
  dropZoneChoose: string
  /** « Couverture », le badge de la première photo. */
  cover: string
  /** Le nom d'une tuile : « Photo 2 », « Photo 1, couverture ». */
  tile: (number: number, cover: boolean) => string
  /** « Envoi de la photo 2 » : le nom de sa barre de progression. */
  uploading: (number: number) => string
  /** « La photo 2 n'a pas pu être ajoutée : elle dépasse 5 Mo. » */
  failed: (number: number, reason: string) => string
  /** « Déplacer la photo 2 » : la poignée, qui ouvre le menu. */
  move: (number: number) => string
  makeCover: string
  earlier: string
  later: string
  /** « Photo déplacée en place 2. », annoncé après un déplacement. */
  moved: (place: number) => string
  /** « Retirer la photo 2 ». */
  remove: (number: number) => string
}

type Props = {
  tiles: PhotoTile[]
  /** Le nombre de photos au plus (`VISUALS_MAX`) : à ce nombre, « Ajouter » disparaît. */
  max: number
  labels: PhotoTilesLabels
  /** La tuile choisie (anneau de miel), dont l'écran montre la description ; null : aucune. */
  selectedKey: string | null
  onSelect: (key: string) => void
  /** Ouvre le choix de photos de l'appareil (`pickVisuals`). */
  onAdd: () => void
  /** Sur le web : des fichiers déposés sur la zone (ou la tuile « Ajouter »). Absent : pas de dépôt. */
  onDropFiles?: (files: File[]) => void
  /** Déplace la photo de la place `from` à la place `to` (rangs dans `tiles`). */
  onMove: (from: number, to: number) => void
  onRemove: (key: string) => void
  /** Une action de la feuille est en cours (l'envoi du projet) : les gestes attendent. */
  busy?: boolean
  /**
   * L'étiquette de chaque rang (R7a : « Avant », « Après » d'une mise à jour), montrée sur la tuile
   * comme le badge « Couverture » et lue dans son nom (« Photo 1, Avant ») ; `null` ou absente : pas
   * d'étiquette à ce rang. Elle suit le rang, pas la photo : une photo avancée en première place
   * devient « Avant ». Les rangs comptent les photos en place ou en route, pas les refusées.
   */
  badges?: (string | null)[]
  /**
   * Vrai par défaut : la première photo est la couverture (badge, « Mettre en couverture »). Faux
   * pour une mise à jour, qui n'a pas de couverture : ni l'un ni l'autre.
   */
  cover?: boolean
}

/**
 * La taille d'une tuile, celle des planches : plus petite sur téléphone (trois par rangée à 390
 * points), plus haute sur ordinateur. Elle grandit avec le texte (jusqu'à 150 %), pour que le badge
 * « Couverture » y tienne encore (relecture du plan, ui-M4).
 */
const TILE = { compact: { width: 112, height: 96 }, roomy: { width: 128, height: 136 } } as const
const TILE_SCALE_MAX = 1.5
/** La largeur de base de la zone de dépôt : de quoi lire sa phrase sur deux lignes au plus. */
const DROP_ZONE_BASIS = 260
/** Sous ce déplacement (en points), un doigt posé sur une tuile la touche, il ne la glisse pas. */
const DRAG_START = 8
/** Le type de donnée d'une tuile qu'on glisse à la souris : la zone de dépôt ne la prend pas. */
const TILE_DRAG_TYPE = 'application/x-waiggle-photo'

type Rect = { x: number; y: number; width: number; height: number }
/** Où poser le focus quand les tuiles auront changé : une poignée, une tuile, ou « Ajouter ». */
type PendingFocus = { key: string; target: 'move' | 'tile' } | { key: null; target: 'add' }

// Le peu du glisser-déposer du navigateur dont on a besoin (les types de React Native ne décrivent
// pas la page web).
type WebDataTransfer = {
  types: ArrayLike<string>
  files?: ArrayLike<File>
  dropEffect?: string
  effectAllowed?: string
  setData?: (type: string, value: string) => void
  getData?: (type: string) => string
}
type WebDragEvent = { dataTransfer?: WebDataTransfer | null; preventDefault: () => void }
type WebElement = {
  setAttribute?: (name: string, value: string) => void
  addEventListener: (type: string, listener: (event: WebDragEvent) => void) => void
  removeEventListener?: (type: string, listener: (event: WebDragEvent) => void) => void
}

const hasType = (event: WebDragEvent, type: string) =>
  Array.from(event.dataTransfer?.types ?? []).includes(type)

/**
 * Branche des gestionnaires de glisser-déposer sur l'élément du navigateur d'une vue. Sur le web,
 * react-native-web ne transmet pas `onDrop` ni `onDragOver` : on les pose sur l'élément lui-même.
 */
const useWebDrag = (
  node: { current: unknown },
  handlers: Record<string, (event: WebDragEvent) => void>,
  draggable: boolean,
) => {
  const latest = useRef(handlers)
  latest.current = handlers
  // biome-ignore lint/correctness/useExhaustiveDependencies: les gestionnaires sont lus par `latest`.
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const element = node.current as WebElement | null
    if (!element?.addEventListener) return
    element.setAttribute?.('draggable', draggable ? 'true' : 'false')
    const names = Object.keys(latest.current)
    const bound = names.map((name) => {
      const listener = (event: WebDragEvent) => latest.current[name]?.(event)
      element.addEventListener(name, listener)
      return [name, listener] as const
    })
    return () => {
      for (const [name, listener] of bound) element.removeEventListener?.(name, listener)
    }
  }, [draggable])
}

export function PhotoTiles({
  tiles,
  max,
  labels,
  selectedKey,
  onSelect,
  onAdd,
  onDropFiles,
  onMove,
  onRemove,
  busy = false,
  badges,
  cover: hasCover = true,
}: Props) {
  const { sizeClass } = useLayout()
  const { scale, probe } = useTextScale('M')
  const base = sizeClass === 'compact' ? TILE.compact : TILE.roomy
  const grow = Math.min(Math.max(scale, 1), TILE_SCALE_MAX)
  const size = { width: Math.round(base.width * grow), height: Math.round(base.height * grow) }

  // Les photos en place ou en route comptent ; une photo refusée ne prend pas de place.
  const kept = tiles.filter((tile) => tile.state !== 'failed')
  const full = kept.length >= max
  // Les places qu'on peut échanger : les photos en place (une photo en route n'a pas encore d'ordre).
  const movable = tiles.flatMap((tile, index) => (tile.state === 'ready' ? [index] : []))
  const coverKey = hasCover ? (kept[0]?.key ?? null) : null
  /** L'étiquette d'une tuile : « Couverture » pour la couverture, sinon celle de son rang. */
  const badgeOf = (key: string): string | null => {
    if (key === coverKey) return labels.cover
    const rank = kept.findIndex((one) => one.key === key)
    return rank < 0 ? null : (badges?.[rank] ?? null)
  }
  // Sur le web, à largeur d'ordinateur, la zone de dépôt garde la tuile « + Ajouter » et ajoute sa
  // phrase. Plus étroit, « Ajouter » et « choisis-les » feraient la même chose : la tuile seule
  // reste (elle reçoit encore des fichiers déposés, `fileHandlers`).
  const dropZone = Platform.OS === 'web' && onDropFiles !== undefined && sizeClass === 'wide'

  // Les vues à focaliser, par tuile : la tuile, sa poignée. Et « Ajouter ».
  const tileRefs = useRef(new Map<string, View | null>())
  const moveRefs = useRef(new Map<string, View | null>())
  const addRef = useRef<View | null>(null)
  const layouts = useRef(new Map<string, Rect>())
  const pending = useRef<PendingFocus | null>(null)
  // Vrai quand « Ajouter » avait le focus (ou le doigt, sur téléphone) au moment de disparaître.
  const addHadFocus = useRef(false)
  const addTouched = useRef(false)
  const [message, setMessage] = useState('')

  // Après un changement des tuiles, le focus va où le geste l'a promis (voir `pending`).
  // biome-ignore lint/correctness/useExhaustiveDependencies: seules les tuiles le déclenchent.
  useLayoutEffect(() => {
    const wanted = pending.current
    if (!wanted) return
    const node =
      wanted.target === 'add'
        ? addRef.current
        : (wanted.target === 'move' ? moveRefs : tileRefs).current.get(wanted.key)
    if (!node) return
    pending.current = null
    if (!focusWithoutScroll(node)) moveReaderTo(node)
  }, [tiles])

  // La sixième photo fait disparaître « Ajouter » : si le focus y était, il va à la dernière tuile
  // au lieu de retomber sur la page.
  const wasFull = useRef(full)
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul le passage à « plein » compte.
  useLayoutEffect(() => {
    const before = wasFull.current
    wasFull.current = full
    if (before || !full) return
    const hadFocus = addHadFocus.current || (Platform.OS !== 'web' && addTouched.current)
    addHadFocus.current = false
    addTouched.current = false
    const last = kept[kept.length - 1]
    if (!hadFocus || !last) return
    const node = tileRefs.current.get(last.key)
    if (!focusWithoutScroll(node)) moveReaderTo(node)
  }, [full])

  const move = (key: string, to: number) => {
    const from = tiles.findIndex((tile) => tile.key === key)
    if (busy || from < 0 || to === from) return
    pending.current = { key, target: 'move' }
    setMessage(labels.moved(to + 1))
    onMove(from, to)
  }

  const remove = (key: string) => {
    if (busy) return
    const index = tiles.findIndex((tile) => tile.key === key)
    const neighbour = tiles[index + 1] ?? tiles[index - 1]
    pending.current = neighbour
      ? { key: neighbour.key, target: 'tile' }
      : { key: null, target: 'add' }
    onRemove(key)
  }

  // Une tuile lâchée après un glisser : elle prend la place de la tuile dont le centre est le plus
  // proche de son propre centre (les tuiles passent à la ligne : on compte en deux dimensions).
  const dropAt = (key: string, dx: number, dy: number) => {
    const rect = layouts.current.get(key)
    if (!rect) return
    const x = rect.x + rect.width / 2 + dx
    const y = rect.y + rect.height / 2 + dy
    let best = -1
    let bestDistance = Number.POSITIVE_INFINITY
    for (const index of movable) {
      const other = layouts.current.get(tiles[index]?.key ?? '')
      if (!other) continue
      const distance = Math.hypot(other.x + other.width / 2 - x, other.y + other.height / 2 - y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = index
      }
    }
    if (best >= 0) move(key, best)
  }

  // Les fichiers déposés (web) : seulement des fichiers ; une tuile glissée sur la zone n'y entre pas.
  const [dragOver, setDragOver] = useState(false)
  const fileHandlers = {
    dragover: (event: WebDragEvent) => {
      if (!hasType(event, 'Files')) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
    },
    dragleave: () => setDragOver(false),
    drop: (event: WebDragEvent) => {
      setDragOver(false)
      if (!hasType(event, 'Files')) return
      event.preventDefault()
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length > 0 && !busy) onDropFiles?.(files)
    },
  }

  const addProps = {
    full,
    busy,
    labels,
    size,
    dragOver,
    onPress: () => {
      addTouched.current = true
      onAdd()
    },
    fileHandlers: onDropFiles ? fileHandlers : null,
    addRef,
    onGone: (focused: boolean) => {
      addHadFocus.current = focused
    },
  }

  return (
    <View>
      {probe}
      <View
        accessibilityRole="list"
        accessibilityLabel={labels.list}
        // Un écart de 8 : trois tuiles de 112 par rangée dans une feuille de 390 points.
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, rowGap: space.md }}
      >
        {tiles.map((tile, index) => {
          const cover = tile.key === coverKey
          const place = movable.indexOf(index)
          const items: ActionMenuItem[] =
            place < 0
              ? []
              : [
                  ...(place > 0
                    ? [
                        // Sans couverture (une mise à jour), avancer et reculer suffisent.
                        ...(hasCover
                          ? [
                              {
                                label: labels.makeCover,
                                icon: 'star' as const,
                                onPress: () => move(tile.key, movable[0] ?? 0),
                              },
                            ]
                          : []),
                        {
                          label: labels.earlier,
                          icon: 'caret-left' as const,
                          onPress: () => move(tile.key, movable[place - 1] ?? index),
                        },
                      ]
                    : []),
                  ...(place < movable.length - 1
                    ? [
                        {
                          label: labels.later,
                          icon: 'caret-right' as const,
                          onPress: () => move(tile.key, movable[place + 1] ?? index),
                        },
                      ]
                    : []),
                ]
          return (
            <Tile
              key={tile.key}
              tile={tile}
              number={index + 1}
              cover={cover}
              badge={badgeOf(tile.key)}
              selected={tile.key === selectedKey}
              size={size}
              labels={labels}
              items={busy ? [] : items}
              busy={busy}
              onSelect={() => onSelect(tile.key)}
              onRemove={() => remove(tile.key)}
              onDragEnd={(dx, dy) => dropAt(tile.key, dx, dy)}
              onDropTile={(key) => {
                const to = tiles.findIndex((one) => one.key === tile.key)
                if (movable.includes(to)) move(key, to)
              }}
              onLayout={(rect) => layouts.current.set(tile.key, rect)}
              tileRef={(node) => tileRefs.current.set(tile.key, node)}
              moveRef={(node) => moveRefs.current.set(tile.key, node)}
            />
          )
        })}
        {/* La zone de dépôt prend le reste de la rangée des tuiles (planche R6-Publier-Desktop) ;
            sous sa largeur de base, elle passe à la ligne. */}
        {full ? null : dropZone ? (
          <View role="listitem" style={{ flexGrow: 1, flexBasis: DROP_ZONE_BASIS }}>
            <DropZone {...addProps} />
          </View>
        ) : (
          <View role="listitem">
            <AddTile {...addProps} />
          </View>
        )}
      </View>
      <LiveStatus message={message} visible={false} />
    </View>
  )
}

type TileProps = {
  tile: PhotoTile
  number: number
  cover: boolean
  /** L'étiquette posée en bas de la tuile (« Couverture », « Avant »…) ; null : aucune. */
  badge: string | null
  selected: boolean
  size: { width: number; height: number }
  labels: PhotoTilesLabels
  /** Les actions de la poignée ; vide : pas de poignée (une seule photo, ou photo pas en place). */
  items: ActionMenuItem[]
  busy: boolean
  onSelect: () => void
  onRemove: () => void
  onDragEnd: (dx: number, dy: number) => void
  /** Une autre tuile, glissée à la souris (web), est lâchée sur celle-ci. */
  onDropTile: (key: string) => void
  onLayout: (rect: Rect) => void
  tileRef: (node: View | null) => void
  moveRef: (node: View | null) => void
}

function Tile({
  tile,
  number,
  cover,
  badge,
  selected,
  size,
  labels,
  items,
  busy,
  onSelect,
  onRemove,
  onDragEnd,
  onDropTile,
  onLayout,
  tileRef,
  moveRef,
}: TileProps) {
  const { colors } = useTheme()
  // Le nom lu : « Photo 1, couverture » (son propre texte), sinon « Photo 1, Avant » quand le rang a
  // une étiquette. La virgule sépare deux textes traduits, comme dans les deux langues de l'appli.
  const name = cover
    ? labels.tile(number, true)
    : badge
      ? `${labels.tile(number, false)}, ${badge}`
      : labels.tile(number, false)
  const failed = tile.state === 'failed'
  const uploading = tile.state === 'uploading'
  const reasonId = `photo-tile-reason-${tile.key}`
  const canDrag = items.length > 0

  // Glisser au doigt (téléphone) : la tuile suit le doigt, un peu soulevée, puis l'écran décide de
  // sa place au lâcher. Seulement un geste surtout horizontal : vers le haut ou le bas, la feuille
  // défile comme d'habitude.
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const lifted = useSharedValue(0)
  const latest = useRef({ canDrag, onDragEnd })
  latest.current = { canDrag, onDragEnd }
  const settle = () => {
    x.value = withSpring(0)
    y.value = withSpring(0)
    lifted.value = withSpring(0)
  }
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Platform.OS !== 'web' &&
        latest.current.canDrag &&
        Math.abs(gesture.dx) > DRAG_START &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        lifted.value = withSpring(1)
      },
      onPanResponderMove: (_event, gesture) => {
        x.value = gesture.dx
        y.value = gesture.dy
      },
      onPanResponderRelease: (_event, gesture) => {
        settle()
        latest.current.onDragEnd(gesture.dx, gesture.dy)
      },
      onPanResponderTerminate: settle,
    }),
  ).current
  const dragged = useAnimatedStyle(() => ({
    zIndex: lifted.value > 0 ? 1 : 0,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: 1 + lifted.value * 0.04 },
    ],
  }))

  // Glisser à la souris (web) : la tuile porte sa clé ; une autre tuile la reçoit.
  const frame = useRef<View>(null)
  useWebDrag(
    frame,
    {
      dragstart: (event) => {
        event.dataTransfer?.setData?.(TILE_DRAG_TYPE, tile.key)
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
      },
      dragover: (event) => {
        if (!hasType(event, TILE_DRAG_TYPE)) return
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      },
      drop: (event) => {
        if (!hasType(event, TILE_DRAG_TYPE)) return
        event.preventDefault()
        const key = event.dataTransfer?.getData?.(TILE_DRAG_TYPE)
        if (key && key !== tile.key) onDropTile(key)
      },
    },
    canDrag,
  )

  // Les gestes de la poignée, aussi proposés au lecteur d'écran du téléphone sur la tuile elle-même.
  const actions =
    Platform.OS === 'web'
      ? null
      : {
          accessibilityActions: items.map((item, index) => ({
            name: `move-${index}`,
            label: item.label,
          })),
          onAccessibilityAction: (event: AccessibilityActionEvent) => {
            const index = Number(event.nativeEvent.actionName.replace('move-', ''))
            items[index]?.onPress()
          },
        }

  return (
    <Animated.View
      style={[{ width: size.width, gap: space.xs }, dragged]}
      onLayout={(event: LayoutChangeEvent) => onLayout(event.nativeEvent.layout)}
      {...pan.panHandlers}
    >
      <View
        ref={frame}
        style={{ width: size.width, height: size.height, borderRadius: radii.small }}
      >
        <Pressable
          ref={tileRef}
          accessibilityRole="button"
          accessibilityLabel={name}
          {...pressed(selected)}
          {...(failed ? describedBy(reasonId) : null)}
          {...(failed && Platform.OS !== 'web'
            ? { accessibilityHint: labels.failed(number, tile.error ?? '') }
            : null)}
          {...actions}
          onPress={onSelect}
          style={{
            width: size.width,
            height: size.height,
            borderRadius: radii.small,
            overflow: 'hidden',
            backgroundColor: colors.surfaceGrouped,
          }}
        >
          {tile.image.source ? (
            <Image
              source={tile.image.source}
              placeholder={tile.image.thumbhash ? { thumbhash: tile.image.thumbhash } : null}
              contentFit="cover"
              accessible={false}
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: colors.honeySoft,
                opacity: failed ? 0.4 : 1,
              }}
            />
          ) : null}
        </Pressable>

        {/* L'anneau de la tuile choisie : le liseré des contrôles choisis (3:1 contre la page),
            dessiné autour de la tuile sans la déplacer. */}
        {selected ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              inset: -space.xs,
              borderRadius: radii.small + space.xs,
              borderWidth: borders.focus,
              borderColor: colors.controlChecked,
            }}
          />
        ) : null}

        {/* Le badge (« Couverture », « Avant », « Après ») : dessiné seulement, le nom de la tuile le
            dit déjà. */}
        {badge ? (
          <View
            pointerEvents="none"
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: 'absolute',
              left: space.sm,
              bottom: space.sm,
              maxWidth: size.width - 2 * space.sm,
              paddingHorizontal: space.sm,
              paddingVertical: space.xxs,
              borderRadius: radii.pill,
              backgroundColor: colors.glass,
              borderWidth: borders.hairline,
              borderColor: colors.glassBorder,
            }}
          >
            <Text variant="caption" weight={700} maxScale={TILE_SCALE_MAX}>
              {badge}
            </Text>
          </View>
        ) : null}

        {uploading ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={labels.uploading(number)}
            {...(Platform.OS === 'web'
              ? { 'aria-busy': true }
              : { accessibilityState: { busy: true } })}
            pointerEvents="none"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: radii.small,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.glass,
            }}
          >
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : null}

        {failed ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              inset: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="warning-circle" size={28} tone="danger" />
          </View>
        ) : null}

        {/* Les deux contrôles, hors du bouton de la tuile : des frères posés par-dessus. */}
        {items.length > 0 ? (
          <View style={{ position: 'absolute', top: 0, left: 0 }}>
            <ActionMenu
              ref={moveRef}
              items={items}
              label={labels.move(number)}
              icon="dots-six-vertical"
              size="small"
              variant="glass"
            />
          </View>
        ) : null}
        <View style={{ position: 'absolute', top: 0, right: 0 }}>
          <IconButton
            icon="x"
            size="small"
            variant="glass"
            label={labels.remove(number)}
            onPress={onRemove}
            disabled={busy}
          />
        </View>
      </View>

      {/* La raison, dans une région annoncée toujours montée sous la tuile (vide tant que la photo
          n'a pas échoué) : elle est lue en apparaissant, sans annonce à part. */}
      <View nativeID={reasonId}>
        <LiveStatus tone="danger" message={failed ? labels.failed(number, tile.error ?? '') : ''} />
      </View>
    </Animated.View>
  )
}

type AddProps = {
  full: boolean
  busy: boolean
  labels: PhotoTilesLabels
  size: { width: number; height: number }
  dragOver: boolean
  onPress: () => void
  fileHandlers: Record<string, (event: WebDragEvent) => void> | null
  addRef: { current: View | null }
  /** « Ajouter » disparaît ; `focused` : il avait le focus du clavier. */
  onGone: (focused: boolean) => void
}

/** Garde la trace du focus d'« Ajouter » au moment où il quitte la page (avant d'être retiré). */
const useGoneWatch = (addRef: { current: View | null }, onGone: (focused: boolean) => void) => {
  const latest = useRef(onGone)
  latest.current = onGone
  useLayoutEffect(() => {
    const node = addRef
    return () => latest.current(holdsFocus(node.current))
  }, [addRef])
}

/** La tuile « + Ajouter », en pointillés de miel : une place à remplir (téléphone). */
function AddTile({
  busy,
  labels,
  size,
  dragOver,
  onPress,
  fileHandlers,
  addRef,
  onGone,
  inZone = false,
}: AddProps & { inZone?: boolean }) {
  useGoneWatch(addRef, onGone)
  // Dans la zone de dépôt, c'est la zone qui reçoit les fichiers.
  useWebDrag(addRef, inZone ? {} : (fileHandlers ?? {}), false)
  return (
    <DashedPlace
      ref={addRef}
      label={labels.addLabel}
      onPress={onPress}
      busy={busy}
      dragOver={dragOver && !inZone}
      dashed={!inZone}
      style={{ width: size.width, height: size.height, borderRadius: radii.small }}
    >
      <Icon name="plus" size={22} tone="accent" />
      <Text variant="caption" weight={700} tone="accent" align="center">
        {labels.add}
      </Text>
    </DashedPlace>
  )
}

/**
 * La zone « Glisse tes images ici, ou choisis-les » (web, largeur d'ordinateur), qui reçoit des
 * fichiers. Elle garde dedans la tuile « + Ajouter » (même nom, même place dans l'ordre de Tab que
 * sur téléphone), puis la phrase et son bouton « choisis-les ».
 */
function DropZone(props: AddProps) {
  const { colors } = useTheme()
  const zone = useRef<View>(null)
  useWebDrag(zone, props.fileHandlers ?? {}, false)
  return (
    <View
      ref={zone}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        columnGap: space.lg,
        rowGap: space.xs,
        minHeight: props.size.height,
        padding: space.sm,
        borderRadius: radii.group,
        borderWidth: borders.strong,
        borderStyle: 'dashed',
        borderColor: colors.dashed,
        backgroundColor: props.dragOver ? colors.honeySoft : 'transparent',
      }}
    >
      <AddTile {...props} inZone />
      <View style={{ flexShrink: 1, maxWidth: '100%', alignItems: 'flex-start' }}>
        <Text variant="callout" weight={700}>
          {props.labels.dropZone}
        </Text>
        <TextLink
          role="button"
          tone="accent"
          label={props.labels.dropZoneChoose}
          onPress={() => {
            if (!props.busy) props.onPress()
          }}
        />
      </View>
    </View>
  )
}

/** Le cadre en pointillés de miel commun à « Ajouter » et à la zone de dépôt. */
function DashedPlace({
  ref,
  label,
  onPress,
  busy,
  dragOver,
  dashed = true,
  style,
  children,
}: {
  ref: { current: View | null }
  label: string
  onPress: () => void
  busy: boolean
  dragOver: boolean
  /** Faux dans la zone de dépôt, qui porte déjà les pointillés. */
  dashed?: boolean
  style: object
  children: ReactNode
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-busy={busy}
      onPress={() => {
        if (!busy) onPress()
      }}
      style={[
        {
          borderWidth: dashed ? borders.strong : 0,
          borderStyle: 'dashed',
          borderColor: colors.dashed,
          backgroundColor: dragOver ? colors.honeySoft : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.xs,
          minWidth: layout.touchTarget,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  )
}
