// Les commentaires de la page d'un projet (tranche 5) : le titre « Commentaires (12) », le champ
// pour en écrire un, puis les fils, du plus récent au plus ancien, chacun avec ses réponses.
// Un membre répond à un fil (« Répondre », une fois au bout du fil : le champ s'ouvre là), modifie
// ou supprime ses commentaires (après confirmation) ; l'auteur du projet masque ou démasque ceux
// des autres.
//
// Un composant à part, comme le journal : ses états (le texte en cours, la réponse ouverte, le
// commentaire à supprimer) ne redessinent pas toute la page à chaque lettre tapée.
// Le focus du clavier ne se perd jamais : un champ qui se referme le rend au bouton qui l'avait
// ouvert (« Répondre », « Modifier ») ; après une suppression, il va sur l'action voisine.
// Dans chaque champ (commentaire, réponse, modification), « @in » propose des membres à mentionner
// (tranche 6b) ; une fois publié, « @ines_morel » est un lien vers la page d'Inès.
import {
  COMMENT_MAX,
  type Comment,
  type CommentReply,
  type CommentState,
  CommentText,
  type Project,
} from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import {
  type CommentFailure,
  useComments,
  useDeleteComment,
  useEditComment,
  useHideComment,
  usePostComment,
} from '../comments/api'
import { useMentionable } from '../mentions/api'
import { useSignInAgain } from '../navigation/signInAgain'
import { shortDate } from '../projects/format'
import { removalBanner } from '../reports/removal'
import { Button } from '../ui/Button'
import { excerpt } from '../ui/CommentAction'
import { type CommentAction, CommentCard, type CommentCardHandle } from '../ui/CommentCard'
import { CommentList } from '../ui/CommentList'
import { CommentThread, type CommentThreadHandle } from '../ui/CommentThread'
import { Dialog } from '../ui/Dialog'
import { NoteComposer } from '../ui/NoteComposer'
import { Notice } from '../ui/Notice'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { useNameOf } from '../useNameOf'

// Les actions possibles sur un commentaire, dans leur ordre d'affichage. (« Répondre » appartient
// au fil, pas au commentaire.) « Signaler » (tranche 7a) ouvre la page du même nom.
type ActionId = 'edit' | 'delete' | 'hide' | 'report'

// Où dire « Ton commentaire a été supprimé. » : à la place du commentaire disparu.
// - une réponse : à sa place dans son fil ;
// - une racine qui avait des réponses : juste sous « Commentaire supprimé » ;
// - un fil entier (racine sans réponse) : à sa place dans la liste.
type DeletedAt =
  | { threadId: string; replyIndex: number | null }
  | { threadIndex: number; threadId?: undefined }

// La confirmation affichée après un geste, jusqu'au geste suivant. Celles qui concernent un fil
// s'affichent au bout de ce fil, là où le membre regarde.
type Done =
  | { kind: 'published' }
  | { kind: 'deleted'; at: DeletedAt }
  | { kind: 'replied' | 'saved' | 'hidden' | 'shown'; threadId: string }

// Ce que le focus peut viser après une suppression : une action d'une carte, ou « Répondre ».
type FocusTarget = { card: string } | { thread: string }

// Le champ où se tape une mention : le nouveau commentaire, la réponse, ou la modification.
type MentionFrom = 'root' | 'reply' | 'edit'

// Le texte de l'emplacement d'un commentaire sans auteur, selon son état. Un commentaire « visible »
// a toujours son auteur : sa ligne ne sert pas, elle garde l'ancien texte par défaut.
const placeholderKey = {
  visible: 'hiddenPlaceholder',
  hidden: 'hiddenPlaceholder',
  deleted: 'deletedPlaceholder',
  removed: 'removedPlaceholder',
  blocked: 'blockedPlaceholder',
  unavailable: 'unavailablePlaceholder',
} as const satisfies Record<CommentState, string>

