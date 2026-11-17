// L'onglet Explorer (refonte, tranche R3, docs/scenarios/refonte.md, « Explorer ») : les projets de
// tous les membres. De haut en bas :
// - le titre, et sur ordinateur une phrase qui dit ce qu'on trouve ici ;
// - sur téléphone, le champ de recherche, qui est un lien vers /search (sur ordinateur, le champ
//   est celui de la barre du haut) ;
// - R12 : « À la une », les projets de la vitrine de l'accueil (absente sans projet mis en avant) ;
// - « Ils cherchent des testeurs » : un carrousel des projets testables qui ont une démo ;
// - « Outils populaires » : les dix outils les plus cités, et « Tous les outils » ;
// - « Récents » : l'ancien fil « Découvrir », page par page, où chaque carte d'un auteur qu'on ne
//   suit pas porte la pastille « Suivre Nora ». R6b : sous son titre, une rangée de pastilles
//   (« Toutes », puis chaque catégorie qui a des projets) le filtre ; le filtre vit dans l'adresse
//   (`/explore?category=animals`), pour qu'on puisse la partager ou y revenir.
//
// R15 (« L'ordinateur en grand », planche R15-Explorer-1920) : la page prend le gabarit large
// (`Screen width="wide"`). Dès `breakpoints.xwide` (1 536 points), deux colonnes : à gauche « À la
// une » et « Récents » ; à droite, un
// panneau qui reste en place au défilement, avec « Ils cherchent des testeurs » et « Outils
// populaires » en lignes, lu après « Récents » (comme le panneau du Fil). En dessous, la page
// d'avant, sections l'une sous l'autre ; sur téléphone, celle de R12.
import { layout } from '@ruche/brand'
import { CategoryCode, type ProjectSummary } from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { useMediaSources } from '../api/media'
import { categoryOf, useCategories } from '../categories/api'
import { useDiscoverFeed } from '../feed/api'
import { type CardOverlay, DiscoverFeed } from '../feed/FeedList'
import { useFollow } from '../follows/api'
import { useSuspension } from '../moderation/suspension'
import { useOpenDemo } from '../navigation/links'
import { firstParam } from '../navigation/params'
import { TopNav } from '../navigation/TopNav'
import { useMemberShowcase } from '../showcase/api'
import { useTools } from '../tools/api'
import { Carousel } from '../ui/Carousel'
import { Columns } from '../ui/Columns'
import { FilterPills } from '../ui/FilterPills'
import { FollowButton } from '../ui/FollowButton'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { InitialTile, tileVariantOf } from '../ui/InitialTile'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { GridCardsContext } from '../ui/ProjectGrid'
import { Screen } from '../ui/Screen'
import { SearchLink } from '../ui/SearchLink'
import { SHOWCASE_CARD_SHADOW, ShowcaseCard } from '../ui/ShowcaseCard'
import { SidePanel } from '../ui/SidePanel'
import { SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { Tag } from '../ui/Tag'
import { TesterCard } from '../ui/TesterCard'
import { TesterRow } from '../ui/TesterRow'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import { useToast } from '../ui/theme/toast'
import { LoadingScreen, SessionErrorScreen, SignedOutScreen } from './states'

/** Le nombre d'outils de « Outils populaires » : les autres sont dans « Tous les outils ». */
const POPULAR_TOOLS = 10

/**
 * R15 : dans le panneau, moins de lignes que dans les carrousels (planche R15-Explorer-1920 :
 * quatre projets, six outils). Le panneau reste en place au défilement seulement s'il tient dans la
 * fenêtre : à 1 920 × 1 080, les dix outils l'en empêcheraient.
 */
const PANEL_TESTERS = 4
const PANEL_TOOLS = 6

export function ExploreScreen() {
  const { state, session, retry } = useMemberSession()
  if (state === 'pending') return <LoadingScreen width="page" />
  // La session ne se lit pas : réessayer, pas se connecter (voir accounts/session.ts).
  if (state === 'error') return <SessionErrorScreen onRetry={retry} width="page" />
  if (!session) return <SignedOutScreen />
  return <MemberExplore userId={session.user.id} />
}

function MemberExplore({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { sizeClass, width } = useLayout()
  const compact = sizeClass === 'compact'
  // R15 : le panneau dès 1 536 points. `useLayout` donne une largeur de 0 tant que la page web n'est
  // pas hydratée (`useHydrated`) : la page pré-rendue, qui ne connaît pas la fenêtre, est donc celle
  // sans panneau, et le premier affichage du navigateur la reprend sans écart.
  const withPanel = width >= layout.breakpoints.xwide
  // Les abonnements faits ou défaits ici, auteur par auteur, depuis l'ouverture de la page. Ils
  // l'emportent sur ce que dit le fil : après « Suivre Nora », le fil relu dit que Nora est suivie,
  // et sa pastille doit rester là, « Tu suis Nora », sous le doigt qui vient de la toucher (et
  // pouvoir défaire le geste), au lieu de disparaître.
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const setFollowed = (authorId: string, followed: boolean) =>
    setTouched((current) => ({ ...current, [authorId]: followed }))

  // Un compte suspendu (tranche 7c) ne suit plus personne de nouveau : l'API refuserait, et la
  // pastille finirait en toast d'erreur (relecture de l'interface de R3, C2). Même garde que sur la
  // page d'un membre et celle d'un projet.
  const { suspended } = useSuspension()

  // La pastille d'une carte de « Récents » : jamais sur ses propres projets, ni sur ceux d'un
  // auteur déjà suivi à l'ouverture (rien à proposer) ; toujours sur celui qu'on vient de toucher.
  // Suspendu : aucune pastille à proposer. Une pastille déjà touchée (la suspension est arrivée
  // pendant la visite) reste à sa place, sous le doigt et avec le focus : « Tu suis Nora » peut
  // encore arrêter de suivre ; « Suivre Nora » y devient inactive, comme sur la page d'un membre.
  const chipOf = (project: ProjectSummary, followedAuthorIds: ReadonlySet<string>) => {
    const { author } = project
    if (author.id === userId) return null
    const local = touched[author.id]
    if (local === undefined && (suspended || followedAuthorIds.has(author.id))) return null
    const followed = local ?? false
    return (
      <AuthorChip
        author={author}
        followed={followed}
        disabled={suspended && !followed}
        onChange={(next) => setFollowed(author.id, next)}
      />
    )
  }

  // « Récents » : sa grille compte ses colonnes d'après la largeur que lui donne sa colonne
  // (`ui/ProjectGrid`).
  // Les cartes de « Récents » comptent avec la largeur d'une compacte (R15) : quatre à cinq colonnes
  // à côté du panneau, là où le Fil, plus bas dans l'appli, garde ses grandes cartes.
  const recent = (
    <GridCardsContext.Provider value="compact">
      <Recent viewerId={userId} overlay={chipOf} />
    </GridCardsContext.Provider>
  )

  return (
    <Screen
      width="wide"
      header={<TopNav />}
      title={t(($) => $.explore.title)}
      // « Moins de mots » (16/11/2026) : l'onglet Explorer allumé dit déjà où l'on est ; le titre
      // reste lu par les lecteurs d'écran (niveau 1), caché à l'œil.
      titleHidden
      pageTitle={t(($) => $.explore.title)}
    >
      {compact ? (
        <SearchLink
          label={t(($) => $.search.label)}
          placeholder={t(($) => $.search.placeholder)}
          href="/search"
          onPress={(event) => {
            // Sur le web, le routeur ouvre la page sans que le navigateur la recharge.
            event?.preventDefault?.()
            router.push('/search')
          }}
        />
      ) : null}
      {withPanel ? (
        // Le panneau à droite, lu après « Récents » (comme celui du Fil) ; il reste en place au
        // défilement tant qu'il tient dans la fenêtre (`sticky`).
        <Columns
          sideWidth="panel"
          sticky
          main={
            <Stack gap="xl">
              <Featured />
              {recent}
            </Stack>
          }
          side={
            <SidePanel>
              <Testers rows />
              <PopularTools rows />
            </SidePanel>
          }
        />
      ) : (
        <>
          <Featured />
          <Testers />
          <PopularTools />
          {recent}
        </>
      )}
    </Screen>
  )
}

/**
 * Le filtre de « Récents » (R6b), tel que l'adresse le donne : `?category=animals`.
 *
 * - L'adresse n'est lue qu'une fois la page hydratée (`useHydrated`) : le pré-rendu du web ne la
 *   connaît pas, et lire plus tôt ferait différer le premier affichage du HTML préparé.
 * - Un code mal formé (`?category=Animaux !`) est ignoré, sans erreur : l'API le refuserait, et la
 *   section tomberait en panne pour une adresse mal recopiée.
 * - Un code bien formé que la base ne connaît pas (`?category=knitting`, une catégorie retirée) vaut
 *   « Toutes » une fois les catégories lues (choix de R6b) : on ne saurait pas quoi
 *   écrire dans « Aucun projet dans « … » ».
 * - Tant que les catégories se lisent, le filtre demandé s'applique déjà ; si elles ne se lisent
 *   pas, il reste appliqué (la section le dit, et propose de le retirer).
 *
 * `ready` : le fil peut être lu (l'adresse est connue, et un code demandé est vérifié ou ne peut pas
 * l'être), pour une seule lecture, déjà filtrée.
 */
const useCategoryFilter = () => {
  const router = useRouter()
  const hydrated = useHydrated()
  const raw = firstParam(useLocalSearchParams<{ category?: string | string[] }>().category)
  const categories = useCategories()
  const list = categories.data?.categories
  const asked = hydrated && raw !== undefined && CategoryCode.safeParse(raw).success ? raw : null
  const unknown = asked !== null && list !== undefined && !list.some((one) => one.code === asked)
  const category = unknown ? null : asked
  // Un paramètre qui ne filtre rien (mal formé, ou inconnu de la base) quitte l'adresse : elle dit
  // ce que montre la page. `setParams` remplace l'adresse, sans page de plus dans l'historique.
  const stray = hydrated && raw !== undefined && category === null && (asked === null || unknown)
  useEffect(() => {
    if (stray) router.setParams({ category: undefined })
  }, [stray, router])

  return {
    category,
    categories,
    ready: hydrated && (asked === null || !categories.isPending),
    /** Toucher une pastille : l'adresse change, et la page la suit. Jamais `push` : un filtre n'est pas une page. */
    choose: (code: string | null) => router.setParams({ category: code ?? undefined }),
  }
}

/**
 * « Récents » : son titre, la rangée des catégories, puis le fil « Découvrir », filtré par la
 * catégorie choisie.
 */
function Recent({ viewerId, overlay }: { viewerId: string; overlay: CardOverlay }) {
  const { t } = useTranslation()
  const { category, categories, ready, choose } = useCategoryFilter()
  const chosen = categoryOf(categories.data?.categories, category)
  // Le titre de la section : il reçoit le focus quand « Voir tous les projets » retire le filtre
  // et disparaît avec lui (le focus ne se perd pas ; il reste juste au-dessus des projets revenus).
  const heading = useRef<Focusable>(null)
  const seeAll = () => {
    choose(null)
    focusWithoutScroll(heading.current)
    moveReaderTo(heading.current)
  }
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2} focusRef={heading}>
        {t(($) => $.explore.recent)}
      </Text>
      <RecentCategories categories={categories} category={category} onChange={choose} />
      <DiscoverFeed
        viewerId={viewerId}
        overlay={overlay}
        errorMessage={t(($) => $.explore.recentError)}
        category={category}
        ready={ready}
        {...(category === null
          ? null
          : {
              // Une catégorie sans projet se nomme ; sans son nom (catégories en panne), une
              // phrase qui ne la nomme pas, plutôt que le code brut.
              emptyMessage: chosen
                ? t(($) => $.explore.categoryEmpty, { name: chosen.name })
                : t(($) => $.tool.emptyFiltered),
              // Et une issue, comme sur la page d'un outil (relecture de design de R6b, C4).
              emptyAction: { label: t(($) => $.explore.seeAllProjects), onPress: seeAll },
            })}
      />
    </Stack>
  )
}

