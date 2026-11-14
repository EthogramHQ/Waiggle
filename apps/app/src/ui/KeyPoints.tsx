// Ce que change un geste lourd, en trois temps (R9, planche R9-Bloquer) : un résumé en gras, quelques
// puces courtes précédées d'une icône, puis, sous un intertitre, le texte complet. Tout est visible
// d'emblée, sans rien à déplier : les puces se lisent d'un coup d'œil, et le texte complet (celui
// que la relecture juridique a voulu, mot pour mot) reste là pour qui veut tout savoir.
//
// Aligné à gauche, même dans une fenêtre au titre centré : au-delà d'une phrase, un texte centré se
// lit mal (chaque ligne commence ailleurs).
import { space } from '@ruche/brand'
import { View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Stack } from './Stack'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** Le rond clair derrière l'icône d'une puce. */
const DOT = 28

type Props = {
  /** La phrase qui dit l'essentiel, en gras (« Léa et toi ne vous verrez plus. »). */
  summary: string
  /** Les puces courtes, chacune avec son icône (décorative : la phrase dit tout). */
  points: { icon: IconName; text: string }[]
  /** Le texte complet, sous son intertitre (« Ce que change le blocage »), un paragraphe par élément. */
  details?: { title: string; paragraphs: string[] }
}

export function KeyPoints({ summary, points, details }: Props) {
  const { colors } = useTheme()
  return (
    // alignSelf « stretch » : dans une fenêtre aux éléments centrés, le bloc prend toute la largeur,
    // et ses lignes partent toutes du même bord gauche.
    <View style={{ alignSelf: 'stretch', gap: space.lg }}>
      <Text weight={700}>{summary}</Text>
      {/* Une liste annoncée (« liste, 4 éléments ») : la pile pose elle-même chaque élément. */}
      <Stack gap="md" accessibilityRole="list">
        {points.map((point, index) => (
          // Le rang comme clé : la liste ne change pas pendant qu'elle est affichée, et deux puces
          // pourraient dire la même chose.
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: liste fixe, voir ci-dessus.
            key={index}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}
          >
            {/* Une vue autour du dessin : sur le web, un dessin seul rétrécit quand le texte est long. */}
            <View
              aria-hidden
              style={{
                flexShrink: 0,
                width: DOT,
                height: DOT,
                borderRadius: DOT / 2,
                alignItems: 'center',
                justifyContent: 'center',
                // `line`, pas `surfaceGrouped`, qui se confond avec la matière d'une fenêtre (sheet).
                backgroundColor: colors.line,
              }}
            >
              <Icon name={point.icon} size={16} tone="secondary" />
            </View>
            {/* flexShrink et minWidth 0 : la phrase passe à la ligne au lieu de sortir du cadre. */}
            <View style={{ flexShrink: 1, flexGrow: 1, minWidth: 0, paddingTop: space.xxs }}>
              <Text variant="callout">{point.text}</Text>
            </View>
          </View>
        ))}
      </Stack>
      {details ? (
        <View style={{ gap: space.sm }}>
          {/* Un intertitre de la fenêtre (dont le titre est de niveau 2), pas un bouton à déplier. */}
          <Text variant="callout" weight={700} heading={3}>
            {details.title}
          </Text>
          {details.paragraphs.map((paragraph, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: liste fixe, comme les puces.
            <Text key={index} variant="callout" tone="secondary">
              {paragraph}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  )
}
