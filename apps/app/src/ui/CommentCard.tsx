// Un commentaire sur la page d'un projet (tranche 5) : la photo et le nom de son auteur (un lien
// vers sa page), la date, « modifié » s'il l'a été, puis le texte, brut, tel qu'écrit, sur plusieurs
// lignes. Dessous, les actions permises au membre qui regarde, données par l'écran (« Modifier »,
// « Supprimer », « Masquer ») : de simples boutons texte (CommentActionButton), sans menu à ouvrir.
// « Répondre » n'est pas ici : il vient une seule fois, au bout du fil (CommentThread).
// Les « @pseudo » rendus par l'API (tranche 6b) sont des liens vers la page du membre (MentionText).
//
// Trois autres allures :
// - masqué par l'auteur du projet : un bandeau le dit, au-dessus du texte, que seuls lui et l'auteur
//   du commentaire lisent encore (`hidden`) ;
// - retiré par la modération (tranche 7a) : pour son auteur, seul à le lire encore, le bandeau du
//   retrait (`removed` : pourquoi, et comment contester), au-dessus du texte ;
// - un emplacement, sans auteur ni texte : « Commentaire supprimé », « Commentaire masqué »,
//   « Contenu retiré par la modération » (`placeholder`), une ligne discrète gardée parce que des
//   réponses le suivent. Un emplacement n'a ni bandeau, ni lien, ni action, même si on lui en donne ;
// - en cours de modification : le champ (`editor`) prend la place du texte et des actions.
//
// Plusieurs commentaires ont chacun leur « Supprimer » : chaque action est en plus « décrite » par
// une courte phrase (`description` : l'auteur et le début du texte), et le lecteur d'écran dit
// lequel. Quand une action disparaît (le champ de modification se referme), l'écran peut ramener
// le focus du clavier sur elle (handle).
import { layout, radii, space, textStyles } from '@ruche/brand'
import type { Mention } from '@ruche/contracts'
import { type ReactNode, type Ref, useId, useImperativeHandle, useRef } from 'react'
import { View } from 'react-native'
import { Avatar } from './Avatar'
import {
  ActionDescription,
  type CommentAction,
  CommentActionButton,
  excerpt,
} from './CommentAction'
import { focusWithoutScroll } from './focus'
import { Icon } from './Icon'
import type { ImageSource } from './image'
import { MentionText } from './MentionText'
import { Notice, type NoticeAction } from './Notice'
import { Pressed } from './Pressed'
import { RemovalNotice, type RemovedBanner } from './RemovalNotice'
import { Text } from './Text'
import { useLayout } from './theme/layout'
import { useTheme } from './theme/ThemeProvider'

export type { CommentAction } from './CommentAction'

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
  /** Les membres mentionnés dans le texte, rendus par l'API (tranche 6b) : des liens. */
  mentions?: readonly Mention[]
  /** Une mention touchée : l'identifiant du membre, pour ouvrir sa page. */
  onMemberPress?: (memberId: string) => void
  /** « modifié », s'il l'a été. */
  edited?: string | undefined
  /** Le bandeau d'un commentaire masqué (« Masqué par toi »), s'il l'est. */
  hidden?: string | undefined
  /** Le bandeau d'un commentaire retiré par la modération, pour son auteur (tranche 7a). */
  removed?: RemovedBanner | undefined
  /** Ce qu'on lit à la place d'un commentaire sans auteur (« Commentaire supprimé »). */
  placeholder?: string | undefined
  actions?: CommentAction[]
  /**
   * Ce que les lecteurs d'écran entendent après le nom d'une action, pour savoir de quel
   * commentaire il s'agit (« Max : Super idée… ») ; par défaut, le début du texte.
   */
  description?: string | undefined
  /** Une action a échoué : le message, sous les actions. */
  error?: string | undefined
  /**
   * Un lien sous le message d'erreur (« Me reconnecter » quand la session a expiré, tranche 6c).
   */
  errorAction?: NoticeAction | undefined
  /** Le champ de modification, à la place du texte et des actions. */
  editor?: ReactNode
  /** Une réponse : une photo plus petite. */
  reply?: boolean
  handle?: Ref<CommentCardHandle>
}

