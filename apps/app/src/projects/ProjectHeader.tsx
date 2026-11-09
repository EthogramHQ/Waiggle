// L'en-tête de la page d'un projet (R5a, planche « Projet ») : le statut et, à côté, la catégorie
// (R6a : « Cuisine · Famille et enfants »), le titre, la ligne de dates
// (« Publié le 3 oct. · Mis à jour hier » ; « Créé le … » pour un projet privé), l'auteur et sa
// pastille « Suivre », puis le pitch. La page (ProjectScreen) le pose dans sa feuille sur téléphone,
// dans la colonne de droite sur ordinateur.
//
// Trois exports :
// - `ProjectHeader`, ce que la page utilise : il lit lui-même ce qu'il faut savoir de l'auteur ;
// - `useAuthorLine`, le hook qui le lit (son pseudo, et si le membre qui regarde le suit déjà) ;
// - `ProjectHeaderView`, le dessin seul, sans lecture : le catalogue le montre dans chaque état.
// Ce fichier n'écrit aucun style (règle Biome de `src/projects/**`) : il assemble des composants.
import type { Project } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type Ref, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaSources } from '../api/media'
import { useFollow } from '../follows/api'
import { useMember } from '../members/api'
import { useSuspension } from '../moderation/suspension'
import { useSignInAgain } from '../navigation/signInAgain'
import { AuthorLine, type AuthorLineProps } from '../ui/AuthorLine'
import { CategoryLine } from '../ui/CategoryLine'
import type { Focusable } from '../ui/focus'
import type { IconName } from '../ui/Icon'
import { MetaLine } from '../ui/MetaLine'
import { RelativeTime } from '../ui/RelativeTime'
import { Stack } from '../ui/Stack'
import { StatusPill } from '../ui/StatusPill'
import { Text } from '../ui/Text'
import { useNameOf } from '../useNameOf'
import type { CategoryOption } from './categories'
import { changedAfterCreation } from './format'
import { useCategory } from './useCategory'

/** Ce que l'en-tête montre du projet. */
export type HeaderProject = Pick<
  Project,
  | 'id'
  | 'author'
  | 'title'
  | 'pitch'
  | 'status'
  | 'visibility'
  | 'isMine'
  | 'createdAt'
  | 'updatedAt'
  | 'primaryCategory'
  | 'secondaryCategory'
>

/**
 * Hook : la ligne de l'auteur, prête pour `AuthorLine`.
 *
 * Le projet ne dit pas si le membre qui regarde suit déjà l'auteur (`Project.author` n'a que son
 * nom et sa photo) : on le lit par la page du membre (GET /v1/members/{id}, `isFollowed`), la même
 * lecture que sa page, en cache sous la même clé. Elle donne aussi son pseudo. Toucher la pastille
 * passe par `useFollow`, qui change ce cache au toucher : la pastille et la page du membre disent
 * aussitôt la même chose.
 * - Tant que la lecture n'a pas répondu : aucune pastille. Un « Suivre » qui deviendrait « Tu suis
 *   Léa » une seconde plus tard ferait faire le geste inverse à qui touche vite.
 * - Si elle échoue : aucune pastille non plus (décision de Louis du 2/11/2026). Sans la page de
 *   l'auteur, on ne sait pas si on le suit, et le geste échouerait sans doute aussi : mieux vaut
 *   ne rien proposer que « Suivre » puis une erreur. Son pseudo ne viendra pas non plus : la ligne
 *   qui lui était réservée disparaît (`handle: null`) et le nom se centre sur la photo.
 * - Sur son propre projet : aucune pastille (on ne se suit pas soi-même).
 * - Un compte suspendu (tranche 7c) ne suit plus personne, mais peut encore ne plus suivre : la
 *   pastille reste pour un auteur suivi à un moment de la visite, inactive une fois retirée.
 */