type RecentCategoriesProps = {
  categories: ReturnType<typeof useCategories>
  /** La catégorie choisie ; `null` : « Toutes ». */
  category: string | null
  onChange: (code: string | null) => void
}

/**
 * La rangée des catégories de « Récents » : « Toutes », puis chaque catégorie qui a au moins un
 * projet visible, avec son icône, dans l'ordre de la feuille de publication (celui de l'API). Sur
 * téléphone, la rangée défile de côté ; sur ordinateur, elle passe à la ligne.
 *
 * Pendant la lecture des catégories, rien (la rangée arrive avec le fil, qui se lit en même temps).
 * En panne, la section le dit, avec « Réessayer » ; si un filtre de l'adresse s'applique, un lien
 * le retire : on ne reste jamais coincé dans une catégorie.
 */
function RecentCategories({ categories, category, onChange }: RecentCategoriesProps) {
  const { t } = useTranslation()
  const compact = useLayout().sizeClass === 'compact'
  const list = categories.data?.categories
  if (!list) {
    if (!categories.isError) return null
    return (
      <Stack gap="sm">
        <Notice
          message={t(($) => $.explore.categoriesError)}
          action={{ label: t(($) => $.common.retry), onPress: () => void categories.refetch() }}
        />
        {category === null ? null : (
          <TextLink label={t(($) => $.tool.clearFilters)} onPress={() => onChange(null)} />
        )}
      </Stack>
    )
  }
  // La catégorie choisie garde sa pastille même sans projet visible : elle reste cochée, et l'on
  // voit pourquoi la liste est vide.
  const options = list
    .filter((one) => one.projectCount > 0 || one.code === category)
    .map((one) => ({ value: one.code, label: one.name, icon: one.icon }))
  // Aucune catégorie n'a de projet : une pastille « Toutes » seule ne filtrerait rien.
  if (options.length === 0) return null
  return (
    <FilterPills
      label={t(($) => $.explore.categoriesLabel)}
      allLabel={t(($) => $.explore.allCategories)}
      value={category}
      options={options}
      scroll={compact}
      onChange={onChange}
    />
  )
}

