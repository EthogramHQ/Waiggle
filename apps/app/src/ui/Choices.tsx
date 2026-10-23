// Une question à choix unique (statut, visibilité…) : une rangée de pastilles dont une seule est
// cochée, en miel. Les lecteurs d'écran l'annoncent comme un groupe de boutons radio, ce qui permet
// aussi aux tests de retrouver chaque choix par son nom : getByRole('radio', { name: 'Testable' }).
// Au clavier (web), comme tout groupe de boutons radio (et comme Segmented) : Tab n'arrive que sur
// un choix, la barre d'espace le coche, et les flèches passent au choix voisin en le cochant.
import { borders, layout, radii, space } from '@ruche/brand'
import { useRef } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { spaceToggles } from './keyboard'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Option<T extends string> = { value: T; label: string; icon?: IconName }

// <T extends string> : un composant « générique ». T est le type des valeurs possibles
// ('idea' | 'building' | …) : TypeScript vérifie que les options et la valeur choisie concordent.
type Props<T extends string> = {
  label: string
  options: Option<T>[]
  /** Le choix coché ; null : aucun encore (une question à laquelle il faut répondre soi-même). */
  value: T | null
  onChange: (value: T) => void
}

type KeyEvent = { key: string; preventDefault: () => void }

export function Choices<T extends string>({ label, options, value, onChange }: Props<T>) {
  const { colors } = useTheme()
  // Les choix, pour y poser le focus quand une flèche passe au voisin.
  const refs = useRef<(View | null)[]>([])
  // Le seul choix que Tab atteint (« tabIndex itinérant ») : le choix coché, ou le premier quand
  // rien ne l'est encore. Sans cela, Tab s'arrêterait sur chaque pastille du groupe.
  const checkedIndex = options.findIndex((option) => option.value === value)
  const tabStop = checkedIndex === -1 ? 0 : checkedIndex

  // Sur le web seulement : les flèches cochent le choix voisin et lui donnent le focus (en faisant
  // le tour). La barre d'espace passe par spaceToggles (keyboard.ts), comme les autres radios :
  // react-native-web ne la fait réagir que sur les boutons.
  const keys = (index: number, option: Option<T>) => {
    if (Platform.OS !== 'web') return null
    const spaceBar = spaceToggles(() => onChange(option.value)) as {
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
        const next = (index + step + options.length) % options.length
        const neighbour = options[next]
        if (neighbour) onChange(neighbour.value)
        refs.current[next]?.focus()
      },
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      <Text variant="caption" weight={600} tone="muted">
        {label}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}
      >
        {options.map((option, index) => {
          const checked = option.value === value
          return (
            <Pressable
              key={option.value}
              ref={(node) => {
                refs.current[index] = node
              }}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              aria-checked={checked}
              onPress={() => onChange(option.value)}
              {...keys(index, option)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.xs,
                minHeight: layout.touchTarget,
                paddingHorizontal: space.lg,
                borderRadius: radii.pill,
                borderWidth: borders.strong,
                borderColor: checked ? colors.honey : colors.outline,
                backgroundColor: checked
                  ? colors.honey
                  : pressed
                    ? colors.honeySoft
                    : colors.surface,
              })}
            >
              {option.icon ? (
                <Icon name={option.icon} size={18} tone={checked ? 'onHoney' : 'muted'} />
              ) : null}
              <Text
                variant="callout"
                weight={checked ? 700 : 500}
                tone={checked ? 'onHoney' : 'default'}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
