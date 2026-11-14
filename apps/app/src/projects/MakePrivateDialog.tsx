// La fenêtre « Rendre « Le ciel de ce soir » privé ? » (R9, scénario « Un compte suspendu », J14,
// décision L6 de Louis du 13/11/2026). Pendant une suspension, l'auteur ne modifie plus ses projets ;
// il peut seulement en retirer un des regards des autres, en le passant en privé, sans pouvoir le
// rendre de nouveau public avant la fin de la suspension (le message le dit avant qu'il confirme).
//
// Elle reprend les gardes de DeleteProjectDialog, la fenêtre de geste la plus proche :
// - « Rendre privé » ignore les tapes juste après l'ouverture (`guardTaps`) : elle s'ouvre sous le
//   doigt qui vient de toucher « Rendre privé » dans le menu ;
// - une seule écriture part, même sur une double tape (une ref, en plus de l'état) ; pendant l'envoi,
//   le bouton tourne, « Annuler » attend, et rien ne ferme la fenêtre (`busy`) ;
// - la seule écriture est `{ visibility: 'private' }` : l'API refuse tout autre changement à un compte
//   suspendu (relecture de sécurité, P7) ;
// - un échec se lit dans la fenêtre, qui reste ouverte : on réessaie, ou on annule ;
// - réussie, le projet renvoyé par l'API remplace celui du cache, et l'écran dit « Projet passé en
//   privé. » (`onDone`).
import { type RefObject, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApiErrorKey } from '../api/errors'
import { useSignInAgain } from '../navigation/signInAgain'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { Notice } from '../ui/Notice'
import { updateProject } from './api'
import { useSetProject } from './hooks'

type Props = {
  /** Le projet visé : son identifiant, et son titre (dans le titre de la fenêtre). */
  project: { id: string; title: string }
  visible: boolean
  /** « Annuler », Échap, le voile ou le retour d'Android, hors envoi : l'écran ferme la fenêtre. */
  onCancel: () => void
  /** Le projet est passé en privé, le cache est à jour : l'écran ferme la fenêtre et le dit. */
  onDone: () => void
  /** Le contrôle qui a ouvert la fenêtre (« … ») : il reprend le focus quand elle se ferme. */
  opener?: RefObject<Focusable | null>
}

export function MakePrivateDialog({ project, visible, onCancel, onDone, opener }: Props) {
  const { t } = useTranslation()
  const setProject = useSetProject()
  const signInAgain = useSignInAgain()
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<ApiErrorKey | null>(null)
  // Deux tapes dans la même image voient toutes deux l'ancien `busy` ; la ref, elle, est déjà à vrai
  // pour la seconde.
  const sending = useRef(false)
  // « Annuler » reçoit le focus à l'ouverture : Entrée à l'arrivée ne change rien.
  const cancelRef = useRef<Focusable>(null)

  // Rouverte, la fenêtre ne montre pas l'échec d'une fois précédente (charte de design). Changer
  // l'état pendant le dessin suit la prop : React redessine aussitôt, avant d'afficher.
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) setRefusal(null)
  }

  const cancel = () => {
    if (!sending.current) onCancel()
  }

  const confirm = async () => {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setRefusal(null)
    const result = await updateProject(project.id, { visibility: 'private' })
    sending.current = false
    setBusy(false)
    if (!result.ok) {
      setRefusal(result.error)
      return
    }
    setProject(result.data)
    onDone()
  }

  // La fenêtre est tout à fait partie (après son fondu) : le focus revient au « … » qui l'a ouverte,
  // qu'elle ait changé le projet ou non (la page reste là, le menu aussi).
  const closed = () => {
    const node = opener?.current
    if (!node) return
    if (!focusWithoutScroll(node)) moveReaderTo(node)
  }

  // Une session expirée a son lien « Me reconnecter », le quota son message ; le reste, « Réessaie ».
  const refusalMessage =
    refusal === 'unauthorized'
      ? t(($) => $.states.expired)
      : refusal === 'rateLimited'
        ? t(($) => $.errors.rateLimited)
        : t(($) => $.suspension.makePrivateError)

  return (
    <Dialog
      visible={visible}
      guardTaps
      busy={busy}
      title={t(($) => $.suspension.makePrivateTitle, { title: project.title })}
      message={t(($) => $.suspension.makePrivateBody)}
      error={refusal && refusal !== 'unauthorized' ? refusalMessage : undefined}
      onDismiss={cancel}
      onClosed={closed}
      initialFocusRef={cancelRef}
    >
      {refusal === 'unauthorized' ? (
        <Notice message={refusalMessage} action={signInAgain(onCancel)} />
      ) : null}
      <Button
        label={t(($) => $.suspension.makePrivate)}
        variant="confirm"
        onPress={() => void confirm()}
        loading={busy}
      />
      <Button
        ref={cancelRef}
        label={t(($) => $.common.cancel)}
        variant="secondary"
        onPress={cancel}
        disabled={busy}
      />
    </Dialog>
  )
}
