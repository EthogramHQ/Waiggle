// La colonne de l'aperçu de la feuille de publication, sur ordinateur (R6a, planche
// R6-Publier-Desktop), sortie de `ProjectFormScreen` après les relectures (ui-C6) : la carte du fil
// telle qu'elle paraîtra, qui suit la frappe, puis « Qui peut le voir ? ».
import { useTranslation } from 'react-i18next'
import { useMe } from '../profile/hooks'
import { categoryOption } from '../projects/categories'
import type { ProjectForm } from '../projects/form'
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
  const category = form.primaryCategory ? categoryOption(t, form.primaryCategory) : null
  // Sans « Tester » : sur la carte, c'est un lien, qui resterait atteignable au clavier d'une
  // tablette (le web, lui, rend tout l'aperçu `inert`) dans un aperçu caché aux lecteurs d'écran.
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
