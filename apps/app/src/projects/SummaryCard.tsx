// La carte d'un projet dans une liste (page d'un membre, d'une étiquette, le fil) : elle prépare les textes
// et l'image d'un résumé de projet pour le composant ProjectCard, et mène à la page du projet.
// Sur téléphone, la carte est haute : la couverture verticale y va mieux, si l'auteur en a donné une.
// R4 : l'auteur mène à sa page, « Tester » à la démo par la page d'avertissement des liens externes
// (`/out`, jamais directement), la date se dit par rapport à maintenant (« il y a 2 h »), et le
// total des réactions s'affiche (« ✦ 49 »).
// R6a : la catégorie principale du projet, en étiquette sur la carte (fil, Explorer, page d'un
// membre, d'une étiquette) ; et la carte que vise la danse de publication (`PublishTarget`).
import type { ProjectSummary } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type ComponentProps, createContext, type ReactNode, useCallback, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaSources } from '../api/media'
import { useOpenDemo } from '../navigation/links'
import { type Measurable, useCoverSource } from '../ui/coverTransition'
import { ProjectCard } from '../ui/ProjectCard'
import { RelativeTime } from '../ui/RelativeTime'
import { useLayout } from '../ui/theme/layout'
import { useCategory } from './useCategory'

/**
 * La carte que vise la danse de publication (R6a) : le projet tout juste publié, et la fonction qui
 * reçoit la vue de sa photo (elle couvre toute la carte), pour la mesurer. L'accueil le fournit
 * autour du fil ; la carte de ce projet, où qu'elle soit dans la liste, lui donne sa vue. Un
 * contexte plutôt qu'une prop : la liste (feed/FeedList.tsx) n'a pas à savoir qu'une danse a lieu.
 */
export type PublishTarget = { id: string; onCover: (node: Measurable | null) => void }
export const PublishTargetContext = createContext<PublishTarget | null>(null)

type Props = {
  project: ProjectSummary
  /** La date à afficher, si ce n'est pas la création : dans le fil, le jour de la publication. */
  at?: string
  /**
   * Un contrôle posé sur la photo, à côté du lien de la carte (Explorer y pose la pastille
   * « Suivre Nora », R3) : transmis tel quel à ProjectCard, qui le place.
   */
  overlay?: ReactNode
  /**
   * La vue autour de la photo, pour la mesurer (transmise à ProjectCard). Son type vient de
   * ProjectCard : src/projects n'importe rien de react-native (règle de Biome, R5a ui-2).
   */
  coverRef?: ComponentProps<typeof ProjectCard>['coverRef']
}

export function SummaryCard({ project, at = project.createdAt, overlay, coverRef }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const openDemo = useOpenDemo()
  const toSource = useMediaSources()
  const wide = useLayout().sizeClass === 'wide'
  const visual = wide ? project.cover : (project.portraitCover ?? project.cover)
  // La démo, recopiée dans une constante : le rappel de « Tester » la lit plus tard, et TypeScript
  // ne garde pas le « non nul » vérifié ici jusque dans une fonction.
  const { demoUrl } = project
  // La carte qui devient la page (R4) : la vue autour de la photo, et sa mesure au toucher.
  const cover = useCoverSource(project.id)
  // La danse de publication vise-t-elle cette carte ? Sa vue va alors aux deux : la transition de
  // page et la danse. Un `ref` en fonction (« callback ref ») : React l'appelle avec la vue posée,
  // puis avec null quand elle part.
  const target = useContext(PublishTargetContext)
  const onTarget = target?.id === project.id ? target.onCover : null
  const { ref: coverSource } = cover
  const ownCoverRef = useCallback(
    (node: Measurable | null) => {
      coverSource(node)
      onTarget?.(node)
    },
    [coverSource, onTarget],
  )
  // La catégorie principale, nommée par l'API (R6b) ; aucune étiquette pour un projet d'avant R6a,
  // pendant le chargement ou la panne des catégories, ni pour un code inconnu : jamais le code brut.
  const category = useCategory(project.primaryCategory)
  return (
    <ProjectCard
      title={project.title}
      pitch={project.pitch}
      category={category}
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
              onPress: () => openDemo(demoUrl, project.id),
            }
          : undefined
      }
      reactionTotal={project.reactionTotal}
      // La photo est mesurée avant d'ouvrir la page, qui la fait grandir depuis ce cadre (R4).
      onPress={() =>
        cover.capture(() => router.push({ pathname: '/projects/[id]', params: { id: project.id } }))
      }
      overlay={overlay}
      coverRef={coverRef ?? ownCoverRef}
    />
  )
}