/**
 * « À la une » (R12, planche R12-A-La-Une ; scénario « La vitrine ») : les projets de la vitrine de
 * l'accueil, dans l'ordre choisi par la modération, en cartes qu'on fait défiler de côté, sur
 * téléphone comme sur ordinateur (« la même rangée »). C'est le chemin le plus court vers la vitrine
 * sur téléphone.
 *
 * - La lecture est celle d'un membre, GET /v1/showcase (`useMemberShowcase`) : l'API y applique les
 *   règles de blocage d'Explorer. Jamais la route des visiteurs.
 * - Une carte ouvre la page du projet des membres (`/projects/<id>`, plan R12, choix 7).
 * - Sans projet mis en avant, ni titre ni place vide : la section n'existe pas. Pendant la lecture
 *   non plus (rien à annoncer tant qu'on ne sait pas s'il y en aura).
 * - En panne, rien non plus, comme sur l'accueil (ShowcaseScreen) : la vitrine est un plus, et les
 *   sections d'Explorer, elles, disent chacune leur panne.
 */
function Featured() {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const items = useMemberShowcase().data?.items ?? []
  if (items.length === 0) return null
  const title = (
    <Text variant="heading" heading={2}>
      {t(($) => $.explore.featured)}
    </Text>
  )
  return (
    <Carousel
      label={t(($) => $.explore.featured)}
      previousLabel={t(($) => $.explore.featuredPrevious)}
      nextLabel={t(($) => $.explore.featuredNext)}
      header={title}
      bleed
      cardShadow={SHOWCASE_CARD_SHADOW}
    >
      {items.map((item) => (
        <ShowcaseCard
          key={item.id}
          title={item.title}
          author={{ name: item.author.name, avatar: toSource(item.author.avatarUrl) }}
          image={
            item.cover
              ? {
                  source: toSource(item.cover.url),
                  thumbhash: item.cover.thumbhash,
                  label: item.title,
                }
              : null
          }
          // Le statut, déjà traduit ; « Testable » en miel, comme sur la vitrine de l'accueil.
          status={{
            label: t(($) => $.project.status[item.status]),
            strong: item.status === 'testable',
          }}
          onPress={() => router.push({ pathname: '/projects/[id]', params: { id: item.id } })}
          size="carousel"
          // R12b : « Exemple » sur le projet d'un compte d'exemples, mis à la une comme un autre.
          example={item.author.example === true}
        />
      ))}
    </Carousel>
  )
}

