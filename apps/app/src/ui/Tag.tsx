// Une étiquette d'outil ou de modèle (« Claude », « Python »). Touchée, elle mène à la page de
// l'étiquette ; sans `onPress`, c'est une simple pastille. Avec `count` (R3, « Outils populaires »
// d'Explorer sur ordinateur), elle affiche aussi le nombre de projets publics qui citent l'outil.
import { borders, layout, radii, space } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, View, type ViewStyle } from 'react-native'
import { enterActivates } from './keyboard'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  label: string
  onPress?: () => void
  /** Sur une image ou une lumière d'ambiance : en verre. */
  onGlass?: boolean
  /**
   * Le nombre de projets publics qui citent l'outil (« Claude 41 »). Le chiffre affiché reste hors
   * du nom lu, qui le dit en toutes lettres : « Claude, 41 projets publics » (relecture de
   * l'interface de R3 : un nombre nu, lu seul, ne dit pas ce qu'il compte).
   */
  count?: number
}

export function Tag({ label, onPress, onGlass = false, count }: Props) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  // Le nom lu : le libellé seul, ou le libellé et son nombre au pluriel de la langue de l'appli.
  const spoken =
    count === undefined
      ? label
      : t(($) => $.tools.withCount, {
          label,
          projects: t(($) => $.tools.projects, { count }),
        })
  const box: ViewStyle = {
    alignSelf: 'flex-start',
    // Jamais plus large que la ligne : un nom d'outil très long passe à la ligne.
    maxWidth: '100%',
    minHeight: layout.chipHeight,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    borderWidth: borders.hairline,
    backgroundColor: onGlass ? colors.glass : colors.surface,
    borderColor: onGlass ? colors.glassBorder : colors.outline,
  }
  const name = (
    // Un nom très long tient sur une ligne, abrégé par « … » : la pastille garde sa forme. Le nom
    // complet reste lu par les lecteurs d'écran (accessibilityLabel) et présent dans la page.
    // Le rôle `mono` (Miel 2) : les noms d'outils et de modèles en police à chasse fixe.
    <Text variant="mono" numberOfLines={1}>
      {label}
    </Text>
  )
  const content =
    count === undefined ? (
      name
    ) : (
      // Le nom puis le nombre, plus discret, sur la même ligne. Le nom peut rétrécir (flexShrink, et
      // son « … ») ; le nombre, jamais : on le lit toujours en entier. Chiffres de même largeur
      // (tabular) : deux étiquettes voisines gardent leurs nombres alignés.
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, maxWidth: '100%' }}>
        <View style={{ flexShrink: 1 }}>{name}</View>
        <Text variant="mono" tone="muted" tabular>
          {String(count)}
        </Text>
      </View>
    )
  // La pastille dessinée fait 36 points de haut ; autour d'elle, une zone de 44. Touchable, c'est
  // la zone à toucher ; simple pastille, elle garde la même hauteur, pour que les deux sortes
  // restent alignées sur une même ligne (sinon la simple pastille remontait de 4 points).
  const frame: ViewStyle = {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: layout.touchTarget,
    justifyContent: 'center',
  }
  if (!onPress) {
    // Une simple pastille avec un nombre se lit d'un bloc, par son nom complet. Un nom sans rôle
    // serait ignoré sur le web : « texte » sur téléphone, image sur le web (comme l'Avatar), le
    // seul rôle qui y fait lire le nom d'un bloc non touchable.
    const counted =
      count === undefined
        ? null
        : {
            accessible: true,
            accessibilityLabel: spoken,
            ...(Platform.OS === 'web'
              ? { role: 'img' as const }
              : { accessibilityRole: 'text' as const }),
          }
    return (
      <View style={frame} {...counted}>
        <View style={box}>{content}</View>
      </View>
    )
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={spoken}
      // Entrée ouvre l'étiquette sur le web, comme un vrai lien (voir keyboard.ts).
      {...enterActivates(onPress)}
      onPress={onPress}
      style={{ ...frame, minWidth: layout.touchTarget }}
    >
      {({ pressed }) => (
        <View style={[box, pressed && { backgroundColor: colors.honeySoft }]}>{content}</View>
      )}
    </Pressable>
  )
}
