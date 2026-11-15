// La fenêtre « Supprimer ce commentaire ? » (R11), la même dans le fil d'un projet et dans « Mes
// commentaires ». Elle ne supprime rien elle-même : elle demande la confirmation et montre l'état que
// l'écran lui donne ; l'écran garde la requête, le focus d'après et l'annonce, qui ne se ressemblent
// pas d'un écran à l'autre.
// - garde contre la double tape (`guardTaps`, 600 ms), et une seule demande même si « Supprimer » est
//   touché deux fois dans le même instant ;
// - le focus arrive sur « Annuler » (une suppression ne se défait pas) ;
// - pendant la suppression (`busy`) la fenêtre ne se ferme pas (Échap, fond, « Annuler ») : la fermer
//   perdrait le focus prévu après ;
// - une racine qui a des réponses ne disparaît pas tout à fait : le corps le dit.
import type { ComponentProps } from 'react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import type { Focusable } from '../ui/focus'
import { Notice } from '../ui/Notice'

type Props = {
  /** Ouverte ou fermée. */
  visible: boolean
  /** Le commentaire a des réponses : le corps dit qu'elles restent. */
  hasReplies: boolean
  /** La suppression est en cours : « Supprimer » est occupé, rien ne ferme la fenêtre. */
  busy: boolean
  /** Le message d'un refus, sous le corps ; `null` : rien à dire (avant l'envoi, ou après réouverture). */
  error: string | null
  /** Un lien qui suit le message (session expirée : « Me reconnecter »). */
  errorAction?: ComponentProps<typeof Notice>['action']
  /** « Supprimer » touché (une seule fois tant que `busy`). */
  onConfirm: () => void
  /** « Annuler », Échap ou le fond (jamais pendant `busy`). */
  onCancel: () => void
  /** La fenêtre a fini de partir (fin du fondu sur le web) : l'écran y rend le focus. */
  onClosed?: () => void
}

export function DeleteCommentDialog({
  visible,
  hasReplies,
  busy,
  error,
  errorAction,
  onConfirm,
  onCancel,
  onClosed,
}: Props) {
  const { t } = useTranslation()
  const cancelRef = useRef<Focusable>(null)
  // Deux appuis dans le même instant arrivent avant que `busy` ne repasse par l'écran : ce drapeau,
  // posé au premier, fait ignorer le second. Il se rend quand `busy` retombe (refus : on peut réessayer).
  const sent = useRef(false)
  if (!busy) sent.current = false

  const confirm = () => {
    if (busy || sent.current) return
    sent.current = true
    onConfirm()
  }

  return (
    <Dialog
      visible={visible}
      guardTaps
      title={t(($) => $.project.comments.deleteTitle)}
      message={
        hasReplies
          ? t(($) => $.project.comments.deleteBodyReplies)
          : t(($) => $.project.comments.deleteBody)
      }
      initialFocusRef={cancelRef}
      busy={busy}
      onDismiss={() => {
        if (!busy) onCancel()
      }}
      onClosed={onClosed}
    >
      {error ? <Notice message={error} action={errorAction} /> : null}
      <Button
        label={t(($) => $.project.comments.confirmDelete)}
        variant="confirm"
        onPress={confirm}
        loading={busy}
      />
      <Button
        ref={cancelRef}
        label={t(($) => $.common.cancel)}
        variant="secondary"
        onPress={onCancel}
        disabled={busy}
      />
    </Dialog>
  )
}
