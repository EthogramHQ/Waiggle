// Les commentaires de la page d'un projet (tranche 5) : le titre « Commentaires (12) », le champ
// pour en écrire un, puis les fils, du plus récent au plus ancien, chacun avec ses réponses.
// Un membre répond à un commentaire (le champ s'ouvre au bout du fil), modifie ou supprime les siens
// (après confirmation) ; l'auteur du projet masque ou démasque ceux des autres.
//
// Un composant à part, comme le journal : ses états (le texte en cours, la réponse ouverte, le
// commentaire à supprimer) ne redessinent pas toute la page à chaque lettre tapée.
// Le focus du clavier ne se perd jamais : un champ qui se referme le rend à l'action qui l'avait
// ouvert (« Répondre », « Modifier ») ; après une suppression, il va sur le commentaire voisin.
import {
  COMMENT_MAX,
  type Comment,
  type CommentReply,
  CommentText,
  type Project,
} from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaSources } from '../api/media'
import {
  type CommentFailure,
  useComments,
  useDeleteComment,
  useEditComment,
  useHideComment,
  usePostComment,
} from '../comments/api'
import { shortDate } from '../projects/format'
import { Button } from '../ui/Button'
import { type CommentAction, CommentCard, type CommentCardHandle } from '../ui/CommentCard'
import { CommentList } from '../ui/CommentList'
import { CommentThread } from '../ui/CommentThread'
import { Dialog } from '../ui/Dialog'
import { NoteComposer } from '../ui/NoteComposer'
import { Notice } from '../ui/Notice'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'

// Les actions possibles sur un commentaire, dans leur ordre d'affichage.
type ActionId = 'reply' | 'edit' | 'delete' | 'hide'

// La confirmation affichée après un geste, jusqu'au geste suivant. Celles qui concernent un fil
// s'affichent au bout de ce fil, là où le membre regarde.
type Done =
  | { kind: 'published' | 'deleted' }
  | { kind: 'replied' | 'saved' | 'hidden' | 'shown'; threadId: string }