/**
 * « Ils cherchent des testeurs » : la première page des projets testables, en carrousel. Seule la
 * première page : le carrousel ne demande jamais la suite (relecture juridique, jur-J7). Seuls les
 * projets qui ont une démo y entrent : « Tester » doit mener quelque part.
 *
 * `rows` (R15, le panneau des grands écrans) : les premiers en lignes (`TesterRow`), comme dans le
 * panneau du Fil, au lieu du carrousel. Le chargement, la panne et l'absence de projet se disent de
 * la même façon.
 */
function Testers({ rows = false }: { rows?: boolean }) {
  const { t } = useTranslation()
  const router = useRouter()
  const openDemo = useOpenDemo()
  const toSource = useMediaSources()
  const feed = useDiscoverFeed({ testers: true })
  const projects = (feed.data?.pages[0]?.items ?? []).flatMap((item) =>
    item.kind === 'project' && item.project.demoUrl
      ? [{ project: item.project, demoUrl: item.project.demoUrl }]
      : [],
  )
  const title = (
    <Text variant="heading" heading={2}>
      {t(($) => $.explore.testers)}
    </Text>
  )

  if (!feed.data) {
    return (
      <Stack gap="md">
        {title}
        {feed.isError ? (
          // L'échec se dit dans la section ; le reste de la page (outils, « Récents ») reste.
          // Son propre texte : « Le fil n'a pas pu se charger », dit aussi par « Récents », ne
          // disait pas lequel (relecture de design de R3, #3).
          <Notice
            message={t(($) => $.explore.testersError)}
            action={{ label: t(($) => $.common.retry), onPress: () => void feed.refetch() }}
          />
        ) : (
          <SkeletonList count={1} />
        )}
      </Stack>
    )
  }
  if (projects.length === 0) {
    return (
      <Stack gap="md">
        {title}
        <Text tone="secondary">{t(($) => $.feed.testersEmpty)}</Text>
      </Stack>
    )
  }
  const coverOf = (project: ProjectSummary) =>
    project.cover
      ? {
          source: toSource(project.cover.url),
          thumbhash: project.cover.thumbhash,
          label: project.title,
        }
      : null
  const openProject = (id: string) => router.push({ pathname: '/projects/[id]', params: { id } })
  if (rows) {
    return (
      <Stack gap="md" align="stretch">
        {title}
        <ListGroup>
          {projects.slice(0, PANEL_TESTERS).map(({ project, demoUrl }) => (
            <TesterRow
              key={project.id}
              title={project.title}
              author={project.author.name}
              example={project.author.example === true}
              image={coverOf(project)}
              // La démo passe par la page d'avertissement des liens externes, comme sur la carte.
              onTest={() => openDemo(demoUrl, project.id)}
              onOpen={() => openProject(project.id)}
            />
          ))}
        </ListGroup>
      </Stack>
    )
  }
  return (
    <Carousel
      label={t(($) => $.explore.carousel)}
      previousLabel={t(($) => $.explore.previous)}
      nextLabel={t(($) => $.explore.next)}
      header={title}
      bleed
    >
      {projects.map(({ project, demoUrl }) => (
        <TesterCard
          key={project.id}
          title={project.title}
          author={project.author.name}
          // R12b : « Exemple » sur un projet du compte d'exemples de l'équipe.
          example={project.author.example === true}
          image={coverOf(project)}
          // La démo passe par la page d'avertissement des liens externes (« Tu quittes… »).
          onTest={() => openDemo(demoUrl, project.id)}
          // Le titre ouvre la page du projet (décision du 31/10/2026).
          onOpen={() => openProject(project.id)}
        />
      ))}
    </Carousel>
  )
}