export function useAuthorLine(project: HeaderProject): AuthorLineProps {
  const { t } = useTranslation()
  const nameOf = useNameOf()
  const router = useRouter()
  const toSource = useMediaSources()
  const signInAgain = useSignInAgain()
  const { suspended } = useSuspension()
  const { author, isMine } = project
  const member = useMember(author.id)
  const follow = useFollow({ kind: 'member', id: author.id })

  // L'état choisi au dernier toucher, gardé ici tant que la page du membre ne le dit pas encore.
  // Le cache de `useFollow`, quand il existe, dit la même chose au même instant.
  const [chosen, setChosen] = useState<boolean | null>(null)
  // Le message d'échec n'appartient qu'à un geste fait ici : `touched` le réserve à la pastille
  // touchée pendant la visite.
  const [touched, setTouched] = useState(false)
  // Un échec rend la main à ce que dit la page du membre (`useFollow` y remet l'état d'avant).
  useEffect(() => {
    if (follow.error) setChosen(null)
  }, [follow.error])

  const known = member.data?.isFollowed
  const followed = chosen ?? known
  // Suivi à un moment de la visite : un compte suspendu garde la pastille pour ne plus suivre.
  const followedOnce = useRef(false)
  if (followed) followedOnce.current = true

  const name = author.name
  const shown = !isMine && followed !== undefined && (!suspended || followedOnce.current)
  return {
    name,
    // Lu : « @lea ». Pas encore lu : undefined (sa ligne garde sa place). Lecture en échec : null,
    // il ne viendra pas, la ligne n'a plus à être réservée.
    handle: member.data
      ? t(($) => $.member.handle, { handle: member.data.handle })
      : member.isError
        ? null
        : undefined,
    avatar: toSource(author.avatarUrl),
    openLabel: t(($) => $.member.open, { nameOf: nameOf(name) }),
    onOpen: () => router.push({ pathname: '/members/[id]', params: { id: author.id } }),
    follow: shown
      ? {
          followed,
          // Le nom lu reprend le texte affiché : « Suivre Léa » contient « Suivre ».
          label: followed
            ? t(($) => $.follow.memberFollowing, { name })
            : t(($) => $.follow.member, { name }),
          text: followed ? t(($) => $.follow.memberFollowing, { name }) : t(($) => $.follow.follow),
          onPress: (current) => {
            setTouched(true)
            setChosen(!current)
            follow.toggle(current)
          },
          // Suspendu, l'abonnement retiré : à sa place, inactive (l'API refuserait, 403).
          disabled: suspended && !followed,
        }
      : null,
    error:
      touched && follow.error
        ? follow.expired
          ? t(($) => $.states.expired)
          : t(($) => $.follow.error)
        : undefined,
    errorAction: touched && follow.expired ? signInAgain() : undefined,
  }
}

/**
 * Ce que dit la ligne de la catégorie : « Cuisine · Famille et enfants » (un seul texte, lu d'un
 * trait), ou la principale seule, avec l'icône de la principale. Un projet publié avant R6a n'a
 * pas de catégorie : rien (décision de Louis du 8/11/2026), pas même une place vide.
 */
const categoryLine = (
  t: ReturnType<typeof useTranslation>['t'],
  primary: CategoryOption | undefined,
  secondary: CategoryOption | undefined,
): { label: string; icon: IconName } | null => {
  if (!primary) return null
  return {
    icon: primary.icon,
    label: secondary
      ? t(($) => $.project.page.categories, {
          primary: primary.label,
          secondary: secondary.label,
        })
      : primary.label,
  }
}

/**
 * Les catégories du projet telles que l'API les nomme (R6b) : `undefined` pour la principale = pas
 * d'étiquette (chargement, panne, code inconnu, projet d'avant R6a). Lues par `ProjectHeader` ;
 * le catalogue donne les siennes, ou rien : sans liste, aucune catégorie n'est affichée.
 */
export type HeaderCategories = { primary?: CategoryOption; secondary?: CategoryOption }

