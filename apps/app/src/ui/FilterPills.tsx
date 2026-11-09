// Une rangée de pastilles de filtre (tranche R6b) : « Toutes », puis chaque choix (une catégorie,
// un statut), une seule pastille cochée, en miel. Sert au-dessus de « Récents » dans Explorer, et
// sur la page d'un outil (le statut, puis les catégories de ses projets).
// Elle part de `Choices` (relecture du plan de R6b, A1) : même rôle (un groupe de boutons radio
// nommé), mêmes pastilles miel à icône, même clavier sur le web (un seul arrêt de Tab, sur la
// pastille cochée ; la barre d'espace coche ; les flèches passent à la voisine en la cochant). Ce
// qu'elle ajoute :
// - « Toutes » en tête, qui vaut « aucun filtre » : `null`, jamais une valeur sentinelle (`all`
//   pourrait être un vrai code de catégorie) ;
// - un nombre à côté du nom (« Cuisine 3 »), lu dans le nom par `spokenLabel` (« Cuisine, 3
//   projets ») : le chiffre seul ne dirait rien à l'oreille ;
// - `scroll` : les pastilles restent sur une ligne qui défile de côté (téléphone), et la bande
//   montre toujours la pastille cochée en entier (`scrollToShow`, celui de `Segmented`) ; sans
//   `scroll`, elles passent à la ligne ;
// - `groups` : d'autres groupes posés à la suite sur la même rangée, séparés par un trait (le statut
//   puis les catégories, sur ordinateur). Chacun reste un groupe de radios à part, avec son nom, sa
//   valeur et son propre arrêt de Tab.
import { borders, layout, radii, space } from '@ruche/brand'
import { type ReactNode, useEffect, useRef } from 'react'
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native'
import { Icon, type IconName } from './Icon'
import { spaceToggles } from './keyboard'
import { scrollToShow } from './Segmented'
import { Text } from './Text'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/** Un choix de la rangée. */
export type FilterPillOption<T extends string> = {
  value: T
  /** Le nom affiché (« Cuisine »). */
  label: string
  /** Une icône avant le nom (décorative : le nom lu reste le nom). */
  icon?: IconName
  /** Un nombre affiché après le nom (« 3 ») ; à dire aussi dans `spokenLabel`. */
  count?: number
  /** Le nom lu par les lecteurs d'écran, s'il diffère du nom affiché (« Cuisine, 3 projets »). */
  spokenLabel?: string
}

/**
 * Un groupe de pastilles : un nom (celui du groupe de radios), le libellé de « Toutes », la valeur
 * cochée (`null` : « Toutes ») et les choix. `onChange` est écrit en méthode : un groupe aux
 * valeurs précises (`'testable' | 'done'`) se range ainsi dans la liste `groups`, faite de groupes
 * aux valeurs quelconques.
 */
export type FilterPillGroup<T extends string = string> = {
  label: string
  allLabel: string
  value: T | null
  options: FilterPillOption<T>[]
  onChange(value: T | null): void
}

type Props<T extends string> = {
  /** Le nom du groupe, lu par les lecteurs d'écran (« Catégories des projets récents »). */
  label: string
  /** Le libellé de la première pastille, qui retire le filtre (« Toutes »). */
  allLabel: string
  /** La valeur cochée ; `null` : « Toutes ». */
  value: T | null
  options: FilterPillOption<T>[]
  /**
   * D'autres groupes, posés après celui-ci sur la même rangée et séparés par un trait (le statut,
   * puis les catégories). Chacun est un groupe de radios à part entière.
   */
  groups?: readonly FilterPillGroup[]
  /** Une ligne qui défile de côté (téléphone) ; sinon, les pastilles passent à la ligne. */
  scroll?: boolean
  /** Le choix touché, ou `null` pour « Toutes ». `NoInfer` : T se déduit des choix et de la valeur. */
  onChange: (value: NoInfer<T> | null) => void
}

/** La place d'une pastille dans la bande qui défile : son début et sa largeur, en points. */
type Place = { x: number; width: number }

type KeyEvent = { key: string; preventDefault: () => void }

/** Montre une place de la bande (glissé si `animated`), ce que la bande décide seule. */
type Reveal = (place: Place | undefined, animated: boolean) => void

