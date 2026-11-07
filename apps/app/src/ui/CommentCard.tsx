// Un commentaire sur la page d'un projet (tranche 5, redessiné en R5b, planches `R5b-Commentaires`
// et `R5b-Menu-Etats`). La carte reçoit le commentaire tel que l'API le rend (`comment`) et décide
// seule de son allure ; l'écran lui dit seulement qui regarde (`isMine`, `isProjectAuthor`) et
// quelles actions offrir (`menu`, `onReply`, `onUnhide`).
//
// - En tête : la photo et le nom de l'auteur (un lien vers sa page), le badge « Auteur » si c'est
//   l'auteur du projet, la date relative (« il y a 3 h »), « modifié » s'il l'a été, et à droite le
//   menu « … » (ActionMenu : Modifier, Supprimer, Masquer, Signaler, selon le membre).
// - Puis le texte, ses mentions en pastilles (MentionText), et « Répondre » dessous.
// - Ses propres commentaires sont posés sur un fond gris arrondi, et le lecteur d'écran l'entend :
//   « Ton commentaire ». Le commentaire visé par une réponse ou une modification est surligné en
//   miel pâle (`highlighted`).
// - Masqué par l'auteur du projet : une pastille (« Masqué par toi », ou « Masqué par l'auteur du
//   projet » pour celui qui l'a écrit), une phrase qui dit qui le voit encore, et « Démasquer ».
// - Retiré par la modération, pour son auteur : l'encadré du retrait (RemovalNotice).
// - Un emplacement (l'API ne rend pas l'auteur : supprimé, retiré, masqué pour un tiers, écrit par
//   un membre bloqué) : une icône et une phrase, sans nom, ni date, ni action.
// - `compact` (l'aperçu sous le projet) : la carte entière est un seul bouton, qui ouvre la feuille
//   des commentaires ; ni lien, ni « Répondre », ni menu dedans.
//
// Plusieurs commentaires ont chacun leur « Répondre » et leur « … » : chacun est « décrit » par
// l'auteur et le début du texte (« Léa Moreau : Super idée… »), et le lecteur d'écran dit lequel.
// L'écran garde une poignée (`handle`) pour ramener le focus sur « … » ou « Répondre » (après la
// fermeture de la feuille, une suppression voisine).
import { radii, space, textStyles } from '@ruche/brand'
import {
  COMMENT_FOLD_LINES,
  type CommentReply,
  type CommentState,
  type Mention,
  splitMentions,
} from '@ruche/contracts'
import { type Ref, type RefObject, useId, useImperativeHandle, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ActionMenu, type ActionMenuItem } from './ActionMenu'
import { Avatar } from './Avatar'
import { ActionDescription, CommentActionButton, excerpt } from './CommentAction'
import { focusWithoutScroll, moveReaderTo } from './focus'
import { hiddenFrame } from './HiddenHeading'
import { Icon, type IconName } from './Icon'
import type { ImageSource } from './image'
import { MentionText } from './MentionText'
import { Notice } from './Notice'
import { Pressed } from './Pressed'
import { ReadMore } from './ReadMore'
import { RelativeTime } from './RelativeTime'
import { RemovalNotice, type RemovedBanner } from './RemovalNotice'
import { StatusPill } from './StatusPill'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

export type { ActionMenuItem } from './ActionMenu'

/** Ce qu'un écran peut demander à la carte : poser le focus sur « … » ou sur « Répondre ». */
export type CommentCardHandle = {
  /** Vrai si le focus a pu être posé (la carte a un menu). */
  focusMenu: () => boolean
  /** Vrai si le focus a pu être posé (la carte a « Répondre »). */
  focusReply: () => boolean
  /** Vrai si le focus a pu être posé (la carte `compact`, qui est un seul bouton). */
  focusCard: () => boolean
}

/** Qui a masqué le commentaire, vu par celui qui regarde : lui-même, ou l'auteur du projet. */
export type CommentHiddenNote = 'byYou' | 'byProjectAuthor' | null