/**
 * « Outils populaires » : les dix outils les plus cités par les projets publics (l'API les range du
 * plus cité au moins cité), avec leur nombre sur ordinateur, et le lien « Tous les outils ».
 * Sans outil (aucun projet public n'en cite), la section ne s'affiche pas.
 *
 * `rows` (R15, le panneau des grands écrans) : les six premiers en lignes, chacun avec sa tuile et
 * son nombre de projets, menant à sa page ; « Tous les outils » passe sous la liste (la largeur du
 * panneau ne le tient pas à côté du titre).
 */
function PopularTools({ rows = false }: { rows?: boolean }) {
  const { t } = useTranslation()
  const router = useRouter()
  const compact = useLayout().sizeClass === 'compact'
  const tools = useTools()
  const list = tools.data?.tools.slice(0, rows ? PANEL_TOOLS : POPULAR_TOOLS) ?? []
  const title = (
    <Text variant="heading" heading={2}>
      {t(($) => $.explore.popularTools)}
    </Text>
  )
  const allTools = (
    <TextLink label={t(($) => $.explore.allTools)} onPress={() => router.push('/tools')} />
  )
  const header = rows ? (
    title
  ) : (
    // Le titre à gauche, « Tous les outils » au bout de la ligne ; à 200 %, le lien passe dessous.
    <Stack direction="row" gap="md" align="center" justify="between" wrap>
      {title}
      {allTools}
    </Stack>
  )

  if (!tools.data) {
    // En attente : rien (la ligne est basse) ; en échec, on le dit, avec « Réessayer ».
    return tools.isError ? (
      <Stack gap="md">
        {header}
        <Notice
          message={t(($) => $.explore.toolsError)}
          action={{ label: t(($) => $.common.retry), onPress: () => void tools.refetch() }}
        />
        {rows ? allTools : null}
      </Stack>
    ) : null
  }
  if (list.length === 0) return null
  if (rows) {
    return (
      <Stack gap="md" align="stretch">
        {header}
        <ListGroup>
          {list.map((tool) => {
            // « 41 projets » : un outil populaire est cité par au moins un projet.
            const projects = t(($) => $.tools.projects, { count: tool.projectCount })
            return (
              <ListRow
                key={tool.slug}
                label={tool.name}
                // Le nom d'un lien cache le texte qu'il contient : il dit aussi le nombre affiché.
                spokenLabel={t(($) => $.tools.withCount, { label: tool.name, projects })}
                leading={<InitialTile name={tool.name} variant={tileVariantOf(tool.slug)} />}
                detail={projects}
                detailRight
                href={`/tags/${encodeURIComponent(tool.slug)}`}
                onPress={(event) => {
                  // Sur le web, le routeur ouvre la page sans que le navigateur la recharge.
                  event?.preventDefault?.()
                  router.push({ pathname: '/tags/[slug]', params: { slug: tool.slug } })
                }}
              />
            )
          })}
        </ListGroup>
        {allTools}
      </Stack>
    )
  }
  return (
    <Carousel
      variant="chips"
      label={t(($) => $.explore.popularTools)}
      previousLabel={t(($) => $.explore.previousTools)}
      nextLabel={t(($) => $.explore.nextTools)}
      header={header}
      bleed
    >
      {list.map((tool) => (
        <Tag
          key={tool.slug}
          label={tool.name}
          // Le nombre sur ordinateur seulement : sur téléphone, la place va aux noms.
          count={compact ? undefined : tool.projectCount}
          onPress={() => router.push({ pathname: '/tags/[slug]', params: { slug: tool.slug } })}
        />
      ))}
    </Carousel>
  )
}