/**
 * Un groupe de pastilles. Dans la bande qui défile, il mesure sa place et celle de ses pastilles,
 * et demande à la bande de montrer la pastille cochée quand elle change.
 */
function PillGroup<T extends string>({
  group,
  reveal,
}: {
  group: FilterPillGroup<T>
  reveal: Reveal | null
}) {
  const { label, allLabel, value, options, onChange } = group
  const { colors } = useTheme()
  // « Toutes » d'abord, puis chaque choix ; `value: null` pour « Toutes ».
  const pills: { value: T | null; option: FilterPillOption<T> | null }[] = [
    { value: null, option: null },
    ...options.map((option) => ({ value: option.value, option })),
  ]
  // Les pastilles, pour y poser le focus quand une flèche passe à la voisine.
  const refs = useRef<(View | null)[]>([])
  // La pastille cochée, seul arrêt de Tab du groupe (« tabIndex itinérant ») ; une valeur absente
  // des choix (une catégorie qui n'a plus de projet) laisse l'arrêt sur « Toutes ».
  const checkedIndex = pills.findIndex((pill) => pill.value === value)
  const tabStop = checkedIndex === -1 ? 0 : checkedIndex

  // Dans la bande : le début du groupe, et la place de chaque pastille dans le groupe (gardés dans
  // des refs : les lire ne redessine rien).
  const groupX = useRef(0)
  const places = useRef<(Place | undefined)[]>([])
  const placeOf = (index: number): Place | undefined => {
    const place = places.current[index]
    return place ? { x: groupX.current + place.x, width: place.width } : undefined
  }
  // Une autre pastille cochée (un toucher, les flèches, l'écran) : la bande la montre. Au premier
  // rendu, rien n'est encore mesuré : ce sont les mesures (plus bas) qui la montrent, sans glisser.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seule la pastille cochée décide ; `placeOf` ne lit que des refs.
  useEffect(() => {
    reveal?.(placeOf(tabStop), true)
  }, [tabStop])

  // Sur le web seulement : la barre d'espace coche (react-native-web ne la fait réagir que sur les
  // boutons), les flèches cochent la voisine et lui donnent le focus, en faisant le tour.
  const keys = (index: number, next: T | null) => {
    if (Platform.OS !== 'web') return null
    const spaceBar = spaceToggles(() => onChange(next)) as {
      onKeyDown?: (event: KeyEvent) => void
    }
    return {
      tabIndex: index === tabStop ? (0 as const) : (-1 as const),
      onKeyDown: (event: KeyEvent) => {
        const step =
          event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              ? -1
              : 0
        if (step === 0) {
          spaceBar.onKeyDown?.(event)
          return
        }
        // preventDefault : la flèche ne fait défiler ni la page ni la bande.
        event.preventDefault()
        const target = (index + step + pills.length) % pills.length
        const neighbour = pills[target]
        if (neighbour) onChange(neighbour.value)
        refs.current[target]?.focus()
      },
    }
  }

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={
        reveal
          ? (event: LayoutChangeEvent) => {
              groupX.current = event.nativeEvent.layout.x
            }
          : undefined
      }
      style={{
        flexDirection: 'row',
        // Dans la bande, une seule ligne ; sinon, les pastilles passent à la ligne.
        flexWrap: reveal ? 'nowrap' : 'wrap',
        gap: space.sm,
        // Sur le web, une vue ne rétrécit pas d'elle-même : sans cela, un groupe plus large que la
        // colonne en sortirait au lieu de passer à la ligne.
        ...(reveal ? null : { flexShrink: 1, maxWidth: '100%' }),
      }}
    >
      {pills.map((pill, index) => {
        const checked = index === checkedIndex
        const option = pill.option
        const name = option ? option.label : allLabel
        return (
          <Pressable
            key={pill.value ?? ''}
            ref={(node) => {
              refs.current[index] = node
            }}
            accessibilityRole="radio"
            accessibilityLabel={option?.spokenLabel ?? name}
            aria-checked={checked}
            onPress={() => onChange(pill.value)}
            onLayout={
              reveal
                ? (event: LayoutChangeEvent) => {
                    const { x, width } = event.nativeEvent.layout
                    places.current[index] = { x, width }
                    if (index === tabStop) reveal(placeOf(index), false)
                  }
                : undefined
            }
            {...keys(index, pill.value)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              // Hors de la bande, un nom long (texte agrandi, petit écran) passe à la ligne dans sa
              // pastille au lieu de sortir de l'écran (react-native-web donne `flexShrink: 0`).
              ...(reveal ? { flexShrink: 0 } : { maxWidth: '100%', flexShrink: 1 }),
              minHeight: layout.touchTarget,
              paddingHorizontal: space.lg,
              borderRadius: radii.pill,
              borderWidth: borders.strong,
              borderColor: checked ? colors.honey : colors.outline,
              backgroundColor: checked ? colors.honey : pressed ? colors.honeySoft : colors.surface,
            })}
          >
            {option?.icon ? (
              <Icon name={option.icon} size={18} tone={checked ? 'onHoney' : 'muted'} />
            ) : null}
            <View style={{ flexShrink: 1 }}>
              <Text
                variant="callout"
                weight={checked ? 700 : 500}
                tone={checked ? 'onHoney' : 'default'}
              >
                {name}
              </Text>
            </View>
            {option?.count === undefined ? null : (
              // Le nombre, plus discret que le nom ; sur le miel, à l'encre comme le nom.
              <Text variant="callout" weight={500} tone={checked ? 'onHoney' : 'muted'}>
                {String(option.count)}
              </Text>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

/** Le trait entre deux groupes : décoratif, caché aux lecteurs d'écran. */
function Divider() {
  const { colors } = useTheme()
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{
        width: borders.hairline,
        alignSelf: 'stretch',
        marginVertical: space.sm,
        backgroundColor: colors.lineStrong,
      }}
    />
  )
}

// <T extends string> : un composant « générique », comme Choices. T est le type des valeurs
// (des codes de catégorie) : TypeScript vérifie que les choix, la valeur et la fonction concordent.
export function FilterPills<T extends string>({
  label,
  allLabel,
  value,
  options,
  groups = [],
  scroll = false,
  onChange,
}: Props<T>): ReactNode {
  const calm = useCalmMotion()
  // La bande qui défile : sa largeur visible et sa position, gardées dans des refs.
  const scroller = useRef<ScrollView>(null)
  const viewport = useRef(0)
  const offset = useRef(0)
  // La dernière place demandée, montrée à nouveau quand la bande se mesure.
  const wanted = useRef<Place | undefined>(undefined)
  const reveal: Reveal = (place, animated) => {
    if (place) wanted.current = place
    const target = scrollToShow(place, viewport.current, offset.current)
    if (target !== null) scroller.current?.scrollTo({ x: target, animated: animated && !calm })
  }

  // Ce groupe-ci, puis les autres : une liste de groupes aux valeurs quelconques (chacun garde
  // pour lui le type précis de ses valeurs).
  const own: FilterPillGroup<T> = { label, allLabel, value, options, onChange }
  const every: FilterPillGroup[] = [own, ...groups]
  const content = every.flatMap((group, index) => {
    const pills = (
      <PillGroup key={`group-${group.label}`} group={group} reveal={scroll ? reveal : null} />
    )
    return index === 0 ? [pills] : [<Divider key={`divider-${group.label}`} />, pills]
  })

  if (!scroll) {
    return (
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: space.lg,
          rowGap: space.sm,
          maxWidth: '100%',
        }}
      >
        {content}
      </View>
    )
  }
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(event: LayoutChangeEvent) => {
        viewport.current = event.nativeEvent.layout.width
        reveal(wanted.current, false)
      }}
      onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
        offset.current = event.nativeEvent.contentOffset.x
      }}
      // Une position lue au plus toutes les 16 ms (une image) pendant le défilement.
      scrollEventThrottle={16}
      // La bande déborde de la colonne de l'air qu'il faut à l'anneau du focus (posé autour de la
      // pastille, une bande qui défile le rognerait) ; ses pastilles restent alignées sur la
      // colonne. Pas d'anneau intérieur ici : il ne se verrait pas sur la pastille miel.
      style={{ marginHorizontal: -space.sm, marginVertical: -space.sm, flexGrow: 0 }}
      contentContainerStyle={{ padding: space.sm, gap: space.lg, alignItems: 'stretch' }}
    >
      {content}
    </ScrollView>
  )
}