// Sans mention, ni rien à ouvrir : des valeurs fixes, les mêmes à chaque dessin.
const NO_MENTIONS: readonly Mention[] = []
const ignore = () => {}

/**
 * La photo de l'auteur : un peu plus petite pour une réponse, posée en retrait sous son fil.
 * Exportée : le trait des réponses (CommentThread) part sous le milieu de la photo de la racine.
 */
export const COMMENT_AVATAR = { root: 36, reply: 28 } as const
/** La hauteur d'une ligne de texte « callout » : l'icône d'un emplacement se centre sur la première. */
const CALLOUT_LINE = textStyles.callout.lineHeight

export function CommentCard({
  author,
  authorLabel,
  onAuthorPress,
  when,
  body,
  mentions = NO_MENTIONS,
  onMemberPress = ignore,
  edited,
  hidden,
  removed,
  placeholder,
  actions = [],
  description,
  error,
  errorAction,
  editor,
  reply = false,
  handle,
}: Props) {
  const { colors } = useTheme()
  const { sizeClass } = useLayout()
  // useId : un identifiant stable (le même au pré-rendu web et dans le navigateur), qui relie les
  // actions à la description du commentaire qu'elles concernent.
  const descriptionId = useId()
  const buttons = useRef<(View | null)[]>([])
  useImperativeHandle(handle, () => ({
    focusAction: (index: number) => focusWithoutScroll(buttons.current[index]),
  }))

  if (!author) {
    // Un emplacement : ni photo, ni nom, ni action ; une ligne discrète qui dit ce qu'il était, et
    // sa date. Sans fond ni hauteur de bouton : on ne peut rien en faire, il ne doit pas en avoir
    // l'air.
    // L'icône reste à sa place, en tête de la première ligne ; la phrase et la date passent à la
    // ligne à côté d'elle (sur téléphone, à texte agrandi), sans que l'icône parte seule sur une
    // ligne au-dessus du texte (relecture de design 7b). flexShrink et minWidth : sur le web, une
    // vue ne se replie pas sans eux (react-native-web lui donne flexShrink 0).
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <View style={{ minHeight: CALLOUT_LINE, justifyContent: 'center' }}>
          <Icon name="chat-circle" size={16} tone="muted" />
        </View>
        <View
          style={{
            flex: 1,
            flexShrink: 1,
            minWidth: 0,
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            columnGap: space.sm,
            rowGap: space.xxs,
          }}
        >
          <View style={{ maxWidth: '100%', flexShrink: 1 }}>
            <Text variant="callout" tone="muted">
              {placeholder ?? ''}
            </Text>
          </View>
          <Text variant="caption" tone="muted">
            {when}
          </Text>
        </View>
      </View>
    )
  }

  const size = reply ? COMMENT_AVATAR.reply : COMMENT_AVATAR.root
  // Sur un écran large, le texte s'aligne sous le nom, pas sous la photo ; sur téléphone, il
  // repart du bord : la place gagnée garde des lignes lisibles, même en retrait sous un fil et
  // avec un texte agrandi.
  const indent = sizeClass === 'compact' ? 0 : size + space.sm
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
  const described = description ?? excerpt(body)

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
      <View style={{ paddingLeft: indent, gap: space.xs }}>
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
              borderRadius: radii.small,
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
        {removed ? <RemovalNotice title={removed.title} lines={removed.lines} compact /> : null}
        {editor ?? (
          <>
            {/* Texte brut, affiché tel quel, ses mentions en liens (MentionText). */}
            <MentionText text={body} mentions={mentions} onMemberPress={onMemberPress} />
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
                <ActionDescription id={descriptionId} text={described} />
                {actions.map((action, index) => (
                  <CommentActionButton
                    // L'identité de l'action : « Masquer » devient « Démasquer » sur le même bouton,
                    // qui garde le focus du clavier, même si une action disparaît devant lui. Sans
                    // identifiant, la place en tient lieu.
                    key={action.id ?? index}
                    action={action}
                    describedById={descriptionId}
                    hint={described}
                    ref={(node) => {
                      buttons.current[index] = node
                    }}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
        {error ? <Notice message={error} action={errorAction} /> : null}
      </View>
    </View>
  )
}