type ViewProps = {
  project: HeaderProject
  /** Les catégories lues de l'API ; absentes, aucune catégorie n'est affichée. */
  categories?: HeaderCategories | undefined
  /** Toucher la catégorie : Explorer filtré sur son code (donné par `ProjectHeader`). */
  onOpenCategory?: (() => void) | undefined
  /** La ligne de l'auteur (voir `useAuthorLine`). */
  author: AuthorLineProps
  /** Pour poser le focus sur le titre à l'arrivée de la page (la carte qui devient la page). */
  titleRef?: Ref<Focusable> | undefined
  /** L'heure qu'il est, pour figer les dates (catalogue, tests) ; l'horloge de l'appareil sinon. */
  now?: Date | undefined
}

/** L'en-tête dessiné, sans aucune lecture : ce que montrent la page et le catalogue. */
export function ProjectHeaderView({
  project,
  categories,
  onOpenCategory,
  author,
  titleRef,
  now,
}: ViewProps) {
  const { t } = useTranslation()
  const priv = project.visibility === 'private'
  const updated = changedAfterCreation(project.createdAt, project.updatedAt)
  // La date complète, lue par le lecteur d'écran : « le 12 octobre à 08:00 ».
  const onFull = (full: string) => t(($) => $.dates.onDate, { date: full })
  // Sans `categories`, pas d'étiquette : jamais un nom inventé.
  const category = categoryLine(t, categories?.primary, categories?.secondary)
  return (
    <Stack gap="md">
      {/* Le statut, puis la catégorie sur la même rangée (elle passe dessous si la place manque) :
          lus dans cet ordre, avant le titre. */}
      <Stack direction="row" wrap align="center" gap="sm">
        <StatusPill
          label={t(($) => $.project.status[project.status])}
          strong={project.status === 'testable'} // « Testable » en miel plein : on appelle au test
        />
        {category ? <CategoryLine {...category} onPress={onOpenCategory} /> : null}
      </Stack>
      <Stack gap="xs">
        <Text variant="title2" heading={1} breakAnywhere focusRef={titleRef}>
          {project.title}
        </Text>
        {/* « Publié le 3 oct. » ou « Créé le 12 oct. » (privé : il n'est publié pour personne),
            puis « Mis à jour hier » s'il a changé après sa création. On voit la date courte ; le
            lecteur d'écran entend la date complète (RelativeTime et sa phrase, ui-16). */}
        <MetaLine>
          <RelativeTime
            date={project.createdAt}
            now={now}
            phrase={({ afterVerb, full }) => ({
              label: priv
                ? t(($) => $.project.page.createdOn, { when: afterVerb })
                : t(($) => $.project.page.publishedOn, { when: afterVerb }),
              spoken: priv
                ? t(($) => $.project.page.createdOn, { when: onFull(full) })
                : t(($) => $.project.page.publishedOn, { when: onFull(full) }),
            })}
          />
          {updated ? (
            <RelativeTime
              date={project.updatedAt}
              now={now}
              phrase={({ afterVerb, full }) => ({
                label: t(($) => $.project.page.updatedWhen, { when: afterVerb }),
                spoken: t(($) => $.project.page.updatedWhen, { when: onFull(full) }),
              })}
            />
          ) : null}
        </MetaLine>
      </Stack>
      <AuthorLine {...author} />
      <Text variant="headline" tone="secondary" weight={400} readable>
        {project.pitch}
      </Text>
    </Stack>
  )
}

type Props = Omit<ViewProps, 'author' | 'categories' | 'onOpenCategory'>

/**
 * L'en-tête de la page d'un projet, avec la ligne de l'auteur et les catégories qu'il lit lui-même.
 * La catégorie principale est un lien vers Explorer filtré sur elle (`/explore?category=<code>`).
 */
export function ProjectHeader(props: Props) {
  const router = useRouter()
  const author = useAuthorLine(props.project)
  const { primaryCategory, secondaryCategory } = props.project
  const primary = useCategory(primaryCategory)
  const secondary = useCategory(secondaryCategory)
  return (
    <ProjectHeaderView
      {...props}
      author={author}
      categories={{ primary, secondary }}
      onOpenCategory={
        primaryCategory
          ? () => router.push({ pathname: '/explore', params: { category: primaryCategory } })
          : undefined
      }
    />
  )
}
