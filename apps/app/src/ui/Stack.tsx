// Pile : range ses enfants les uns sous les autres (ou côte à côte avec `direction="row"`), avec un
// écart régulier pris dans l'échelle des espaces. C'est la brique de mise en page des écrans : ils
// n'écrivent ainsi jamais de marge ou d'écart en chiffres.
import { readableWidth, type Space, space } from '@ruche/brand'
import { Children, isValidElement, type ReactNode, type Ref } from 'react'
import { View, type ViewStyle } from 'react-native'
import type { FirstArrived } from './FeedEnd'

type Props = {
  children: ReactNode
  direction?: 'column' | 'row'
  gap?: Space
  padding?: Space
  paddingX?: Space
  paddingY?: Space
  /** Alignement sur l'autre axe que celui de la pile (en travers). */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline'
  /** Répartition le long de la pile. */
  justify?: 'start' | 'center' | 'end' | 'between'
  /** Passe à la ligne quand il n'y a plus de place (pour des pastilles, par exemple). */
  wrap?: boolean
  /** Prend toute la place disponible dans son parent. */
  grow?: boolean
  /**
   * `group` (R10, l'aperçu de « Créer une ruche ») : un groupe nommé par `accessibilityLabel`, lu
   * d'un seul nom (« Ma ruche Famille ») avant ses parties. React Native ne connaît pas ce rôle
   * dans `accessibilityRole` : la pile le pose par `role`, comme `RemovalNotice`, sans `accessible`
   * (sur iOS, VoiceOver atteint encore chaque partie).
   */
  accessibilityRole?: 'list' | 'radiogroup' | 'group' | 'none'
  accessibilityLabel?: string
  /**
   * Pour faire venir la pile dans l'écran (`revealWithoutJump`, ui/focus.ts) : la section
   * « E-mails » du profil, quand on y arrive depuis « Mon compte ».
   */
  ref?: Ref<View>
  /**
   * L'identifiant de la pile, pour qu'un lien voisin la cite en description (`describedBy`) : la
   * date relative d'un auteur, lue avec le lien vers sa page (R4).
   */
  nativeID?: string
  /**
   * Une liste (`accessibilityRole="list"`) qui se lit par pages : la case de l'élément arrivé en
   * premier avec la dernière page reçoit la vue que `FeedEnd` focalise (`useFirstArrived`, jur-RF2).
   */
  firstArrived?: FirstArrived
  /**
   * R7b : avec `accessibilityRole="list"`, les enfants sont déjà des éléments de liste (une bulle
   * du fil, `MessageBubble`, pose elle-même son `listitem`) : la pile ne les enveloppe pas. Sinon,
   * un élément de liste dans un autre, du HTML invalide que React signale (#418).
   */
  ownItems?: boolean
  /**
   * R11 : une colonne de lecture, bornée à `readableWidth` comme le Markdown et `Text readable`, même
   * sur un grand écran : l'« En bref » de l'écran « Accepter » garde la largeur du texte des Règles.
   */
  readable?: boolean
}

const alignments = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
  between: 'space-between',
} as const

export function Stack({
  children,
  direction = 'column',
  gap = 'md',
  padding,
  paddingX,
  paddingY,
  align,
  justify,
  wrap = false,
  grow = false,
  accessibilityRole,
  accessibilityLabel,
  ref,
  nativeID,
  firstArrived,
  ownItems = false,
  readable = false,
}: Props) {
  const style: ViewStyle = {
    flexDirection: direction,
    gap: space[gap],
    ...(padding ? { padding: space[padding] } : null),
    ...(paddingX ? { paddingHorizontal: space[paddingX] } : null),
    ...(paddingY ? { paddingVertical: space[paddingY] } : null),
    ...(align ? { alignItems: alignments[align] } : null),
    ...(justify ? { justifyContent: alignments[justify] } : null),
    ...(wrap ? { flexWrap: 'wrap' } : null),
    // minWidth: 0 laisse le texte se replier au lieu de pousser la mise en page hors de l'écran.
    ...(grow ? { flex: 1, minWidth: 0 } : null),
    // `stretch` : la colonne prend la largeur de son parent jusqu'à la borne, même dans un parent
    // aux éléments centrés.
    ...(readable ? { alignSelf: 'stretch', maxWidth: readableWidth } : null),
  }
  // Une liste annoncée (« liste, 8 éléments ») : chaque enfant y devient un élément de liste. Les
  // lecteurs d'écran disent ainsi combien il y en a, et permettent de sauter d'un élément au suivant.
  const items =
    accessibilityRole === 'list' && !ownItems
      ? Children.toArray(children).map((child, index) => (
          <View
            key={isValidElement(child) && child.key !== null ? child.key : index}
            role="listitem"
            ref={index === firstArrived?.index ? firstArrived.ref : undefined}
          >
            {child}
          </View>
        ))
      : children
  return (
    <View
      ref={ref}
      style={style}
      {...(accessibilityRole === 'group'
        ? { role: 'group' as const }
        : accessibilityRole
          ? { accessibilityRole }
          : null)}
      {...(accessibilityLabel ? { accessibilityLabel } : null)}
      {...(nativeID ? { nativeID } : null)}
    >
      {items}
    </View>
  )
}

/** Raccourci : une pile horizontale, éléments centrés verticalement. */
export function Row(props: Omit<Props, 'direction'>) {
  return <Stack direction="row" align="center" {...props} />
}
