// Un fil de commentaires (tranche 5) : le commentaire « racine », puis ses réponses, de la plus
// ancienne à la plus récente, en retrait derrière un trait fin qui les rattache à lui. Au bout du
// fil, un seul « Répondre » : les réponses vont toujours au bout du fil (elles tiennent sur un seul
// niveau), et c'est là que le champ s'ouvre, à la place du bouton, là où la réponse viendra se
// ranger. L'écran ne donne pas « Répondre » quand on ne peut pas répondre (racine supprimée ou
// masquée).
// Le composant fait la mise en page et garde le focus : quand le champ se referme (réponse publiée
// ou annulée), le focus du clavier revient sur « Répondre », revenu à sa place. Les cartes
// (CommentCard) et le champ (NoteComposer) sont donnés par l'écran.
import { borders, space } from '@ruche/brand'
import {
  Children,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
} from 'react'
import { Platform, View } from 'react-native'
import { ActionDescription, type CommentAction, CommentActionButton } from './CommentAction'
import { COMMENT_AVATAR } from './CommentCard'
import { focusWithoutScroll } from './focus'
import { useTheme } from './theme/ThemeProvider'

/** Ce qu'un écran peut demander au fil : poser le focus sur « Répondre » (vrai s'il est là). */
export type CommentThreadHandle = { focusReply: () => boolean }

type Props = {
  /** Le commentaire racine (une CommentCard), et ce qui le suit de près (une confirmation). */
  root: ReactNode
  /** Ses réponses, dans l'ordre (des CommentCard). */
  replies?: ReactNode
  /**
   * « Répondre », au bout du fil ; absent quand on ne peut pas répondre. `description` dit aux
   * lecteurs d'écran à quel commentaire (« Max : Super idée… »).
   */
  replyAction?: (CommentAction & { description?: string }) | undefined
  /** Le champ d'une réponse en cours : il prend la place de « Répondre ». */
  composer?: ReactNode
  /** Ce qui vient tout au bout du fil : une confirmation (« Réponse publiée. »). */
  footer?: ReactNode
  handle?: Ref<CommentThreadHandle>
}

// Le peu du navigateur dont on a besoin ici : savoir si le focus est retombé sur la page.
const lostFocus = () => {
  const document = (globalThis as { document?: { activeElement: unknown; body: unknown } }).document
  return !document?.activeElement || document.activeElement === document.body
}

export function CommentThread({ root, replies, replyAction, composer, footer, handle }: Props) {
  const { colors } = useTheme()
  const replyButton = useRef<View>(null)
  const descriptionId = useId()
  useImperativeHandle(handle, () => ({
    focusReply: () => focusWithoutScroll(replyButton.current),
  }))

  // Children.toArray retire les « rien » (null, false) : sans réponse ni champ, pas de retrait vide.
  const hasReplies = Children.toArray(replies).length > 0
  const hasComposer = Children.toArray(composer).length > 0
  const hasFooter = Children.toArray(footer).length > 0

  // Le champ vient de se refermer : le bouton qu'on avait touché (« Publier la réponse »,
  // « Annuler ») a disparu, et sur le web le focus est retombé sur la page. On le pose sur
  // « Répondre », revenu à la même place, sans faire défiler la page.
  const wasComposing = useRef(hasComposer)
  useEffect(() => {
    const closed = wasComposing.current && !hasComposer
    wasComposing.current = hasComposer
    if (closed && Platform.OS === 'web' && lostFocus()) focusWithoutScroll(replyButton.current)
  }, [hasComposer])

  const reply = hasComposer ? (
    composer
  ) : replyAction ? (
    // marginLeft négatif : le texte de « Répondre » s'aligne sur celui des réponses.
    <View style={{ flexDirection: 'row', marginLeft: -space.sm }}>
      {replyAction.description ? (
        <ActionDescription id={descriptionId} text={replyAction.description} />
      ) : null}
      <CommentActionButton
        ref={replyButton}
        action={replyAction}
        describedById={replyAction.description ? descriptionId : undefined}
        hint={replyAction.description}
      />
    </View>
  ) : null

  return (
    <View style={{ gap: space.md }}>
      {root}
      {hasReplies || reply || hasFooter ? (
        <View
          style={{
            // Le trait part sous le milieu de la photo de la racine.
            marginLeft: COMMENT_AVATAR.root / 2 - borders.thread / 2,
            paddingLeft: space.lg,
            borderLeftWidth: borders.thread,
            borderLeftColor: colors.line,
            gap: space.lg,
          }}
        >
          {replies}
          {reply}
          {footer}
        </View>
      ) : null}
    </View>
  )
}
