// La grille d'icônes où un administrateur choisit l'icône d'une catégorie (R6b, « Nouvelle
// catégorie »). C'est un groupe de boutons radio, comme `Choices` : une seule icône cochée, chacune
// nommée par son sens (« Fleur », « Vélo »), jamais par son code. Au clavier (web) : Tab n'arrive que
// sur une icône (la cochée, sinon la première), la barre d'espace la coche, les flèches passent à la
// voisine en la cochant et en faisant le tour. Chaque icône fait 44 × 44 points au moins.
import { borders, layout, radii, space } from '@ruche/brand'
import { useRef } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { spaceToggles } from './keyboard'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Le nom du groupe (« Icône »). */
  label: string
  /** Les icônes proposées et leur sens traduit, dans l'ordre d'affichage. */
  icons: { name: IconName; label: string }[]
  /** L'icône cochée ; null : aucune encore. */
  value: IconName | null
  onChange: (name: IconName) => void
}

type KeyEvent = { key: string; preventDefault: () => void }

export function IconGrid({ label, icons, value, onChange }: Props) {
  const { colors } = useTheme()
  // Les icônes, pour y poser le focus quand une flèche passe à la voisine.
  const refs = useRef<(View | null)[]>([])
  // Le seul arrêt de Tab (« tabIndex itinérant ») : l'icône cochée, sinon la première.
  const checkedIndex = icons.findIndex((icon) => icon.name === value)
  const tabStop = checkedIndex === -1 ? 0 : checkedIndex

  // Web seulement : les flèches (les quatre) cochent la voisine et lui donnent le focus, en
  // faisant le tour ; l'espace passe par spaceToggles, que react-native-web ne fait réagir que sur
  // les boutons.
  const keys = (index: number, name: IconName) => {
    if (Platform.OS !== 'web') return null
    const spaceBar = spaceToggles(() => onChange(name)) as {
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
        // preventDefault : la flèche ne fait pas défiler la page.
        event.preventDefault()
        const next = (index + step + icons.length) % icons.length
        const neighbour = icons[next]
        if (neighbour) onChange(neighbour.name)
        refs.current[next]?.focus()
      },
    }
  }

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}
    >
      {icons.map((icon, index) => {
        const checked = icon.name === value
        return (
          <Pressable
            key={icon.name}
            ref={(node) => {
              refs.current[index] = node
            }}
            accessibilityRole="radio"
            accessibilityLabel={icon.label}
            aria-checked={checked}
            onPress={() => onChange(icon.name)}
            {...keys(index, icon.name)}
            style={({ pressed }) => ({
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: layout.touchTarget,
              minHeight: layout.touchTarget,
              borderRadius: radii.pill,
              borderWidth: borders.strong,
              borderColor: checked ? colors.honey : colors.outline,
              backgroundColor: checked ? colors.honey : pressed ? colors.honeySoft : colors.surface,
            })}
          >
            <Icon name={icon.name} size={22} tone={checked ? 'onHoney' : 'muted'} />
          </Pressable>
        )
      })}
    </View>
  )
}
