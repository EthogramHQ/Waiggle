// Une ligne de « Mes commentaires » (tranche R11, planche R11-Mes-Commentaires) : l'un de ses
// commentaires ou réponses, avec le titre de son projet et sa date, « Réponse » au-dessus d'une
// réponse, le début du texte, et « Supprimer » à droite.
//
// - Projet visible : la colonne de gauche est un lien vers le commentaire, à sa place dans le fil du
//   projet. Son nom (`openLabel`, « Ton commentaire sur Carnet de cafés : … ») dit le projet et
//   l'extrait ; la date entière et les marques le décrivent, lues juste après (`aria-describedby`
//   sur le web, l'indice sur téléphone), comme une ligne de fil de retours (`ThreadRow`).
// - Projet qu'on ne voit plus (`projectTitle` nul) : un œil barré et « Projet qui n'est plus
//   visible », rien d'autre du projet ; la ligne n'ouvre rien. Le texte s'y lit en entier : il n'a
//   plus d'autre page où le relire (jamais coupé par « … »).
// - « Masqué par l'auteur du projet » et « Contenu retiré par la modération » : une marque sous le
//   texte, qui reste lisible (son auteur le lit encore).
// - « Supprimer » est un bouton à part, jamais dans le lien (deux gestes, deux zones) ; son nom lu
//   dit lequel (« Supprimer le commentaire : … ») quand deux commentaires partagent un projet.
//
// La ligne se pose dans un `ListGroup list`, qui rogne ce qui dépasse : l'anneau du clavier se
// dessine dedans. À 320 points ou à texte agrandi, « Supprimer » passe sous le texte, à droite.
import { space } from '@ruche/brand'
import { type Ref, useId } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { describedBy } from './aria'
import { CommentActionButton } from './CommentAction'
import { Icon, type IconName } from './Icon'
import { MIN_NAME, type PressEvent } from './ListGroup'
import { RelativeTime, useRelativeDate } from './RelativeTime'
import { Text } from './Text'
import { useLargeText } from './textScale'
import { insetFocus } from './theme/document'
import { useTheme } from './theme/ThemeProvider'

/** Une marque sous le texte : son icône et sa phrase, déjà traduite. */
export type MyCommentMark = { icon: IconName; label: string }

type Props = {
  /** Le titre du projet ; null : un projet qu'on ne voit plus (rien d'autre n'en est montré). */
  projectTitle: string | null
  /** Ce qui s'écrit à la place du titre quand le projet n'est plus visible. */
  goneLabel: string
  /** La date du commentaire, au format ISO du contrat. */
  date: string
  /** Le mot au-dessus d'une réponse (« Réponse ») ; absent : un commentaire. */
  replyLabel?: string | undefined
  /** Le texte du commentaire, tel qu'écrit. */
  body: string
  /** Masqué, retiré : les marques sous le texte. */
  marks?: readonly MyCommentMark[]
  /** Le nom lu du lien (projet visible seulement). */
  openLabel?: string | undefined
  /** L'adresse du commentaire dans le fil (un vrai lien sur le web). */
  href?: string | undefined
  /** Ouvrir le commentaire ; absent : projet invisible, la ligne n'ouvre rien. */
  onOpen?: ((event?: PressEvent) => void) | undefined
  /** Le texte affiché du bouton (« Supprimer »). */
  deleteText: string
  /** Son nom lu, qui dit quel commentaire (« Supprimer le commentaire : … »). */
  deleteLabel: string
  onDelete: () => void
  /**
   * La vue qui reçoit le focus quand l'écran le pose sur cette ligne (après la suppression de la
   * ligne d'avant) : le lien, ou « Supprimer » sur une ligne qui n'ouvre rien.
   */
  ref?: Ref<View> | undefined
}

/** Le nombre de lignes de l'extrait d'un commentaire qu'on peut ouvrir (planche : deux). */
const EXCERPT_LINES = 2
/**
 * À texte agrandi (200 %), deux lignes ne tiennent que quatre ou cinq mots : l'extrait en garde
 * quatre, pour qu'on reconnaisse encore son commentaire (batterie R11, 320 px).
 */
const EXCERPT_LINES_LARGE = 4
/** Les icônes de la ligne (planche : 14 points, à la taille des précisions). */
const SMALL_ICON = 14

