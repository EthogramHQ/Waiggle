// Un contrôle segmenté : deux à quatre choix côte à côte dans une capsule, le choix actif en relief
// (la « goutte ») : blanc le jour, crème la nuit (jeton `surfaceRaised`). Sur cette goutte, le texte
// est toujours à l'encre (ton `onHoney`) : la nuit, le texte clair ordinaire y était illisible.
// Sert pour l'apparence (Automatique / Jour / Nuit), la langue ou le fil de l'accueil. Annoncé
// comme un groupe de boutons radio, comme Choices.
// Au clavier (web) : Tab ne s'arrête qu'une fois dans le groupe, sur le choix actif (« tabIndex
// itinérant ») ; la barre d'espace ou Entrée choisit, et les flèches passent au choix voisin en le
// choisissant, comme dans tout groupe de boutons radio.
// Quand les choix ne tiennent pas sur la largeur (les onglets de la recherche à 320 points), ils
// restent sur une rangée qui défile de côté, plutôt que de laisser un choix seul sur une deuxième
// rangée (relecture de design de R3, 4) ; la bande montre toujours le choix actif en entier.
// Sur téléphone, avec le texte très agrandi, chaque choix prend sa propre ligne.
import { borders, layout, radii, space } from '@ruche/brand'
import { type Ref, useEffect, useImperativeHandle, useRef } from 'react'
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'
import { insetFocus } from './theme/document'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/** La place d'un choix dans la bande qui défile : son début et sa largeur, en points. */
type Place = { x: number; width: number }

/**
 * Où faire défiler la bande pour montrer un choix en entier : `null` s'il se voit déjà, sinon la
 * position qui l'amène juste au bord (avec `edge` d'air), du côté où il était caché. La bande ne
 * bouge donc que du nécessaire.
 */
export const scrollToShow = (
  place: Place | undefined,
  viewport: number,
  offset: number,
  edge = space.xxs,
): number | null => {
  if (!place || viewport <= 0) return null
  if (place.x < offset) return Math.max(0, place.x - edge)
  if (place.x + place.width > offset + viewport) return place.x + place.width - viewport + edge
  return null
}

type Option<T extends string> = {
  value: T
  label: string
  icon?: IconName
  /** Le nom lu par les lecteurs d'écran, s'il diffère du texte affiché (« FR » → « Français »). */
  spokenLabel?: string
}

/** Ce qu'un écran peut demander au contrôle : poser le focus du clavier sur le choix actif. */
export type SegmentedHandle = { focusChecked: () => void }

type Props<T extends string> = {
  /** Le nom du groupe, lu par les lecteurs d'écran (« Apparence »). */
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  /** Prend toute la largeur (par défaut) ou seulement la place de ses choix. */
  fill?: boolean
  /** Pour ramener le focus sur le choix actif (après un bouton qui a changé ce choix). */
  handle?: Ref<SegmentedHandle>
}

