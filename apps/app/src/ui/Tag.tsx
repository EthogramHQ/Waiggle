// Une étiquette d'outil ou de modèle (« Claude », « Python »). Touchée, elle mène à la page de
// l'étiquette ; sans `onPress`, c'est une simple pastille. Avec `count` (R3, « Outils populaires »
// d'Explorer sur ordinateur), elle affiche aussi le nombre de projets publics qui citent l'outil.
// Avec `icon` (R6a), elle sert aussi à la catégorie d'un projet, en verre sur sa photo.
import { borders, layout, radii, space } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, View, type ViewStyle } from 'react-native'
import { Icon, type IconName } from './Icon'
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
  /**
   * R6a : une icône dessinée avant le libellé (la catégorie d'un projet sur sa carte : la planète de
   * « Sciences et espace »). Décorative : le nom lu reste le libellé, l'icône est cachée aux
   * lecteurs d'écran (Icon).
   */
  icon?: IconName
  /**
   * Correction C2 de R6a (relecture de design, C3) : ce que l'étiquette nomme. `tool` (par défaut) :
   * un outil ou un modèle, en police à chasse fixe (`mono`), que Miel réserve aux outils, versions
   * et prompts. `category` : la catégorie d'un projet (« Sciences et espace »), en police de texte,
   * comme sur les planches R6-Danse et R6-Publier-Desktop ; plus étroite, elle tient aussi entière
   * dans l'aperçu de la feuille de publication.
   */
  kind?: 'tool' | 'category'
  /**
   * R6b : l'outil est-il entré au catalogue ? Par défaut oui. Un « Autre » (`false`), cité par un
   * membre mais pas encore au catalogue, n'a pas de page : c'est un texte simple, jamais un lien,
   * même avec `onPress` (qui est alors ignoré). Un lecteur d'écran le lit en entier : « Teachable
   * Machine, autre outil, pas encore dans le catalogue ».
   */
  inCatalogue?: boolean
}

export function Tag({
  label,
  onPress,
  onGlass = false,
  count,
  icon,
  kind = 'tool',
  inCatalogue = true,
}: Props) {
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
    // Relectures de R6b (design C2, interface C4) : un « Autre » n'a pas de page, il ne ressemble
    // donc pas à une pastille qu'on touche. Un contour en tirets, sans fond plein (comme un mois pas
    // encore arrivé dans MonthField : la forme dit « pas comme les autres », pas la couleur seule).
    // Sur une photo, le verre reste, pour que le nom se lise. Son nom, qu'aucune page ne permet de
    // relire, passe à la ligne : les coins deviennent ceux d'un panneau, dont la courbe ne passe
    // pas sur les lettres, et un peu d'air en haut et en bas.
    ...(inCatalogue
      ? null
      : {
          borderStyle: 'dashed' as const,
          borderWidth: borders.strong,
          borderRadius: radii.panel,
          paddingVertical: space.xs,
          backgroundColor: onGlass ? colors.glass : 'transparent',
        }),
  }
  // Un outil du catalogue tient sur une ligne, abrégé par « … » : la pastille garde sa forme, et
  // sa page redit son nom entier. Un « Autre » passe à la ligne, et coupe au besoin un nom sans
  // espace (« gpt-4o-mini-2024-… ») : il n'a aucune page où le relire. Le nom complet reste lu
  // par les lecteurs d'écran (accessibilityLabel).
  const lines = inCatalogue ? { numberOfLines: 1 } : { breakAnywhere: true }
  const name =
    // Le rôle `mono` (Miel 2) : les noms d'outils et de modèles en police à chasse fixe ; une
    // catégorie, en police de texte, à la même taille et en demi-gras.
    kind === 'category' ? (
      <Text variant="caption" weight={600} {...lines}>
        {label}
      </Text>
    ) : (
      <Text variant="mono" {...lines}>
        {label}
      </Text>
    )
  const content =
    count === undefined && icon === undefined ? (
      name
    ) : (
      // L'icône, le nom, puis le nombre, plus discret, sur la même ligne. Le nom peut rétrécir
      // (flexShrink, et son « … ») ; l'icône et le nombre, jamais : on lit toujours le nombre en
      // entier. Chiffres de même largeur (tabular) : deux étiquettes voisines gardent leurs nombres
      // alignés.
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, maxWidth: '100%' }}>
        {icon === undefined ? null : (
          // flexShrink 0 : sur le web, un `<svg>` rétrécirait avec la rangée.
          <View style={{ flexShrink: 0 }}>
            <Icon name={icon} size={18} />
          </View>
        )}
        <View style={{ flexShrink: 1 }}>{name}</View>
        {count === undefined ? null : (
          <Text variant="mono" tone="muted" tabular>
            {String(count)}
          </Text>
        )}
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
  if (!onPress || !inCatalogue) {
    // Une simple pastille avec un nombre, ou un « Autre », se lit d'un bloc, par son nom complet.
    // Un nom sans rôle serait ignoré sur le web : « texte » sur téléphone, image sur le web (comme
    // l'Avatar), le seul rôle qui y fait lire le nom d'un bloc non touchable.
    const readAs = inCatalogue
      ? count === undefined
        ? null
        : spoken
      : t(($) => $.tool.otherSpoken, { name: label })
    const counted =
      readAs === null
        ? null
        : {
            accessible: true,
            accessibilityLabel: readAs,
            ...(Platform.OS === 'web'
              ? { role: 'img' as const }
              : { accessibilityRole: 'text' as const }),
          }
    return (
      <View
        style={frame}
        {...counted}
        // Un « Autre » refuse le toucher (comme un vrai texte) : même si l'écran a donné un
        // `onPress`, rien ne s'ouvre. Les outils de test, qui remontent du nœud touché jusqu'aux
        // props de `Tag`, s'arrêtent ici.
        {...(inCatalogue ? null : { onStartShouldSetResponder: () => false })}
      >
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
