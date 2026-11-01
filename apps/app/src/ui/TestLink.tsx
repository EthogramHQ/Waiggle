// La pastille « Tester ↗ » : un lien miel vers la démo d'un projet, qui quitte l'appli. Elle était
// recopiée dans la carte du fil (`ProjectCard`), la carte d'Explorer (`TesterCard`) et la ligne de
// la colonne du fil (`TesterRow`), et les copies divergeaient : un seul composant les remplace.
//
// Ce qu'elle garantit, partout où elle se pose :
// - c'est un lien, nommé « Tester <titre du projet> » (plusieurs cartes, plusieurs « Tester ») ;
// - il sort de l'appli : sur le web, où l'indice n'existe pas, le nom le dit (« …, ouvre un site
//   externe ») ; sur téléphone, l'indice est lu après le nom ;
// - Entrée l'ouvre sur le web, comme un vrai lien (voir keyboard.ts) ;
// - la zone à toucher fait 44 points au moins, autour de la pastille dessinée, qui peut être plus
//   petite (`hitSlop` est ignoré sur le web) ; le rayon suit la pastille pour l'anneau du clavier ;
// - jamais plus large que sa rangée, même à 200 % de texte ;
// - le miel s'assombrit sous le doigt ; le texte encre (`onHoney`) se lit sur le miel, opaque sur
//   n'importe quelle photo ; la flèche décore (le nom dit déjà que le lien sort de l'appli).
//
// Le composant ne connaît ni l'adresse de la démo (l'écran passe par la page d'avertissement des
// liens externes) ni la garde contre la double tape : `onPress` arrive déjà gardé (`useTapGuard`),
// car la garde est commune aux liens voisins de la carte.
import { layout, radii, space } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, type StyleProp, View, type ViewStyle } from 'react-native'
import { Icon } from './Icon'
import { enterActivates } from './keyboard'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/**
 * La taille de la pastille dessinée : `small` (la carte d'Explorer, la ligne du fil), `compact`
 * (la carte du fil, à la hauteur d'une zone à toucher, comme sur la planche).
 */
export type TestLinkSize = 'small' | 'compact'

/** Pour chaque taille : la hauteur de la pastille et ses marges de côté. */
const SIZES = {
  small: { height: layout.controlHeight.small, padding: space.md },
  compact: { height: layout.controlHeight.compact, padding: space.lg },
} as const

type Props = {
  /** Le titre du projet, ajouté au nom lu (« Tester Carnet de cafés »). */
  title: string
  /** Ouvre la démo (déjà gardé contre la double tape par l'appelant). */
  onPress: () => void
  size: TestLinkSize
  /** Le texte affiché ; par défaut « Tester ». Le nom lu ajoute toujours le projet. */
  label?: string
  /**
   * Où la pastille se pose dans sa rangée ou sur sa photo (marge automatique, position absolue) :
   * c'est le parent qui sait, pas la pastille. S'ajoute à la zone à toucher, jamais à la pastille.
   */
  style?: StyleProp<ViewStyle>
}

export function TestLink({ title, onPress, size, label, style }: Props) {
  const { t } = useTranslation()
  const { colors, shadows } = useTheme()
  const web = Platform.OS === 'web'
  const { height, padding } = SIZES[size]

  const name = t(($) => $.explore.testProject, { title })
  const outside = t(($) => $.common.externalSite)

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={web ? `${name}, ${outside}` : name}
      accessibilityHint={web ? undefined : outside}
      {...enterActivates(onPress)}
      onPress={onPress}
      style={[
        {
          minHeight: layout.touchTarget,
          minWidth: layout.touchTarget,
          maxWidth: '100%',
          flexShrink: 1,
          justifyContent: 'center',
          borderRadius: radii.pill,
        },
        style,
      ]}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.xs,
            minHeight: height,
            paddingHorizontal: padding,
            borderRadius: radii.pill,
            backgroundColor: pressed ? colors.honeyPressed : colors.honey,
            // Le halo détache la pastille d'une photo claire.
            boxShadow: `${shadows.highlight}, ${shadows.honey}`,
          }}
        >
          <Text variant="callout" weight={700} tone="onHoney" numberOfLines={1}>
            {label ?? t(($) => $.explore.test)}
          </Text>
          <View aria-hidden>
            <Icon name="arrow-up-right" size={space.lg} tone="onHoney" />
          </View>
        </View>
      )}
    </Pressable>
  )
}