type Props = {
  /** Le commentaire, tel que l'API le rend. */
  comment: CommentReply
  /** Une racine, ou une réponse (une photo plus petite, posée en retrait sous son fil). */
  kind: 'root' | 'reply'
  /** Le membre qui regarde l'a écrit : le fond gris, lu « Ton commentaire ». */
  isMine: boolean
  /** L'auteur du commentaire est celui du projet : le badge « Auteur ». */
  isProjectAuthor: boolean
  /** Le commentaire visé par une réponse ou une modification en cours : le miel pâle. */
  highlighted?: boolean
  /**
   * Le projet est privé : un emplacement `hidden` est gardé, personne ne l'a masqué (l'API rend ce
   * même état pour le commentaire d'un autre sur un projet devenu privé). Il le dit (décision 22).
   */
  keptWhilePrivate?: boolean
  /** L'aperçu sous le projet : un seul bouton (`onPress`), sans lien ni action dedans. */
  compact?: boolean
  /** Les actions du menu « … » ; vide : pas de « … ». */
  menu: ActionMenuItem[]
  /** « Répondre » ; absent : pas de « Répondre » (masqué, retiré, membre suspendu…). */
  onReply?: () => void
  /** Masqué : qui l'a fait, vu par celui qui regarde ; null s'il n'est pas masqué. */
  hiddenNote: CommentHiddenNote
  /** « Démasquer », pour l'auteur du projet (avec `hiddenNote` « byYou »). */
  onUnhide?: () => void
  /** « Démasquer » attend l'API : annoncé occupé, et les appuis sont ignorés. */
  unhiding?: boolean
  /** L'encadré du retrait par la modération, pour son auteur (construit par l'écran). */
  removed?: RemovedBanner
  /** Le nom de l'auteur touché : sa page. */
  onAuthorPress: () => void
  /** Une pastille de mention touchée : l'identifiant du membre. */
  onMemberPress: (memberId: string) => void
  /** La carte compacte touchée : la feuille des commentaires s'ouvre. */
  onPress?: () => void
  /** Une action a échoué : le message, sous le commentaire. */
  error?: string
  /** Un lien sous ce message (« Me reconnecter », « Réessayer »). */
  errorAction?: { label: string; onPress: () => void }
  /** L'heure qu'il est, pour figer la date relative (tests, catalogue) ; l'horloge sinon. */
  now?: Date
  /**
   * La photo de l'auteur, prête à dessiner : l'écran la fabrique depuis `author.avatarUrl`
   * (`useMediaSources`, qui joint la session sur téléphone ; un composant de `src/ui` ne lit pas
   * l'API). Absente : ses initiales.
   */
  avatar?: ImageSource | null
  handle?: Ref<CommentCardHandle>
}

/**
 * La photo de l'auteur : un peu plus petite pour une réponse, posée en retrait sous son fil.
 * Exportée : le trait des réponses (CommentThread) part sous le milieu de la photo de la racine.
 */
export const COMMENT_AVATAR = { root: 36, reply: 28 } as const
/** La hauteur d'une ligne de texte « callout » : l'icône d'un emplacement se centre sur la première. */
const CALLOUT_LINE = textStyles.callout.lineHeight
/** L'aperçu montre le début du texte : au plus ces lignes, la feuille donne le reste. */
const COMPACT_LINES = 3

/** L'icône et la phrase de chaque emplacement (planche `R5b-Menu-Etats`). */
const PLACEHOLDERS: Record<
  Exclude<CommentState, 'visible'>,
  {
    icon: IconName
    text:
      | 'deletedPlaceholder'
      | 'hiddenPlaceholder'
      | 'removedPlaceholder'
      | 'blockedPlaceholder'
      | 'unavailablePlaceholder'
  }
