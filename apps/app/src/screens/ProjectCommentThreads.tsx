// La liste complète des commentaires d'un projet (R5b) : les fils, leurs cartes, le menu « … » de
// chacune, la fenêtre qui confirme une suppression et la région qui annonce ce qui vient d'arriver.
// Montée dans la feuille sur téléphone, dans la colonne de droite sur ordinateur ; l'écran
// (ProjectComments.tsx) garde ce qui doit survivre à la feuille, le brouillon surtout.
//
// La fenêtre de suppression est rendue ici, donc dans la feuille quand il y en a une : sur iOS, deux
// Modal frères ne s'empilent pas, et elle ne s'ouvrirait jamais (relecture de l'interface, ui-M4).
import type { Comment, CommentReply, Project } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type ReactNode, type RefObject, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { useMediaSources } from '../api/media'
import { type CommentFailure, useComments, useDeleteComment, useHideComment } from '../comments/api'
import { threadLines } from '../comments/lines'
import type { useCommentDraft } from '../comments/useCommentDraft'
import { useSignInAgain } from '../navigation/signInAgain'
import { removalBanner } from '../reports/removal'
import { Button } from '../ui/Button'
import { type ActionMenuItem, CommentCard, type CommentCardHandle } from '../ui/CommentCard'
import { CommentList } from '../ui/CommentList'
import { CommentThread } from '../ui/CommentThread'
import { Dialog } from '../ui/Dialog'
import { LiveStatus } from '../ui/LiveStatus'
import { Notice } from '../ui/Notice'

/** Les cartes montées, par commentaire : l'écran y pose le focus du clavier. */
export type CommentCards = Map<string, CommentCardHandle>

/** Hook : le message d'un envoi refusé. 429 et 401 : « Réessaie » ne servirait à rien, on dit pourquoi. */
export const useCommentFailure = () => {
  const { t } = useTranslation()
  return (
    reason: CommentFailure | undefined,
    otherwise: string,
    limited = t(($) => $.project.comments.limited),
  ) =>
    reason === 'limited'
      ? limited
      : reason === 'expired'
        ? t(($) => $.states.expired)
        : reason === 'blockedMention'
          ? // Une mention d'un membre qu'on a bloqué (422) : sans nommer qui, l'API ne le dit pas.
            t(($) => $.errors.blockedMention)
          : otherwise
}

/**
 * Pose le focus sur la première de ces cartes qui peut le prendre : son « … », sinon son « Répondre ».
 * Un emplacement (« Commentaire supprimé ») n'a ni l'un ni l'autre : on passe au suivant. Faux si
 * aucune ne l'a pris.
 */
export const focusFirstCard = (cards: CommentCards, ids: readonly string[]) =>
  ids.some((id) => {
    const card = cards.get(id)
    return Boolean(card?.focusMenu() || card?.focusReply())
  })

type Props = {
  project: Project
  threads: Comment[]
  /** Le membre lit sans écrire (compte suspendu, projet retiré) : ni « Répondre », ni « Modifier ». */
  readOnly: boolean
  /** La première page manque (chargement, panne) : ce qu'il faut montrer à la place des fils. */
  trouble: ReactNode
  /**
   * Ce que la région de la feuille annonce : lu, jamais montré (décisions de Louis du 6/11). `null` :
   * pas de région ici, l'écran porte la sienne (la colonne, où la liste n'est pas toujours montée).
   * Dans la feuille, elle est ici et nulle part ailleurs : hors d'une fenêtre `aria-modal`, elle ne
   * serait pas lue.
   */
  announcement: string | null
  announce: (message: string) => void
  draft: ReturnType<typeof useCommentDraft>
  cards: RefObject<CommentCards>
  /** « Répondre » et « Modifier » touchés : le champ prend le geste et le focus. */
  onReply: (root: Comment, target: CommentReply) => void
  onEdit: (comment: CommentReply) => void
  /** Rien de voisin où poser le focus : l'écran sait où il va (le champ, sinon le titre). */
  onFocusLost: () => void
  /** Quitter la page : la feuille se ferme d'abord, sinon elle resterait par-dessus (ui-B2). */
  leave: (go: () => void) => void
  /** La phrase d'une liste vide (sur un projet privé, elle dit que les commentaires sont gardés). */
  emptyLabel: string
}

