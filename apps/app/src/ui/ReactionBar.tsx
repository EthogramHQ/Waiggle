// Les réactions à un projet (tranche 5) : « Bluffant », « Inspirant », « Utile », « Drôle »,
// « Bravo », chacune avec son icône et son nombre. Jamais qui a réagi : seulement combien.
//
// Deux allures :
// - sur le projet d'un autre : cinq pastilles, un groupe de boutons nommé « Réagir à ce projet »
//   (`label`). On touche celles qu'on veut : la pastille reste enfoncée (fond miel pâle, icône
//   pleine, nom et nombre en ambre), et on la touche de nouveau pour retirer sa réaction ;
// - pour l'auteur du projet (`readOnly`) : on ne réagit pas à son propre projet. Les cinq nombres
//   forment une simple liste, nommée par sa légende (« Les réactions à ton projet »), sans bordure
//   ni allure de bouton : rien n'invite à toucher. « 0 » s'y affiche aussi.
// - pour un compte suspendu (tranche 7c, réactions `locked`) : il ne réagit plus, mais retire
//   encore une réaction déjà donnée. Celle-ci garde sa pastille ; les autres montrent leur nombre.
//
// Les lecteurs d'écran entendent le nom donné par l'écran (« Bravo, réagi, 4 »), qui reprend le
// texte affiché, et l'état « activé » (aria-pressed). Les pastilles passent à la ligne quand la
// place manque (téléphone étroit, texte agrandi).
import { borders, layout, pressScale, radii, space } from '@ruche/brand'
import type { ReactionKind } from '@ruche/contracts'
import { Pressable, View, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { pressed } from './aria'
import { Icon, type IconName } from './Icon'
import { Notice, type NoticeAction } from './Notice'
import { Text } from './Text'
import { spring } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/** Une réaction telle que l'écran la prépare : son texte, son nombre, et si c'est la sienne. */
export type ReactionBarItem = {
  kind: ReactionKind
  /** Le nom affiché (« Bravo »). */
  text: string
  count: number
  /** Le membre qui regarde a posé cette réaction. */
  mine: boolean
  /** Le nom lu par les lecteurs d'écran (« Bravo, réagi, 4 »). */
  label: string
  /**
   * Cette réaction ne se pose pas (compte suspendu, tranche 7c) : son nombre seul, sans bouton.
   * Les autres restent des boutons, pour retirer une réaction déjà donnée.
   */
  locked?: boolean
}

type Props = {
  items: ReactionBarItem[]
  /** Pose ou retire cette réaction (absent en lecture seule). */
  onToggle?: (kind: ReactionKind) => void
  /** Le nom du groupe de pastilles, pour les lecteurs d'écran (« Réagir à ce projet »). */
  label?: string
  /** Les nombres seuls, sans bouton : pour l'auteur du projet. */
  readOnly?: boolean
  /** La légende au-dessus des nombres (« Les réactions à ton projet ») ; elle nomme la liste. */
  caption?: string
  /** Le dernier changement n'a pas pu être enregistré : le message, sous les pastilles. */
  error?: string | undefined
  /**
   * Un lien sous le message d'erreur (« Me reconnecter » quand la session a expiré, tranche 6c).
   */
  errorAction?: NoticeAction | undefined
}

// L'icône de chaque réaction : le contour, puis la version pleine une fois la réaction posée.
const icons: Record<ReactionKind, { outline: IconName; filled: IconName }> = {
  amazing: { outline: 'sparkle', filled: 'sparkle-fill' },
  inspiring: { outline: 'lightbulb', filled: 'lightbulb-fill' },
  useful: { outline: 'wrench', filled: 'wrench-fill' },
  funny: { outline: 'smiley', filled: 'smiley-fill' },
  bravo: { outline: 'hands-clapping', filled: 'hands-clapping-fill' },
}

export function ReactionBar({
  items,
  onToggle,
  label,
  readOnly = false,
  caption,
  error,
  errorAction,
}: Props) {
  if (readOnly || !onToggle) {
    return (
      <View style={{ gap: space.sm }}>
        {caption ? (
          <Text variant="caption" weight={600} tone="muted">
            {caption}
          </Text>
        ) : null}
        {/* role « list » : une liste de cinq nombres, annoncée comme telle, nommée par la légende. */}
        <View
          role="list"
          {...(caption ? { accessibilityLabel: caption } : null)}
          style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs }}
        >
          {items.map((item) => (
            <Count key={item.kind} item={item} />
          ))}
        </View>
      </View>
    )
  }
  // Des réactions verrouillées parmi les autres (compte suspendu) : la rangée devient une liste,
  // chaque réaction un élément ; les verrouillées montrent leur nombre, les autres gardent leur
  // bouton (liste > élément > bouton, que les lecteurs d'écran savent lire).
  const mixed = items.some((item) => item.locked)
  return (
    <View style={{ gap: space.sm }}>
      {/* role « group » : les cinq boutons forment un ensemble, annoncé avec son nom. */}
      <View
        role={mixed ? 'list' : 'group'}
        {...(label ? { accessibilityLabel: label } : null)}
        style={[
          { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
          // Un nombre seul est moins haut qu'une pastille : il se place au milieu de la rangée.
          mixed && { alignItems: 'center' },
        ]}
      >
        {items.map((item) =>
          item.locked ? (
            <Count key={item.kind} item={item} />
          ) : mixed ? (
            <View key={item.kind} role="listitem" style={{ maxWidth: '100%' }}>
              <Chip item={item} onPress={() => onToggle(item.kind)} />
            </View>
          ) : (
            <Chip key={item.kind} item={item} onPress={() => onToggle(item.kind)} />
          ),
        )}
      </View>
      {/* Notice est lue dès qu'elle apparaît (role « alert »), comme les autres erreurs. */}
      {error ? <Notice message={error} action={errorAction} /> : null}
    </View>
  )
}

