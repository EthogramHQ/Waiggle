// La fenêtre « Supprimer cette mise à jour ? » (R7a, scénario « Supprimer une mise à jour »), la même
// sur la page du projet (section « Les mises à jour ») et sur la frise. Elle était écrite deux fois,
// et les deux copies ne se comportaient déjà plus pareil (relecture ui-C2) : elle vit ici, avec un
// seul comportement.
// - garde contre la double tape (`guardTaps`, 600 ms) et « Supprimer » occupé pendant l'envoi ;
// - le focus arrive sur « Annuler » (une suppression ne se défait pas) ;
// - une mise à jour retirée par la modération le dit (`deleteBodyRemoved`) : la décision et la copie
//   du signalement restent gardées ;
// - pendant la suppression la fenêtre ne se ferme pas (Échap, fond, « Annuler »), sinon le focus
//   prévu après se perdrait ;
// - refusée, elle reste ouverte avec son message (session expirée : « Me reconnecter », qui referme
//   d'abord la fenêtre) ; l'erreur n'apparaît qu'après un envoi, et disparaît à la réouverture.
//
// Ce qui reste propre à chaque écran lui est rendu par des rappels :
// - `onAttempt` : « Supprimer » vient d'être touché (la frise garde la corbeille occupée) ;
// - `onDeleted` : l'API a supprimé la mise à jour ; la fenêtre se ferme ensuite d'elle-même ;
// - `onCancelled` : fermée sans suppression (Annuler, fond, reconnexion) ;
// - `onClose` : dans tous les cas, l'écran remet `update` à null ;
// - `onGone` : la fenêtre a fini de partir, une seule fois par ouverture. Sur le web, c'est la fin du
//   fondu (`onClosed` de `Dialog`) : avant, la fenêtre reprendrait le focus qu'on donnerait ailleurs.
//   Sur téléphone, `onClosed` n'est pas appelé partout (Android) : la fermeture suffit, et le focus
//   se rend quand même.
import type { ProjectUpdate } from '@ruche/contracts'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { useSignInAgain } from '../navigation/signInAgain'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import type { Focusable } from '../ui/focus'
import { Notice } from '../ui/Notice'
import { type UpdateFailure, useDeleteUpdate } from '../updates/api'

type Props = {
  /** Le projet dont on supprime une mise à jour. */
  projectId: string
  /** La mise à jour dont on demande la confirmation ; null : la fenêtre est fermée. */
  update: ProjectUpdate | null
  onAttempt?: (update: ProjectUpdate) => void
  onDeleted: (update: ProjectUpdate) => void
  onCancelled?: () => void
  onClose: () => void
  onGone?: () => void
}

export function DeleteUpdateDialog({
  projectId,
  update,
  onAttempt,
  onDeleted,
  onCancelled,
  onClose,
  onGone,
}: Props) {
  const { t } = useTranslation()
  const deletion = useDeleteUpdate(projectId)
  const signInAgain = useSignInAgain()
  const visible = update !== null

  const [removing, setRemoving] = useState(false)
  // Deux appuis dans le même instant arrivent avant que « Supprimer » ne passe en « en cours » : ce
  // drapeau, posé au premier, fait ignorer le second (une seule suppression envoyée).
  const sending = useRef(false)
  // Les erreurs de React Query restent jusqu'au prochain envoi : on ne les montre qu'après un envoi,
  // et plus à la réouverture.
  const [sent, setSent] = useState(false)
  const cancelRef = useRef<Focusable>(null)

  // La mise à jour de la dernière ouverture : le texte ne change pas pendant que la fenêtre s'en va
  // (l'écran remet `update` à null dès la fermeture).
  const last = useRef(update)
  if (update) last.current = update
  const removed = (update ?? last.current)?.removal != null

  // « La fenêtre a fini de partir », une fois par ouverture : par `onClosed` (web, fin du fondu) ou,
  // sur téléphone, dès que la fenêtre se ferme.
  const waitingForGone = useRef(false)
  const wasVisible = useRef(false)
  const arrived = () => {
    if (!waitingForGone.current) return
    waitingForGone.current = false
    onGone?.()
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

  const cancel = () => {
    onCancelled?.()
    onClose()
  }

  const confirm = async () => {
    if (!update || sending.current) return
    sending.current = true
    setRemoving(true)
    setSent(true)
    onAttempt?.(update)
    const ok = await deletion.remove(update.id)
    sending.current = false
    setRemoving(false)
    // Refusée : la fenêtre reste ouverte, avec le message ; « Supprimer » permet de réessayer.
    if (!ok) return
    onDeleted(update)
    onClose()
  }

  // Le message d'un refus : la session expirée se dit (« Réessaie » n'y ferait rien).
  const failure = (reason: UpdateFailure | undefined) =>
    reason === 'expired' ? t(($) => $.states.expired) : t(($) => $.project.updates.deleteError)

  return (
    <Dialog
      visible={visible}
      guardTaps
      title={t(($) => $.project.updates.deleteTitle)}
      message={
        removed
          ? t(($) => $.project.updates.deleteBodyRemoved)
          : t(($) => $.project.updates.deleteBody)
      }
      initialFocusRef={cancelRef}
      busy={removing}
      onDismiss={() => {
        if (!removing) cancel()
      }}
      onClosed={arrived}
    >
      {sent && deletion.error ? (
        <Notice
          message={failure(deletion.reason)}
          action={deletion.reason === 'expired' ? signInAgain(cancel) : undefined}
        />
      ) : null}
      <Button
        label={t(($) => $.project.updates.confirmDelete)}
        variant="confirm"
        onPress={() => void confirm()}
        loading={removing}
      />
      <Button
        ref={cancelRef}
        label={t(($) => $.common.cancel)}
        variant="secondary"
        onPress={cancel}
        disabled={removing}
      />
    </Dialog>
  )
}
