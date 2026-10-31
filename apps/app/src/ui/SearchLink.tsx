// Un lien dessiné comme un champ de recherche (refonte, tranche R3 : le haut d'Explorer sur
// téléphone). Il ressemble au champ (une loupe, le texte d'attente « Un projet, une personne, un
// outil »), mais ce n'est pas un champ : le toucher ouvre la page de recherche, où le vrai champ
// prend le focus. Ainsi aucune lettre ne se perd au changement de page (relecture de l'interface
// de R3, ui-5 et « À noter » : le champ d'Explorer sur téléphone est un vrai lien, avec `href`).
// - Sur le web, c'est un vrai `<a href>` : ouvrir dans un nouvel onglet, Entrée (keyboard.ts).
// - Le nom lu commence par le nom du champ (« Rechercher »), puis le texte affiché : un lecteur
//   d'écran et une commande vocale (« toucher Un projet… ») retrouvent tous deux ce qui se voit.
import { borders, layout, radii, space } from '@ruche/brand'
import { Pressable, View } from 'react-native'
import { Icon } from './Icon'
import { enterActivates } from './keyboard'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Le nom du champ qu'il remplace (« Rechercher »), en tête du nom lu. */
  label: string
  /** Le texte d'attente affiché (« Un projet, une personne, un outil »). */
  placeholder: string
  /** L'adresse de la page de recherche : sur le web, le lien est un vrai `<a href>`. */
  href: string
  /**
   * Le geste ordinaire, que l'écran branche sur son routeur. Il reçoit l'événement du clic : sur le
   * web, l'écran empêche le navigateur de recharger la page (`preventDefault`), comme ListRow.
   */
  onPress: (event?: { preventDefault?: () => void }) => void
}

export function SearchLink({ label, placeholder, href, onPress }: Props) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}, ${placeholder}`}
      // `href` manque aux types de React Native : ignoré sur téléphone, un vrai lien sur le web.
      {...{ href }}
      // Entrée ouvre la recherche sur le web, comme un vrai lien (voir keyboard.ts).
      {...enterActivates(() => onPress())}
      onPress={onPress}
      // Le rayon du champ, pour que l'anneau du clavier (app/+html.tsx) en suive la forme.
      style={{ borderRadius: radii.pill }}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            // La hauteur d'un champ ; le texte agrandi l'allonge (minHeight, jamais height).
            minHeight: layout.controlHeight.compact,
            paddingHorizontal: space.lg,
            paddingVertical: space.sm,
            borderRadius: radii.pill,
            borderWidth: borders.hairline,
            borderColor: colors.outline,
            // Appuyé, le fond des pastilles touchées (comme Tag).
            backgroundColor: pressed ? colors.honeySoft : colors.surface,
          }}
        >
          {/* La loupe décore : le nom lu dit déjà qu'on cherche. */}
          <View aria-hidden>
            <Icon name="magnifying-glass" size={18} tone="muted" />
          </View>
          {/* minWidth: 0 : à 200 % de texte, le texte d'attente passe à la ligne sans déborder. */}
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text tone="muted" selectable={false}>
              {placeholder}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  )
}
