// La note d'un projet suivi, dans le fil « Abonnements » : elle prépare les textes et l'image d'un
// élément de fil (une note et son projet) pour le composant NoteCard, et mène à la page du projet,
// où la note se lit en entier dans le journal. Comme SummaryCard pour un projet.
import type { ProjectNote, ProjectSummary } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useMediaSources } from '../api/media'
import { shortDate } from '../projects/format'
import { NoteCard } from '../ui/NoteCard'
import { useNameOf } from '../useNameOf'

type Props = { note: ProjectNote; project: ProjectSummary }

export function FeedNoteCard({ note, project }: Props) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const nameOf = useNameOf()
  // Une bande large et basse : la couverture du projet plutôt que sa couverture verticale.
  const visual = project.cover
  return (
    <NoteCard
      label={t(($) => $.feed.noteLabel, {
        // nameOf : « Note d’Inès sur… », « Note de Léa sur… », « Inès’s note on… ».
        nameOf: nameOf(project.author.name),
        title: project.title,
      })}
      project={project.title}
      author={{ name: project.author.name, avatar: toSource(project.author.avatarUrl) }}
      body={note.body}
      when={shortDate(note.createdAt, i18n.language)}
      image={
        visual
          ? { source: toSource(visual.url), thumbhash: visual.thumbhash, label: project.title }
          : null
      }
      onPress={() => router.push({ pathname: '/projects/[id]', params: { id: project.id } })}
    />
  )
}
