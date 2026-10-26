// La carte d'un projet dans une liste (page d'un membre, d'une étiquette, le fil) : elle prépare les textes
// et l'image d'un résumé de projet pour le composant ProjectCard, et mène à la page du projet.
// Sur téléphone, la carte est haute : la couverture verticale y va mieux, si l'auteur en a donné une.
import type { ProjectSummary } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useMediaSources } from '../api/media'
import { ProjectCard } from '../ui/ProjectCard'
import { useLayout } from '../ui/theme/layout'
import { shortDate } from './format'

type Props = {
  project: ProjectSummary
  /** La date à afficher, si ce n'est pas la création : dans le fil, le jour de la publication. */
  at?: string
}

export function SummaryCard({ project, at = project.createdAt }: Props) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const wide = useLayout().sizeClass === 'wide'
  const visual = wide ? project.cover : (project.portraitCover ?? project.cover)
  return (
    <ProjectCard
      title={project.title}
      pitch={project.pitch}
      author={{ name: project.author.name, avatar: toSource(project.author.avatarUrl) }}
      image={
        visual
          ? { source: toSource(visual.url), thumbhash: visual.thumbhash, label: project.title }
          : null
      }
      when={shortDate(at, i18n.language)}
      status={{
        label: t(($) => $.project.status[project.status]),
        strong: project.status === 'testable',
      }}
      badge={project.visibility === 'private' ? t(($) => $.member.private) : undefined}
      onPress={() => router.push({ pathname: '/projects/[id]', params: { id: project.id } })}
    />
  )
}
