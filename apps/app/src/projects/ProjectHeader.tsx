// L'en-tête de la page d'un projet (R5a, planche « Projet ») : le statut et, à côté, la catégorie
// (R6a : « Cuisine · Famille et enfants ») et « Public » (R12), le titre, la ligne de dates
// (« Publié le 3 oct. · Mis à jour hier » ; « Créé le … » pour un projet privé), l'auteur et sa
// pastille « Suivre », puis le pitch. R12b : pour un projet du compte d'exemples, « Exemple » après le
// statut et, sous le pitch, la phrase qui dit le projet fictif. La page (ProjectScreen) le pose dans sa feuille sur téléphone,
// dans la colonne de droite sur ordinateur.
//
// Trois exports :
// - `ProjectHeader`, ce que la page utilise : il lit lui-même ce qu'il faut savoir de l'auteur ;
// - `useAuthorLine`, le hook qui le lit (son pseudo, et si le membre qui regarde le suit déjà) ;
// - `ProjectHeaderView`, le dessin seul, sans lecture : le catalogue le montre dans chaque état.
// Ce fichier n'écrit aucun style (règle Biome de `src/projects/**`) : il assemble des composants.
import type { Project } from '@ruche/contracts'
import { keepPunctuation } from '@ruche/i18n'
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
import { ExampleBadge } from '../ui/ExampleBadge'
import type { Focusable } from '../ui/focus'
import type { IconName } from '../ui/Icon'
import { ProjectDatesLine } from '../ui/ProjectDatesLine'
import { HeaderLineShape } from '../ui/ProjectPageShapes'
import { Stack } from '../ui/Stack'
import { StatusPill } from '../ui/StatusPill'
import { Text } from '../ui/Text'
import { useNameOf } from '../useNameOf'
import type { CategoryOption } from './categories'
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
  // `updatedAt` ne compte plus pour « Mis à jour » (R7a), mais l'en-tête reste nourri du projet
  // entier : la date et le nombre des mises à jour en font partie, comme la dernière et sa version.
  | 'updatedAt'
  | 'version'
  | 'primaryCategory'
  | 'secondaryCategory'
> & {
  /**
   * La dernière mise à jour publiée, dont l'en-tête ne lit que la date (« Mis à jour hier »). R14 :
   * réduite à cette date, pour que l'aperçu tiré d'une liste (`UpdateSummary`, qui la nomme `at`)
   * dise la même ligne que le projet complet.
   */
  latestUpdate: Pick<NonNullable<Project['latestUpdate']>, 'createdAt'> | null
  /** Le nombre des mises à jour ; absent de l'aperçu tiré d'une liste (R14), qui ne le sait pas. */
  updateCount?: Project['updateCount']
}

/**
 * R17 : l'en-tête que permet une carte de la vitrine (`ShowcasePreview`, projects/hooks.ts), avant la
 * réponse de l'API : le statut, le titre, l'auteur par son nom et sa photo, l'accroche si la carte la
 * porte (`null` sinon). Ni dates, ni catégorie, ni visibilité, ni lien vers la page de l'auteur (son
 * identifiant manque) : leurs places restent vides, ou en squelette, jusqu'au projet complet.
 */
export type CardHeaderProject = Pick<HeaderProject, 'id' | 'title' | 'status'> & {
  pitch: string | null
  author: Pick<HeaderProject['author'], 'name' | 'avatarUrl' | 'example'>
}

/** Ce que l'en-tête peut recevoir : le projet (ou son aperçu tiré d'une liste), ou une carte. */
type KnownProject = HeaderProject | CardHeaderProject

/** Le projet entier (ou son aperçu de liste), qui sait ses dates ; `null` pour une carte. */
const fullOf = (project: KnownProject): HeaderProject | null =>
  'createdAt' in project ? project : null

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
 * - R14 : `followable` faux (l'aperçu de la page, tiré d'une liste), aucune pastille : l'aperçu ne
 *   montre rien qui dépende de qui lit, et la pastille arrive avec le projet complet.
 * - R17 : une carte de la vitrine (`CardHeaderProject`) ne dit pas qui est l'auteur, seulement son
 *   nom : aucune lecture de sa page, aucune pastille, et la ligne n'est pas un lien. Son pseudo
 *   garde sa place (il viendra avec le projet complet), pour que rien ne saute à son arrivée.
 */
