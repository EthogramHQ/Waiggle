// La colonne de l'aperçu de la feuille de publication, sur ordinateur (R6a, planche
// R6-Publier-Desktop), sortie de `ProjectFormScreen` après les relectures (ui-C6) : la carte du fil
// telle qu'elle paraîtra, qui suit la frappe, puis « Qui peut le voir ? ».
import { useTranslation } from 'react-i18next'
import { useMe } from '../profile/hooks'
import { demoUrlLooksValid, type ProjectForm } from '../projects/form'
import { useCategory } from '../projects/useCategory'
import { CardPreview } from '../ui/CardPreview'
import type { PhotoTile } from '../ui/PhotoTiles'
import { ProjectCard } from '../ui/ProjectCard'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { ProjectAudienceChoice } from './ProjectAudienceChoice'
import type { ChangeField } from './ProjectFormFields'

type Props = {
  form: ProjectForm
  /** L'image de la première photo (la couverture), ou rien. */
  cover: PhotoTile['image'] | null
  change: ChangeField
}

/**
 * L'aperçu de la carte du fil (caché aux lecteurs d'écran et au clavier par `CardPreview` : il ne
 * fait que répéter les champs), puis « Qui peut le voir ? ».
 */
export function ProjectFormPreview({ form, cover, change }: Props) {
  const { t } = useTranslation()
  const me = useMe()
  // Pas encore lue, ou en panne : l'aperçu n'a pas d'étiquette de catégorie, il reste dessiné.
  const category = useCategory(form.primaryCategory)
  // « Tester » dès que le lien est valide, comme sur la carte publiée (design-C5, décision de Louis
  // du 9/11/2026) : seulement dessiné (`tryIt` sans `onPress`). Un vrai lien resterait atteignable
  // au clavier d'une tablette (le web, lui, rend tout l'aperçu `inert`) dans un aperçu caché aux
  // lecteurs d'écran.
  const tryIt = demoUrlLooksValid(form) ? { label: t(($) => $.explore.test) } : null
  return (
    <Stack gap="xl">
      <Stack gap="lg">
        <Stack gap="xs">
          <Text variant="headline" heading={2}>
            {t(($) => $.project.form.preview)}
          </Text>
          <Text variant="callout" tone="secondary">
            {t(($) => $.project.form.previewHint)}
          </Text>
        </Stack>
        <CardPreview image={cover}>
          <ProjectCard
            title={form.title.trim() || t(($) => $.project.form.previewUntitled)}
            pitch={form.pitch.trim() || t(($) => $.project.form.previewNoPitch)}
            author={{ name: me.data?.name ?? '', avatar: null }}
            image={cover}
            when={t(($) => $.project.preview.now)}
            status={{
              label: t(($) => $.project.status[form.status]),
              strong: form.status === 'testable',
            }}
            {...(category ? { category: { label: category.label, icon: category.icon } } : null)}
            {...(tryIt ? { tryIt } : null)}
          />
        </CardPreview>
        <Text variant="caption" tone="muted">
          {t(($) => $.project.form.previewLight)}
        </Text>
      </Stack>
      <ProjectAudienceChoice audience={form.audience} change={change} />
    </Stack>
  )
}
