// La carte d'un projet dans une liste (page d'un membre, d'une étiquette, le fil) : elle prépare les textes
// et l'image d'un résumé de projet pour le composant ProjectCard, et mène à la page du projet.
// Sur téléphone, la carte est haute : la couverture verticale y va mieux, si l'auteur en a donné une.
// R4 : l'auteur mène à sa page, « Tester » à la démo par la page d'avertissement des liens externes
// (`/out`, jamais directement), la date se dit par rapport à maintenant (« il y a 2 h »), et le
// total des réactions s'affiche (« ✦ 49 »).
import type { ProjectSummary } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import type { ReactNode, Ref } from 'react'
import { useTranslation } from 'react-i18next'
import type { View } from 'react-native'
import { useMediaSources } from '../api/media'
import { useCoverSource } from '../ui/coverTransition'
import { ProjectCard } from '../ui/ProjectCard'
import { RelativeTime } from '../ui/RelativeTime'
import { useLayout } from '../ui/theme/layout'

type Props = {
  project: ProjectSummary
  /** La date à afficher, si ce n'est pas la création : dans le fil, le jour de la publication. */
  at?: string
  /**
   * Un contrôle posé sur la photo, à côté du lien de la carte (Explorer y pose la pastille
   * « Suivre Nora », R3) : transmis tel quel à ProjectCard, qui le place.
   */
  overlay?: ReactNode
  /** La vue autour de la photo, pour la mesurer (transmise à ProjectCard). */
  coverRef?: Ref<View>
}

export function SummaryCard({ project, at = project.createdAt, overlay, coverRef }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const wide = useLayout().sizeClass === 'wide'
  const visual = wide ? project.cover : (project.portraitCover ?? project.cover)
  // La démo, recopiée dans une constante : le rappel de « Tester » la lit plus tard, et TypeScript
  // ne garde pas le « non nul » vérifié ici jusque dans une fonction.
  const { demoUrl } = project
  // La carte qui devient la page (R4) : la vue autour de la photo, et sa mesure au toucher.
  const cover = useCoverSource(project.id)
  return (
    <ProjectCard
      title={project.title}
      pitch={project.pitch}
      author={{
        name: project.author.name,
        avatar: toSource(project.author.avatarUrl),
        onPress: () =>
          router.push({ pathname: '/members/[id]', params: { id: project.author.id } }),
      }}
      image={
        visual
          ? { source: toSource(visual.url), thumbhash: visual.thumbhash, label: project.title }
          : null
      }
      when={<RelativeTime date={at} />}
      status={{
        label: t(($) => $.project.status[project.status]),
        strong: project.status === 'testable',
      }}
      badge={project.visibility === 'private' ? t(($) => $.member.private) : undefined}
      tryIt={
        demoUrl
          ? {
              label: t(($) => $.explore.test),
              // La page « Tu quittes {{appName}} » d'abord : elle montre l'adresse avant d'y aller.
              onPress: () => router.push({ pathname: '/out', params: { url: demoUrl } }),
            }
          : undefined
      }
      reactionTotal={project.reactionTotal}
      // La photo est mesurée avant d'ouvrir la page, qui la fait grandir depuis ce cadre (R4).
      onPress={() =>
        cover.capture(() => router.push({ pathname: '/projects/[id]', params: { id: project.id } }))
      }
      overlay={overlay}
      coverRef={coverRef ?? cover.ref}
    />
  )
}
