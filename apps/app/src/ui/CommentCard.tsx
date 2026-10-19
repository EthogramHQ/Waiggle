// Un commentaire sur la page d'un projet (tranche 5) : la photo et le nom de son auteur (un lien
// vers sa page), la date, « modifié » s'il l'a été, puis le texte, brut, tel qu'écrit, sur plusieurs
// lignes. Dessous, les actions permises au membre qui regarde, données par l'écran (« Répondre »,
// « Modifier », « Supprimer », « Masquer ») : de simples boutons texte, sans menu à ouvrir.
//
// Trois autres allures :
// - masqué par l'auteur du projet : un bandeau le dit, au-dessus du texte, que seuls lui et l'auteur
//   du commentaire lisent encore (`hidden`) ;
// - un emplacement, sans auteur ni texte : « Commentaire supprimé », « Commentaire masqué »
//   (`placeholder`), gardé parce que des réponses le suivent ;
// - en cours de modification : le champ (`editor`) prend la place du texte et des actions.
//
// Plusieurs commentaires ont chacun leur « Répondre » : sur le web, chaque action est en plus
// « décrite » par le texte de son commentaire (aria-describedby), le lecteur d'écran dit lequel.
// Quand une action disparaît (le champ de modification se referme), l'écran peut ramener le focus
// du clavier sur elle (handle).
import { layout, radii, space } from '@ruche/brand'
import { type ReactNode, type Ref, useId, useImperativeHandle, useRef } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { Avatar } from './Avatar'
import { describedBy } from './aria'
import { focusWithoutScroll } from './focus'
import { Icon, type IconName } from './Icon'
import type { ImageSource } from './image'
import { Notice } from './Notice'
import { Pressed } from './Pressed'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** Une action sur le commentaire. */
export type CommentAction = {
  /** Le nom lu (« Modifier le commentaire ») ; il contient le texte affiché. */
  label: string
  /** Le texte affiché, plus court (« Modifier ») ; par défaut, le nom lu. */
  text?: string
  icon?: IconName
  /** danger : une action qui supprime, en rouge. */
  tone?: 'default' | 'danger'
  onPress: () => void
}

/** Ce qu'un écran peut demander à la carte : poser le focus sur une action, par sa place. */
export type CommentCardHandle = { focusAction: (index: number) => boolean }

type Props = {
  /** L'auteur ; null pour un emplacement (« Commentaire supprimé »). */
  author: { name: string; avatar: ImageSource | null } | null
  /** Le nom du lien vers sa page (« Voir la page de Max »). */
  authorLabel?: string
  onAuthorPress?: () => void
  /** Quand (« 15 oct. »). */
  when: string
  /** Le texte, tel qu'écrit (vide pour un emplacement). */
  body: string
  /** « modifié », s'il l'a été. */
  edited?: string | undefined
  /** Le bandeau d'un commentaire masqué (« Masqué par l'auteur du projet »), s'il l'est. */
  hidden?: string | undefined
  /** Ce qu'on lit à la place d'un commentaire sans auteur (« Commentaire supprimé »). */
  placeholder?: string | undefined
  actions?: CommentAction[]
  /** Une action a échoué : le message, sous les actions. */
  error?: string | undefined
  /** Le champ de modification, à la place du texte et des actions. */
  editor?: ReactNode
  /** Une réponse : une photo plus petite. */
  reply?: boolean
  handle?: Ref<CommentCardHandle>
}

// La photo de l'auteur : un peu plus petite pour une réponse, posée en retrait sous son fil.
const AVATAR = { root: 36, reply: 28 }

