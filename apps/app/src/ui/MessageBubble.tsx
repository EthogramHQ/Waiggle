// Un message du fil d'un testeur (R7b, « Le coin des testeurs », planches R7b-Fil et R7b-Fil-Nuit) :
// un retour (« Ça a marché ? », l'appareil, le texte, une capture) ou une réponse, dans une bulle.
//
// - La couleur et le côté suivent **le rôle** de qui écrit, jamais celui qui lit (décision des
//   planches) : l'auteur du projet en crème miel (`bubbleAuthor`), à droite ; le testeur en blanc
//   bordé (`bubbleTester`), à gauche. Le coin pointu, du côté de qui parle, dit d'où vient la bulle.
// - En tête d'un retour : son issue (`OutcomePill`, lue « Ça a marché : En partie ») et l'appareil
//   avec son icône ; puis le texte, la capture, et « Réglé dans la v1.3 » en pied, sous un trait.
// - Le menu « … » (44 points) se pose à côté de la bulle, à l'extérieur, du côté de la colonne ; sa
//   date relative (« il y a 3 h ») dessous, hors de la bulle.
// - Le message est un élément de la liste que pose l'écran (`listitem`), jamais un titre : un fil
//   se parcourt message par message. Son nom dit qui parle et quand (« Retour d'Inès, il y a 3 h »,
//   « Ta réponse, hier ») : le composant le choisit, l'écran lui dit seulement si c'est le sien.
// - La bulle s'élargit jusqu'à 80 % de la colonne ; à texte agrandi, tout passe à la ligne au lieu
//   de déborder (la pastille, l'appareil, un mot sans espace).
//
// La capture est gardée en mémoire seulement (`cachePolicy="memory"`, relecture de sécurité A4) :
// une image d'un fil privé ne s'écrit pas dans le cache disque de l'appareil.
import { borders, layout, radii, space } from '@ruche/brand'
import type {
  FeedbackDevice,
  FeedbackOutcome,
  TesterMessageKind,
  TesterRole,
} from '@ruche/contracts'
import type { ReactNode, Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Platform, View } from 'react-native'
import { useNameOf } from '../useNameOf'
import { ActionMenu, type ActionMenuItem } from './ActionMenu'
import { excerpt } from './CommentAction'
import { hiddenFrame } from './HiddenHeading'
import { Icon, type IconName, SMALL_ICON } from './Icon'
import type { ImageSource } from './image'
import { OpenableImage, PICTURE_MAX_HEIGHT } from './OpenableImage'
import { OutcomePill } from './OutcomePill'
import { RelativeTime, useRelativeDate } from './RelativeTime'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

export type { ActionMenuItem } from './ActionMenu'

type Props = {
  /** Qui a écrit : l'auteur du projet (crème, à droite) ou le testeur (blanc, à gauche). */
  from: TesterRole
  /** Un retour (avec son issue) ou une réponse. */
  kind: TesterMessageKind
  /** Le membre qui lit l'a écrit : « Ton retour », « Ta réponse ». La couleur, elle, ne change pas. */
  mine: boolean
  /** Le nom de qui a écrit (« Inès Haddad »), pour le nom lu : « Retour d'Inès Haddad ». */
  name: string
  /** Le texte, tel qu'écrit ; null : un retour sans texte (l'issue seule). */
  text: string | null
  /** Quand, au format ISO du contrat. */
  at: string
  /** L'issue d'un retour, son libellé traduit par l'écran (« En partie »). */
  outcome?: { value: FeedbackOutcome; label: string } | null
  /** L'appareil d'un retour, traduit par l'écran (« Téléphone ») ; null : non dit. */
  device?: string | null
  /**
   * La sorte d'appareil, pour son icône (téléphone, ordinateur, tablette) : `device` n'en est que le
   * libellé. Absente : l'appareil s'écrit sans icône.
   */
  deviceKind?: FeedbackDevice | null
  /**
   * La capture jointe, prête à dessiner, et son nom lu (fixe, jamais une description du membre).
   * `width` et `height` : ses dimensions (`TesterMedia` du contrat), pour poser le cadre à ses
   * proportions dès le premier dessin ; absentes, elles se lisent au chargement de l'image.
   */
  capture?: { source: ImageSource; description: string; width?: number; height?: number } | null
  /** « Réglé dans la v1.3 », déjà écrit par l'écran ; null : à traiter. */
  settled?: string | null
  /** L'encadré d'un message retiré par la modération, pour qui l'a écrit (`RemovalNotice`). */
  removal?: ReactNode
  /** Les actions du menu « … » ; vide ou absent : pas de « … ». */
  menu?: ActionMenuItem[]
  /**
   * Où l'écran pose le focus sur ce message (après « Afficher les précédents », après la
   * suppression d'un voisin). Sur le web, l'élément de liste, nommé : `focusTarget` y trouve le
   * « … » ; sur téléphone, le texte caché qui dit le nom du message, où va le lecteur d'écran.
   */
  focusRef?: Ref<View>
  /**
   * Un geste en cours sur ce message, déjà écrit par l'écran (« Enregistrement… », pendant « Marquer
   * comme réglé ») : sous la bulle, de son côté, avec une roue ; le message est annoncé occupé
   * (R7b, ui-A1). null : rien en cours.
   */
  pending?: string | null
  /**
   * Le message d'un geste raté sur ce message (l'erreur de « Marquer comme réglé », un `Notice`) :
   * sous la bulle, près du « … » touché, plutôt qu'au bas d'un long fil (R7b, ui-A1).
   */
  notice?: ReactNode
}

