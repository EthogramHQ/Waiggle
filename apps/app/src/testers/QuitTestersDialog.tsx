// La fenêtre « Quitter les testeurs de « Mon projet » ? » du menu « … » de la page d'un projet (R7b,
// juridique J1 et J5). Quitter ne se défait pas d'un geste (il faut se réinscrire, et l'auteur le
// sait), et le membre doit savoir ce qui reste chez l'auteur : ses retours, qu'il peut relire et
// supprimer tant que le projet est visible. D'où cette confirmation, qui nomme l'auteur.
//
// Ce qu'elle fait, sur le modèle de `DeleteProjectDialog` :
// - « Quitter » ignore les tapes juste après l'ouverture (`guardTaps`) : la fenêtre s'ouvre sous le
//   doigt qui vient de toucher « Quitter les testeurs » dans le menu ;
// - une seule demande part, même sur une double tape ; pendant l'envoi, ni Échap, ni le voile ne
//   la ferment (`busy`) ;
// - un échec se lit dans la fenêtre, qui reste ouverte : on réessaie ou on annule (`isTester`
//   revient en arrière dans le cache : le hook le défait lui-même) ;
// - « Annuler » reçoit le focus à l'ouverture : le geste qui ne perd rien.
//
// Le focus de la suite (la bulle, puis « Rejoindre les testeurs ») est décidé par la page, au
// rappel `onQuit` : cette fenêtre ne rend donc pas le focus au « … » quand elle se ferme après un
// départ, seulement après un « Annuler ».
import { type RefObject, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSignInAgain } from '../navigation/signInAgain'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { Notice } from '../ui/Notice'
import { useQuitTester } from './api'

type Props = {
  project: { id: string; title: string }
  /** Le nom de l'auteur, dans le texte (« Tes retours restent lisibles par Léa »). */
  authorName: string
  visible: boolean
  /** « Annuler », Échap ou le voile, hors envoi. */
  onCancel: () => void
  /** Le départ est accepté : la page ferme la fenêtre, dit « Tu ne fais plus partie… » et place le focus. */
  onQuit: () => void
  /** Le contrôle qui a ouvert la fenêtre (« … ») : il reprend le focus après un « Annuler ». */
  opener?: RefObject<Focusable | null>
}

export function QuitTestersDialog({
  project,
  authorName,
  visible,
  onCancel,
  onQuit,
  opener,
}: Props) {
  const { t } = useTranslation()
  const signInAgain = useSignInAgain()
  const quit = useQuitTester(project.id)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // Une ref en plus de l'état : deux tapes dans la même image voient toutes deux l'ancien `busy`.
  const sending = useRef(false)
  const cancelRef = useRef<Focusable>(null)
  // Parti : à la fermeture, le focus appartient à la page (« Rejoindre »), pas au « … ».
  const left = useRef(false)

  // Rouverte, la fenêtre ne garde pas l'échec d'une fois précédente (changer l'état pendant le
  // dessin est permis par React pour suivre une prop).
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) setFailed(false)
  }

  const cancel = () => {
    if (!sending.current) onCancel()
  }

  const confirm = async () => {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setFailed(false)
    const done = await quit.quit()
    sending.current = false
    setBusy(false)
    if (!done) {
      setFailed(true)
      return
    }
    left.current = true
    onQuit()
  }

  const closed = () => {
    if (left.current) {
      left.current = false
      return
    }
    const node = opener?.current
    if (!node) return
    if (!focusWithoutScroll(node)) moveReaderTo(node)
  }

  const expired = failed && quit.reason === 'expired'
  const problem = !failed
    ? undefined
    : quit.reason === 'limited'
      ? t(($) => $.errors.rateLimited)
      : t(($) => $.project.testers.quitError)

  return (
    <Dialog
      visible={visible}
      guardTaps
      busy={busy}
      title={t(($) => $.project.testers.quitTitle, { title: project.title })}
      message={t(($) => $.project.testers.quitBody, { name: authorName })}
      error={expired ? undefined : problem}
      onDismiss={cancel}
      onClosed={closed}
      initialFocusRef={cancelRef}
    >
      {expired ? (
        <Notice message={t(($) => $.states.expired)} action={signInAgain(onCancel)} />
      ) : null}
      <Button
        label={t(($) => $.project.testers.quitConfirm)}
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
