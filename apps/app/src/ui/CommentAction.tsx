// Une action sur un commentaire (tranche 5) : « Modifier », « Supprimer », « Masquer », ou
// « Répondre » au bout d'un fil. Un simple texte avec son icône, sans bordure : sous chaque
// commentaire, des boutons bordés pèseraient plus lourd que le texte qu'ils servent. Sa zone à
// toucher fait 44 points ; son fond n'apparaît que sous le doigt.
//
// Plusieurs commentaires ont chacun leur « Supprimer » : le lecteur d'écran dit lequel grâce à une
// courte description (l'auteur et le début du texte), liée au bouton par aria-describedby sur le
// web, et lue comme indice (accessibilityHint) sur téléphone.
// Pendant l'envoi (`pending`), l'icône laisse la place à un indicateur, le bouton est annoncé
// « occupé » (aria-busy) et ignore les appuis, sans perdre le focus du clavier.
import { layout, radii, space } from '@ruche/brand'
import type { Ref } from 'react'
import { ActivityIndicator, Platform, Pressable, Text as RNText, View } from 'react-native'
import { describedBy } from './aria'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** Une action sur un commentaire. */
export type CommentAction = {
  /**
   * Ce qui identifie l'action d'un dessin à l'autre (« hide » pour Masquer comme pour Démasquer) ;
   * par défaut, sa place.
   */
  id?: string
  /** Le nom lu (« Modifier le commentaire ») ; il contient le texte affiché. */
  label: string
  /** Le texte affiché, plus court (« Modifier ») ; par défaut, le nom lu. */
  text?: string
  icon?: IconName
  /** danger : une action qui supprime, en rouge. */
  tone?: 'default' | 'danger'
  /** L'action est en route (attend l'API) : un indicateur, et les appuis sont ignorés. */
  pending?: boolean
  onPress: () => void
}

type Props = {
  action: CommentAction
  /** Le texte (caché) qui décrit le commentaire concerné, pour aria-describedby (web). */
  describedById?: string | undefined
  /** La même description, lue comme indice sur téléphone. */
  hint?: string | undefined
  ref?: Ref<View>
}

export function CommentActionButton({ action, describedById, hint, ref }: Props) {
  const { colors } = useTheme()
  const danger = action.tone === 'danger'
  const pending = action.pending ?? false
  const tone = danger ? 'danger' : 'secondary'
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      {...describedBy(describedById)}
      // Sur le web, aria-describedby suffit ; ailleurs, l'indice dit de quel commentaire il s'agit.
      accessibilityHint={Platform.OS === 'web' ? undefined : hint}
      // « occupé » pour les lecteurs d'écran (web et téléphone), comme les boutons (Button).
      aria-busy={pending}
      onPress={() => {
        if (!pending) action.onPress()
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        minHeight: layout.touchTarget,
        minWidth: layout.touchTarget,
        paddingHorizontal: space.sm,
        borderRadius: radii.pill,
        backgroundColor: pressed && !pending ? colors.surfaceGrouped : 'transparent',
      })}
    >
      {pending ? (
        // L'indicateur prend la place de l'icône, à la même taille : le texte ne bouge pas.
        <View style={{ width: ICON, height: ICON, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator
            size="small"
            color={danger ? colors.dangerText : colors.textSecondary}
          />
        </View>
      ) : action.icon ? (
        <Icon name={action.icon} size={ICON} tone={tone} />
      ) : null}
      {/* flexShrink : un texte agrandi passe à la ligne au lieu de sortir de la carte. */}
      <View style={{ flexShrink: 1 }}>
        <Text variant="callout" weight={600} tone={tone} selectable={false}>
          {action.text ?? action.label}
        </Text>
      </View>
    </Pressable>
  )
}

// La taille des icônes des actions (et de l'indicateur qui les remplace).
const ICON = 18

/**
 * La description des actions d'un commentaire, pour les lecteurs d'écran du web : un texte caché
 * (display: none), que le bouton désigne par aria-describedby. Le navigateur lit quand même un
 * texte caché quand il est désigné ainsi. Ailleurs, rien : l'indice du bouton en tient lieu.
 */
export function ActionDescription({ id, text }: { id: string; text: string }) {
  if (Platform.OS !== 'web') return null
  return (
    <RNText nativeID={id} style={{ display: 'none' }}>
      {text}
    </RNText>
  )
}

/** Le début d'un texte, `max` caractères au plus (un emoji compte pour un), puis « … ». */
export const excerpt = (text: string, max = 80) => {
  const chars = Array.from(text)
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text
}