/** L'icône de chaque appareil (pas d'icône de tablette dans le jeu : celle du téléphone). */
const deviceIcons: Record<FeedbackDevice, IconName> = {
  phone: 'device-mobile',
  tablet: 'device-mobile',
  computer: 'desktop',
}

/** Le coin pointu d'une bulle, du côté de qui parle (planche : 8 points ; les autres, `radii.group`). */
const TAIL_RADIUS = 8
/** La part de la colonne que la bulle peut prendre, au plus. */
const BUBBLE_MAX = '80%'
/** L'icône de « Réglé ». */
const SETTLED_ICON = 16

export function MessageBubble({
  from,
  kind,
  mine,
  name,
  text,
  at,
  outcome = null,
  device = null,
  deviceKind = null,
  capture = null,
  settled = null,
  removal,
  menu = [],
  focusRef,
  pending = null,
  notice,
}: Props) {
  const { t } = useTranslation()
  const { colors, shadows } = useTheme()
  // « de Léa », « d’Inès » : le nom relié au texte selon la langue (`{{nameOf}}` des textes).
  const nameOf = useNameOf()
  // La date relative du nom lu, sur la même horloge que celle affichée sous la bulle.
  const { label: time } = useRelativeDate(at)
  const byAuthor = from === 'author'
  const isFeedback = kind === 'feedback'

  const spokenName = mine
    ? t(
        ($) =>
          isFeedback ? $.project.testers.thread.mineFeedback : $.project.testers.thread.mineReply,
        {
          time,
        },
      )
    : t(
        ($) =>
          isFeedback ? $.project.testers.thread.feedbackOf : $.project.testers.thread.replyOf,
        {
          nameOf: nameOf(name),
          time,
        },
      )

  // Le nom du « … » : le début du texte (plusieurs messages se suivent) ; sans texte, à qui il est.
  const menuLabel = text
    ? t(($) => $.project.testers.thread.menu, { excerpt: excerpt(text) })
    : mine
      ? t(($) => $.project.testers.thread.menuMineNoText)
      : t(($) => $.project.testers.thread.menuNoText, { nameOf: nameOf(name) })

  const head =
    outcome || device ? (
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.md,
          rowGap: space.xs,
          maxWidth: '100%',
        }}
      >
        {outcome ? (
          <OutcomePill
            outcome={outcome.value}
            label={outcome.label}
            spokenLabel={t(($) => $.project.testers.feedback.outcomeSpoken, {
              outcome: outcome.label,
            })}
          />
        ) : null}
        {device ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              flexShrink: 1,
              maxWidth: '100%',
            }}
          >
            {deviceKind ? (
              // Décorative : le libellé dit l'appareil. Dans une vue, pour ne pas rétrécir sur le web.
              <View style={{ flexShrink: 0 }} aria-hidden>
                <Icon name={deviceIcons[deviceKind]} size={SMALL_ICON} tone="secondary" />
              </View>
            ) : null}
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Text variant="caption" weight={600} tone="secondary">
                {device}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    ) : null

  const settledLine = settled ? (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingTop: space.sm,
        borderTopWidth: borders.hairline,
        borderTopColor: colors.line,
      }}
    >
      {/* La coche, de la couleur de « Réglé » (`Icon color`). Décorative : le texte dit l'état. */}
      <View style={{ flexShrink: 0 }}>
        <Icon name="check-circle" size={SETTLED_ICON} color="settledText" />
      </View>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text variant="caption" weight={700} tone="settled">
          {settled}
        </Text>
      </View>
    </View>
  ) : null

  const bubble = (
    <View
      style={{
        // La bulle prend la place de son texte, jusqu'à 80 % de la colonne ; flexShrink et minWidth :
        // sur le web, une vue ne se replie pas sans eux (react-native-web lui donne flexShrink 0).
        maxWidth: BUBBLE_MAX,
        flexShrink: 1,
        minWidth: 0,
        gap: space.sm,
        paddingHorizontal: space.md,
        paddingTop: space.sm,
        paddingBottom: space.md,
        borderRadius: radii.group,
        ...(byAuthor
          ? { backgroundColor: colors.bubbleAuthor, borderTopRightRadius: TAIL_RADIUS }
          : {
              backgroundColor: colors.bubbleTester,
              borderTopLeftRadius: TAIL_RADIUS,
              borderWidth: borders.hairline,
              borderColor: colors.line,
              boxShadow: shadows.soft,
            }),
      }}
    >
      {removal}
      {head}
      {text ? (
        <Text variant="callout" breakAnywhere selectable>
          {text}
        </Text>
      ) : null}
      {capture ? (
        // Entière, à ses proportions, dans un carré de 240 points au plus ; un appui l'ouvre en
        // grand (relecture de design B1). En mémoire seulement (sécurité A4).
        <OpenableImage
          source={capture.source}
          label={capture.description}
          size={capture}
          maxWidth={PICTURE_MAX_HEIGHT}
        />
      ) : null}
      {settledLine}
    </View>
  )

  // Le nom du message : sur le web, celui de l'élément de liste (le navigateur le lit en y entrant) ;
  // sur téléphone, un texte caché à l'œil, lu en premier (une vue `accessible` cacherait au lecteur
  // d'écran le menu « … » qu'elle contient).
  // `aria-busy` : un geste en cours sur ce message (le web lit l'état ; sur téléphone, la phrase dite).
  const named =
    Platform.OS === 'web'
      ? ({
          role: 'listitem',
          'aria-label': spokenName,
          ...(pending ? { 'aria-busy': true } : null),
        } as object)
      : ({ role: 'listitem' } as object)

  return (
    <View
      {...named}
      ref={Platform.OS === 'web' ? focusRef : undefined}
      style={{
        alignSelf: 'stretch',
        gap: space.xs,
        alignItems: byAuthor ? 'flex-end' : 'flex-start',
      }}
    >
      {Platform.OS === 'web' ? null : (
        <View style={hiddenFrame} pointerEvents="none">
          <Text accessibilityLabel={spokenName} focusRef={focusRef}>
            {spokenName}
          </Text>
        </View>
      )}
      {/* La bulle et son « … » : la rangée a la largeur de la colonne, la bulle la sienne (80 % au
          plus). L'auteur parle à droite : la rangée s'inverse, le « … » passe à gauche de la bulle,
          mais il suit toujours la bulle au clavier et au lecteur d'écran. */}
      <View
        style={{
          alignSelf: 'stretch',
          flexDirection: byAuthor ? 'row-reverse' : 'row',
          alignItems: 'flex-start',
          gap: space.xxs,
        }}
      >
        {bubble}
        {menu.length > 0 ? (
          <View style={{ flexShrink: 0, minHeight: layout.touchTarget }}>
            <ActionMenu
              items={menu}
              label={menuLabel}
              // Sans disque au repos : répété à chaque message, il pèserait plus que le texte.
              variant="bare"
              {...(byAuthor ? null : { align: 'end' as const })}
            />
          </View>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: space.sm, maxWidth: '100%' }}>
        <RelativeTime date={at} />
      </View>
      {/* Le geste en cours, puis son erreur : sous la bulle, du côté de qui parle, au plus large de
          la bulle (80 %), pour rester près du « … » touché. */}
      {pending ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.xs,
            paddingHorizontal: space.sm,
            maxWidth: BUBBLE_MAX,
          }}
        >
          {/* La roue est un décor : la phrase dit l'état. */}
          <ActivityIndicator size="small" color={colors.textMuted} aria-hidden />
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text variant="caption" tone="muted">
              {pending}
            </Text>
          </View>
        </View>
      ) : null}
      {notice ? <View style={{ width: '100%', maxWidth: BUBBLE_MAX }}>{notice}</View> : null}
    </View>
  )
}