export function CommentCard({
  author,
  authorLabel,
  onAuthorPress,
  when,
  body,
  edited,
  hidden,
  placeholder,
  actions = [],
  error,
  editor,
  reply = false,
  handle,
}: Props) {
  const { colors } = useTheme()
  // useId : un identifiant stable (le même au pré-rendu web et dans le navigateur), qui relie les
  // actions au texte qu'elles concernent.
  const bodyId = useId()
  const buttons = useRef<(View | null)[]>([])
  useImperativeHandle(handle, () => ({
    focusAction: (index: number) => focusWithoutScroll(buttons.current[index]),
  }))

  if (!author) {
    // Un emplacement : ni photo, ni nom, ni action ; seulement ce qu'il était, et sa date.
    return (
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.sm,
          rowGap: space.xxs,
          minHeight: layout.touchTarget,
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
          borderRadius: radii.small,
          // Aussi large que son contenu : un emplacement reste discret.
          alignSelf: 'flex-start',
          maxWidth: '100%',
          backgroundColor: colors.surfaceGrouped,
        }}
      >
        <Icon name="chat-circle" size={18} tone="muted" />
        <Text variant="callout" tone="muted">
          {placeholder ?? ''}
        </Text>
        <Text variant="caption" tone="muted">
          {when}
        </Text>
      </View>
    )
  }

  const size = reply ? AVATAR.reply : AVATAR.root
  const name = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        flexShrink: 1,
        minWidth: 0,
      }}
    >
      <Avatar name={author.name} source={author.avatar} label={author.name} size={size} />
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text variant="callout" weight={700} breakAnywhere>
          {author.name}
        </Text>
      </View>
    </View>
  )

  return (
    // Sans écart : la ligne du nom fait déjà 44 points de haut (la zone à toucher du lien).
    <View>
      {/* L'auteur, puis la date et « modifié ». Quand la place manque (texte agrandi, nom long),
          la date passe à la ligne au lieu d'être coupée. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.sm,
        }}
      >
        {onAuthorPress ? (
          <Pressed label={authorLabel ?? author.name} role="link" onPress={onAuthorPress}>
            {name}
          </Pressed>
        ) : (
          <View style={{ minHeight: layout.touchTarget, justifyContent: 'center' }}>{name}</View>
        )}
        <Text variant="caption" tone="muted">
          {when}
        </Text>
        {edited ? (
          <>
            {/* Le point sépare la date de « modifié » pour l'œil ; les lecteurs d'écran le sautent. */}
            <View aria-hidden>
              <Text variant="caption" tone="muted">
                ·
              </Text>
            </View>
            <Text variant="caption" tone="muted">
              {edited}
            </Text>
          </>
        ) : null}
      </View>
      {/* Le texte et les actions s'alignent sous le nom, pas sous la photo. */}
      <View style={{ paddingLeft: size + space.sm, gap: space.xs }}>
        {hidden ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              maxWidth: '100%',
              gap: space.xs,
              paddingHorizontal: space.sm,
              paddingVertical: space.xxs,
              borderRadius: radii.pill,
              backgroundColor: colors.surfaceGrouped,
            }}
          >
            <Icon name="eye-slash" size={16} tone="muted" />
            <View style={{ flexShrink: 1 }}>
              <Text variant="caption" weight={600} tone="muted">
                {hidden}
              </Text>
            </View>
          </View>
        ) : null}
        {editor ?? (
          <>
            {/* Texte brut, affiché tel quel ; selectable : on peut le copier. Un mot très long
                (une adresse) se coupe au lieu de sortir de l'écran ; readable : sur un grand
                écran, la ligne garde une longueur confortable. */}
            <Text nativeID={bodyId} selectable breakAnywhere readable>
              {body}
            </Text>
            {actions.length > 0 ? (
              // marginLeft négatif : le texte de la première action s'aligne sur celui du commentaire ;
              // le fond de l'action, qui déborde un peu, n'apparaît que sous le doigt.
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  columnGap: space.xs,
                  marginLeft: -space.sm,
                }}
              >
                {actions.map((action, index) => (
                  <ActionButton
                    // La place de l'action : « Masquer » devient « Démasquer » au même endroit, et
                    // garde le focus du clavier.
                    // biome-ignore lint/suspicious/noArrayIndexKey: la place est l'identité voulue
                    key={index}
                    action={action}
                    describedById={bodyId}
                    hint={shorten(body, 80)}
                    ref={(node) => {
                      buttons.current[index] = node
                    }}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
        {error ? <Notice message={error} /> : null}
      </View>
    </View>
  )
}

/** Une action en simple texte (avec son icône), sur 44 points de haut. */
function ActionButton({
  action,
  describedById,
  hint,
  ref,
}: {
  action: CommentAction
  describedById: string
  hint: string
  ref: Ref<View>
}) {
  const { colors } = useTheme()
  const danger = action.tone === 'danger'
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      {...describedBy(describedById)}
      // Sur le web, aria-describedby suffit ; ailleurs, l'indice dit de quel commentaire il s'agit.
      accessibilityHint={Platform.OS === 'web' ? undefined : hint}
      onPress={action.onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        minHeight: layout.touchTarget,
        minWidth: layout.touchTarget,
        paddingHorizontal: space.sm,
        borderRadius: radii.pill,
        backgroundColor: pressed ? colors.surfaceGrouped : 'transparent',
      })}
    >
      {action.icon ? (
        <Icon name={action.icon} size={18} tone={danger ? 'danger' : 'secondary'} />
      ) : null}
      <Text
        variant="callout"
        weight={600}
        tone={danger ? 'danger' : 'secondary'}
        selectable={false}
      >
        {action.text ?? action.label}
      </Text>
    </Pressable>
  )
}

/** Le début d'un texte, `max` caractères au plus (un emoji compte pour un), puis « … ». */
const shorten = (text: string, max: number) => {
  const chars = Array.from(text)
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text
}
