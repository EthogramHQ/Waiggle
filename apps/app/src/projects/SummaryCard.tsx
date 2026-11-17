// La carte d'un projet dans une liste (page d'un membre, d'une étiquette, le fil) : elle prépare les textes
// et l'image d'un résumé de projet pour le composant ProjectCard, et mène à la page du projet.
// Sur téléphone, la carte est haute : la couverture verticale y va mieux, si l'auteur en a donné une.
// R4 : l'auteur mène à sa page, « Tester » à la démo par la page d'avertissement des liens externes
// (`/out`, jamais directement), la date se dit par rapport à maintenant (« il y a 2 h »), et le
// total des réactions s'affiche (« ✦ 49 »).
// R6a : la catégorie principale du projet, en étiquette sur la carte (fil, Explorer, page d'un
// membre, d'une étiquette) ; et la carte que vise la danse de publication (`PublishTarget`).
// R7a : la dernière mise à jour du projet (`updated` de ProjectCard). Dans « Abonnements », un
// projet remonté par sa mise à jour (la prop `update`, posée par la liste du fil) montre la carte
// entière : « Mis à jour · v1.2 », sa première ligne, « et 2 autres changements » et sa date.
// Ailleurs, une mise à jour de moins de `UPDATED_BADGE_DAYS` jours pose le repère seul.
// R14 : sur la page d'un membre, la mosaïque choisit la taille de chaque carte (`size`) ; la carte
// ne répète pas le nom de l'auteur (`owner`, on est sur sa page) et montre la première photo de la
// galerie à toute largeur (`galleryCover`), celle qui grandit jusqu'à la page du projet. Partout, la
// carte rebondit au Retour du navigateur quand on revient du projet qu'elle a ouvert (`bounceStyle`).
import { type ProjectSummary, UPDATED_BADGE_DAYS, type UpdateSummary } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type ComponentProps, createContext, type ReactNode, useCallback, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaSources } from '../api/media'
import { useOpenDemo } from '../navigation/links'
import { type Measurable, useCoverSource } from '../ui/coverTransition'
import { ProjectCard, type ProjectCardSize } from '../ui/ProjectCard'
import { RelativeTime } from '../ui/RelativeTime'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import { useCategory } from './useCategory'

/** Une journée, en millisecondes. */
const DAY_MS = 24 * 60 * 60 * 1000

type CardUpdate = ComponentProps<typeof ProjectCard>['updated']

/**
 * Hook : ce que la carte montre de la dernière mise à jour. Avec `update` (l'élément du fil qui a
 * fait remonter le projet), la carte entière ; sinon, le repère seul si `latestUpdate` a moins de
 * `UPDATED_BADGE_DAYS` jours ; rien au-delà, ni pour un projet jamais mis à jour.
 */
const useUpdated = (project: ProjectSummary, update: UpdateSummary | undefined): CardUpdate => {
  const { t } = useTranslation()
  // Le repère compte depuis maintenant : sur le web, la page est pré-rendue sans connaître l'heure
  // du visiteur ; on attend l'hydratation pour lire l'horloge (sinon React verrait un écart).
  const hydrated = useHydrated()
  /** « Mis à jour · v1.2 », ou « Mis à jour » seul pour une mise à jour sans version. */
  const labelOf = (version: string | null) =>
    version ? t(($) => $.feed.updated, { version }) : t(($) => $.feed.updatedPlain)
  if (update) {
    // « et 2 autres changements » : les lignes après la première ; rien pour une seule ligne.
    const others = update.lineCount - 1
    return {
      kind: 'full',
      label: labelOf(update.version),
      line: update.firstLine,
      more: others > 0 ? t(($) => $.feed.moreChanges, { count: others }) : null,
      at: update.at,
    }
  }
  const latest = project.latestUpdate
  if (!latest || !hydrated) return undefined
  const age = Date.now() - new Date(latest.at).getTime()
  return age < UPDATED_BADGE_DAYS * DAY_MS
    ? { kind: 'badge', label: labelOf(latest.version) }
    : undefined
}

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
  /**
   * R7a : la mise à jour qui a fait remonter le projet dans « Abonnements » (l'`update` de
   * l'élément du fil, posée par feed/FeedList.tsx) ; absente ailleurs.
   */
  update?: UpdateSummary
  /**
   * R10 : la pastille de la carte, à la place de « Privé » : « Épinglé par Papi Jean » sur le projet
   * épinglé d'une ruche (relecture du plan, interface 13 : l'épingle par `ProjectCard badge`).
   */
  badge?: string
  /**
   * R14 : la carte est sur la page de son auteur (la mosaïque d'un membre) : ni son nom, ni sa
   * photo, ni la date qui se lit dans leur rangée. Tout le reste est inchangé.
   */
  owner?: boolean
  /** R14 : la grande carte (par défaut, celle du Fil) ou la compacte, choisie par la mosaïque. */
  size?: ProjectCardSize
  /**
   * R14 : la première photo de la galerie (`cover`) à toute largeur, jamais la photo verticale du
   * téléphone. La mosaïque d'un membre ouvre le projet en faisant grandir la photo de la carte
   * jusqu'à celle de la page, qui est la première de la galerie : sans cela, l'image changerait
   * en plein vol. Le Fil garde sa règle (la verticale sur téléphone, plus haute).
   */
  galleryCover?: boolean
}

export function SummaryCard({
  project,
  at = project.createdAt,
  overlay,
  coverRef,
  update,
  badge,
  owner = false,
  size,
  galleryCover = false,
}: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const openDemo = useOpenDemo()
  const toSource = useMediaSources()
  const wide = useLayout().sizeClass === 'wide'
  const visual = wide || galleryCover ? project.cover : (project.portraitCover ?? project.cover)
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
  const updated = useUpdated(project, update)
  return (
    <ProjectCard
      title={project.title}
      pitch={project.pitch}
      category={category}
      author={
        owner
          ? undefined
          : {
              name: project.author.name,
              avatar: toSource(project.author.avatarUrl),
              onPress: () =>
                router.push({ pathname: '/members/[id]', params: { id: project.author.id } }),
            }
      }
      size={size}
      image={
        visual
          ? { source: toSource(visual.url), thumbhash: visual.thumbhash, label: project.title }
          : null
      }
      // La date se lit dans la rangée de l'auteur : sans auteur, rien à dater.
      when={owner ? undefined : <RelativeTime date={at} />}
      status={{
        label: t(($) => $.project.status[project.status]),
        strong: project.status === 'testable',
      }}
      badge={badge ?? (project.visibility === 'private' ? t(($) => $.member.private) : undefined)}
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
      // R12b : « Exemple » sur un projet du compte d'exemples de l'équipe (contrat, `author.example`).
      example={project.author.example === true}
      // La photo est mesurée avant d'ouvrir la page, qui la fait grandir depuis ce cadre (R4).
      onPress={() =>
        cover.capture(() => router.push({ pathname: '/projects/[id]', params: { id: project.id } }))
      }
      overlay={overlay}
      coverRef={coverRef ?? ownCoverRef}
      // R14 : le léger rebond de la carte quand on revient, par le Retour du navigateur, du projet
      // qu'elle a ouvert ; à 1 (immobile) le reste du temps.
      bounceStyle={cover.bounceStyle}
      updated={updated}
    />
  )
}