export function MyCommentRow({
  projectTitle,
  goneLabel,
  date,
  replyLabel,
  body,
  marks = [],
  openLabel,
  href,
  onOpen,
  deleteText,
  deleteLabel,
  onDelete,
  ref,
}: Props) {
  const { colors } = useTheme()
  // L'identifiant du texte caché qui décrit le lien (web) : unique dans la page.
  const hintId = useId()
  const { full } = useRelativeDate(date)
  // Le texte est-il agrandi ? Sur le web, une sonde mesure la taille réelle des lettres (`probe`).
  const { large, probe } = useLargeText()
  const gone = projectTitle === null
  const opens = !gone && onOpen !== undefined
  // La description du lien : les marques, puis la date entière (« le 14 novembre à 19:00 »).
  const hint = [...marks.map((mark) => mark.label), full].join(' · ')

  const content = (
    <View style={{ gap: space.xxs }}>
      {/* Le projet, puis la date à droite ; à texte agrandi, la date passe à la ligne. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.sm,
        }}
      >
        {gone ? (
          <View style={{ flexShrink: 0 }}>
            <Icon name="eye-slash" size={SMALL_ICON} tone="muted" />
          </View>
        ) : null}
        <View style={{ flexGrow: 0, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }}>
          <Text variant="callout" weight={600} tone={gone ? 'muted' : 'default'} breakAnywhere>
            {projectTitle ?? goneLabel}
          </Text>
        </View>
        <View style={{ flexShrink: 0, maxWidth: '100%' }}>
          <RelativeTime date={date} />
        </View>
      </View>
      {replyLabel ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <View style={{ flexShrink: 0 }}>
            <Icon name="arrow-bend-up-left" size={SMALL_ICON} tone="muted" />
          </View>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text variant="caption" tone="muted">
              {replyLabel}
            </Text>
          </View>
        </View>
      ) : null}
      <Text
        variant="callout"
        tone="secondary"
        {...(gone ? null : { numberOfLines: large ? EXCERPT_LINES_LARGE : EXCERPT_LINES })}
        breakAnywhere
      >
        {body}
      </Text>
      {marks.map((mark) => (
        <View
          key={mark.label}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}
        >
          <View style={{ flexShrink: 0 }}>
            <Icon name={mark.icon} size={SMALL_ICON} tone="muted" />
          </View>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text variant="caption" tone="muted">
              {mark.label}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )

  // La colonne du texte : `flexGrow` et une vraie `flexBasis` (jamais `flex: 1`) ; si « Supprimer »
  // ne lui laisse pas MIN_NAME points, il passe dessous (comme le côté droit d'une `ListRow`).
  const column = {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: MIN_NAME,
    minWidth: 0,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    paddingVertical: space.md,
  } as const

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {probe}
      {opens ? (
        <Pressable
          ref={ref}
          accessibilityRole="link"
          accessibilityLabel={openLabel}
          accessibilityHint={Platform.OS === 'web' ? undefined : hint}
          {...describedBy(Platform.OS === 'web' ? hintId : undefined)}
          // Un lien avec adresse : sur le web, un vrai `<a>` (Entrée, nouvel onglet) ; `href`
          // manque aux types de React Native, d'où l'objet.
          {...(href ? { href } : null)}
          onPress={onOpen}
          // Le groupe rogne ce qui dépasse : l'anneau de focus se dessine à l'intérieur de la ligne.
          {...insetFocus}
          style={({ pressed }) => ({
            ...column,
            ...(pressed ? { backgroundColor: colors.surfaceGrouped } : null),
          })}
        >
          {content}
        </Pressable>
      ) : (
        <View style={column}>{content}</View>
      )}
      {/* « Supprimer », rangé à droite, en haut de la ligne ; il passe dessous quand la place manque. */}
      <View style={{ marginLeft: 'auto', paddingHorizontal: space.sm, paddingVertical: space.sm }}>
        <CommentActionButton
          {...(opens ? null : { ref })}
          action={{
            label: deleteLabel,
            text: deleteText,
            icon: 'trash',
            tone: 'danger',
            onPress: onDelete,
          }}
        />
      </View>
      {/* La description du lien, cachée à l'œil (display: none) mais lue par aria-describedby. */}
      {opens && Platform.OS === 'web' ? (
        <View nativeID={hintId} style={{ display: 'none' }}>
          <Text>{hint}</Text>
        </View>
      ) : null}
    </View>
  )
}
