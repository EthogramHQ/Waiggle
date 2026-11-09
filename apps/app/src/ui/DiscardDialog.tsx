// La fenêtre « Abandonner les changements ? » d'une feuille où l'on a écrit (correction U3 d'après
// la relecture de l'interface de R6b, ui-C1) : toute fermeture la demande, y compris Échap, le voile
// et le retour du navigateur. Les feuilles d'administration (un outil, un rattachement, un
// rangement, une catégorie) reprenaient la fenêtre de la publication d'un projet, dont le texte
// parle de photos déjà enregistrées : faux sur une feuille sans photo. Celle-ci dit seulement que ce
// qui est écrit sera perdu (`common.discard*`). La publication garde la sienne
// (`ProjectAbandonDialog`), qui a deux textes et parle de ses photos.
//
// Les mêmes garanties que la fenêtre de la publication :
// - le focus va d'abord à « Continuer », le geste qui ne perd rien : la fenêtre l'y pose quand son
//   contenu paraît (`initialFocusRef`) ; une Entrée distraite ne jette rien ;
// - ses boutons ignorent les tapes juste après l'ouverture (`guardTaps`) : la seconde tape d'une
//   double tape sur « Annuler » de la feuille n'abandonne rien.
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Dialog } from './Dialog'
import type { Focusable } from './focus'

type Props = {
  visible: boolean
  /** « Continuer » (et Échap, le voile) : la fenêtre se ferme, rien n'est perdu. */
  onKeep: () => void
  /** « Abandonner » : la feuille se ferme sans rien enregistrer. */
  onDiscard: () => void
}

export function DiscardDialog({ visible, onKeep, onDiscard }: Props) {
  const { t } = useTranslation()
  const keepRef = useRef<Focusable>(null)
  return (
    <Dialog
      visible={visible}
      title={t(($) => $.common.discardTitle)}
      message={t(($) => $.common.discardBody)}
      guardTaps
      onDismiss={onKeep}
      initialFocusRef={keepRef}
    >
      <Button
        ref={keepRef}
        label={t(($) => $.common.keepEditing)}
        variant="secondary"
        onPress={onKeep}
      />
      <Button label={t(($) => $.common.discard)} variant="danger" onPress={onDiscard} />
    </Dialog>
  )
}
