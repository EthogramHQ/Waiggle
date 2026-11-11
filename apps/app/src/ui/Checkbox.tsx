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
// - Un détail facultatif (R7b : l'extrait d'un retour et sa date, sous « Inès · En partie ») s'écrit
//   sous le libellé, plus petit. Le nom reste le libellé seul ; le détail est sa description, lue
//   après lui, par le même chemin que l'erreur (aria-describedby sur le web, indice ailleurs).
import { borders, layout, radii, space } from '@ruche/brand'
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
  /**
   * Une ligne sous le libellé (« “le score repart à zéro au niveau 3” · il y a 2 jours ») : elle
   * décrit la case sans la nommer. Avec un détail, le libellé passe en gras, comme un titre.
   */
  detail?: string
  /** Pour y poser le focus du clavier, après un envoi refusé par exemple (voir focus.ts). */
  ref?: Ref<View>
}

// Dimensions de la maquette : une case de 24, arrondie à 7, bordée de 2.
const BOX = 24
const BOX_RADIUS = 7
const CHECK = 16

export function Checkbox({
  label,
  value,
  onValueChange,
  disabled = false,
  error,
  detail,
  ref,
}: Props) {
  const { colors } = useTheme()
  // useId : un identifiant stable (le même au pré-rendu web et dans le navigateur), qui relie la
  // case au texte de son erreur, et à son détail.
  const errorId = useId()
  const detailId = useId()
  const toggle = () => onValueChange(!value)
  // Ce qui décrit la case, dans l'ordre où on le voit : le détail, puis l'erreur. Sur le web,
  // aria-describedby prend plusieurs identifiants séparés par une espace ; ailleurs, l'indice
  // reprend les deux textes à la suite.
  const descriptions = [detail ? detailId : null, error ? errorId : null].filter(Boolean)
  const hint = [detail, error].filter(Boolean).join('. ')

  return (
    <View style={{ gap: space.xxs }}>
      <Pressable
        ref={ref}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        {...describedBy(descriptions.length > 0 ? descriptions.join(' ') : undefined)}
        {...invalid(Boolean(error))}
        // Sur le web, aria-describedby suffit ; ailleurs, l'indice joue ce rôle.
        accessibilityHint={Platform.OS === 'web' || hint === '' ? undefined : hint}
        aria-checked={value}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={toggle}
        {...spaceToggles(toggle, disabled)}
        style={{
          flexDirection: 'row',
          // Avec un détail, la case s'aligne sur la première ligne du libellé (la case et la ligne
          // du texte courant font toutes deux 24 points), comme sur la planche R7b ; sans détail,
          // elle reste centrée sur son libellé.
          alignItems: detail ? 'flex-start' : 'center',
          ...(detail ? { paddingVertical: space.xs } : null),
          gap: space.md,
          minHeight: layout.touchTarget,
          // L'anneau de focus du clavier (web) suit le contour de la rangée : arrondi, comme celui
          // des choix d'un RadioGroup, et non un rectangle à angles vifs.
          borderRadius: radii.small,
        }}
      >
        <View
          style={{
            width: BOX,
            height: BOX,
            borderRadius: BOX_RADIUS,
            borderWidth: borders.focus,
            // Le bord dit qu'il y a une case : 3:1 au moins contre le fond, vide (controlBorder) ou
            // cochée (controlChecked, autour du miel qui la remplit). En erreur : le rouge du refus.
            borderColor: value
              ? colors.controlChecked
              : error
                ? colors.dangerText
                : colors.controlBorder,
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
          <Text tone={disabled ? 'muted' : 'default'} weight={detail ? 600 : undefined}>
            {label}
          </Text>
          {/* Le détail : lu comme description (voir plus haut), pas comme une part du nom. */}
          {detail ? (
            <Text variant="caption" tone={disabled ? 'muted' : 'secondary'} nativeID={detailId}>
              {detail}
            </Text>
          ) : null}
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
