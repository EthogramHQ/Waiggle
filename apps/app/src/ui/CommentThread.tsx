// Un fil de commentaires (tranche 5, redessiné en R5b, planche `R5b-Commentaires`) : le commentaire
// « racine », puis ses réponses, de la plus ancienne à la plus récente, en retrait. Un trait part de
// sous la photo de la racine, descend le long des réponses et tourne vers chacune par un coude
// arrondi, jusqu'à sa photo. Sans réponse, aucun trait.
//
// Depuis R5b, « Répondre » est sous chaque commentaire (dans sa carte) et le champ est en bas de la
// feuille : le fil ne fait plus que la mise en page. Les cartes (des `CommentCard`) sont données par
// l'écran ; un emplacement (« Commentaire supprimé ») garde ses réponses dessous, avec le trait.
//
// Pour les lecteurs d'écran (relecture de l'interface ui-M1) : le fil est un élément de la liste des
// fils (`listitem`), et ses réponses une liste imbriquée, dont chaque réponse est un élément. On
// entend ainsi « liste, 2 éléments » sous un commentaire, et l'on saute d'une réponse à l'autre.
// La liste qui contient les fils n'enveloppe donc pas ses enfants dans des éléments de liste
// (pas de `Stack accessibilityRole="list"`) : un élément dans un élément est du HTML invalide, que
// le navigateur répare en lisant la page pré-rendue, et React échoue alors à l'hydrater.
//
// Le trait est un dessin : caché aux lecteurs d'écran, jamais touchable.
import { borders, layout, space } from '@ruche/brand'
import { Children, isValidElement, type ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'
import { useLargeText } from './textScale'
import { useLayout } from './theme/layout'
import { useTheme } from './theme/ThemeProvider'

/**
 * Les tailles des photos d'une carte (`COMMENT_AVATAR` de CommentCard : 36 pour la racine, 28 pour
 * une réponse). Le trait se place d'après elles : sous le milieu de la photo de la racine, jusqu'au
 * milieu de celle de chaque réponse. Recopiées ici pour que le fil ne dépende pas de la carte ;
 * elles changent ensemble.
 */
const AVATAR = { root: 36, reply: 28 } as const

/**
 * La carte pose sa photo à ce retrait du bord gauche, dans une rangée de cette hauteur, où elle est
 * centrée (la hauteur à toucher du lien du nom), sans marge au-dessus ; le trait se place d'après
 * eux, recopiés comme `AVATAR`.
 */
const CARD_PADDING = space.sm
const CARD_ROW = layout.touchTarget
/** Le trait vertical, centré sous la photo de la racine (sa position depuis le bord du fil). */
const TRUNK = CARD_PADDING + AVATAR.root / 2 - borders.thread / 2
/** Le retrait des réponses : leur photo s'aligne sur le nom de la racine, à droite de sa photo. */
const INDENT = AVATAR.root + space.sm
/** L'arrondi du coude. */
const ELBOW_RADIUS = space.md
/**
 * Le plus petit retrait pour un trait placé à `trunk` : le coude entier (son arrondi), puis l'écart
 * d'avant la photo de la réponse, posée à `CARD_PADDING` du bord de sa carte.
 */
const indentFor = (trunk: number) => trunk + ELBOW_RADIUS + space.xs - CARD_PADDING
/**
 * Sous cette largeur d'écran, le retrait se resserre (R6b, restes de R5b) : à 320 points, les
 * réponses ne gardaient que 19 caractères par ligne. Le même seuil que la photo du champ
 * (`REPLY_PHOTO_FROM` de CommentComposer).
 */
const NARROW_BELOW = 360
/**
 * Les mises en page du fil. `trunk` : où descend le trait, depuis le bord du fil ; `indent` : le
 * retrait des réponses ; `fromPhoto` : le trait part-il de sous la photo de la racine ?
 * - `normal` : les réponses alignées sur le nom de la racine ;
 * - `narrow` (écran étroit) : le trait reste sous la photo de la racine, le retrait ne garde que la
 *   place du coude (33 points au lieu de 44) ;
 * - `large` (texte très agrandi) : le texte de la racine passe sous sa photo, le trait ne part plus
 *   que du bas de la carte ; il peut donc longer le bord du fil, et le retrait tombe à 12 points. À
 *   320 points et 200 %, la seule largeur de l'écran ne laisse de toute façon qu'une quinzaine de
 *   caractères par ligne, à la racine comme aux réponses : chaque point rendu au texte compte.
 */
const SHAPES = {
  normal: { trunk: TRUNK, indent: INDENT, fromPhoto: true },
  narrow: { trunk: TRUNK, indent: indentFor(TRUNK), fromPhoto: true },
  large: { trunk: space.xs, indent: indentFor(space.xs), fromPhoto: false },
} as const
/**
 * Entre la racine et sa première réponse, puis entre deux réponses. Le même écart qu'entre deux fils,
 * celui que « Répondre » laisse dépasser sous sa carte : les zones de 44 points se touchent sans se
 * chevaucher (décision 18).
 */
const GAP = { first: space.md, between: space.md } as const
/** La hauteur, depuis le haut d'une réponse, où le coude arrive : le milieu de sa photo. */
const ELBOW_END = CARD_ROW / 2
/** Où le trait part, depuis le haut de la racine : juste sous sa photo. */
const TRUNK_START = (CARD_ROW + AVATAR.root) / 2 + space.xs

type Props = {
  /** Le commentaire racine (une CommentCard), et ce qui le suit de près (une confirmation). */
  root: ReactNode
  /** Ses réponses, dans l'ordre (des CommentCard). */
  replies?: ReactNode
  /**
   * Ce qui vient tout au bout du fil, sous les réponses et à leur retrait, sans trait : une
   * confirmation, une erreur propre au fil.
   */
  footer?: ReactNode
  /**
   * Le fil est un élément de liste (par défaut). Faux quand `CommentList` pose déjà cet élément autour
   * de lui : un élément dans un élément est du HTML invalide (voir plus haut), et la liste compterait
   * deux fois chaque fil.
   */
  listItem?: boolean
  /**
   * Retirés en R5b : « Répondre » est dans chaque carte (`CommentCard onReply`), et le champ en bas
   * de la feuille (`CommentComposer`). `never` refuse toute valeur, une erreur de typage par
   * propriété : un écran qui les passe encore se voit à la compilation.
   */
  replyAction?: never
  composer?: never
}

/**
 * Un morceau du trait. Caché aux lecteurs d'écran sur le web (`aria-hidden`) comme sur téléphone
 * (Android : `importantForAccessibility`, iOS : `accessibilityElementsHidden`), et laissé passer au
 * doigt (`pointerEvents` en propriété : en style, react-native-web le traduit mal). Posé sous le
 * contenu (`zIndex: -1`, dans un élément qui forme sa propre pile) : sur la carte grise de ses
 * propres commentaires, il passe dessous au lieu de la barrer.
 */
function Line({ style }: { style: ViewStyle }) {
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      pointerEvents="none"
      style={[{ position: 'absolute', zIndex: -1 }, style]}
    />
  )
}