export function Comments({ project }: { project: Project }) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const comments = useComments(project.id)
  const post = usePostComment(project.id)
  const edit = useEditComment(project.id)
  const remove = useDeleteComment(project.id)
  const hide = useHideComment(project.id)

  // Un nouveau commentaire : le champ ouvert ou non, son texte, et le problème du texte s'il y en a un.
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | undefined>()
  // Une réponse : le fil où elle ira (sa racine), et la carte dont on a touché « Répondre ».
  const [replying, setReplying] = useState<{ rootId: string; fromId: string } | null>(null)
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
  // Le commentaire dont on demande confirmation de la suppression.
  const [deleting, setDeleting] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [showDeleteError, setShowDeleteError] = useState(false)
  // Masquer : le commentaire dont le dernier changement a échoué, et ceux en cours d'envoi.
  const [hideFailed, setHideFailed] = useState<string | null>(null)
  const hiding = useRef(new Set<string>())
  const [done, setDone] = useState<Done | null>(null)

  // Le focus du clavier. Chaque carte donne une poignée pour poser le focus sur une de ses actions.
  const cards = useRef(new Map<string, CommentCardHandle>())
  // L'action à focaliser au prochain dessin (son bouton vient de revenir, champ refermé).
  const pendingFocus = useRef<{ id: string; action: ActionId } | null>(null)
  // Après une suppression : les cartes voisines, à essayer dans l'ordre, une fois la fenêtre fermée.
  const focusAfterClose = useRef<string[] | null>(null)

  const threads: Comment[] = comments.data?.pages.flatMap((page) => page.items) ?? []

  /** Les actions permises sur ce commentaire, dans l'ordre d'affichage. */
  const actionIds = (comment: CommentReply): ActionId[] => {
    const ids: ActionId[] = []
    // On répond à un commentaire visible ; pas à un emplacement, ni à un commentaire masqué (sa
    // réponse s'afficherait sous « Commentaire masqué » pour les autres).
    if (comment.state === 'visible') ids.push('reply')
    if (comment.isMine) ids.push('edit', 'delete')
    // L'auteur du projet masque le commentaire d'un autre ; le sien, il le supprime plutôt.
    else if (project.isMine && comment.state !== 'deleted') ids.push('hide')
    return ids
  }

  // Après chaque dessin : si un champ vient de se refermer, le focus revient sur l'action qui
  // l'avait ouvert, revenue à sa place (sur le web ; ailleurs, rien à faire).
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
  const failure = (
    reason: CommentFailure | undefined,
    otherwise: string,
    limited = t('project.comments.limited'),
  ) => (reason === 'limited' ? limited : reason === 'expired' ? t('states.expired') : otherwise)

  // La même règle que l'API (packages/contracts) : un texte non vide, sans caractères invisibles.
  const check = (text: string, required: string) => {
    const checked = CommentText.safeParse(text)
    if (checked.success) return { body: checked.data, error: undefined }
    return {
      body: null,
      error: text.trim() === '' ? required : t('project.errors.invalidCharacters'),
    }
  }

  // --- Un nouveau commentaire -------------------------------------------------------------------

  const changeDraft = (text: string) => {
    latestDraft.current = text
    setDraft(text)
    // Le texte a changé : l'ancien reproche (« Écris ton commentaire… ») ne vaut plus.
    setDraftError(undefined)
  }

  const submit = async () => {
    if (sending.current) return
    const { body, error } = check(draft, t('project.comments.required'))
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
  const openReply = (rootId: string, fromId: string) => {
    setReplying({ rootId, fromId })
    setReplyError(undefined)
    if (postFrom === 'reply') setPostFrom(null)
    setDone(null)
  }

  const closeReply = () => {
    if (replying) pendingFocus.current = { id: replying.fromId, action: 'reply' }
    setReplying(null)
    setReplyError(undefined)
    if (postFrom === 'reply') setPostFrom(null)
  }

  const submitReply = async () => {
    if (!replying || sending.current) return
    const { body, error } = check(replyDraft, t('project.comments.replyRequired'))
    if (body === null) {
      setReplyError(error)
      return
    }
    sending.current = true
    setPostFrom('reply')
    const target = replying
    const sent = replyDraft
    // Les réponses tiennent sur un seul niveau : on répond toujours à la racine du fil.
    const ok = await post.post({ body, replyTo: target.rootId })
    sending.current = false
    if (!ok || latestReply.current !== sent) return
    changeReply('')
    setReplying(null)
    setPostFrom(null)
    pendingFocus.current = { id: target.fromId, action: 'reply' }
    setDone({ kind: 'replied', threadId: target.rootId })
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
    const { body, error } = check(editDraft, t('project.comments.required'))
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

  /** Les cartes voisines de celle-ci qui ont des actions : d'abord les suivantes, puis les précédentes. */
  const neighborsOf = (id: string) => {
    const order = threads
      .flatMap((root) => [root, ...root.replies])
      .filter((c) => actionIds(c).length > 0)
      .map((c) => c.id)
    const at = order.indexOf(id)
    if (at < 0) return order
    return [...order.slice(at + 1), ...order.slice(0, at).reverse()]
  }

  const confirmDelete = async () => {
    if (!deleting || removing) return
    setRemoving(true)
    setShowDeleteError(true)
    const ok = await remove.remove(deleting)
    setRemoving(false)
    // Refusée : la fenêtre reste ouverte, avec le message ; « Supprimer » permet de réessayer.
    if (!ok) return
    // Supprimé : ses boutons n'existent plus ; le focus ira sur un voisin, une fois la fenêtre
    // refermée. « Commentaire supprimé. » le confirme.
    focusAfterClose.current = neighborsOf(deleting)
    setDone({ kind: 'deleted' })
    setDeleting(null)
  }

  // --- Masquer ----------------------------------------------------------------------------------

  const setHidden = async (comment: CommentReply, hidden: boolean, threadId: string) => {
    // Un seul envoi à la fois par commentaire, même après un double clic.
    if (hiding.current.has(comment.id)) return
    hiding.current.add(comment.id)
    setHideFailed(null)
    setDone(null)
    const ok = await hide.setHidden({ id: comment.id, hidden })
    hiding.current.delete(comment.id)
    if (!ok) {
      setHideFailed(comment.id)
      return
    }
    setDone({ kind: hidden ? 'hidden' : 'shown', threadId })
  }

  // --- Les cartes -------------------------------------------------------------------------------

  const actionsOf = (comment: CommentReply, rootId: string): CommentAction[] =>
    actionIds(comment).map((id) => {
      switch (id) {
        case 'reply':
          return {
            label: t('project.comments.reply'),
            icon: 'arrow-bend-up-left',
            onPress: () => openReply(rootId, comment.id),
          }
        case 'edit':
          return {
            label: t('project.comments.edit'),
            text: t('project.comments.editShort'),
            icon: 'pencil-simple',
            onPress: () => openEdit(comment),
          }
        case 'delete':
          return {
            label: t('project.comments.delete'),
            text: t('project.comments.deleteShort'),
            icon: 'trash',
            tone: 'danger',
            onPress: () => {
              setShowDeleteError(false)
              setDone(null)
              setDeleting(comment.id)
            },
          }
        default: {
          // 'hide' : masquer, ou démasquer un commentaire déjà masqué.
          const hidden = comment.state === 'hidden'
          return {
            label: hidden ? t('project.comments.unhide') : t('project.comments.hide'),
            text: hidden ? t('project.comments.unhideShort') : t('project.comments.hideShort'),
            icon: hidden ? 'eye' : 'eye-slash',
            onPress: () => void setHidden(comment, !hidden, rootId),
          }
        }
      }
    })

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
              authorLabel: t('member.open', { name: author.name }),
              onAuthorPress: () =>
                router.push({ pathname: '/members/[id]', params: { id: author.id } }),
            }
          : null)}
        when={shortDate(comment.createdAt, i18n.language)}
        body={comment.body}
        edited={comment.editedAt ? t('project.comments.edited') : undefined}
        // Le bandeau, pour les deux auteurs qui lisent encore un commentaire masqué ; les autres
        // ne voient qu'un emplacement, sans auteur.
        hidden={
          comment.state === 'hidden' && author ? t('project.comments.hiddenBanner') : undefined
        }
        placeholder={
          comment.state === 'deleted'
            ? t('project.comments.deletedPlaceholder')
            : t('project.comments.hiddenPlaceholder')
        }
        actions={actionsOf(comment, rootId)}
        error={
          hideFailed === comment.id
            ? failure(hide.reason, t('project.comments.hideError'), t('errors.rateLimited'))
            : undefined
        }
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
              labels={{
                open: t('project.comments.edit'),
                field: t('project.comments.field'),
                hint: t('project.comments.hint'),
                submit: t('project.comments.editSubmit'),
                cancel: t('common.cancel'),
              }}
              fieldError={editError}
              error={
                showEditError && edit.error
                  ? failure(edit.reason, t('project.comments.editError'))
                  : undefined
              }
            />
          ) : undefined
        }
        reply={reply}
      />
    )
  }

  /** Ce qui vient au bout d'un fil : le champ de la réponse en cours, puis une confirmation. */
  const footerOf = (root: Comment) => {
    const composer =
      replying?.rootId === root.id ? (
        <NoteComposer
          open
          onOpen={() => {}}
          onCancel={closeReply}
          value={replyDraft}
          onChangeText={changeReply}
          onSubmit={() => void submitReply()}
          pending={post.pending && postFrom === 'reply'}
          max={COMMENT_MAX}
          labels={{
            open: t('project.comments.reply'),
            field: t('project.comments.replyField'),
            hint: t('project.comments.replyHint'),
            submit: t('project.comments.replySubmit'),
            cancel: t('common.cancel'),
          }}
          fieldError={replyError}
          error={
            postFrom === 'reply' && post.error
              ? failure(post.reason, t('project.comments.replyError'))
              : undefined
          }
        />
      ) : null
    const message =
      done && 'threadId' in done && done.threadId === root.id
        ? {
            replied: t('project.comments.replyPublished'),
            saved: t('project.comments.saved'),
            hidden: t('project.comments.hiddenDone'),
            shown: t('project.comments.shownDone'),
          }[done.kind]
        : null
    if (!composer && !message) return null
    return (
      <>
        {composer}
        {/* polite : une confirmation se lit sans interrompre (role « status »). */}
        {message ? <Notice tone="success" message={message} polite /> : null}
      </>
    )
  }

  // --- La section -------------------------------------------------------------------------------

  const list = comments.isPending ? (
    <Text tone="muted">{t('project.comments.loading')}</Text>
  ) : comments.isError && threads.length === 0 ? (
    // La première page n'a pas pu se charger : on le dit, et on propose de réessayer. Le reste
    // de la page (le projet, son journal) reste là.
    <>
      <Notice message={t('project.comments.loadError')} />
      <Button
        label={t('common.retry')}
        variant="secondary"
        size="compact"
        onPress={() => void comments.refetch()}
      />
    </>
  ) : (
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
      moreLabel={t('project.comments.more')}
      endLabel={t('project.comments.end')}
      errorLabel={t('project.comments.moreError')}
      retryLabel={t('common.retry')}
      empty={t('project.comments.empty')}
    >
      {threads.map((root) => (
        <CommentThread
          key={root.id}
          root={card(root, root.id, false)}
          replies={root.replies.map((reply) => card(reply, root.id, true))}
          footer={footerOf(root)}
        />
      ))}
    </CommentList>
  )
  const empty = !comments.isPending && threads.length === 0

  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <Text variant="heading" accessibilityRole="header">
        {t('project.comments.title', { count: project.commentCount })}
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
        labels={{
          open: t('project.comments.add'),
          field: t('project.comments.field'),
          // Sur un projet privé, personne d'autre ne lira le commentaire : on le dit.
          hint:
            project.visibility === 'private'
              ? t('project.comments.hintPrivate')
              : t('project.comments.hint'),
          submit: t('project.comments.submit'),
          cancel: t('common.cancel'),
        }}
        fieldError={draftError}
        error={
          postFrom === 'root' && post.error
            ? failure(post.reason, t('project.comments.error'))
            : undefined
        }
        success={done?.kind === 'published' ? t('project.comments.published') : undefined}
      />
      {/* Après une suppression : la confirmation, lue sans interrompre (role « status »). */}
      {done?.kind === 'deleted' ? (
        <Notice tone="success" message={t('project.comments.deleted')} polite />
      ) : null}
      {empty ? null : list}
      {/* Supprimer un commentaire est définitif : une fenêtre demande confirmation. */}
      <Dialog
        visible={deleting !== null}
        title={t('project.comments.deleteTitle')}
        message={t('project.comments.deleteBody')}
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
              for (const id of candidates) if (cards.current.get(id)?.focusAction(0)) return
            })
          }
        }}
      >
        {/* Refusée : le message reste dans la fenêtre, et « Supprimer » permet de réessayer. */}
        {showDeleteError && remove.error ? (
          <Notice
            message={failure(
              remove.reason,
              t('project.comments.deleteError'),
              t('errors.rateLimited'),
            )}
          />
        ) : null}
        <Button
          label={t('project.comments.confirmDelete')}
          variant="confirm"
          onPress={() => void confirmDelete()}
          loading={removing}
        />
        <Button
          label={t('common.cancel')}
          variant="secondary"
          onPress={() => setDeleting(null)}
          disabled={removing}
        />
      </Dialog>
    </Surface>
  )
}
