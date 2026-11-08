// La section « Fenêtres et gardes de la publication » du catalogue (tranche R6a) : trois petites
// pièces de la feuille de publication, dans leurs états.
// - La fenêtre de suppression (`Dialog`) : occupée pendant la suppression (ni Échap, ni le voile ne
//   la ferment ; « Supprimer » tourne, « Annuler » attend), puis avec l'erreur d'un échec, lue en
//   alerte dans la fenêtre restée ouverte. Une fenêtre couvre tout l'écran : elle s'ouvre par un
//   bouton.
// - « Enregistrer » grisé mais atteignable au clavier (`Button focusableWhenDisabled`), décrit par
//   « Rien à enregistrer pour l'instant. », à côté du même bouton actif.
// - La ligne « Catégorie » en erreur (`ListRow error`), sous une ligne sans erreur.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Les légendes (un outil de développement, absent de l'appli publiée)
// sont écrites ici en français et en anglais ; les textes des pièces sont ceux de l'appli.
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

const fr = {
  title: 'Fenêtres et gardes de la publication (R6a)',
  dialogIntro:
    'La fenêtre de suppression d’un projet. « Supprimer » la rend occupée deux secondes (Échap, le voile et le retour d’Android ne la ferment pas), puis l’échec s’affiche dans la fenêtre, qui reste ouverte. « Annuler » la ferme hors de l’action.',
  openBusy: 'Ouvrir occupée (2 s, puis l’erreur)',
  openError: 'Ouvrir avec l’erreur',
  buttonIntro:
    '« Enregistrer » grisé reste une étape de Tab, annoncé désactivé et décrit par sa raison ; un appui ne fait rien. À côté, le même bouton actif.',
  rowIntro:
    'La ligne « Catégorie » sans valeur : la phrase rouge dit ce qui manque et décrit la ligne. Au-dessus, la même ligne remplie.',
  science: 'Sciences et espace',
}

const en: typeof fr = {
  title: 'Publishing windows and guards (R6a)',
  dialogIntro:
    'The window that deletes a project. “Delete” makes it busy for two seconds (Escape, the scrim and Android back do not close it), then the failure shows in the window, which stays open. “Cancel” closes it outside the action.',
  openBusy: 'Open busy (2 s, then the error)',
  openError: 'Open with the error',
  buttonIntro:
    'A greyed “Save” stays a Tab stop, announced as disabled and described by its reason; a press does nothing. Next to it, the same button enabled.',
  rowIntro:
    'The “Category” row with no value: the red sentence says what is missing and describes the row. Above, the same row filled in.',
  science: 'Science and space',
}

type Labels = typeof fr
const noop = () => {}
/** La durée de la fausse suppression : de quoi voir l'attente, et essayer Échap pendant. */
const BUSY_MS = 2000

/** La fenêtre de suppression : fermée, ouverte, occupée, en échec. */
function DeleteWindowDemo({ l }: { l: Labels }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // La fausse suppression finit toujours en échec : le catalogue montre l'erreur, jamais un départ.
  useEffect(() => {
    if (!busy) return
    const timer = setTimeout(() => {
      setBusy(false)
      setFailed(true)
    }, BUSY_MS)
    return () => clearTimeout(timer)
  }, [busy])
  const start = () => {
    setFailed(false)
    setBusy(true)
  }
  const close = () => {
    setOpen(false)
    setBusy(false)
    setFailed(false)
  }
  return (
    <Stack direction="row" gap="sm" wrap>
      <Button
        label={l.openBusy}
        variant="secondary"
        onPress={() => {
          setOpen(true)
          start()
        }}
      />
      <Button
        label={l.openError}
        variant="secondary"
        onPress={() => {
          setOpen(true)
          setFailed(true)
        }}
      />
      <Dialog
        visible={open}
        title={t(($) => $.project.page.deleteTitle, { title: 'Le ciel de ce soir' })}
        message={t(($) => $.project.page.deleteConfirm)}
        busy={busy}
        error={failed ? t(($) => $.project.form.deleteError) : undefined}
        onDismiss={close}
      >
        <Button
          label={t(($) => $.project.page.deleteConfirmButton)}
          variant="confirm"
          loading={busy}
          onPress={start}
        />
        <Button
          label={t(($) => $.project.form.cancel)}
          variant="secondary"
          disabled={busy}
          onPress={close}
        />
      </Dialog>
    </Stack>
  )
}

/** « Enregistrer » grisé, décrit par sa raison, puis actif. */
function SaveButtonDemo() {
  const { t } = useTranslation()
  const reasonId = useId()
  const reason = t(($) => $.project.form.unchanged)
  return (
    <Stack gap="sm">
      <Stack direction="row" gap="sm" wrap>
        <Button
          label={t(($) => $.project.form.save)}
          size="compact"
          disabled
          focusableWhenDisabled
          describedById={reasonId}
          hint={reason}
          onPress={noop}
        />
        <Button label={t(($) => $.project.form.save)} size="compact" onPress={noop} />
      </Stack>
      <Text variant="caption" tone="muted" nativeID={reasonId}>
        {reason}
      </Text>
    </Stack>
  )
}

export function PublishWindowsCatalogue() {
  const { t, i18n } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.dialogIntro}</Text>
      <DeleteWindowDemo l={l} />
      <Text tone="secondary">{l.buttonIntro}</Text>
      <SaveButtonDemo />
      <Text tone="secondary">{l.rowIntro}</Text>
      <ListGroup>
        <ListRow
          label={t(($) => $.project.form.category)}
          detail={l.science}
          trailing="chevron"
          onPress={noop}
        />
        <ListRow
          label={t(($) => $.project.form.category)}
          error={t(($) => $.project.form.chooseCategory)}
          trailing="chevron"
          onPress={noop}
        />
      </ListGroup>
    </Stack>
  )
}