export function CommentThreads({
  project,
  threads,
  readOnly,
  trouble,
  announcement,
  announce,
  draft,
  cards,
  onReply,
  onEdit,
  onFocusLost,
  leave,
  emptyLabel,
}: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const comments = useComments(project.id)
  const remove = useDeleteComment(project.id)
  const hide = useHideComment(project.id)
  const signInAgain = useSignInAgain()
  const failure = useCommentFailure()

  // Le commentaire dont on demande confirmation de la suppression, et s'il a des réponses (la
  // fenêtre ne dit pas la même chose).
  const [deleting, setDeleting] = useState<{ id: string; hasReplies: boolean } | null>(null)
  const [removing, setRemoving] = useState(false)
  // Les erreurs de React Query restent jusqu'au prochain envoi : on ne les montre qu'après un envoi.
  const [showDeleteError, setShowDeleteError] = useState(false)
  // Après une suppression : les cartes voisines à essayer, une fois la fenêtre fermée.
  const focusAfterClose = useRef<string[] | null>(null)
  // Masquer : le commentaire dont le dernier changement a échoué, et ceux en cours d'envoi. La `ref`
  // est lue tout de suite (un double clic n'envoie qu'une fois) ; l'état fait attendre le bouton.
  const [hideFailed, setHideFailed] = useState<string | null>(null)
  const [hiding, setHiding] = useState<ReadonlySet<string>>(new Set())
  const hidingNow = useRef(new Set<string>())

  const setHidden = async (comment: CommentReply, hidden: boolean, fromCard = false) => {
    if (hidingNow.current.has(comment.id)) return
    hidingNow.current.add(comment.id)
    setHiding(new Set(hidingNow.current))
    setHideFailed(null)
    announce('')
    const ok = await hide.setHidden({ id: comment.id, hidden })
    hidingNow.current.delete(comment.id)
    setHiding(new Set(hidingNow.current))
    if (!ok) {
      setHideFailed(comment.id)
      return
    }
    announce(
      hidden ? t(($) => $.project.comments.hiddenDone) : t(($) => $.project.comments.shownDone),
    )
    // « Démasquer » de la carte s'en va avec la pastille : le focus passe à « … », qui reste.
    if (fromCard) cards.current.get(comment.id)?.focusMenu()
  }

  /** Les cartes voisines : d'abord les suivantes, puis les précédentes, de la plus proche à la plus loin. */
  const neighborsOf = (id: string) => {
    const order = threadLines(threads).map((comment) => comment.id)
    const at = order.indexOf(id)
    return [...order.slice(at + 1), ...order.slice(0, Math.max(at, 0)).reverse()]
  }

  const focusNeighbor = () => {
    const candidates = focusAfterClose.current
    focusAfterClose.current = null
    if (!candidates) return
    // Le temps que la fenêtre quitte la page : avant, elle garderait le focus pour elle.
    requestAnimationFrame(() => {
      if (!focusFirstCard(cards.current, candidates)) onFocusLost()
    })
  }

  const confirmDelete = async () => {
    if (!deleting || removing) return
    setRemoving(true)
    setShowDeleteError(true)
    // Calculé avant : une fois supprimé, le commentaire n'est plus dans la liste.
    const { id } = deleting
    const neighbors = neighborsOf(id)
    const ok = await remove.remove(id)
    setRemoving(false)
    // Refusée : la fenêtre reste ouverte, avec le message ; « Supprimer » permet de réessayer.
    if (!ok) return
    // Le champ ne vise plus un commentaire qui n'existe plus : un envoi serait refusé.
    if (draft.highlightedId === id || (draft.mode.kind === 'reply' && draft.mode.rootId === id)) {
      draft.cancel()
    }
    focusAfterClose.current = neighbors
    announce(t(($) => $.project.comments.deleted))
    setDeleting(null)
    // Android n'appelle pas `onDismiss` d'un Modal : la fenêtre ne préviendrait jamais de son départ.
    if (Platform.OS === 'android') focusNeighbor()
  }

  /** Le menu « … » : le sien, ou celui du commentaire d'un autre. Vide : pas de « … ». */
  const menuOf = (comment: CommentReply): ActionMenuItem[] => {
    // Un emplacement (supprimé, masqué, retiré, ou caché par un blocage) : rien à y lire, donc rien
    // à signaler, et on n'interagit plus avec un membre bloqué.
    if (!comment.author) return []
    const deleteItem: ActionMenuItem = {
      label: t(($) => $.project.comments.deleteShort),
      icon: 'trash',
      tone: 'danger',
      onPress: () => {
        setShowDeleteError(false)
        announce('')
        setDeleting({
          id: comment.id,
          hasReplies: 'replies' in comment && (comment as Comment).replies.length > 0,
        })
      },
    }
    if (comment.isMine) {
      // Son commentaire retiré par la modération : l'API refuserait de le modifier (409 `removed`),
      // il peut encore le supprimer. Sans champ (compte suspendu, projet retiré), rien à modifier.
      return comment.state === 'removed' || readOnly
        ? [deleteItem]
        : [
            {
              label: t(($) => $.project.comments.editShort),
              icon: 'pencil-simple',
              onPress: () => onEdit(comment),
            },
            deleteItem,
          ]
    }
    const report: ActionMenuItem = {
      label: t(($) => $.report.action),
      icon: 'flag',
      // Une réponse est un commentaire comme un autre : la même sorte de cible.
      onPress: () =>
        leave(() =>
          router.push({ pathname: '/report', params: { kind: 'comment', id: comment.id } }),
        ),
    }
    if (!project.isMine) return [report]
    const hidden = comment.state === 'hidden'
    return [
      {
        label: hidden
          ? t(($) => $.project.comments.unhideShort)
          : t(($) => $.project.comments.hideShort),
        icon: hidden ? 'eye' : 'eye-slash',
        onPress: () => void setHidden(comment, !hidden),
      },
      report,
    ]
  }

  const card = (comment: CommentReply, root: Comment, kind: 'root' | 'reply') => {
    const { author } = comment
    // Pas de « Répondre » dans un fil dont la racine n'est pas visible (supprimée, masquée, retirée,
    // bloquée, indisponible : décision de Louis du 5/11), ni sous un commentaire qui ne l'est pas,
    // ni sans champ où écrire (compte suspendu, projet retiré).
    const canReply =
      !readOnly &&
      root.state === 'visible' &&
      root.author !== null &&
      comment.state === 'visible' &&
      author !== null
    const hidden = comment.state === 'hidden' && author !== null
    return (
      <CommentCard
        key={comment.id}
        handle={(handle) => {
          if (handle) cards.current.set(comment.id, handle)
          else cards.current.delete(comment.id)
        }}
        comment={comment}
        kind={kind}
        isMine={comment.isMine}
        isProjectAuthor={author?.id === project.author.id}
        highlighted={draft.highlightedId === comment.id}
        // Un emplacement masqué que personne n'a masqué : le projet est retiré (le retrait l'emporte,
        // il est aussi public) ou privé.
        {...(project.removal !== null
          ? { keptBecause: 'removed' as const }
          : project.visibility === 'private'
            ? { keptBecause: 'private' as const }
            : null)}
        menu={menuOf(comment)}
        {...(canReply ? { onReply: () => onReply(root, comment) } : null)}
        // Les deux qui lisent encore un commentaire masqué : l'auteur du projet, qui l'a masqué, et
        // celui qui l'a écrit. Les autres n'en reçoivent qu'un emplacement, sans auteur.
        hiddenNote={hidden ? (project.isMine ? 'byYou' : 'byProjectAuthor') : null}
        {...(hidden && project.isMine
          ? { onUnhide: () => void setHidden(comment, false, true) }
          : null)}
        unhiding={hiding.has(comment.id)}
        // Retiré par la modération : son auteur, seul à le lire encore, voit pourquoi et comment contester.
        {...(comment.state === 'removed' && author && comment.removal
          ? { removed: removalBanner(comment.removal, t) }
          : null)}
        avatar={author ? toSource(author.avatarUrl) : null}
        onAuthorPress={() => {
          if (author) {
            leave(() => router.push({ pathname: '/members/[id]', params: { id: author.id } }))
          }
        }}
        onMemberPress={(memberId) =>
          leave(() => router.push({ pathname: '/members/[id]', params: { id: memberId } }))
        }
        {...(hideFailed === comment.id
          ? {
              error: failure(
                hide.reason,
                t(($) => $.project.comments.hideError),
                t(($) => $.errors.rateLimited),
              ),
              ...(hide.reason === 'expired' ? { errorAction: signInAgain() } : null),
            }
          : null)}
      />
    )
  }

  return (
    <>
      {/* Toujours montée, vide plutôt qu'absente : un lecteur d'écran n'annonce que ce qui change
          dans une région qu'il connaît déjà. Lue, jamais montrée : le geste se voit déjà. */}
      {announcement === null ? null : <LiveStatus message={announcement} visible={false} />}
      {trouble ?? (
        <CommentList
          state={
            comments.isFetchingNextPage
              ? 'loading'
              : comments.isFetchNextPageError
                ? 'error'
                : comments.hasNextPage
                  ? 'more'
                  : 'end'
          }
          onMore={() => {
            // Une seule demande à la fois, même après un double clic.
            if (!comments.isFetchingNextPage) void comments.fetchNextPage()
          }}
          moreLabel={t(($) => $.project.comments.more)}
          errorLabel={t(($) => $.project.comments.moreError)}
          retryLabel={t(($) => $.common.retry)}
          empty={emptyLabel}
        >
          {threads.map((root) => (
            <CommentThread
              key={root.id}
              // La liste pose déjà l'élément de liste autour de chaque fil (ui-M1).
              listItem={false}
              root={card(root, root, 'root')}
              replies={root.replies.map((reply) => card(reply, root, 'reply'))}
            />
          ))}
        </CommentList>
      )}
      {/* Supprimer est définitif : une fenêtre demande confirmation. guardTaps : elle s'ouvre sous le
          doigt qui vient de toucher « Supprimer » ; une seconde tape trop rapide n'y décide rien. */}
      <Dialog
        visible={deleting !== null}
        guardTaps
        title={t(($) => $.project.comments.deleteTitle)}
        // Une racine qui a des réponses ne disparaît pas tout à fait : la fenêtre le dit.
        message={
          deleting?.hasReplies
            ? t(($) => $.project.comments.deleteBodyReplies)
            : t(($) => $.project.comments.deleteBody)
        }
        // Pendant la suppression, la fenêtre reste ouverte : la fermer perdrait le focus prévu après.
        onDismiss={() => {
          if (!removing) setDeleting(null)
        }}
        onClosed={focusNeighbor}
      >
        {showDeleteError && remove.error ? (
          <Notice
            message={failure(
              remove.reason,
              t(($) => $.project.comments.deleteError),
              t(($) => $.errors.rateLimited),
            )}
            action={remove.reason === 'expired' ? signInAgain(() => setDeleting(null)) : undefined}
          />
        ) : null}
        <Button
          label={t(($) => $.project.comments.confirmDelete)}
          variant="confirm"
          onPress={() => void confirmDelete()}
          loading={removing}
        />
        <Button
          label={t(($) => $.common.cancel)}
          variant="secondary"
          onPress={() => setDeleting(null)}
          disabled={removing}
        />
      </Dialog>
    </>
  )
}