export function Comments({ project }: { project: Project }) {
  const { t, i18n } = useTranslation()
  const nameOf = useNameOf()
  const router = useRouter()
  const toSource = useMediaSources()
  const comments = useComments(project.id)
  const post = usePostComment(project.id)
  const edit = useEditComment(project.id)
  const remove = useDeleteComment(project.id)
  const hide = useHideComment(project.id)
  // « Me reconnecter », à côté de « Ta session a expiré » (tranche 6c).
  const signInAgain = useSignInAgain()
  const isPrivate = project.visibility === 'private'

  // Un nouveau commentaire : le champ ouvert ou non, son texte, et le problème du texte s'il y en a un.
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | undefined>()
  // Une réponse : le fil où elle ira (l'identifiant de sa racine).
  const [replying, setReplying] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [replyError, setReplyError] = useState<string | undefined>()
  // Les textes à jour, lus à la fin d'un envoi (la fonction en cours ne voit que les anciens).
  const latestDraft = useRef('')
  const latestReply = useRef('')
  // Le champ qui a envoyé la dernière publication : son erreur s'affiche là, pas dans l'autre.
  // Les erreurs de React Query restent jusqu'au prochain envoi : on ne les montre qu'après un envoi.
  const [postFrom, setPostFrom] = useState<'root' | 'reply' | null>(null)
  // Deux appuis dans le même instant arrivent avant que le bouton ne passe en « en cours » : ce
  // drapeau, posé au premier, fait ignorer le second (un seul commentaire publié).
  const sending = useRef(false)
  // La modification en cours : le commentaire, son texte.
  const [editing, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editError, setEditError] = useState<string | undefined>()
  const [showEditError, setShowEditError] = useState(false)
  const saving = useRef(false)
  // Le commentaire dont on demande confirmation de la suppression, et s'il a des réponses (la
  // fenêtre ne dit pas la même chose).
  const [deleting, setDeleting] = useState<{ id: string; hasReplies: boolean } | null>(null)
  const [removing, setRemoving] = useState(false)
  const [showDeleteError, setShowDeleteError] = useState(false)
  // Masquer : le commentaire dont le dernier changement a échoué, et ceux en cours d'envoi (leur
  // bouton attend, « occupé »).
  const [hideFailed, setHideFailed] = useState<string | null>(null)
  const [hiding, setHiding] = useState<ReadonlySet<string>>(new Set())
  const hidingNow = useRef(new Set<string>())
  const [done, setDone] = useState<Done | null>(null)
  // La mention en cours de frappe (« @in ») et le champ où elle se tape : un seul à la fois, même
  // si plusieurs champs sont ouverts. Les suggestions ne vont qu'à ce champ.
  const [mentioning, setMentioning] = useState<{ from: MentionFrom; query: string } | null>(null)
  const mentionable = useMentionable(project.id, mentioning?.query ?? null)

  // Le focus du clavier. Chaque carte donne une poignée pour poser le focus sur une de ses actions,
  // chaque fil une poignée pour le poser sur « Répondre ».
  const cards = useRef(new Map<string, CommentCardHandle>())
  const threadHandles = useRef(new Map<string, CommentThreadHandle>())
  // L'action à focaliser au prochain dessin (son bouton vient de revenir, champ refermé).
  const pendingFocus = useRef<{ id: string; action: ActionId } | null>(null)
  // Après une suppression : les actions voisines, à essayer dans l'ordre, une fois la fenêtre fermée.
  const focusAfterClose = useRef<FocusTarget[] | null>(null)

  const threads: Comment[] = comments.data?.pages.flatMap((page) => page.items) ?? []

  /** Les actions permises sur ce commentaire, dans l'ordre d'affichage. */
  const actionIds = (comment: CommentReply): ActionId[] => {
    // Son propre commentaire retiré par la modération : on ne le modifie plus (l'API refuserait,
    // 409 `removed`), on peut encore le supprimer.
    if (comment.isMine) return comment.state === 'removed' ? ['delete'] : ['edit', 'delete']
    // Un emplacement (supprimé, masqué, retiré, ou caché par un blocage, pour qui regarde) n'a
    // aucune action : rien à y lire, donc rien à signaler, et on n'interagit plus avec un membre
    // bloqué.
    if (
      !comment.author ||
      comment.state === 'deleted' ||
      comment.state === 'removed' ||
      comment.state === 'blocked' ||
      comment.state === 'unavailable'
    ) {
      return []
    }
    // L'auteur du projet masque le commentaire d'un autre ; tout le monde peut le signaler,
    // jamais le sien.
    return project.isMine ? ['hide', 'report'] : ['report']
  }

  /**
   * On répond à un fil dont la racine est visible : pas sous un emplacement (supprimé, ou masqué
   * pour qui regarde), ni sous une racine masquée (la réponse s'afficherait sous « Commentaire
   * masqué » pour les autres).
   */
  const canReply = (root: Comment) => root.state === 'visible' && root.author !== null

  // Après chaque dessin : si un champ de modification vient de se refermer, le focus revient sur
  // « Modifier », revenu à sa place (sur le web ; ailleurs, rien à faire).
  useEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    pendingFocus.current = null
    const comment = threads
      .flatMap((root) => [root, ...root.replies])
      .find((c) => c.id === target.id)
    const index = comment ? actionIds(comment).indexOf(target.action) : -1
    if (index >= 0) cards.current.get(target.id)?.focusAction(index)
  })

  // Le message d'un envoi refusé. 429 et 401 : « Réessaie » ne servirait à rien, on dit pourquoi.
  // Une mention d'un membre qu'on a bloqué (422, tranche 7b) : on le dit, sans nommer qui (l'API ne
  // le dit pas) ; le texte reste dans le champ, à corriger.
  const failure = (
    reason: CommentFailure | undefined,
    otherwise: string,
    limited = t(($) => $.project.comments.limited),
  ) =>
    reason === 'limited'
      ? limited
      : reason === 'expired'
        ? t(($) => $.states.expired)
        : reason === 'blockedMention'
          ? t(($) => $.errors.blockedMention)
          : otherwise
  // Le lien « Me reconnecter » qui accompagne « Ta session a expiré » ; `before` referme ce qui
  // doit l'être avant de partir (la fenêtre de confirmation).
  const failureAction = (reason: CommentFailure | undefined, before?: () => void) =>
    reason === 'expired' ? signInAgain(before) : undefined

  // La même règle que l'API (packages/contracts) : un texte non vide, sans caractères invisibles.
  const check = (text: string, required: string) => {
    const checked = CommentText.safeParse(text)
    if (checked.success) return { body: checked.data, error: undefined }
    return {
      body: null,
      error: text.trim() === '' ? required : t(($) => $.project.errors.invalidCharacters),
    }
  }

  // --- Les mentions ------------------------------------------------------------------------------

  /** Ce qu'il faut au champ `from` pour proposer des membres après « @ ». */
  const mentionsFor = (from: MentionFrom) => ({
    suggestions:
      mentioning?.from === from
        ? mentionable.map((member) => ({
            id: member.id,
            name: member.name,
            handle: member.handle,
            avatar: toSource(member.avatarUrl),
          }))
        : [],
    label: t(($) => $.mentions.suggestions),
    onQueryChange: (query: string | null) =>
      setMentioning((current) =>
        query !== null
          ? { from, query }
          : // Ce champ ne cherche plus : on n'efface que sa propre recherche.
            current?.from === from
            ? null
            : current,
      ),
  })

  /** Une mention touchée : la page du membre gardé avec elle (son identifiant). */
  const openMember = (memberId: string) =>
    router.push({ pathname: '/members/[id]', params: { id: memberId } })

  // --- Un nouveau commentaire -------------------------------------------------------------------

  const changeDraft = (text: string) => {
    latestDraft.current = text
    setDraft(text)
    // Le texte a changé : l'ancien reproche (« Écris ton commentaire… ») ne vaut plus.
    setDraftError(undefined)
  }

  const submit = async () => {
    if (sending.current) return
    const { body, error } = check(
      draft,
      t(($) => $.project.comments.required),
    )
    if (body === null) {
      setDraftError(error)
      return
    }
    sending.current = true
    setPostFrom('root')
    const sent = draft
    const ok = await post.post({ body })
    sending.current = false
    // Refusé : le texte reste dans le champ, et l'erreur s'affiche (post.error).
    if (!ok) return
    // Publié. Si le texte a changé entre-temps, c'est un autre commentaire qui commence : on le garde.
    if (latestDraft.current !== sent) return
    changeDraft('')
    setComposing(false)
    setDone({ kind: 'published' })
  }

  // --- Répondre ---------------------------------------------------------------------------------

  const changeReply = (text: string) => {
    latestReply.current = text
    setReplyDraft(text)
    setReplyError(undefined)
  }

  // Le texte déjà tapé suit le champ s'il change de fil : rien de ce qui est écrit ne se perd.
  const openReply = (rootId: string) => {
    setReplying(rootId)
    setReplyError(undefined)
    if (postFrom === 'reply') setPostFrom(null)
    setDone(null)
  }

  // Le champ se referme : le fil rend lui-même le focus à « Répondre » (CommentThread).
  const closeReply = () => {
    setReplying(null)
    setReplyError(undefined)
    if (postFrom === 'reply') setPostFrom(null)
  }

  const submitReply = async () => {
    if (!replying || sending.current) return
    const { body, error } = check(
      replyDraft,
      t(($) => $.project.comments.replyRequired),
    )
    if (body === null) {
      setReplyError(error)
      return
    }
    sending.current = true
    setPostFrom('reply')
    const rootId = replying
    const sent = replyDraft
    // Les réponses tiennent sur un seul niveau : on répond toujours à la racine du fil.
    const ok = await post.post({ body, replyTo: rootId })
    sending.current = false
    if (!ok || latestReply.current !== sent) return
    changeReply('')
    setReplying(null)
    setPostFrom(null)
    setDone({ kind: 'replied', threadId: rootId })
  }

  // --- Modifier ---------------------------------------------------------------------------------

  const openEdit = (comment: CommentReply) => {
    setEditing(comment.id)
    setEditDraft(comment.body)
    setEditError(undefined)
    setShowEditError(false)
    setDone(null)
  }

  const closeEdit = () => {
    if (editing) pendingFocus.current = { id: editing, action: 'edit' }
    setEditing(null)
    setEditError(undefined)
    setShowEditError(false)
  }

  const submitEdit = async (threadId: string) => {
    if (!editing || saving.current) return
    const { body, error } = check(
      editDraft,
      t(($) => $.project.comments.required),
    )
    if (body === null) {
      setEditError(error)
      return
    }
    saving.current = true
    setShowEditError(true)
    const id = editing
    const ok = await edit.edit({ id, body })
    saving.current = false
    // Refusé : le texte reste dans le champ, avec le message.
    if (!ok) return
    pendingFocus.current = { id, action: 'edit' }
    setEditing(null)
    setShowEditError(false)
    setDone({ kind: 'saved', threadId })
  }

  // --- Supprimer --------------------------------------------------------------------------------

  /** Tout ce qui peut recevoir le focus, dans l'ordre de la page : actions des cartes, « Répondre ». */
  const focusTargets = (): { key: string; target: FocusTarget }[] =>
    threads.flatMap((root) => [
      ...[root, ...root.replies]
        .filter((c) => actionIds(c).length > 0)
        .map((c) => ({ key: c.id, target: { card: c.id } })),
      ...(canReply(root) ? [{ key: `reply:${root.id}`, target: { thread: root.id } }] : []),
    ])

  /** Les actions voisines de ce commentaire : d'abord les suivantes, puis les précédentes. */
  const neighborsOf = (id: string): FocusTarget[] => {
    const order = focusTargets()
    const at = order.findIndex((item) => item.key === id)
    if (at < 0) return order.map((item) => item.target)
    return [...order.slice(at + 1), ...order.slice(0, at).reverse()].map((item) => item.target)
  }

  /** Où le commentaire supprimé laissera sa confirmation (voir DeletedAt). */
  const deletedAt = (id: string): DeletedAt => {
    const threadIndex = threads.findIndex((root) => root.id === id)
    const root = threads[threadIndex]
    if (root) return root.replies.length > 0 ? { threadId: id, replyIndex: null } : { threadIndex }
    const thread = threads.find((r) => r.replies.some((reply) => reply.id === id))
    return {
      threadId: thread?.id ?? '',
      replyIndex: thread ? thread.replies.findIndex((reply) => reply.id === id) : 0,
    }
  }

  const confirmDelete = async () => {
    if (!deleting || removing) return
    setRemoving(true)
    setShowDeleteError(true)
    // Calculé avant : une fois supprimé, le commentaire n'est plus dans la liste.
    const at = deletedAt(deleting.id)
    const neighbors = neighborsOf(deleting.id)
    const ok = await remove.remove(deleting.id)
    setRemoving(false)
    // Refusée : la fenêtre reste ouverte, avec le message ; « Supprimer » permet de réessayer.
    if (!ok) return
    // Supprimé : ses boutons n'existent plus ; le focus ira sur un voisin, une fois la fenêtre
    // refermée. « Ton commentaire a été supprimé. » le confirme, à sa place.
    focusAfterClose.current = neighbors
    setDone({ kind: 'deleted', at })
    setDeleting(null)
  }

  // --- Masquer ----------------------------------------------------------------------------------

  const setHidden = async (comment: CommentReply, hidden: boolean, threadId: string) => {
    // Un seul envoi à la fois par commentaire, même après un double clic (le drapeau est lu tout
    // de suite ; l'état, lui, fait attendre le bouton au prochain dessin).
    if (hidingNow.current.has(comment.id)) return
    hidingNow.current.add(comment.id)
    setHiding(new Set(hidingNow.current))
    setHideFailed(null)
    setDone(null)
    const ok = await hide.setHidden({ id: comment.id, hidden })
    hidingNow.current.delete(comment.id)
    setHiding(new Set(hidingNow.current))
    if (!ok) {
      setHideFailed(comment.id)
      return
    }
    setDone({ kind: hidden ? 'hidden' : 'shown', threadId })
  }

  // --- Les cartes -------------------------------------------------------------------------------

  const actionsOf = (comment: CommentReply, rootId: string): CommentAction[] =>
    actionIds(comment).map((id) => ({ id, ...actionOf(id, comment, rootId) }))

  const actionOf = (id: ActionId, comment: CommentReply, rootId: string): CommentAction => {
    switch (id) {
      case 'edit':
        return {
          label: t(($) => $.project.comments.edit),
          text: t(($) => $.project.comments.editShort),
          icon: 'pencil-simple',
          onPress: () => openEdit(comment),
        }
      case 'delete':
        return {
          label: t(($) => $.project.comments.delete),
          text: t(($) => $.project.comments.deleteShort),
          icon: 'trash',
          tone: 'danger',
          onPress: () => {
            setShowDeleteError(false)
            setDone(null)
            setDeleting({ id: comment.id, hasReplies: hasReplies(comment) })
          },
        }
      case 'report':
        // Une réponse est un commentaire comme un autre : la même sorte de cible.
        return {
          label: t(($) => $.report.action),
          icon: 'flag',
          onPress: () =>
            router.push({ pathname: '/report', params: { kind: 'comment', id: comment.id } }),
        }
      default: {
        // 'hide' : masquer, ou démasquer un commentaire déjà masqué.
        const hidden = comment.state === 'hidden'
        return {
          label: hidden ? t(($) => $.project.comments.unhide) : t(($) => $.project.comments.hide),
          text: hidden
            ? t(($) => $.project.comments.unhideShort)
            : t(($) => $.project.comments.hideShort),
          icon: hidden ? 'eye' : 'eye-slash',
          pending: hiding.has(comment.id),
          onPress: () => void setHidden(comment, !hidden, rootId),
        }
      }
    }
  }

  /** Ce que les lecteurs d'écran entendent après le nom d'une action : l'auteur, le début du texte. */
  const describe = (comment: CommentReply) =>
    comment.author
      ? t(($) => $.project.comments.about, {
          name: comment.author.name,
          text: excerpt(comment.body),
        })
      : undefined

  // L'aide du champ de modification : qui lira la nouvelle version.
  const editHint = (comment: CommentReply) =>
    isPrivate
      ? t(($) => $.project.comments.hintPrivate)
      : comment.state === 'hidden'
        ? t(($) => $.project.comments.editHintHidden)
        : t(($) => $.project.comments.editHint)

  // « Ton commentaire a été supprimé. » : lu sans interrompre (role « status »).
  const deletedNotice = (
    <Notice key="deleted" tone="success" message={t(($) => $.project.comments.deleted)} polite />
  )
  const deleted = done?.kind === 'deleted' ? done.at : null

  const card = (comment: CommentReply, rootId: string, reply: boolean) => {
    const { author } = comment
    return (
      <CommentCard
        key={comment.id}
        handle={(handle) => {
          if (handle) cards.current.set(comment.id, handle)
          else cards.current.delete(comment.id)
        }}
        author={author ? { name: author.name, avatar: toSource(author.avatarUrl) } : null}
        {...(author
          ? {
              authorLabel: t(($) => $.member.open, {
                nameOf: nameOf(author.name),
              }),
              onAuthorPress: () =>
                router.push({ pathname: '/members/[id]', params: { id: author.id } }),
            }
          : null)}
        when={shortDate(comment.createdAt, i18n.language)}
        body={comment.body}
        mentions={comment.mentions}
        onMemberPress={openMember}
        edited={comment.editedAt ? t(($) => $.project.comments.edited) : undefined}
        // Le bandeau, pour les deux auteurs qui lisent encore un commentaire masqué : l'auteur du
        // projet l'a masqué lui-même ; l'auteur du commentaire apprend que les autres ne le voient
        // plus. Les autres ne voient qu'un emplacement, sans auteur.
        hidden={
          comment.state === 'hidden' && author
            ? project.isMine
              ? t(($) => $.project.comments.hiddenByMe)
              : t(($) => $.project.comments.hiddenBanner)
            : undefined
        }
        // Retiré par la modération (tranche 7a) : son auteur, seul à le lire encore, voit pourquoi
        // et comment contester ; les autres, l'auteur du projet compris, un simple emplacement.
        removed={
          comment.state === 'removed' && author && comment.removal
            ? removalBanner(comment.removal, t)
            : undefined
        }
        // L'emplacement d'un commentaire qu'on ne lit pas. Un blocage (tranche 7b) a ses deux
        // textes : « Commentaire d'un membre que tu as bloqué » pour qui a bloqué, « Commentaire
        // indisponible » pour qui l'est (rien ne lui dit qu'il est bloqué). « Commentaire masqué »
        // reste au geste de l'auteur du projet.
        placeholder={t(($) => $.project.comments[placeholderKey[comment.state]])}
        actions={actionsOf(comment, rootId)}
        description={describe(comment)}
        error={
          hideFailed === comment.id
            ? failure(
                hide.reason,
                t(($) => $.project.comments.hideError),
                t(($) => $.errors.rateLimited),
              )
            : undefined
        }
        errorAction={hideFailed === comment.id ? failureAction(hide.reason) : undefined}
        editor={
          editing === comment.id ? (
            <NoteComposer
              open
              onOpen={() => {}}
              onCancel={closeEdit}
              value={editDraft}
              onChangeText={(text) => {
                setEditDraft(text)
                setEditError(undefined)
              }}
              onSubmit={() => void submitEdit(rootId)}
              pending={edit.pending}
              max={COMMENT_MAX}
              reveal
              mentions={mentionsFor('edit')}
              labels={{
                open: t(($) => $.project.comments.edit),
                field: t(($) => $.project.comments.field),
                hint: editHint(comment),
                submit: t(($) => $.project.comments.editSubmit),
                cancel: t(($) => $.common.cancel),
              }}
              fieldError={editError}
              error={
                showEditError && edit.error
                  ? failure(
                      edit.reason,
                      t(($) => $.project.comments.editError),
                    )
                  : undefined
              }
              errorAction={showEditError && edit.error ? failureAction(edit.reason) : undefined}
            />
          ) : undefined
        }
        reply={reply}
      />
    )
  }

  /** Le champ de la réponse en cours, s'il est ouvert dans ce fil. */
  const composerOf = (root: Comment) =>
    replying === root.id ? (
      <NoteComposer
        open
        onOpen={() => {}}
        onCancel={closeReply}
        value={replyDraft}
        onChangeText={changeReply}
        onSubmit={() => void submitReply()}
        pending={post.pending && postFrom === 'reply'}
        max={COMMENT_MAX}
        reveal
        mentions={mentionsFor('reply')}
        labels={{
          open: t(($) => $.project.comments.reply),
          field: t(($) => $.project.comments.replyField),
          hint: isPrivate
            ? t(($) => $.project.comments.replyHintPrivate)
            : t(($) => $.project.comments.replyHint),
          submit: t(($) => $.project.comments.replySubmit),
          cancel: t(($) => $.common.cancel),
        }}
        fieldError={replyError}
        error={
          postFrom === 'reply' && post.error
            ? // 404 : le fil n'accepte plus de réponse (racine supprimée ou masquée entre-temps).
              post.reason === 'gone'
              ? t(($) => $.project.comments.replyGone)
              : failure(
                  post.reason,
                  t(($) => $.project.comments.replyError),
                )
            : undefined
        }
        errorAction={postFrom === 'reply' && post.error ? failureAction(post.reason) : undefined}
      />
    ) : null

  /** La confirmation qui vient au bout d'un fil, s'il y en a une. */
  const footerOf = (root: Comment) => {
    if (!done || !('threadId' in done) || done.threadId !== root.id) return null
    const message = {
      replied: t(($) => $.project.comments.replyPublished),
      saved: t(($) => $.project.comments.saved),
      hidden: t(($) => $.project.comments.hiddenDone),
      shown: t(($) => $.project.comments.shownDone),
    }[done.kind]
    // polite : une confirmation se lit sans interrompre (role « status »).
    return <Notice tone="success" message={message} polite />
  }

  const thread = (root: Comment) => {
    const replies: ReactNode[] = root.replies.map((reply) => card(reply, root.id, true))
    // Une réponse supprimée : la confirmation prend sa place dans le fil.
    if (deleted?.threadId === root.id && deleted.replyIndex !== null) {
      replies.splice(deleted.replyIndex, 0, deletedNotice)
    }
    return (
      <CommentThread
        key={root.id}
        handle={(handle) => {
          if (handle) threadHandles.current.set(root.id, handle)
          else threadHandles.current.delete(root.id)
        }}
        root={
          deleted?.threadId === root.id && deleted.replyIndex === null ? (
            // La racine vient d'être supprimée ; ses réponses restent, sous l'emplacement.
            <>
              {card(root, root.id, false)}
              {deletedNotice}
            </>
          ) : (
            card(root, root.id, false)
          )
        }
        replies={replies}
        replyAction={
          canReply(root)
            ? {
                id: 'reply',
                label: t(($) => $.project.comments.reply),
                icon: 'arrow-bend-up-left',
                onPress: () => openReply(root.id),
                // À quel commentaire on répond, pour les lecteurs d'écran (« Max : Super idée… »).
                description: describe(root) ?? excerpt(root.body),
              }
            : undefined
        }
        composer={composerOf(root)}
        footer={footerOf(root)}
      />
    )
  }

  // --- La section -------------------------------------------------------------------------------

  const threadNodes: ReactNode[] = threads.map(thread)
  // Un fil entier supprimé : la confirmation prend sa place dans la liste (s'il en reste d'autres).
  if (deleted && deleted.threadId === undefined && threads.length > 0) {
    threadNodes.splice(deleted.threadIndex, 0, deletedNotice)
  }
  const expired = errorKey(comments.error) === 'unauthorized'

  const list = comments.isPending ? (
    <Text tone="muted">{t(($) => $.project.comments.loading)}</Text>
  ) : comments.isError && threads.length === 0 ? (
    // La première page n'a pas pu se charger : on le dit, et on propose de réessayer. Le reste
    // de la page (le projet, son journal) reste là. 401 : réessayer ne servirait à rien, il faut
    // se reconnecter ; pas de bouton.
    <>
      <Notice
        message={expired ? t(($) => $.states.expired) : t(($) => $.project.comments.loadError)}
        action={expired ? signInAgain() : undefined}
      />
      {expired ? null : (
        <Button
          label={t(($) => $.common.retry)}
          variant="secondary"
          size="compact"
          onPress={() => void comments.refetch()}
        />
      )}
    </>
  ) : (
    <>
      {/* Le dernier commentaire vient d'être supprimé : la confirmation, puis la liste vide. */}
      {deleted && threads.length === 0 ? deletedNotice : null}
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
        endLabel={t(($) => $.project.comments.end)}
        errorLabel={t(($) => $.project.comments.moreError)}
        retryLabel={t(($) => $.common.retry)}
        empty={t(($) => $.project.comments.empty)}
      >
        {threadNodes}
      </CommentList>
    </>
  )
  const empty = !comments.isPending && threads.length === 0

  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <Text variant="heading" heading={2}>
        {/* Sans commentaire, le titre seul : « (0) » n'apprend rien que la liste vide ne dise. */}
        {project.commentCount > 0
          ? t(($) => $.project.comments.title, { count: project.commentCount })
          : t(($) => $.project.comments.titleNone)}
      </Text>
      {/* Pas encore de commentaire : l'invitation d'abord, puis le bouton qui y répond. */}
      {empty ? list : null}
      <NoteComposer
        open={composing}
        onOpen={() => {
          setDone(null)
          if (postFrom === 'root') setPostFrom(null)
          setComposing(true)
        }}
        onCancel={() => {
          setComposing(false)
          setDraftError(undefined)
          if (postFrom === 'root') setPostFrom(null)
        }}
        value={draft}
        onChangeText={changeDraft}
        onSubmit={() => void submit()}
        pending={post.pending && postFrom === 'root'}
        max={COMMENT_MAX}
        mentions={mentionsFor('root')}
        labels={{
          open: t(($) => $.project.comments.add),
          // Sur téléphone, « Commenter » : le nom lu reste « Écrire un commentaire ».
          openShort: t(($) => $.project.comments.addShort),
          field: t(($) => $.project.comments.field),
          // L'aide dit qui lira : tous les membres, ou personne d'autre sur un projet privé.
          hint: isPrivate
            ? t(($) => $.project.comments.hintPrivate)
            : t(($) => $.project.comments.hint),
          submit: t(($) => $.project.comments.submit),
          cancel: t(($) => $.common.cancel),
        }}
        fieldError={draftError}
        error={
          postFrom === 'root' && post.error
            ? failure(
                post.reason,
                t(($) => $.project.comments.error),
              )
            : undefined
        }
        errorAction={postFrom === 'root' && post.error ? failureAction(post.reason) : undefined}
        success={done?.kind === 'published' ? t(($) => $.project.comments.published) : undefined}
      />
      {empty ? null : list}
      {/* Supprimer un commentaire est définitif : une fenêtre demande confirmation. */}
      <Dialog
        visible={deleting !== null}
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
        onClosed={() => {
          const candidates = focusAfterClose.current
          focusAfterClose.current = null
          // Le temps que la fenêtre quitte la page : avant, elle garderait le focus pour elle.
          if (candidates) {
            requestAnimationFrame(() => {
              for (const target of candidates) {
                const focused =
                  'card' in target
                    ? cards.current.get(target.card)?.focusAction(0)
                    : threadHandles.current.get(target.thread)?.focusReply()
                if (focused) return
              }
            })
          }
        }}
      >
        {/* Refusée : le message reste dans la fenêtre, et « Supprimer » permet de réessayer. */}
        {showDeleteError && remove.error ? (
          <Notice
            message={failure(
              remove.reason,
              t(($) => $.project.comments.deleteError),
              t(($) => $.errors.rateLimited),
            )}
            action={failureAction(remove.reason, () => setDeleting(null))}
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
    </Surface>
  )
}

/** Ce commentaire est une racine qui a des réponses (une réponse n'a pas de champ `replies`). */
const hasReplies = (comment: CommentReply | Comment) =>
  'replies' in comment && comment.replies.length > 0
