// La fenêtre « Supprimer ce message ? » d'un message du coin des testeurs (R7b), commune au fil
// (`TesterThreadView`) et à « Mes retours envoyés » (R11, Réglages → Mes données) : une fenêtre de
// geste qui sert à deux écrans devient un composant dès la deuxième copie.
//
// Elle reprend les soins de `DeleteUpdateDialog` (R7a) : garde contre la double tape, focus sur
// « Annuler », pas de fermeture pendant l'envoi, l'erreur après un envoi seulement, et `onGone` à la
// fin du fondu (web) ou dès la fermeture (téléphone, où Android ne prévient pas). La suppression
// passe toujours par la route du coin (`useDeleteMessage`), qui retire le message du fil en cache.
//
// Ce fichier assemble des pièces de `src/ui`, sans écrire de style (règle des étages).
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { useSignInAgain } from '../navigation/signInAgain'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import type { Focusable } from '../ui/focus'
import { Notice } from '../ui/Notice'
import { useDeleteMessage } from './corner-api'

/** Le message dont on demande la suppression, et ce que la fenêtre en dit. */
export type MessageToDelete = {
  id: string
  /** Le projet du coin : la route de suppression en dépend. */
  projectId: string
  /** Retiré par la modération : la fenêtre dit ce que la modération garde. */
  removed: boolean
  /**
   * L'autre personne du fil, qui ne le verra plus non plus ; null : on ne la nomme pas (un projet
   * qu'on ne voit plus, R11, U5), la fenêtre dit seulement ce qui disparaît.
   */
  otherName: string | null
}

type Props = {
  /** Le fil du testeur (son identifiant) : le cache du fil à changer. */
  testerId: string
  /** Le message à supprimer ; null : la fenêtre est fermée. */
  message: MessageToDelete | null
  /** L'API a supprimé le message ; la fenêtre se ferme ensuite d'elle-même. */
  onDeleted: (messageId: string) => void
  /** Dans tous les cas : l'écran remet `message` à null. */
  onClose: () => void
  /** La fenêtre a fini de partir, une fois par ouverture (voir `DeleteUpdateDialog`). */
  onGone: () => void
}

export function DeleteMessageDialog({ testerId, message, onDeleted, onClose, onGone }: Props) {
  const { t } = useTranslation()
  // Le message de la dernière ouverture : le texte et le projet ne changent pas pendant que la
  // fenêtre s'en va (l'écran a déjà remis `message` à null).
  const last = useRef(message)
  if (message) last.current = message
  const shown = message ?? last.current
  const deletion = useDeleteMessage(shown?.projectId ?? '', testerId)
  const signInAgain = useSignInAgain()
  const visible = message !== null
  const [removing, setRemoving] = useState(false)
  // Deux appuis dans le même instant : le second est ignoré (une seule suppression envoyée).
  const sendingRef = useRef(false)
  const [sent, setSent] = useState(false)
  const cancelRef = useRef<Focusable>(null)

  const waitingForGone = useRef(false)
  const wasVisible = useRef(false)
  const arrived = () => {
    if (!waitingForGone.current) return
    waitingForGone.current = false
    onGone()
  }
  const arrivedRef = useRef(arrived)
  arrivedRef.current = arrived
  useEffect(() => {
    if (visible) {
      waitingForGone.current = true
      setSent(false)
    } else if (wasVisible.current && Platform.OS !== 'web') {
      arrivedRef.current()
    }
    wasVisible.current = visible
  }, [visible])

  const confirm = async () => {
    if (!message || sendingRef.current) return
    sendingRef.current = true
    setRemoving(true)
    setSent(true)
    const ok = await deletion.remove(message.id)
    sendingRef.current = false
    setRemoving(false)
    // Refusée : la fenêtre reste ouverte, avec le message ; « Supprimer » permet de réessayer.
    if (!ok) return
    onDeleted(message.id)
    onClose()
  }

  const otherName = shown?.otherName ?? null
  const body =
    otherName === null
      ? t(($) => $.myFeedback.deleteBody)
      : shown?.removed
        ? t(($) => $.project.testers.thread.deleteBodyRemoved, { name: otherName })
        : t(($) => $.project.testers.thread.deleteBody, { name: otherName })

  return (
    <Dialog
      visible={visible}
      guardTaps
      title={t(($) => $.project.testers.thread.deleteTitle)}
      message={body}
      initialFocusRef={cancelRef}
      busy={removing}
      onDismiss={() => {
        if (!removing) onClose()
      }}
      onClosed={arrived}
    >
      {sent && deletion.error ? (
        <Notice
          message={
            deletion.reason === 'expired'
              ? t(($) => $.states.expired)
              : t(($) => $.project.testers.thread.deleteError)
          }
          action={deletion.reason === 'expired' ? signInAgain(onClose) : undefined}
        />
      ) : null}
      <Button
        label={t(($) => $.project.testers.thread.deleteConfirm)}
        variant="confirm"
        onPress={() => void confirm()}
        loading={removing}
      />
      <Button
        ref={cancelRef}
        label={t(($) => $.common.cancel)}
        variant="secondary"
        onPress={onClose}
        disabled={removing}
      />
    </Dialog>
  )
}