> = {
  deleted: { icon: 'chat-circle', text: 'deletedPlaceholder' },
  hidden: { icon: 'eye-slash', text: 'hiddenPlaceholder' },
  removed: { icon: 'shield-check', text: 'removedPlaceholder' },
  blocked: { icon: 'prohibit', text: 'blockedPlaceholder' },
  unavailable: { icon: 'prohibit', text: 'unavailablePlaceholder' },
}

/**
 * Le texte sans liens (la carte compacte, et l'extrait lu) : chaque mention reconnue devient
 * « @Léa Moreau », le nom actuel du membre, comme sur la pastille ; un pseudo que l'API n'a pas
 * rendu reste tel qu'écrit.
 */
export const plainCommentText = (text: string, mentions: readonly Mention[]) => {
  if (mentions.length === 0) return text
  const names = new Map(mentions.map((mention) => [mention.handle, mention.name]))
  return splitMentions(text)
    .map((segment) => {
      const name = segment.handle ? names.get(segment.handle) : undefined
      return name ? `@${name}` : segment.text
    })
    .join('')
}

/**
 * Pose le focus sur la vue d'une `ref`, sans faire défiler, et y amène le lecteur d'écran sur
 * téléphone ; faux s'il n'y en a pas.
 */
const focusOn = (ref: RefObject<View | null>) => {
  if (!ref.current) return false
  focusWithoutScroll(ref.current)
  moveReaderTo(ref.current)
  return true
}

