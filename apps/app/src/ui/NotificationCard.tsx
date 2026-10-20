// Une notification dans la liste (tranche 6b) : une icône qui dit sa sorte (réactions, commentaire,
// abonnés…), la phrase (« 2 réactions sur « Météo » »), un détail facultatif (les nombres par
// réaction, ou l'extrait d'un commentaire, en citation), la date, et « Nouveau » si elle est
// arrivée depuis la dernière visite.
// Avec `onPress`, toute la carte est un lien (vers le projet, ou « Mon profil ») : les lecteurs
// d'écran entendent son nom, qui reprend tout ce qui est écrit dessus. Sans `onPress` (les abonnés
// à son compte, sans nom), elle ne mène nulle part : ce n'est ni un lien ni un bouton, et ses
// textes se lisent l'un après l'autre.
import { borders, radii, space } from '@ruche/brand'
import { View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Pressed } from './Pressed'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** L'icône de la sorte de notification (heart, chat-circle, at…). */
  icon: IconName
  /** La phrase, déjà traduite. */
  text: string
  /** Une ligne de plus, sous la phrase (« Bravo ×2, Utile ×1 »). */
  detail?: string | null
  /** L'extrait d'un commentaire, affiché en citation. */
  quote?: string | null
  /** Quand (« 20 oct. »). */
  when: string
  /** Arrivée depuis la dernière ouverture de l'écran. */
  isNew: boolean
  /** Le mot qui le dit (« Nouveau »). */
  newLabel: string
  /** Où elle mène ; sans, elle ne se touche pas. */
  onPress?: (() => void) | null
}

// Le rond de l'icône : assez grand pour se repérer d'un coup d'œil en parcourant la liste.
const BUBBLE = 40

export function NotificationCard({
  icon,
  text,
  detail,
  quote,
  when,
  isNew,
  newLabel,
  onPress,
}: Props) {
  const { colors, shadows } = useTheme()
  const content = (
    <View
      style={{
        flexGrow: 1,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.md,
        padding: space.lg,
        backgroundColor: colors.surface,
        borderRadius: radii.group,
        borderWidth: borders.hairline,
        // Une nouvelle se distingue aussi par son bord miel, pas seulement par le mot « Nouveau ».
        borderColor: isNew ? colors.honey : colors.groupBorder,
        boxShadow: shadows.soft,
      }}
    >
      <View
        style={{
          width: BUBBLE,
          height: BUBBLE,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isNew ? colors.honeySoft : colors.surfaceGrouped,
        }}
      >
        <Icon name={icon} size={20} tone={isNew ? 'amber' : 'muted'} />
      </View>
      {/* minWidth 0 : un mot très long (un titre sans espace) se coupe au lieu de déborder. */}
      <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
        <Text variant="callout" weight={isNew ? 700 : 400} breakAnywhere>
          {text}
        </Text>
        {detail ? (
          <Text variant="callout" tone="secondary" breakAnywhere>
            {detail}
          </Text>
        ) : null}
        {quote ? (
          // L'extrait, souligné d'un trait de miel à gauche, comme une citation (voir NoteCard).
          <View
            style={{
              borderLeftWidth: borders.quote,
              borderLeftColor: colors.honey,
              paddingLeft: space.md,
            }}
          >
            <Text variant="callout" tone="secondary" numberOfLines={2} breakAnywhere>
              {quote}
            </Text>
          </View>
        ) : null}
        {/* La date, puis « Nouveau » ; à texte agrandi, la pastille passe à la ligne. */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: space.sm,
            rowGap: space.xxs,
          }}
        >
          <Text variant="caption" tone="muted">
            {when}
          </Text>
          {isNew ? (
            <View
              style={{
                paddingHorizontal: space.sm,
                borderRadius: radii.pill,
                backgroundColor: colors.honeySoft,
              }}
            >
              <Text variant="caption" weight={700} tone="status">
                {newLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
  if (!onPress) return content
  // Le nom du lien : tout ce que la carte écrit, « Nouveau » d'abord.
  const label = [isNew ? newLabel : null, text, detail, quote, when].filter(Boolean).join('. ')
  return (
    <Pressed label={label} onPress={onPress} role="link" fill>
      {content}
    </Pressed>
  )
}
