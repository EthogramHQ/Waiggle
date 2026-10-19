// Les réactions à un projet (tranche 5) : cinq pastilles, « Bluffant », « Inspirant », « Utile »,
// « Drôle », « Bravo », chacune avec son icône et son nombre. Un membre touche celles qu'il veut
// poser sur le projet d'un autre : la pastille reste enfoncée (en miel pâle, icône pleine), et on la
// touche de nouveau pour retirer sa réaction. Jamais qui a réagi : seulement combien.
// L'auteur du projet voit les mêmes nombres, sans bouton (`readOnly`) : on ne réagit pas à son
// propre projet.
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
import { Notice } from './Notice'
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
}

type Props = {
  items: ReactionBarItem[]
  /** Pose ou retire cette réaction (absent en lecture seule). */
  onToggle?: (kind: ReactionKind) => void
  /** Les nombres seuls, sans bouton : pour l'auteur du projet. */
  readOnly?: boolean
  /** Une légende au-dessus des pastilles (« Les réactions à ton projet »). */
  caption?: string
  /** Le dernier changement n'a pas pu être enregistré : le message, sous les pastilles. */
  error?: string | undefined
}

// L'icône de chaque réaction : le contour, puis la version pleine une fois la réaction posée.
const icons: Record<ReactionKind, { outline: IconName; filled: IconName }> = {
  amazing: { outline: 'sparkle', filled: 'sparkle-fill' },
  inspiring: { outline: 'lightbulb', filled: 'lightbulb-fill' },
  useful: { outline: 'wrench', filled: 'wrench-fill' },
  funny: { outline: 'smiley', filled: 'smiley-fill' },
  bravo: { outline: 'hands-clapping', filled: 'hands-clapping-fill' },
}

export function ReactionBar({ items, onToggle, readOnly = false, caption, error }: Props) {
  return (
    <View style={{ gap: space.sm }}>
      {caption ? (
        <Text variant="caption" weight={600} tone="muted">
          {caption}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {items.map((item) =>
          readOnly || !onToggle ? (
            <Count key={item.kind} item={item} />
          ) : (
            <Chip key={item.kind} item={item} onPress={() => onToggle(item.kind)} />
          ),
        )}
      </View>
      {/* Notice est lue dès qu'elle apparaît (role « alert »), comme les autres erreurs. */}
      {error ? <Notice message={error} /> : null}
    </View>
  )
}

/** Le contenu d'une pastille : l'icône, le nom, puis le nombre (caché tant qu'il vaut zéro). */
function Content({ item, active }: { item: ReactionBarItem; active: boolean }) {
  const kind = icons[item.kind]
  return (
    <>
      <Icon
        name={active ? kind.filled : kind.outline}
        size={18}
        tone={active ? 'amber' : 'secondary'}
      />
      <Text variant="callout" weight={600} selectable={false}>
        {item.text}
      </Text>
      {item.count > 0 ? (
        // tabular : des chiffres de même largeur, la pastille ne tressaute pas quand il change.
        <Text variant="callout" weight={700} tone={active ? 'default' : 'secondary'} tabular>
          {item.count}
        </Text>
      ) : null}
    </>
  )
}

/** Une réaction qu'on peut poser ou retirer : un bouton qui reste enfoncé. */
function Chip({ item, onPress }: { item: ReactionBarItem; onPress: () => void }) {
  const { colors } = useTheme()
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
            backgroundColor: item.mine ? colors.honeySoft : colors.surface,
            borderColor: item.mine ? colors.honey : colors.outline,
          },
          down && !item.mine && { backgroundColor: colors.surfaceGrouped },
        ]}
      >
        <Content item={item} active={item.mine} />
      </Pressable>
    </Animated.View>
  )
}

/** Une réaction en lecture seule : son nombre, lu d'un seul tenant (« Bravo, 4 »). */
function Count({ item }: { item: ReactionBarItem }) {
  const { colors } = useTheme()
  return (
    <View
      accessible
      accessibilityLabel={item.label}
      style={[
        chipBox,
        {
          minHeight: layout.chipHeight,
          backgroundColor: colors.surface,
          borderColor: colors.outline,
        },
      ]}
    >
      <Content item={item} active={false} />
    </View>
  )
}

// La forme commune des pastilles : une pilule bordée, son contenu sur une ligne.
const chipBox: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: space.xs,
  paddingHorizontal: space.md,
  paddingVertical: space.xs, // si le texte agrandi passe sur deux lignes
  borderRadius: radii.pill,
  borderWidth: borders.hairline,
  // Jamais plus large que la ligne : un nom long (texte agrandi) se replie dans la pastille.
  maxWidth: '100%',
}