export function CommentCard({
  comment,
  kind,
  isMine,
  isProjectAuthor,
  highlighted = false,
  keptWhilePrivate = false,
  compact = false,
  menu,
  onReply,
  hiddenNote,
  onUnhide,
  unhiding = false,
  removed,
  onAuthorPress,
  onMemberPress,
  onPress,
  error,
  errorAction,
  now,
  avatar = null,
  handle,
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  // useId : un identifiant stable (le même au pré-rendu web et dans le navigateur), qui relie
  // « Répondre » et « … » à la description du commentaire qu'ils concernent.
  const descriptionId = useId()
  const menuRef = useRef<View>(null)
  const replyRef = useRef<View>(null)
  const cardRef = useRef<View>(null)
  // useImperativeHandle : ce que l'écran reçoit dans `handle`, à la place de la vue elle-même.
  useImperativeHandle(handle, () => ({
    focusMenu: () => focusOn(menuRef),
    focusReply: () => focusOn(replyRef),
    focusCard: () => focusOn(cardRef),
  }))

  const { author } = comment

  // Le fond de la carte : miel pâle quand elle est visée (il l'emporte), gris pour les siennes.
  // Une carte sans fond garde le même retrait : le texte ne saute pas quand le surlignage part.
  const frame = {
    borderRadius: radii.small,
    padding: space.sm,
    ...(highlighted
      ? { backgroundColor: colors.highlightSoft }
      : isMine
        ? { backgroundColor: colors.surfaceGrouped }
        : null),
  }

  if (!author) {
    // Un emplacement : ni photo, ni nom, ni date, ni action ; une icône et une phrase discrètes,
    // gardées parce que des réponses suivent. Sans fond ni hauteur de bouton : on ne peut rien en
    // faire, il ne doit pas en avoir l'air. L'icône reste en tête de la première ligne, la phrase
    // passe à la ligne à côté d'elle (texte agrandi) ; flexShrink et minWidth : sur le web, une vue
    // ne se replie pas sans eux (react-native-web lui donne flexShrink 0).
    const placeholder =
      comment.state === 'visible' ? PLACEHOLDERS.deleted : PLACEHOLDERS[comment.state]
    const phrase =
      comment.state === 'hidden' && keptWhilePrivate ? 'privateKeptPlaceholder' : placeholder.text
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: space.sm,
          padding: space.sm,
        }}
      >
        <View style={{ minHeight: CALLOUT_LINE, justifyContent: 'center' }}>
          <Icon name={placeholder.icon} size={16} tone="muted" />
        </View>
        <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
          <Text variant="callout" tone="muted">
            {t(($) => $.project.comments[phrase])}
          </Text>
        </View>
      </View>
    )
  }

  const size = kind === 'reply' ? COMMENT_AVATAR.reply : COMMENT_AVATAR.root
  const plain = plainCommentText(comment.body, comment.mentions)
  const short = excerpt(plain)
  // Null seulement pour un emplacement, traité plus haut : une carte écrite a toujours sa date.
  const date =
    comment.createdAt === null ? null : (
      <RelativeTime date={comment.createdAt} {...(now ? { now } : null)} />
    )
  const edited = comment.editedAt ? (
    // Le point et « modifié » passent à la ligne ensemble, jamais le point seul au bout de la date.
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      {/* Le point sépare la date de « modifié » pour l'œil ; les lecteurs d'écran le sautent. */}
      <View aria-hidden>
        <Text variant="caption" tone="muted">
          ·
        </Text>
      </View>
      <Text variant="caption" tone="muted">
        {t(($) => $.project.comments.edited)}
      </Text>
    </View>
  ) : null
  const badge = isProjectAuthor ? (
    // Dans le lien, dont le nom le dit déjà (« Léa Moreau, Auteur ») : lu une seule fois.
    <StatusPill label={t(($) => $.project.comments.author)} />
  ) : null
  // La photo, le nom et le badge : le contenu du lien vers sa page, ou de la carte compacte.
  const who = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        flexShrink: 1,
        minWidth: 0,
      }}
    >
      <Avatar name={author.name} source={avatar} label={author.name} size={size} />
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: space.xs,
          flexShrink: 1,
          minWidth: 0,
        }}
      >
        <View style={{ flexShrink: 1, maxWidth: '100%' }}>
          <Text variant="callout" weight={700} breakAnywhere>
            {author.name}
          </Text>
        </View>
        {badge}
      </View>
    </View>
  )
  // « Ton commentaire » : le fond gris dit à l'œil que c'est le sien ; le lecteur d'écran l'entend
  // en arrivant sur la carte (un texte caché à l'œil seulement, comme HiddenHeading).
  const yours = isMine ? (
    <View style={hiddenFrame} pointerEvents="none">
      <Text>{t(($) => $.project.comments.yours)}</Text>
    </View>
  ) : null

  if (compact) {
    // L'aperçu : un seul bouton, nommé par l'auteur et l'extrait ; les mentions y sont du texte
    // simple (aucun lien dans un bouton). Toucher n'importe où ouvre la feuille.
    return (
      <Pressed
        ref={cardRef}
        label={t(($) => $.project.comments.openLine, { name: author.name, excerpt: short })}
        onPress={onPress ?? (() => {})}
        radius="small"
      >
        <View style={[frame, { gap: space.xs }]}>
          {yours}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              columnGap: space.sm,
            }}
          >
            {who}
            {date}
            {edited}
          </View>
          <Text numberOfLines={COMPACT_LINES} breakAnywhere>
            {plain}
          </Text>
        </View>
      </Pressed>
    )
  }

  // Le texte s'aligne sous le nom, pas sous la photo, sur téléphone aussi (planche `R5b-Commentaires`) :
  // le trait des réponses descend de la photo sans jamais passer sous le texte.
  const indent = size + space.sm
  const piece = { paddingLeft: indent }
  const nextPiece = { paddingLeft: indent, marginTop: space.xs }
  const described = t(($) => $.project.comments.about, { name: author.name, text: short })
  const hidden =
    hiddenNote === 'byYou'
      ? {
          label: t(($) => $.project.comments.hiddenByMe),
          note: t(($) => $.project.comments.hiddenNote),
        }
      : hiddenNote === 'byProjectAuthor'
        ? {
            label: t(($) => $.project.comments.hiddenByAuthor),
            note: t(($) => $.project.comments.hiddenByAuthorNote),
          }
        : null

  return (
    <View style={frame}>
      {yours}
      <ActionDescription id={descriptionId} text={described} />
      {/* L'auteur, la date et « modifié », puis « … » au bout de la rangée. Quand la place manque
          (texte agrandi, nom long), la date passe à la ligne au lieu d'être coupée. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.xs }}>
        <View
          style={{
            flex: 1,
            flexShrink: 1,
            minWidth: 0,
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: space.sm,
          }}
        >
          <View style={{ flexShrink: 1, maxWidth: '100%' }}>
            <Pressed
              label={
                isProjectAuthor
                  ? t(($) => $.project.comments.authorLink, { name: author.name })
                  : author.name
              }
              role="link"
              onPress={onAuthorPress}
            >
              {who}
            </Pressed>
          </View>
          {date}
          {edited}
        </View>
        {menu.length > 0 ? (
          <ActionMenu
            ref={menuRef}
            items={menu}
            label={t(($) => $.project.comments.menu, { name: author.name })}
            describedById={descriptionId}
            hint={described}
            // Au bout de la rangée : le menu s'ouvre vers la gauche, au-dessus de la carte.
            align="end"
          />
        ) : null}
      </View>
      {/* Le corps : chaque morceau est un enfant direct de la carte, à côté de la rangée du haut. */}
      {hidden ? (
        <View style={[piece, { gap: space.xxs }]}>
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
              // Sur le fond gris des siens, la pastille prend le blanc de la carte : elle se voit.
              backgroundColor: isMine && !highlighted ? colors.surface : colors.surfaceGrouped,
            }}
          >
            <Icon name="eye-slash" size={16} tone="muted" />
            <View style={{ flexShrink: 1 }}>
              <Text variant="caption" weight={600} tone="muted">
                {hidden.label}
              </Text>
            </View>
          </View>
          <Text variant="caption" tone="muted">
            {hidden.note}
          </Text>
        </View>
      ) : null}
      {removed ? (
        <View style={hidden ? nextPiece : piece}>
          <RemovalNotice title={removed.title} lines={removed.lines} compact />
        </View>
      ) : null}
      {/* Texte brut, affiché tel quel, ses mentions en pastilles (MentionText). Au-delà de
            10 lignes, il se replie : ReadMore lui donne le nombre de lignes à montrer, et
            « Lire la suite » est décrit comme « Répondre » et « … ». */}
      <View style={hidden || removed ? nextPiece : piece}>
        <ReadMore lines={COMMENT_FOLD_LINES} hint={described}>
          {(numberOfLines) => (
            <MentionText
              text={comment.body}
              mentions={comment.mentions}
              onMemberPress={onMemberPress}
              numberOfLines={numberOfLines}
            />
          )}
        </ReadMore>
      </View>
      {onReply || (hidden && onUnhide) ? (
        // marginLeft négatif : le texte de la première action s'aligne sur celui du commentaire ;
        // le fond de l'action, qui déborde un peu, n'apparaît que sous le doigt.
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            columnGap: space.xs,
            marginTop: space.xs,
            marginLeft: indent - space.sm,
          }}
        >
          {onReply ? (
            <CommentActionButton
              ref={replyRef}
              action={{
                label: t(($) => $.project.comments.reply),
                icon: 'arrow-bend-up-left',
                onPress: onReply,
              }}
              describedById={descriptionId}
              hint={described}
            />
          ) : null}
          {hidden && onUnhide ? (
            <CommentActionButton
              action={{
                // Le nom lu est le texte affiché (« Démasquer ») ; la description dit lequel.
                label: t(($) => $.project.comments.unhideShort),
                icon: 'eye',
                pending: unhiding,
                onPress: onUnhide,
              }}
              describedById={descriptionId}
              hint={described}
            />
          ) : null}
        </View>
      ) : null}
      {error ? (
        <View style={nextPiece}>
          <Notice message={error} action={errorAction} />
        </View>
      ) : null}
    </View>
  )
}