export function CommentThread({ root, replies, footer, listItem = true }: Props) {
  const { colors } = useTheme()
  // Children.toArray retire les « rien » (null, false) : sans réponse, ni liste vide ni trait.
  const items = Children.toArray(replies)
  const hasReplies = items.length > 0
  const hasFooter = Children.toArray(footer).length > 0
  const ink = colors.line
  // Très agrandi, le texte de la carte passe sous la photo (CommentCard) : le trait n'y descend plus.
  const { large, probe } = useLargeText()
  // La largeur de la fenêtre, 0 avant l'hydratation (web) : le pré-rendu garde le retrait normal.
  const { width } = useLayout()
  const shape = SHAPES[large ? 'large' : width > 0 && width < NARROW_BELOW ? 'narrow' : 'normal']
  const { trunk, indent } = shape

  return (
    <View {...(listItem ? { role: 'listitem' as const } : null)} style={{ gap: GAP.first }}>
      {hasReplies ? probe : null}
      {/* zIndex: 0 fait de chaque bloc sa propre pile : le trait (zIndex -1) passe sous la carte,
          mais reste au-dessus du fond de la page. */}
      <View style={{ zIndex: 0 }}>
        {hasReplies && shape.fromPhoto ? (
          // Le départ du trait : de sous la photo de la racine jusqu'au bas de sa carte.
          <Line
            style={{
              left: trunk,
              top: TRUNK_START,
              bottom: 0,
              width: borders.thread,
              backgroundColor: ink,
            }}
          />
        ) : null}
        {root}
      </View>
      {hasReplies ? (
        <View accessibilityRole="list" style={{ marginLeft: indent, gap: GAP.between }}>
          {items.map((reply, index) => {
            const last = index === items.length - 1
            // L'écart au-dessus de cette réponse, que son morceau de trait franchit.
            const above = index === 0 ? GAP.first : GAP.between
            return (
              <View
                key={isValidElement(reply) && reply.key !== null ? reply.key : index}
                role="listitem"
                style={{ zIndex: 0 }}
              >
                {/* Le trait vertical, de la réponse d'au-dessus (ou de la racine) jusqu'au coude ;
                    il continue jusqu'en bas de la réponse quand une autre la suit. Les morceaux
                    se touchent bout à bout : de nuit, le trait est translucide, et deux morceaux
                    posés l'un sur l'autre se verraient plus clairs. Seul le départ du coude d'une
                    réponse suivie d'une autre croise le trait qui continue, sur quelques points. */}
                <Line
                  style={{
                    left: trunk - indent,
                    top: -above,
                    width: borders.thread,
                    backgroundColor: ink,
                    ...(last ? { height: above + ELBOW_END + 1 - ELBOW_RADIUS } : { bottom: 0 }),
                  }}
                />
                {/* Le coude : un quart d'arrondi, du trait vertical jusqu'au bord de la photo. */}
                <Line
                  style={{
                    left: trunk - indent,
                    top: ELBOW_END + 1 - ELBOW_RADIUS,
                    width: indent + CARD_PADDING - trunk - space.xs,
                    height: ELBOW_RADIUS,
                    borderLeftWidth: borders.thread,
                    borderBottomWidth: borders.thread,
                    borderBottomLeftRadius: ELBOW_RADIUS,
                    borderColor: ink,
                  }}
                />
                {reply}
              </View>
            )
          })}
        </View>
      ) : null}
      {hasFooter ? <View style={{ marginLeft: indent }}>{footer}</View> : null}
    </View>
  )
}
