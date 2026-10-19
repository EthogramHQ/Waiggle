// Un contrôle segmenté : deux à quatre choix côte à côte dans une capsule, le choix actif en blanc
// plein (la « goutte »). Sert pour l'apparence (Automatique / Jour / Nuit), la langue ou le fil de
// l'accueil. Annoncé comme un groupe de boutons radio, comme Choices.
// Au clavier (web) : Tab arrive sur les choix, la barre d'espace ou Entrée en choisit un, et les
// flèches passent au choix voisin, comme dans tout groupe de boutons radio.
// Quand le texte est très agrandi, les choix vont à la ligne au lieu de se chevaucher.
import { borders, layout, radii, space } from '@ruche/brand'
import { type Ref, useImperativeHandle, useRef } from 'react'
import { Platform, Pressable, useWindowDimensions, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

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

type KeyEvent = { key: string; preventDefault: () => void }

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

  // Sur le web : l'espace choisit (react-native-web ne le fait que pour les boutons), les flèches
  // passent au choix voisin, qui reçoit aussi le focus.
  const keys = (index: number) =>
    Platform.OS === 'web'
      ? {
          onKeyDown: (event: KeyEvent) => {
            const step =
              event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? 1
                : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  ? -1
                  : 0
            if (event.key === ' ') {
              event.preventDefault()
              onChange(options[index]?.value ?? value)
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

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        // Très agrandis, les choix passent à la ligne plutôt que de se chevaucher ou d'être coupés.
        flexWrap: 'wrap',
        // Une capsule fine autour des choix : chaque choix garde ses 44 points à toucher.
        padding: space.xxs,
        gap: space.xxs,
        borderRadius: large ? radii.group : radii.pill,
        backgroundColor: colors.surfaceGrouped,
        borderWidth: borders.hairline,
        borderColor: colors.line,
        alignSelf: fill ? 'stretch' : 'flex-start',
      }}
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
            accessibilityLabel={option.spokenLabel ?? option.label}
            aria-checked={checked}
            onPress={() => onChange(option.value)}
            {...keys(index)}
            style={{
              // Côte à côte, chacun sa part de largeur ; très agrandis, chacun sa ligne entière.
              ...(fill || large ? { flexGrow: 1, flexBasis: large ? '100%' : 0 } : null),
              flexDirection: 'row',
              gap: space.xs,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: layout.touchTarget,
              minWidth: layout.touchTarget,
              paddingHorizontal: space.md,
              paddingVertical: space.xs,
              borderRadius: radii.pill,
              ...(checked
                ? { backgroundColor: colors.surfaceRaised, boxShadow: shadows.soft }
                : null),
            }}
          >
            {option.icon ? (
              <Icon name={option.icon} size={18} tone={checked ? 'default' : 'muted'} />
            ) : null}
            <Text
              variant="callout"
              weight={checked ? 700 : 500}
              tone={checked ? 'default' : 'muted'}
              align="center"
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
