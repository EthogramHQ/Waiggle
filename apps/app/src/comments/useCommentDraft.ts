// Le brouillon d'un commentaire (R5b) : ce que le membre écrit dans le champ du bas de la feuille, et
// ce que ce texte devient selon le geste (un nouveau fil, une réponse, une modification).
// L'état vit dans ce hook, appelé par l'écran au-dessus de la feuille : fermer la feuille garde donc
// le texte. Il reste dans l'état React, jamais dans le stockage de l'appareil (juridique : un
// brouillon écrit là survivrait à la page, et au compte sur un appareil partagé).
import type { Comment, CommentReply } from '@ruche/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type CommentFailure, useEditComment, usePostComment } from './api'
import { replyPrefill } from './lines'

/** Ce que le champ est en train de faire. */
export type DraftMode =
  | { kind: 'new' }
  | { kind: 'reply'; rootId: string; name: string }
  | { kind: 'edit'; commentId: string }

/** Pourquoi le dernier envoi a échoué (`reason` absent : une panne qu'un nouvel essai peut régler). */
export type DraftError = { reason: CommentFailure | undefined }

/** Tout l'état du brouillon, d'un seul bloc, pour que chaque geste le change d'un coup. */
type Draft = {
  mode: DraftMode
  text: string
  /** Le commentaire que le geste vise (surligné) : la réponse ou le commentaire modifié. */
  targetId: string | null
  /** La mention que « Répondre » a écrite en tête du texte ('' s'il n'y en a pas). */
  prefill: string
  /** Le texte d'avant une modification, rendu à l'annulation. */
  before: string
}

const fresh: Draft = { mode: { kind: 'new' }, text: '', targetId: null, prefill: '', before: '' }

/**
 * Le texte sans la mention que « Répondre » avait préremplie, si elle est encore en tête, telle
 * quelle. Si le membre l'a modifiée ou effacée, on n'y touche pas : son texte est à lui.
 */
const withoutPrefill = ({ text, prefill }: Draft): string =>
  prefill && text.startsWith(prefill) ? text.slice(prefill.length) : text

/**
 * Hook : le brouillon des commentaires d'un projet.
 * - `startReply(root, target)` : répond dans le fil de `root`, sous `target` (la racine ou l'une de
 *   ses réponses). Un texte déjà commencé est gardé, la mention vient devant ; une première mention
 *   encore en tête et intacte est remplacée par la nouvelle.
 * - `startEdit(comment)` : met le texte du commentaire dans le champ ; le texte d'avant est mis de côté.
 * - `cancel()` : revient à un nouveau commentaire. Une modification rend le texte d'avant ; une
 *   réponse garde le texte tapé, sans la mention préremplie.
 * - `send()` : vrai une fois publié (le champ se vide), faux sinon (le texte reste, `error` le dit).
 * - `retry()` : le même envoi, sans que l'erreur disparaisse avant la réponse.
 */
export function useCommentDraft(projectId: string) {
  const [draft, setDraft] = useState<Draft>(fresh)
  const [failed, setFailed] = useState(false)
  const [sending, setSending] = useState(false)
  const [reason, setReason] = useState<CommentFailure | undefined>(undefined)
  const { post, error: postFailed, reason: postReason } = usePostComment(projectId)
  const { edit, error: editFailed, reason: editReason } = useEditComment(projectId)

  // Retenir la cause du dernier échec : l'écriture oublie la sienne dès qu'on la relance, alors que
  // le message doit rester affiché pendant le nouvel essai.
  const mutationFailed = postFailed || editFailed
  const mutationReason = postReason ?? editReason
  useEffect(() => {
    if (mutationFailed) setReason(mutationReason)
  }, [mutationFailed, mutationReason])

  // La garde de l'envoi est une `ref` : elle change tout de suite, alors qu'un état ne change qu'au
  // rendu suivant. Deux `send()` dans le même tour (double tape, Entrée puis toucher) n'envoient
  // qu'une fois.
  const busy = useRef(false)
  // Le dernier brouillon rendu, lu par `send` sans qu'il change de fonction à chaque lettre.
  const latest = useRef(draft)
  latest.current = draft

  const setText = useCallback((text: string) => setDraft((prev) => ({ ...prev, text })), [])

  const startReply = useCallback((root: Comment, target: CommentReply) => {
    setFailed(false) // l'erreur d'un envoi d'avant ne parle plus de ce geste
    setDraft((prev) => {
      // Pendant une modification, on rend d'abord le texte d'avant ; sinon on retire l'ancienne
      // mention si elle est encore là, pour que la nouvelle la remplace.
      const base = prev.mode.kind === 'edit' ? prev.before : withoutPrefill(prev)
      const prefill = replyPrefill(target, target.id === root.id ? 'root' : 'reply')
      return {
        mode: { kind: 'reply', rootId: root.id, name: target.author?.name ?? '' },
        text: prefill + base,
        targetId: target.id,
        prefill,
        before: '',
      }
    })
  }, [])

  const startEdit = useCallback((comment: CommentReply) => {
    setFailed(false)
    setDraft((prev) => ({
      mode: { kind: 'edit', commentId: comment.id },
      text: comment.body,
      targetId: comment.id,
      prefill: '',
      // Une modification déjà en cours garde le texte d'avant la première ; une réponse laisse
      // sa mention (elle ne vise plus personne).
      before: prev.mode.kind === 'edit' ? prev.before : withoutPrefill(prev),
    }))
  }, [])

  const cancel = useCallback(() => {
    setFailed(false)
    setDraft((prev) => ({
      ...fresh,
      text: prev.mode.kind === 'edit' ? prev.before : withoutPrefill(prev),
    }))
  }, [])

  const send = useCallback(async (): Promise<boolean> => {
    const { mode, text, before } = latest.current
    const body = text.trim()
    if (busy.current || body === '') return false
    busy.current = true
    setSending(true)
    try {
      const ok =
        mode.kind === 'edit'
          ? await edit({ id: mode.commentId, body })
          : await post(mode.kind === 'reply' ? { body, replyTo: mode.rootId } : { body })
      setFailed(!ok)
      // Publié : retour à un nouveau commentaire. Après une modification, le texte d'avant revient.
      if (ok) setDraft({ ...fresh, text: mode.kind === 'edit' ? before : '' })
      return ok
    } finally {
      busy.current = false
      setSending(false)
    }
  }, [edit, post])

  return {
    mode: draft.mode,
    text: draft.text,
    setText,
    startReply,
    startEdit,
    cancel,
    send,
    sending,
    error: failed ? ({ reason } satisfies DraftError) : null,
    retry: send,
    highlightedId: draft.targetId,
  }
}
