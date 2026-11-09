// La section « Publier : supprimer un projet » du catalogue (R6a, U6a) : la fenêtre
// « Supprimer « … » ? » (projects/DeleteProjectDialog.tsx) dans ses états :
// - normale, avec la vignette de la première photo et son badge de corbeille ;
// - un projet retiré par la modération (sans photo : la lumière miel), dont le message dit que la
//   décision et la copie du signalement restent gardées jusqu’à un an après la décision ;
// - pendant l'envoi : « Supprimer » tourne trois secondes, « Annuler » attend, ni Échap ni le voile
//   ne la ferment, puis l'échec s'affiche ;
// - l'échec tout de suite, lu en alerte dans la fenêtre restée ouverte.
// Une fenêtre couvre tout l'écran : chaque état s'ouvre par un bouton. Rien n'est envoyé : la
// suppression est simulée (`remove`). Fichier à part de CatalogueScreen.tsx, qui l'importe en une
// ligne ; ses légendes (un outil de développement, absent de l'appli publiée) sont écrites ici, en
// français et en anglais ; les textes de la fenêtre sont ceux de l'appli.
import { palettes } from '@ruche/brand'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApiResult } from '../api/errors'
import { DeleteProjectDialog } from '../projects/DeleteProjectDialog'
import { Button } from '../ui/Button'
import type { CoverImage } from '../ui/ProjectCover'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

const fr = {
  title: 'Publier : supprimer un projet (R6a)',
  intro:
    'La fenêtre ouverte par « Supprimer » du menu « … » de la page, et par « Supprimer ce projet » de la feuille de modification. Elle ignore les tapes juste après l’ouverture, n’envoie qu’une suppression sur une double tape, et rend le focus au bouton qui l’a ouverte. Rien n’est envoyé ici.',
  normal: 'Normale (ferme après une seconde, comme une suppression réussie)',
  removed: 'Projet retiré par la modération, sans photo',
  busy: 'Pendant l’envoi (3 s, puis l’échec)',
  failed: 'Échec tout de suite',
  projectTitle: 'Le ciel de ce soir',
  photo: 'Photo 1 sur 3',
}

const en: typeof fr = {
  title: 'Publish: delete a project (R6a)',
  intro:
    'The dialog opened by “Delete” in the page’s “…” menu, and by “Delete this project” in the edit sheet. It ignores taps right after opening, sends a single deletion on a double tap, and gives the focus back to the button that opened it. Nothing is sent here.',
  normal: 'Normal (closes after a second, like a successful deletion)',
  removed: 'Project removed by the moderation, without a photo',
  busy: 'While sending (3 s, then the failure)',
  failed: 'Immediate failure',
  projectTitle: 'Tonight’s sky',
  photo: 'Photo 1 of 3',
}

/** Une photo d'exemple (le dépôt n'en contient aucune) : un dégradé de la marque, de jour. */
const photoOf = (label: string): CoverImage => {
  const day = palettes.day
  return {
    label,
    source: {
      uri: `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${day.honey}"/><stop offset="1" stop-color="${day.amber}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="260" cy="110" r="70" fill="${day.surface}"/></svg>`,
      )}`,
    },
  }
}

/** Une suppression simulée : sa réponse après `delay` millisecondes. */
const after = (delay: number, result: ApiResult<null>) => (): Promise<ApiResult<null>> =>
  new Promise((resolve) => setTimeout(() => resolve(result), delay))

type Case = 'normal' | 'removed' | 'busy' | 'failed'

export function PublishDeleteCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const [open, setOpen] = useState<Case | null>(null)
  const close = () => setOpen(null)
  const failure: ApiResult<null> = { ok: false, error: 'unavailable' }
  const cases: {
    key: Case
    label: string
    removed: boolean
    photo: boolean
    remove: () => Promise<ApiResult<null>>
  }[] = [
    {
      key: 'normal',
      label: l.normal,
      removed: false,
      photo: true,
      remove: after(1000, { ok: true, data: null }),
    },
    {
      key: 'removed',
      label: l.removed,
      removed: true,
      photo: false,
      remove: after(1000, { ok: true, data: null }),
    },
    { key: 'busy', label: l.busy, removed: false, photo: true, remove: after(3000, failure) },
    { key: 'failed', label: l.failed, removed: false, photo: true, remove: after(0, failure) },
  ]

  return (
    <Stack gap="lg">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Stack direction="row" gap="md" wrap>
        {cases.map((item) => (
          <Button
            key={item.key}
            label={item.label}
            variant="secondary"
            size="compact"
            onPress={() => setOpen(item.key)}
          />
        ))}
      </Stack>
      {cases.map((item) => (
        <DeleteProjectDialog
          key={item.key}
          project={{
            id: `catalogue-${item.key}`,
            title: l.projectTitle,
            cover: item.photo ? photoOf(l.photo) : null,
            removed: item.removed,
          }}
          visible={open === item.key}
          onCancel={close}
          onDeleted={close}
          remove={item.remove}
        />
      ))}
    </Stack>
  )
}
