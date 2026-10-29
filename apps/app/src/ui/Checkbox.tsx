// La case à cocher de Miel 2 (refonte, tranche R1) : un carré arrondi de 24 points, bordé ; cochée,
// elle se remplit de miel avec une coche à l'encre. Son API reprend celle de l'interrupteur
// (Switch) : `value` et `onValueChange`. Elle sert à un accord (« J'accepte les règles ») ou à un
// choix multiple, là où l'interrupteur règle un réglage qui s'applique tout de suite.
// - Toute la ligne est la zone à toucher (44 points de haut au moins) : le libellé coche la case.
// - Les lecteurs d'écran l'annoncent comme une case, avec son nom et son état (`aria-checked`).
// - Sur le web, la barre d'espace la coche (react-native-web ne le fait que pour les boutons).
// - Une erreur s'écrit sous la ligne, en rouge ; sur le web, la case est marquée « invalide »
//   (aria-invalid) et décrite par l'erreur (aria-describedby) ; sur téléphone, l'erreur est lue
//   dans l'indice. Le nom donné au Pressable cache le texte qu'il contient, d'où ces liens à part.
import { borders, layout, space } from '@ruche/brand'
import { type Ref, useId } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { describedBy, invalid } from './aria'
import { Icon } from './Icon'
import { spaceToggles } from './keyboard'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  label: string
  value: boolean
  onValueChange: (value: boolean) => void
  disabled?: boolean
  /** Le message d'une case à cocher obligatoire laissée vide (« Coche cette case pour continuer. »). */
  error?: string
  /** Pour y poser le focus du clavier, après un envoi refusé par exemple (voir focus.ts). */
  ref?: Ref<View>
}

// Dimensions de la maquette : une case de 24, arrondie à 7, bordée de 2.
const BOX = 24
const BOX_RADIUS = 7
const CHECK = 16

export function Checkbox({ label, value, onValueChange, disabled = false, error, ref }: Props) {
  const { colors } = useTheme()
  // useId : un identifiant stable (le même au pré-rendu web et dans le navigateur), qui relie la
  // case au texte de son erreur.
  const errorId = useId()
  const toggle = () => onValueChange(!value)

  return (
    <View style={{ gap: space.xxs }}>
      <Pressable
        ref={ref}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        {...describedBy(error ? errorId : undefined)}
        {...invalid(Boolean(error))}
        // Sur le web, aria-describedby suffit ; ailleurs, l'indice joue ce rôle.
        accessibilityHint={Platform.OS === 'web' ? undefined : error}
        aria-checked={value}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={toggle}
        {...spaceToggles(toggle, disabled)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          minHeight: layout.touchTarget,
        }}
      >
        <View
          style={{
            width: BOX,
            height: BOX,
            borderRadius: BOX_RADIUS,
            borderWidth: borders.focus,
            // Cochée : le miel remplit la case, bordure comprise. En erreur : la bordure du champ refusé.
            borderColor: value ? colors.honey : error ? colors.dangerText : colors.lineStrong,
            backgroundColor: value ? colors.honey : colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.55 : 1,
          }}
        >
          {value ? <Icon name="check" size={CHECK} tone="onHoney" /> : null}
        </View>
        {/* flexShrink : un libellé long passe à la ligne au lieu de sortir de l'écran. */}
        <View style={{ flexShrink: 1 }}>
          <Text tone={disabled ? 'muted' : 'default'}>{label}</Text>
        </View>
      </Pressable>
      {error ? (
        <Text variant="caption" tone="danger" nativeID={errorId}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}