type ChipProps = {
  author: ProjectSummary['author']
  /** Suivi d'après la page : l'état affiché, que le toucher inverse. */
  followed: boolean
  /** Inactive, à sa place : un compte suspendu qui vient d'arrêter de suivre (voir chipOf). */
  disabled: boolean
  /** L'état à afficher désormais (au toucher, puis en arrière si l'API refuse). */
  onChange: (followed: boolean) => void
}

/**
 * La pastille « Suivre Nora » d'une carte de « Récents » (F-Fil8). Toucher suit, retoucher arrête
 * de suivre (jur-J8). La pastille change au toucher, sans attendre l'API ; si l'API refuse, elle
 * revient en arrière, et un toast dit pourquoi : la pastille n'a pas de place pour un message.
 */
function AuthorChip({ author, followed, disabled, onChange }: ChipProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const toSource = useMediaSources()
  const follow = useFollow({ kind: 'member', id: author.id })
  // L'état demandé au dernier toucher : en cas d'échec, la pastille revient à l'inverse.
  const asked = useRef(followed)
  // Les fonctions de l'écran changent à chaque rendu : on garde les dernières dans un `ref`, pour
  // que l'effet ci-dessous ne se relance qu'à un nouvel échec.
  const latest = useRef({ onChange, toast, t })
  latest.current = { onChange, toast, t }

  // Un échec du dernier changement (l'erreur passe à vrai) : retour en arrière, et le toast. La
  // session expirée a son propre message (réessayer ne servirait à rien).
  useEffect(() => {
    if (!follow.error) return
    const { onChange: change, toast: notify, t: translate } = latest.current
    change(!asked.current)
    notify.show(
      follow.expired ? translate(($) => $.errors.unauthorized) : translate(($) => $.follow.error),
      { icon: 'warning' },
    )
  }, [follow.error, follow.expired])

  // Le texte affiché est aussi le nom lu : « Suivre Nora », puis « Tu suis Nora » (la coche est
  // dessinée par la pastille).
  const text = followed
    ? t(($) => $.follow.memberFollowing, { name: author.name })
    : t(($) => $.follow.member, { name: author.name })
  return (
    <FollowButton
      variant="chip"
      followed={followed}
      disabled={disabled}
      label={text}
      text={text}
      avatar={{ name: author.name, source: toSource(author.avatarUrl) }}
      onPress={() => {
        asked.current = !followed
        onChange(!followed)
        // L'état affiché part avec le geste : sans page de Nora en cache, c'est lui qui dit s'il
        // faut suivre ou arrêter de suivre.
        follow.toggle(followed)
      }}
    />
  )
}
