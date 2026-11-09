// La fenêtre « Abandonner ce projet ? » (« Abandonner les modifications ? » en modification) de la
// feuille de publication (R6a), sortie de `ProjectFormScreen` après les relectures (ui-C6). Toute
// fermeture la demande quand quelque chose a été écrit, y compris le retour du navigateur.
//
// Le focus va d'abord à « Continuer », le geste qui ne perd rien (ui-B3) : la fenêtre l'y pose
// quand son contenu paraît (`initialFocusRef`, ui-C1). Ses boutons ignorent les tapes juste après
// l'ouverture (`guardTaps`) : la seconde tape d'une double tape sur « Annuler » n'abandonne rien.
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import type { Focusable } from '../ui/focus'

type Props = {
  visible: boolean
  /** Un projet modifié (« les modifications »), ou un nouveau projet. */
  editing: boolean
  /** « Continuer » (et Échap, le voile) : la fenêtre se ferme, rien n'est perdu. */
  onKeep: () => void
  /** « Abandonner » : la feuille se ferme sans rien enregistrer. */
  onAbandon: () => void
}

export function ProjectAbandonDialog({ visible, editing, onKeep, onAbandon }: Props) {
  const { t } = useTranslation()
  const keepRef = useRef<Focusable>(null)
  return (
    <Dialog
      visible={visible}
      title={editing ? t(($) => $.project.form.abandonEdit) : t(($) => $.project.form.abandonNew)}
      message={
        editing ? t(($) => $.project.form.abandonEditBody) : t(($) => $.project.form.abandonNewBody)
      }
      guardTaps
      onDismiss={onKeep}
      initialFocusRef={keepRef}
    >
      <Button
        ref={keepRef}
        label={t(($) => $.project.form.keepEditing)}
        variant="secondary"
        onPress={onKeep}
      />
      <Button label={t(($) => $.project.form.abandon)} variant="danger" onPress={onAbandon} />
    </Dialog>
  )
}