type KeyEvent = { key: string; repeat?: boolean; preventDefault: () => void }

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  fill = true,
  handle,
}: Props<T>) {
  const { colors, shadows } = useTheme()
  // fontScale : la taille de texte choisie sur l'appareil. Très agrandie, les choix vont à la ligne.
  const { fontScale } = useWindowDimensions()
  const large = fontScale >= 1.5
  // Les choix, pour y poser le focus (flèches, handle).
  const refs = useRef<(View | null)[]>([])
  useImperativeHandle(handle, () => ({
    focusChecked: () => refs.current[options.findIndex((o) => o.value === value)]?.focus(),
  }))

  // Le seul choix que Tab atteint : le choix actif (le premier, si la valeur n'est pas parmi les
  // choix). Sans cela, Tab s'arrêtait sur chaque segment avant de quitter le groupe.
  const checkedIndex = options.findIndex((option) => option.value === value)
  const tabStop = checkedIndex === -1 ? 0 : checkedIndex

  // La bande qui défile : sa largeur visible, sa position, et la place de chaque choix, gardées
  // dans des refs (les lire ne redessine rien).
  const scroller = useRef<ScrollView>(null)
  const viewport = useRef(0)
  const offset = useRef(0)
  const places = useRef<(Place | undefined)[]>([])
  const calm = useCalmMotion()
  /** Amène le choix actif en entier dans la bande (glissé, sauf « Réduire les animations »). */
  const reveal = (index: number, animated: boolean) => {
    const target = scrollToShow(places.current[index], viewport.current, offset.current)
    if (target !== null) scroller.current?.scrollTo({ x: target, animated: animated && !calm })
  }
  // Un autre choix actif (un toucher, les flèches, ou l'écran) : la bande le montre. Au premier
  // rendu, rien n'est encore mesuré : ce sont les mesures (plus bas) qui le montrent, sans glisser.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul le choix actif décide ; `reveal` ne lit que des refs.
  useEffect(() => {
    reveal(checkedIndex, true)
  }, [checkedIndex])
  const measurePlace = (index: number) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout
    places.current[index] = { x, width }
    if (index === checkedIndex) reveal(index, false)
  }

  // Sur le web : l'espace et Entrée choisissent (react-native-web ne le fait que pour les boutons),
  // les flèches passent au choix voisin, qui reçoit aussi le focus.
  const keys = (index: number) =>
    Platform.OS === 'web'
      ? {
          tabIndex: index === tabStop ? (0 as const) : (-1 as const),
          onKeyDown: (event: KeyEvent) => {
            const step =
              event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? 1
                : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  ? -1
                  : 0
            if (event.key === ' ' || event.key === 'Enter') {
              // preventDefault : l'espace ne fait pas défiler la page. Une touche gardée enfoncée
              // (repeat) ne rechoisit pas dix fois le même choix.
              event.preventDefault()
              if (!event.repeat) onChange(options[index]?.value ?? value)
            } else if (step !== 0) {
              event.preventDefault()
              const next = (index + step + options.length) % options.length
              const option = options[next]
              if (option) onChange(option.value)
              refs.current[next]?.focus()
            }
          },
        }
      : null

  const choices = options.map((option, index) => {
    const checked = option.value === value
    return (
      <Pressable
        key={option.value}
        ref={(node) => {
          refs.current[index] = node
        }}
        accessibilityRole="radio"
        accessibilityLabel={option.spokenLabel ?? option.label}
        aria-checked={checked}
        onPress={() => onChange(option.value)}
        onLayout={measurePlace(index)}
        {...keys(index)}
        // L'anneau du clavier à l'intérieur du choix : la bande qui défile rognerait un anneau
        // posé autour.
        {...insetFocus}
        style={{
          // Côte à côte, ils se partagent la largeur quand il y en a assez ; flexBasis 'auto' :
          // chacun part de la taille de son texte. Très agrandis (sur téléphone), chacun sa ligne.
          ...(fill || large ? { flexGrow: 1, flexBasis: large ? '100%' : 'auto' } : null),
          flexDirection: 'row',
          gap: space.xs,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: layout.touchTarget,
          minWidth: layout.touchTarget,
          paddingHorizontal: space.md,
          paddingVertical: space.xs,
          borderRadius: radii.pill,
          ...(checked ? { backgroundColor: colors.surfaceRaised, boxShadow: shadows.soft } : null),
        }}
      >
        {option.icon ? (
          <Icon name={option.icon} size={18} tone={checked ? 'onHoney' : 'muted'} />
        ) : null}
        {/* Le choix actif : l'encre sur la goutte, jour et nuit (paire de contraste
            onHoney / surfaceRaised dans packages/brand/src/colors.ts). */}
        <Text
          variant="callout"
          weight={checked ? 700 : 500}
          tone={checked ? 'onHoney' : 'muted'}
          align="center"
        >
          {option.label}
        </Text>
      </Pressable>
    )
  })

  // L'air entre les choix et autour d'eux, dans la capsule fine : chaque choix garde ses 44 points.
  const row = { gap: space.xxs, padding: space.xxs }
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        borderRadius: large ? radii.group : radii.pill,
        backgroundColor: colors.surfaceGrouped,
        borderWidth: borders.hairline,
        borderColor: colors.line,
        alignSelf: fill ? 'stretch' : 'flex-start',
        // Jamais plus large que la place : au-delà, la bande défile (sur le web, une vue ne
        // rétrécit pas d'elle-même sous la largeur de son contenu).
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      {large ? (
        // Très agrandis (téléphone seulement : le web ne connaît pas la taille de texte), chaque
        // choix sur sa ligne : une liste qui se lit de haut en bas, sans rien à faire défiler.
        <View style={{ ...row, flexDirection: 'row', flexWrap: 'wrap' }}>{choices}</View>
      ) : (
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          onLayout={(event: LayoutChangeEvent) => {
            viewport.current = event.nativeEvent.layout.width
            reveal(checkedIndex, false)
          }}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
            offset.current = event.nativeEvent.contentOffset.x
          }}
          // Une position lue au plus toutes les 16 ms (une image) pendant le défilement.
          scrollEventThrottle={16}
          // flexGrow : quand tout tient, la rangée prend toute la bande (les choix se la partagent).
          contentContainerStyle={{ ...row, flexGrow: 1 }}
        >
          {choices}
        </ScrollView>
      )}
    </View>
  )
}
