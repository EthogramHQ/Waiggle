// Une rangée de la liste des retours des Éclaireuses, dans la page de tri de l'administrateur (R20,
// planches R20-Tri et R20-Tri-Telephone) : l'icône de la sorte, la sorte (« Bug ») et sa gravité
// (« Bloquant », en encre, plus visible que les autres), depuis quand, le début du texte (deux
// lignes), l'autrice avec sa photo, un repère si le retour répond à une mission, et le statut.
//
// Toute la rangée est un bouton qui ouvre le retour (à côté sur ordinateur, à sa place sur
// téléphone). Son nom lu reprend ce qui est écrit, dans l'ordre (« Bug, Bloquant, Le fil ne se
// recharge plus…, Inès, Nouveau ») ; le retour ouvert est marqué « actuel » (`aria-current`) et
// passe en miel doux. Le texte du retour est un texte de membre, écrit tel quel (jamais en
// Markdown).
import { borders, layout, radii, space } from '@ruche/brand'
import { Platform, Pressable, View } from 'react-native'
import { Avatar } from './Avatar'
import { excerpt } from './CommentAction'
import { Icon, type IconName } from './Icon'
import type { ImageSource } from './image'
import { enterActivates } from './keyboard'
import { RelativeTime } from './RelativeTime'
import { StatusPill } from './StatusPill'
import { Text } from './Text'
import { insetFocus } from './theme/document'
import { useTheme } from './theme/ThemeProvider'

/** Le statut d'un retour : miel plein (Corrigé), crème (Nouveau, Prévu) ou neutre (Lu, de côté). */
export type ScoutStatusLook = { label: string; tone: 'strong' | 'soft' | 'neutral' }

type Props = {
  /** La sorte (« Bug ») et son icône. */
  kind: { label: string; icon: IconName }
  /** La gravité (« Bloquant ») ; `strong` : en encre. Absente pour une Idée ou un J'adore. */
  severity?: { label: string; strong: boolean } | undefined
  /** Le texte du retour, coupé à deux lignes dans la rangée (lu en extrait de 80 caractères). */
  text: string
  author: { name: string; avatar: ImageSource | null }
  /** La date d'envoi, au format ISO du contrat. */
  date: string
  status: ScoutStatusLook
  /** Le nom de la mission à laquelle le retour répond (« Mission »), s'il y en a une. */
  mission?: string | undefined
  /** Le retour ouvert. */
  selected?: boolean
  onPress: () => void
  /** L'heure qu'il est, pour figer la date (catalogue, tests). */
  now?: Date
}

export function ScoutTriageRow({
  kind,
  severity,
  text,
  author,
  date,
  status,
  mission,
  selected = false,
  onPress,
  now,
}: Props) {
  const { colors } = useTheme()
  // Le texte lu est un extrait (80 caractères, comme « Mes retours ») : un retour de 2 000
  // caractères lu en entier cachait le statut, dit en dernier (relecture de l'interface, R20).
  const spoken = [kind.label, severity?.label, excerpt(text), author.name, mission, status.label]
    .filter(Boolean)
    .join(', ')
  return (
    <View accessibilityRole={Platform.OS === 'web' ? ('listitem' as 'none') : undefined}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={spoken}
        aria-current={selected ? 'true' : undefined}
        accessibilityState={{ selected }}
        onPress={onPress}
        {...enterActivates(onPress)}
        // L'anneau de focus du clavier se dessine à l'intérieur de la rangée (web).
        {...insetFocus}
        style={({ pressed }) => ({
          flexDirection: 'row',
          gap: space.md,
          padding: space.md,
          minHeight: layout.touchTarget,
          borderRadius: radii.tile,
          backgroundColor: selected || pressed ? colors.honeySoft : 'transparent',
        })}
      >
        {({ pressed }) => (
          <RowContent
            kind={kind}
            severity={severity}
            text={text}
            author={author}
            date={date}
            status={status}
            mission={mission}
            {...(now ? { now } : null)}
            onCream={selected || pressed}
          />
        )}
      </Pressable>
    </View>
  )
}

/**
 * Le dedans de la rangée. Sur le fond crème (retour ouvert, ou rangée pressée), le gris discret
 * (`textMuted`) tombe à 4,44:1 la nuit, sous le seuil de 4,5 : la date et la mission passent alors
 * au gris plus soutenu (`textSecondary`, mesuré sur `honeySoft` dans `contrastPairs`).
 */
function RowContent({
  kind,
  severity,
  text,
  author,
  date,
  status,
  mission,
  now,
  onCream,
}: Omit<Props, 'selected' | 'onPress'> & { onCream: boolean }) {
  const { colors } = useTheme()
  const quiet = onCream ? 'secondary' : 'muted'
  return (
    <>
      {/* L'icône de la sorte, dans un rond : un repère pour l'œil, la sorte est écrite à côté. */}
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: layout.touchTarget - space.xs,
          height: layout.touchTarget - space.xs,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: borders.hairline,
          borderColor: colors.outline,
          backgroundColor: colors.surface,
        }}
      >
        <Icon name={kind.icon} size={20} tone="muted" />
      </View>
      <View style={{ flex: 1, gap: space.xs }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: space.sm,
            rowGap: space.xxs,
          }}
        >
          <Text variant="caption" weight={700}>
            {kind.label}
          </Text>
          {severity ? <SeverityPill {...severity} /> : null}
          <View style={{ flexGrow: 1 }} />
          <RelativeTime date={date} tone={quiet} {...(now ? { now } : null)} />
        </View>
        <Text variant="callout" numberOfLines={2} breakAnywhere>
          {text}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: space.sm,
            rowGap: space.xxs,
          }}
        >
          <Avatar name={author.name} source={author.avatar} label="" size={20} />
          <Text variant="caption" tone="secondary">
            {author.name}
          </Text>
          {mission ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
              <Icon name="flag" size={14} tone={quiet} />
              <Text variant="caption" tone={quiet}>
                {mission}
              </Text>
            </View>
          ) : null}
          <View style={{ flexGrow: 1 }} />
          <StatusLabel {...status} />
        </View>
      </View>
    </>
  )
}

/** La gravité : en encre pour « Bloquant », en crème sinon. Reprise par le détail d'un retour. */
export function SeverityPill({ label, strong }: { label: string; strong: boolean }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xxs,
        paddingHorizontal: space.sm,
        minHeight: space.xxl,
        borderRadius: radii.pill,
        backgroundColor: strong ? colors.text : colors.honeySoft,
      }}
    >
      {/* Sur l'encre, l'icône prend la couleur du fond de page, comme le texte (`onInk`). */}
      {strong ? <Icon name="warning" size={14} color="background" /> : null}
      <Text variant="caption" weight={700} tone={strong ? 'onInk' : 'status'}>
        {label}
      </Text>
    </View>
  )
}

/**
 * Le statut d'un retour. Exporté : le détail d'un retour ouvert le montre de la même façon (miel
 * plein, crème, ou neutre : un simple libellé cerclé).
 */
export function StatusLabel({ label, tone }: ScoutStatusLook) {
  const { colors } = useTheme()
  if (tone !== 'neutral') return <StatusPill label={label} strong={tone === 'strong'} />
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        justifyContent: 'center',
        minHeight: space.xxl,
        paddingHorizontal: space.md,
        borderRadius: radii.pill,
        borderWidth: borders.hairline,
        borderColor: colors.outline,
      }}
    >
      <Text variant="caption" weight={600} tone="secondary">
        {label}
      </Text>
    </View>
  )
}