export function useAuthorLine(project: KnownProject, followable = true): AuthorLineProps {
  const { t } = useTranslation()
  const nameOf = useNameOf()
  const router = useRouter()
  const toSource = useMediaSources()
  const signInAgain = useSignInAgain()
  const { suspended } = useSuspension()
  const { author } = project
  const full = fullOf(project)
  const isMine = full?.isMine ?? false
  // L'identifiant de l'auteur, que seule une carte de la vitrine ne connaît pas.
  const authorId = full ? full.author.id : null
  // Sans identifiant, la lecture est éteinte (`enabled: false`) ; avec, l'appel de toujours.
  const memberArgs: Parameters<typeof useMember> = authorId !== null ? [authorId] : ['', false]
  const member = useMember(...memberArgs)
  const follow = useFollow({ kind: 'member', id: authorId ?? '' })

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
  const shown =
    followable &&
    authorId !== null &&
    !isMine &&
    followed !== undefined &&
    (!suspended || followedOnce.current)
  return {
    name,
    // Lu : « @lea ». Pas encore lu : undefined (sa ligne garde sa place). Lecture en échec : null,
    // il ne viendra pas, la ligne n'a plus à être réservée. Une carte : pas encore lu.
    handle:
      authorId !== null && member.data
        ? t(($) => $.member.handle, { handle: member.data.handle })
        : authorId !== null && member.isError
          ? null
          : undefined,
    avatar: toSource(author.avatarUrl),
    openLabel: t(($) => $.member.open, { nameOf: nameOf(name) }),
    onOpen:
      authorId === null
        ? undefined
        : () => router.push({ pathname: '/members/[id]', params: { id: authorId } }),
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
  /** Le projet (ou son aperçu tiré d'une liste) ; R17, ou ce qu'en sait une carte de la vitrine. */
  project: KnownProject
  /** Les catégories lues de l'API ; absentes, aucune catégorie n'est affichée. */
  categories?: HeaderCategories | undefined
  /** Toucher la catégorie : Explorer filtré sur son code (donné par `ProjectHeader`). */
  onOpenCategory?: (() => void) | undefined
  /** L'adresse de ce lien (`/explore?category=science`) : un vrai `<a href>` sur le web (R6b, S4). */
  categoryHref?: string | undefined
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
  categoryHref,
  author,
  titleRef,
  now,
}: ViewProps) {
  const { t } = useTranslation()
  // Sans `categories`, pas d'étiquette : jamais un nom inventé.
  const category = categoryLine(t, categories?.primary, categories?.secondary)
  // R12b : l'auteur est le compte d'exemples de l'équipe (`true`, sinon le champ est absent).
  const example = project.author.example === true
  // R17 : une carte de la vitrine ne sait ni les dates ni la visibilité (`full` vaut alors null).
  const full = fullOf(project)
  return (
    <Stack gap="md">
      {/* Le statut, puis la catégorie sur la même rangée (elle passe dessous si la place manque) :
          lus dans cet ordre, avant le titre. */}
      <Stack direction="row" wrap align="center" gap="sm">
        <StatusPill
          label={t(($) => $.project.status[project.status])}
          strong={project.status === 'testable'} // « Testable » en miel plein : on appelle au test
        />
        {/* R12b : un projet du compte d'exemples porte « Exemple » juste après son statut, pour
            membres et visiteurs. Le champ n'existe que sur l'auteur d'un tel compte (contrat
            `ExampleFlag`) : tout autre projet ne montre rien de plus. */}
        {example ? <ExampleBadge /> : null}
        {category ? (
          <CategoryLine {...category} onPress={onOpenCategory} href={categoryHref} />
        ) : null}
        {/* R12 (Q19, planche R12-Visiteur-Projet) : « Public » à côté du statut et de la catégorie,
            pour tous, membres compris, sur un projet que tout le monde peut lire. Le même dessin
            discret que la catégorie (l'icône du globe, puis le mot), sans lien : il dit un état. */}
        {full?.visibility === 'web' ? (
          <CategoryLine icon="globe-simple" label={t(($) => $.project.webBadge)} />
        ) : null}
      </Stack>
      <Stack gap="xs">
        <Text variant="title2" heading={1} breakAnywhere focusRef={titleRef}>
          {keepPunctuation(project.title)}
        </Text>
        {/* « Publié le 3 oct. » ou « Créé le 12 oct. » (privé : il n'est publié pour personne),
            puis « Mis à jour hier · v1.2 » d'après la dernière mise à jour publiée (R7a : plus
            une simple modification du projet). La ligne est partagée avec la page de la frise
            (`ProjectDatesLine`), pour que les deux disent toujours la même chose. */}
        {/* R17 : depuis une carte de la vitrine, la place de la ligne, vide, jusqu'au projet. */}
        {full ? (
          <ProjectDatesLine
            createdAt={full.createdAt}
            visibility={full.visibility}
            latestUpdateAt={full.latestUpdate?.createdAt ?? null}
            version={full.version}
            now={now}
          />
        ) : (
          <HeaderLineShape line="dates" />
        )}
      </Stack>
      <AuthorLine {...author} />
      {project.pitch !== null ? (
        <Text variant="headline" tone="secondary" weight={400} readable>
          {keepPunctuation(project.pitch)}
        </Text>
      ) : (
        <HeaderLineShape line="pitch" />
      )}
      {/* R12b : sous l'en-tête, en discret (petit, gris), ce que la pastille ne dit pas : le
          projet est fictif, créé par l'équipe pour montrer à quoi ressemble un projet. Une phrase
          seule, sans icône : l'en-tête ne porte aucune autre note. */}
      {example ? (
        <Text variant="caption" tone="muted" readable>
          {t(($) => $.project.page.exampleNote)}
        </Text>
      ) : null}
    </Stack>
  )
}

type Props = Omit<ViewProps, 'author' | 'categories' | 'onOpenCategory' | 'categoryHref'> & {
  /**
   * Faux : pas de pastille « Suivre » près de l'auteur (R14, l'aperçu de la page tiré d'une liste,
   * voir `useAuthorLine`). Vrai par défaut.
   */
  followable?: boolean
}

/**
 * L'en-tête de la page d'un projet, avec la ligne de l'auteur et les catégories qu'il lit lui-même.
 * La catégorie principale est un lien vers Explorer filtré sur elle (`/explore?category=<code>`).
 */
export function ProjectHeader({ followable = true, ...props }: Props) {
  const router = useRouter()
  const author = useAuthorLine(props.project, followable)
  // R17 : une carte de la vitrine ne sait pas les catégories : aucune lecture, aucune étiquette.
  const full = fullOf(props.project)
  const primaryCategory = full?.primaryCategory ?? null
  const secondaryCategory = full?.secondaryCategory ?? null
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
      // Le même but, en adresse : le code d'une catégorie n'a que des lettres minuscules et des
      // traits d'union (contrat), rien à échapper ; `encodeURIComponent` par prudence.
      categoryHref={
        primaryCategory ? `/explore?category=${encodeURIComponent(primaryCategory)}` : undefined
      }
    />
  )
}