/** Une réaction qu'on peut poser ou retirer : un bouton qui reste enfoncé. */
function Chip({ item, onPress }: { item: ReactionBarItem; onPress: () => void }) {
  const { colors } = useTheme()
  const kind = icons[item.kind]
  // Comme les boutons : la pastille s'enfonce légèrement sous le doigt, avec un ressort.
  const scale = useSharedValue(1)
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <Animated.View style={animated}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.label}
        {...pressed(item.mine)}
        onPress={onPress}
        onPressIn={() => {
          scale.value = spring(pressScale, 'firm')
        }}
        onPressOut={() => {
          scale.value = spring(1)
        }}
        // Le contour du focus clavier est commun à tous les éléments : voir app/+html.tsx.
        style={({ pressed: down }) => [
          chipBox,
          {
            minHeight: layout.touchTarget,
            // Réagi : fond miel pâle, bordure miel ; la même épaisseur dans les deux états, pour
            // que la pastille ne change pas de taille sous le doigt.
            backgroundColor: item.mine ? colors.honeySoft : colors.surface,
            borderColor: item.mine ? colors.honey : colors.outline,
          },
          down && !item.mine && { backgroundColor: colors.surfaceGrouped },
        ]}
      >
        <Icon
          name={item.mine ? kind.filled : kind.outline}
          size={18}
          tone={item.mine ? 'amber' : 'secondary'}
        />
        {/* Réagi : le nom et le nombre passent en ambre (accent), lisible sur le miel pâle de
            jour comme de nuit (couple amberText / honeySoft de contrastPairs). */}
        <Text
          variant="callout"
          weight={600}
          tone={item.mine ? 'accent' : 'default'}
          selectable={false}
        >
          {item.text}
        </Text>
        {item.count > 0 ? (
          // tabular : des chiffres de même largeur, la pastille ne tressaute pas quand il change.
          <Text variant="callout" weight={700} tone={item.mine ? 'accent' : 'secondary'} tabular>
            {item.count}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

/**
 * Une réaction en lecture seule : l'icône, le nom et le nombre, « 0 » compris, sur une ligne. Un
 * élément de liste nommé « Bravo, 4 », lu d'un seul tenant.
 */
function Count({ item }: { item: ReactionBarItem }) {
  const kind = icons[item.kind]
  return (
    <View
      // accessible : sur téléphone, l'élément est lu d'un seul tenant ; sur le web, le rôle suffit.
      accessible
      role="listitem"
      accessibilityLabel={item.label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        minHeight: layout.chipControl,
        maxWidth: '100%',
      }}
    >
      <Icon name={kind.outline} size={18} tone="secondary" />
      <Text variant="callout" tone="secondary">
        {item.text}
      </Text>
      <Text variant="callout" weight={700} tabular>
        {item.count}
      </Text>
    </View>
  )
}

// La forme des pastilles : une pilule bordée, son contenu sur une ligne.
const chipBox: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: space.xs,
  paddingHorizontal: space.md,
  paddingVertical: space.xs, // si le texte agrandi passe sur deux lignes
  borderRadius: radii.pill,
  borderWidth: borders.strong,
  // Jamais plus large que la ligne : un nom long (texte agrandi) se replie dans la pastille.
  maxWidth: '100%',
}
