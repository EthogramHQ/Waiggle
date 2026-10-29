// Le bouton radio rond de Miel 2 (refonte, tranche R1), en deux morceaux :
// - RadioMark : le rond dessiné seul (24 points, un point de miel au centre quand il est choisi,
//   entouré d'un halo). Il n'a aucun rôle : la ligne qui le contient (une ligne de ListGroup, un
//   choix de RadioGroup) porte déjà le rôle « radio » ; un second rôle ferait annoncer chaque
//   choix deux fois.
// - RadioGroup : une question à choix unique, en liste verticale (« Taille de la ruche »). Les
//   lecteurs d'écran l'annoncent comme un groupe de boutons radio. Au clavier (web), comme tout
//   groupe de radios : Tab n'arrive que sur un choix (« tabIndex itinérant »), la barre d'espace le
//   coche, et les flèches passent au choix voisin en le cochant, en sautant les choix inactifs.
//   Choices fait la même chose en pastilles, sur une rangée ; RadioGroup sert quand les libellés
//   sont longs ou nombreux.
import { borders, layout, radii, space } from '@ruche/brand'
import { useRef } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { spaceToggles } from './keyboard'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

// Dimensions : un rond de 24, un point clair de 8 au centre du rond choisi, un halo de 3.
const SIZE = 24
const DOT = 8
const HALO = 3

type MarkProps = {
  /** Le choix est coché : le rond se remplit de miel, avec un point clair au centre. */
  selected: boolean
  /** Le choix ne peut pas être pris : le rond pâlit. */
  disabled?: boolean
}

/**
 * Le rond d'un bouton radio, sans rôle ni geste : c'est la ligne qui le porte qui réagit.
 * Choisi, c'est un rond plein de miel avec un point clair au centre (décision du 29/10/2026) : un
 * simple point miel sur du blanc ne faisait que 1,6:1, trop peu pour dire un état (WCAG 1.4.11).
 * Le bord du rond tient 3:1 contre le fond, vide (controlBorder) comme choisi (controlChecked) :
 * les deux couples sont mesurés dans contrastPairs (packages/brand/src/colors.ts).
 */
export function RadioMark({ selected, disabled = false }: MarkProps) {
  const { colors } = useTheme()
  return (
    <View
      // Décoratif pour les lecteurs d'écran (iOS, Android, web) : l'état est dit par la ligne.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        borderWidth: borders.focus,
        borderColor: selected ? colors.controlChecked : colors.controlBorder,
        backgroundColor: selected ? colors.honey : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        // Le halo : un anneau de miel pâle autour du rond choisi (une ombre sans flou ni décalage).
        boxShadow: selected ? `0 0 0 ${HALO}px ${colors.honeySoft}` : undefined,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {selected ? (
        <View
          style={{
            width: DOT,
            height: DOT,
            borderRadius: DOT / 2,
            // Le point clair, le même blanc que la pastille d'un interrupteur, de jour et de nuit.
            backgroundColor: colors.knob,
          }}
        />
      ) : null}
    </View>
  )
}

export type RadioOption<T extends string> = {
  value: T
  label: string
  /** Un choix qu'on voit mais qu'on ne peut pas prendre (annoncé « désactivé »). */
  disabled?: boolean
}

// <T extends string> : un composant « générique ». T est le type des valeurs possibles
// ('small' | 'medium' | …) : TypeScript vérifie que les options et la valeur choisie concordent.
type GroupProps<T extends string> = {
  /** La question, affichée au-dessus des choix et donnée comme nom au groupe. */
  label: string
  options: RadioOption<T>[]
  /** Le choix coché ; null : aucun encore (une question à laquelle il faut répondre soi-même). */
  value: T | null
  onChange: (value: T) => void
}

type KeyEvent = { key: string; preventDefault: () => void }

/** Le pas d'une flèche : +1 vers le bas ou la droite, -1 vers le haut ou la gauche, 0 sinon. */
const arrowStep = (key: string): number =>
  key === 'ArrowRight' || key === 'ArrowDown'
    ? 1
    : key === 'ArrowLeft' || key === 'ArrowUp'
      ? -1
      : 0

export function RadioGroup<T extends string>({ label, options, value, onChange }: GroupProps<T>) {
  const { colors } = useTheme()
  // Les choix, pour y poser le focus quand une flèche passe au voisin.
  const refs = useRef<(View | null)[]>([])
  // Le seul choix que Tab atteint : le choix coché, sinon le premier qu'on peut prendre. Jamais un
  // choix inactif : Tab s'y arrêterait sans qu'on puisse rien en faire.
  const checkedIndex = options.findIndex((option) => option.value === value && !option.disabled)
  const tabStop =
    checkedIndex === -1 ? options.findIndex((option) => !option.disabled) : checkedIndex

  /** Le prochain choix actif dans la direction `step`, en faisant le tour ; -1 s'il n'y en a pas. */
  const neighbour = (from: number, step: number): number => {
    for (let i = 1; i <= options.length; i += 1) {
      const next = (from + step * i + options.length * i) % options.length
      if (!options[next]?.disabled) return next
    }
    return -1
  }

  // Sur le web seulement : les flèches et la barre d'espace (react-native-web ne fait réagir
  // l'espace que les boutons, voir keyboard.ts).
  const keys = (index: number, option: RadioOption<T>) => {
    if (Platform.OS !== 'web') return null
    const spaceBar = spaceToggles(() => onChange(option.value), option.disabled) as {
      onKeyDown?: (event: KeyEvent) => void
    }
    return {
      tabIndex: index === tabStop ? (0 as const) : (-1 as const),
      onKeyDown: (event: KeyEvent) => {
        const step = arrowStep(event.key)
        if (step === 0) {
          spaceBar.onKeyDown?.(event)
          return
        }
        // preventDefault : la flèche ne fait pas défiler la page.
        event.preventDefault()
        const next = neighbour(index, step)
        const chosen = options[next]
        if (!chosen) return
        onChange(chosen.value)
        refs.current[next]?.focus()
      },
    }
  }

  return (
    <View style={{ gap: space.xs }}>
      <Text variant="caption" weight={600} tone="muted">
        {label}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option, index) => {
          const checked = option.value === value
          const disabled = option.disabled ?? false
          return (
            <Pressable
              key={option.value}
              ref={(node) => {
                refs.current[index] = node
              }}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              aria-checked={checked}
              aria-disabled={disabled}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              {...keys(index, option)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                minHeight: layout.touchTarget,
                paddingVertical: space.xs,
                // Un fond à peine miel sous le doigt : on voit quel choix on est en train de prendre.
                backgroundColor: pressed && !disabled ? colors.honeySoft : 'transparent',
                borderRadius: radii.small,
              })}
            >
              <RadioMark selected={checked} disabled={disabled} />
              {/* flexShrink : un libellé long passe à la ligne au lieu de sortir de l'écran. */}
              <View style={{ flexShrink: 1 }}>
                <Text tone={disabled ? 'muted' : 'default'}>{option.label}</Text>
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
