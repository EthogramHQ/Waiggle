// La recherche par mots (refonte, tranche R3, docs/scenarios/refonte.md, « La recherche par mots »,
// planche R3-Recherche) : on tape « carn », les projets, les membres et les outils qui correspondent
// arrivent pendant qu'on tape, rangés en trois groupes, avec la partie trouvée surlignée de miel.
//
// Le texte vit dans l'adresse (« /search?q=carn ») : on peut partager une recherche entre membres, et
// revenir dessus. Il s'y écrit à la pause de la frappe (250 ms) par `setParams`, qui remplace
// l'adresse au lieu d'en ajouter une : taper « carnaval » ne crée pas huit pages dans l'historique
// du navigateur (relecture juridique, jur-J5), et ni lui ni les journaux du serveur ne gardent
// chaque préfixe tapé (R11).
//
// Où est le champ ?
// - Sur téléphone, dans la page, avec « Annuler » à côté (revenir à Explorer), ou dessous quand le
//   texte est grand ;
// - en largeur moyenne (700 à 1 100 points), dans la page aussi : la barre du haut n'y a qu'une
//   loupe (relecture de l'interface du plan, ui-6) ;
// - sur ordinateur, dans la barre du haut (navigation/TopNav.tsx) : la page lit alors ce que la
//   barre écrit dans l'adresse, et n'a pas de champ à elle.
//
// Le texte cherché n'est jamais interprété : il s'affiche tel quel, en texte simple, et jamais dans
// le titre de la page ou de l'onglet du navigateur (relecture de sécurité, sec-A8).
//
// R6b (scénario « Les catégories en filtre », « La recherche ») : sur « Tout » et « Projets », un
// bouton « Toutes les catégories » ouvre la feuille des catégories (CategoryFilterSheet, la même que
// sur la page d'un outil). Choisir « Cuisine » ne garde, dans le groupe Projets, que les projets de
// cette catégorie ; le bouton dit alors « Cuisine ». La catégorie vit dans l'adresse, comme le
// texte, et pour la même raison remplacée sans nouvelle page d'historique
// (`/search?q=carn&category=cooking`).
//
// R16 (« Ruches, Recherche et Outils en grand », planches R16-Recherche-1920, -1440 et
// -Squelette-1920) :
// - la garde de session commune (`SessionGate`) : rien n'est lu de l'API avant de savoir qu'un
//   membre regarde (avant, la liste des catégories partait même pour un visiteur) ;
// - le titre « Recherche » n'est affiché à aucune largeur (le champ dit déjà où l'on est), mais
//   reste le titre de niveau 1 des lecteurs d'écran (`titleHidden`) ;
// - dès 1 280 points (`useWideTemplate`), le gabarit large de R15 : les projets trouvés en cartes
//   compactes, en grille (quatre colonnes à 1 920, trois à 1 440, comme « Récents » d'Explorer), et
//   les membres et les outils dans un panneau à droite, lu après les projets ; pendant la recherche,
//   « Projets » et huit cartes vides, le panneau avec « Membres » et « Outils » et trois lignes
//   vides. Sous 1 280 points, rien ne change.
import {
  CategoryCode,
  SEARCH_OTHERS_FROM,
  SEARCH_QUERY_MAX,
  SearchQuery,
  type SearchResults,
  searchWords,
} from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Children, type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SessionGate } from '../accounts/SessionGate'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { useCategories } from '../categories/api'
import { firstParam } from '../navigation/params'
import { TopNav } from '../navigation/TopNav'
import { SummaryCard } from '../projects/SummaryCard'
import { useSearch } from '../search/api'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Columns } from '../ui/Columns'
import { ExampleBadge } from '../ui/ExampleBadge'
import { FilterButton } from '../ui/FilterButton'
import { type Focusable, focusWithoutScroll } from '../ui/focus'
import { HighlightedText } from '../ui/HighlightedText'
import { InitialTile, tileVariantOf } from '../ui/InitialTile'
import { ListGroup, ListRow, ListRowSkeleton, type PressEvent } from '../ui/ListGroup'
import { LiveStatus } from '../ui/LiveStatus'
import { ProjectCardSkeleton } from '../ui/ProjectCard'
import { GridCardsContext, ProjectGrid } from '../ui/ProjectGrid'
import { Screen } from '../ui/Screen'
import { SearchField } from '../ui/SearchField'
import { Segmented } from '../ui/Segmented'
import { SidePanel } from '../ui/SidePanel'
import { Loading } from '../ui/Skeleton'
import { Row, Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { StatusPill } from '../ui/StatusPill'
import { Text } from '../ui/Text'
import { useHydrated } from '../ui/theme/hydration'
import { useLayout } from '../ui/theme/layout'
import { useWideTemplate } from '../ui/theme/wideTemplate'
import { type CategoryFilterChoice, CategoryFilterSheet } from './CategoryFilterSheet'

/**
 * R16 (choix 9 des planches) : pendant la recherche, huit cartes vides (deux rangées à 1 920), deux
 * membres et un outil vides, avant de connaître les nombres.
 */
const SKELETON_PROJECTS = 8
const SKELETON_MEMBERS = 2
const SKELETON_TOOLS = 1
/** Les lignes vides de la page qui attend la session, sous 1 280 points (une liste). */
const SKELETON_ROWS = 5

/** Le temps sans frappe après lequel la recherche part : une demande par mot, pas une par lettre. */
const SEARCH_DELAY_MS = 250

/** Les onglets : tous les groupes, ou un seul. */
type Tab = 'all' | keyof SearchResults
const GROUPS: readonly (keyof SearchResults)[] = ['projects', 'members', 'tools']

export function SearchScreen() {
  // R16 (plan, choix 2 et 14) : la garde de session commune. Pendant sa lecture (c'est aussi la page
  // pré-rendue du web), la page de recherche vide ; un visiteur lit « Réservé aux membres » ; une
  // lecture ratée propose « Réessayer ». Les lectures de l'API (la recherche, les catégories) vivent
  // dans `MemberSearch`, qui n'est rendu qu'une fois la session d'un membre connue.
  return <SessionGate loading={<SearchWaiting />}>{() => <MemberSearch />}</SessionGate>
}

/** Le cadre de la page, le même pour l'attente de la session et pour les résultats. */
function SearchPage({ wide, children }: { wide: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Screen
      // R16 : le gabarit large dès 1 280 points ; en dessous, la colonne d'aujourd'hui.
      {...(wide ? { width: 'wide' as const } : null)}
      title={t(($) => $.search.title)}
      // R16 (« Moins de mots », décision de Louis du 17/11) : le titre n'est affiché à aucune
      // largeur ; il reste le titre de niveau 1 des lecteurs d'écran.
      titleHidden
      // Le titre de l'onglet du navigateur ne reprend jamais le texte cherché (sec-A8).
      pageTitle={t(($) => $.search.title)}
      header={<TopNav />}
    >
      {children}
    </Screen>
  )
}

/**
 * R16 : la page pendant la lecture de la session. Rien n'y lit l'API : on ne sait pas encore qui
 * regarde. Une seule zone « Chargement… » (comme toute page gardée) : en grand, la forme de la
 * planche (« Projets », huit cartes vides, le panneau) ; en dessous, une liste de lignes vides.
 */
function SearchWaiting() {
  const large = useWideTemplate()
  return (
    <SearchPage wide={large}>
      <Loading>
        {large ? (
          <ResultsSkeleton whole />
        ) : (
          <ListGroup>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: des lignes identiques, jamais réordonnées.
              <ListRowSkeleton key={index} />
            ))}
          </ListGroup>
        )}
      </Loading>
    </SearchPage>
  )
}

/**
 * R16 (planche R16-Recherche-Squelette-1920) : les résultats en grand, vides. Les titres sont vrais,
 * hors des zones « Chargement… » ; chaque zone (la grille, les membres, les outils) a la sienne.
 * `whole` : la page entière est déjà une seule zone qui charge (l'attente de la session) ; les
 * pièces se posent alors sans zone à elles.
 */
function ResultsSkeleton({ whole = false }: { whole?: boolean }) {
  const { t } = useTranslation()
  const zone = (pieces: ReactNode) => (whole ? pieces : <Loading>{pieces}</Loading>)
  // Les lignes vides d'un groupe du panneau, dans le groupe blanc qui porte son vrai titre : le
  // titre reste hors de la zone « Chargement… », posée dans le groupe, autour des seules lignes.
  const rows = (title: string, count: number, leading: 'round' | 'square') => (
    <ListGroup title={title}>
      {zone(
        Array.from({ length: count }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: des lignes identiques, jamais réordonnées.
          <ListRowSkeleton key={index} leading={leading} />
        )),
      )}
    </ListGroup>
  )
  return (
    <Columns
      sideWidth="panel"
      main={
        <ProjectsSection>
          {zone(
            <ProjectGrid>
              {Array.from({ length: SKELETON_PROJECTS }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: des cartes vides, jamais réordonnées.
                <ProjectCardSkeleton key={index} />
              ))}
            </ProjectGrid>,
          )}
        </ProjectsSection>
      }
      side={
        <SidePanel>
          {rows(
            t(($) => $.search.tabs.members),
            SKELETON_MEMBERS,
            'round',
          )}
          {rows(
            t(($) => $.search.tabs.tools),
            SKELETON_TOOLS,
            'square',
          )}
        </SidePanel>
      }
    />
  )
}

/**
 * R16 : « Projets » en grand, son titre de section (comme « Récents » d'Explorer, choix 5 des
 * planches), puis sa grille de cartes compactes (`GridCardsContext`) : la grille compte ses colonnes
 * dans la largeur que lui laisse le panneau (`ui/ProjectGrid`), quatre à 1 920, trois à 1 440.
 */
function ProjectsSection({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <GridCardsContext.Provider value="compact">
      <Stack gap="md" align="stretch">
        <Text variant="heading" heading={2}>
          {t(($) => $.search.tabs.projects)}
        </Text>
        {children}
      </Stack>
    </GridCardsContext.Provider>
  )
}

function MemberSearch() {
  const { t } = useTranslation()
  const router = useRouter()
  const { sizeClass } = useLayout()
  // R16 : le gabarit large dès 1 280 points.
  const large = useWideTemplate()
  // Les photos des membres trouvés (servies par l'API, avec la session sur téléphone).
  const toSource = useMediaSources()
  // L'adresse n'est lue qu'une fois la page hydratée : la page web est pré-rendue sans connaître
  // l'adresse complète, et lire `q` plus tôt ferait un écart entre le pré-rendu et le navigateur.
  const hydrated = useHydrated()
  const params = useLocalSearchParams<{ q?: string | string[]; category?: string | string[] }>()
  const fromAddress = firstParam(params.q) ?? ''
  const address = hydrated ? fromAddress : ''
  // R6b : la catégorie, lue de l'adresse elle aussi après l'hydratation, et vérifiée par le schéma
  // du contrat : un code mal formé (`?category=Cuisine!`) est ignoré, comme s'il n'y était pas.
  const fromCategory = CategoryCode.safeParse(firstParam(params.category))
  const category = hydrated && fromCategory.success ? fromCategory.data : null

  // Ce qui est dans le champ (téléphone, largeur moyenne), ou ce que la barre du haut a écrit dans
  // l'adresse (ordinateur). Ce qu'on tape fait foi : l'adresse revient un instant plus tard (son
  // « écho »), et ne doit pas effacer une lettre tapée entre-temps.
  const [text, setText] = useState(address)
  // Le texte cherché : `text`, une fois que le membre a cessé de taper depuis 250 ms.
  const [query, setQuery] = useState(address)
  // Les valeurs écrites dans l'adresse dont l'écho n'est pas encore revenu, dans l'ordre.
  const pending = useRef<string[]>([])
  // L'adresse a-t-elle déjà été lue ? La première lecture (lien partagé, page rechargée) cherche
  // tout de suite, sans attendre.
  const read = useRef(hydrated)
  const wide = sizeClass === 'wide'

  // L'adresse a changé sans nous : le bouton « Précédent » du navigateur, un lien vers une
  // recherche, ou, sur ordinateur, une frappe dans la barre du haut. Le champ la suit.
  useEffect(() => {
    if (!hydrated) return
    const echo = pending.current.indexOf(address)
    if (echo >= 0) {
      // L'écho d'une frappe dans la page : on l'oublie, avec ceux d'avant, déjà dépassés.
      pending.current = pending.current.slice(echo + 1)
      return
    }
    pending.current = []
    setText(address)
    // Sur ordinateur, la barre du haut écrit l'adresse à chaque lettre : on attend comme pour une
    // frappe. Ailleurs (ou à la première lecture), l'adresse est une recherche finie.
    if (!read.current || !wide) setQuery(address)
    read.current = true
  }, [hydrated, address, wide])

  // Le minuteur de l'attente (on dit « debounce ») : chaque frappe le relance ; l'ancien est effacé
  // par le nettoyage de useEffect (la fonction rendue, appelée avant l'effet suivant).
  // À la même pause, la frappe est écrite dans l'adresse : l'historique et les journaux du serveur
  // ne gardent pas chaque préfixe tapé (« c », « ca », « car »…), seulement le mot où l'on s'arrête
  // (R11). `typed` garde ce qui a été tapé et pas encore écrit ; l'adresse qui change sans nous
  // (« Précédent », barre du haut) ne passe pas par là et n'est donc pas réécrite.
  const typed = useRef<string | null>(null)
  // Le routeur dans une `ref` : l'effet ne repart pas (et ne relance pas l'attente) quand le
  // routeur change d'identité d'un rendu à l'autre.
  const routerRef = useRef(router)
  routerRef.current = router
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(text)
      if (typed.current !== text) return
      typed.current = null
      pending.current.push(text)
      // Un champ vide retire le paramètre, plutôt que de laisser « ?q= » dans l'adresse.
      routerRef.current.setParams({ q: text === '' ? undefined : text })
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text])

  // Le texte demandé à l'API : sans les blancs autour, et coupé à 80 caractères (au-delà, l'API
  // refuserait tout ; on cherche plutôt le début).
  const searched = query.trim().slice(0, SEARCH_QUERY_MAX)
  // La catégorie part en second argument, seulement s'il y en a une : sans filtre, la demande reste
  // exactement celle d'avant R6b (`useSearch('carn')`, sans second argument).
  const searchArgs: [string, string?] = category === null ? [searched] : [searched, category]
  const search = useSearch(...searchArgs)
  const [tab, setTab] = useState<Tab>('all')

  // R6b : les noms et les icônes des catégories viennent de l'API (GET /v1/categories).
  const categories = useCategories()
  // La feuille des catégories : choisir applique, ferme, et rend le focus au bouton qui l'a ouverte
  // (une fois la feuille fermée : avant, elle garde le focus chez elle).
  const [sheetOpen, setSheetOpen] = useState(false)
  const categoryButton = useRef<Focusable>(null)
  const focusButton = useRef(false)
  // Un choix déjà fait pendant que la feuille se ferme (son fondu de sortie) : une deuxième tape,
  // même sur une autre pastille, ne change plus rien. Remis à zéro à chaque ouverture.
  const chose = useRef(false)
  useEffect(() => {
    if (sheetOpen || !focusButton.current) return
    focusButton.current = false
    focusWithoutScroll(categoryButton.current)
  }, [sheetOpen])

  // « Réessayer » : React Query remet une lecture en erreur sans données « en attente », et
  // l'erreur disparaît pendant la nouvelle tentative ; on la garde affichée (et le focus sur le
  // bouton) jusqu'à la réponse.
  const [retrying, setRetrying] = useState(false)
  const lastError = useRef<unknown>(null)
  if (search.error) lastError.current = search.error

  // Une frappe : le champ la montre tout de suite, l'adresse l'écrira à la pause (voir plus haut).
  const write = (next: string) => {
    setText(next)
    typed.current = next
  }

  // « Annuler » : vider, puis revenir à Explorer (la page d'où l'on vient d'ordinaire ; sinon, elle
  // remplace la recherche). Le départ est un geste fini : l'adresse est vidée sans attendre.
  const cancel = () => {
    setText('')
    typed.current = null
    pending.current.push('')
    router.setParams({ q: undefined })
    router.dismissTo('/explore')
  }

  const field = wide ? null : (
    <SearchField
      label={t(($) => $.search.label)}
      placeholder={t(($) => $.search.placeholder)}
      value={text}
      onChangeText={write}
      // Entrée ne fait rien de plus (la page cherche pendant qu'on tape) ; sur le web, elle garde
      // le focus dans le champ.
      onSubmit={() => {}}
      // On vient ici pour chercher : le curseur est déjà dans le champ.
      autoFocus
      // Sur téléphone, « Annuler » à côté du champ ; le champ le fait passer dessous quand le
      // texte est grand (SearchField, `action`).
      action={
        sizeClass === 'compact' ? (
          <Button
            label={t(($) => $.common.cancel)}
            variant="glass"
            size="compact"
            onPress={cancel}
          />
        ) : undefined
      }
    />
  )

  // Les mots à surligner : ceux de la recherche qui a donné les résultats affichés.
  const words = searchWords(searched)
  // Rien de cherchable dans le champ (moins de deux caractères, ou seulement des mots d'une
  // lettre) : on le dit, sans rien demander ni montrer de résultats d'avant.
  const tooShort = searchWords(text).length === 0
  const failed = !tooShort && (search.isError || (retrying && lastError.current !== null))
  const shownError = search.error ?? lastError.current
  const data = tooShort || failed ? undefined : search.data
  // Le texte tapé, une fois posé, contient un caractère que l'API refuse (un caractère invisible) :
  // rien ne peut correspondre. Pendant l'attente des 250 ms, `query` est encore l'ancien texte : on
  // ne conclut rien.
  const unsearchable =
    !tooShort && query === text && !SearchQuery.safeParse({ q: searched }).success

  const open = (event: PressEvent | undefined, path: string) => {
    // Une ligne-lien est un vrai `<a>` sur le web : c'est le routeur qui change de page, sans
    // recharger.
    event?.preventDefault?.()
    router.push(path)
  }

  const onRetry = () => {
    setRetrying(true)
    void search.refetch().finally(() => setRetrying(false))
  }

  const groups = data ? results(data) : null
  const found = groups ? GROUPS.some((group) => groups[group].count > 0) : false

  // Rien trouvé (ou rien qui puisse l'être) : l'abeille à la loupe dit « Aucun résultat ».
  const nothingFound = (groups !== null && !found) || unsearchable
  // Aucun mot de 3 lettres : l'API ne cherche alors que parmi les membres suivis (décision de Louis
  // du 30/10/2026, sec-B1 et jur-J1, la même règle que l'API, search/load.ts). « Aucun résultat »
  // le dit, sinon on croirait que la personne cherchée n'est pas membre (relecture juridique, C1).
  const onlyFollowed = words.length > 0 && words.every((word) => word.length < SEARCH_OTHERS_FROM)

  // « 3 projets, 1 membre, 0 outil » : les nombres d'une réponse (0 partout quand le texte ne peut
  // rien trouver).
  const counts = groups ?? results({ projects: none, members: none, tools: none })
  const summary = t(($) => $.search.summary, {
    projects: counts.projects.more
      ? t(($) => $.search.projectsMore, { max: counts.projects.count })
      : t(($) => $.search.projects, { count: counts.projects.count }),
    members: counts.members.more
      ? t(($) => $.search.membersMore, { max: counts.members.count })
      : t(($) => $.search.members, { count: counts.members.count }),
    tools: counts.tools.more
      ? t(($) => $.search.toolsMore, { max: counts.tools.count })
      : t(($) => $.search.tools, { count: counts.tools.count }),
  })

  // La ligne d'état, lue poliment par les lecteurs d'écran à chaque changement (relecture de
  // l'interface du plan, ui-7 ; LiveStatus, toujours montée) : « Tape au moins deux caractères »,
  // « Recherche en cours… », puis « 3 projets, 1 membre, 0 outil ». Une panne n'y ajoute rien : son
  // message est déjà une alerte.
  const status = tooShort
    ? t(($) => $.search.typeMore)
    : failed
      ? ''
      : groups || unsearchable
        ? summary
        : t(($) => $.search.searching)

  const tabLabel = (group: keyof SearchResults) => {
    const { count, more } = groups?.[group] ?? { count: 0, more: false }
    const name = t(($) => $.search.tabs[group])
    return {
      // Le nombre affiché (« 20+ ») reste hors du nom lu, qui le dit en toutes lettres.
      label: `${name} ${count}${more ? '+' : ''}`,
      spokenLabel: t(($) => $.search.tabWithCount, {
        tab: name,
        results: more
          ? t(($) => $.search.resultsMore, { max: count })
          : t(($) => $.search.results, { count }),
      }),
    }
  }

  const shows = (group: keyof SearchResults) =>
    (tab === 'all' || tab === group) && groups !== null && groups[group].count > 0

  // --- R6b : le filtre par catégorie, qui ne vise que le groupe Projets (scénario, décision 8).
  // Les catégories proposées : celles qui ont au moins un projet que le membre peut voir, dans
  // l'ordre de la feuille de publication, plus celle de l'adresse si elle n'en a plus (pour pouvoir
  // la voir cochée). Sans nombre : celui de l'API compte tous les projets de la catégorie, pas ceux
  // que la recherche trouve, et le montrer ici tromperait. Une catégorie dont le nom n'est pas lu ne
  // s'affiche pas : jamais le code brut.
  const list = categories.data?.categories ?? []
  const choices: CategoryFilterChoice[] = list
    .filter((one) => one.projectCount > 0 || one.code === category)
    .map((one) => ({ code: one.code, name: one.name, icon: one.icon }))
  const chosen = list.find((one) => one.code === category)
  // Le bouton se montre sur « Tout » et « Projets », jamais « Membres » ni « Outils », dès qu'il y a
  // des résultats. Une catégorie déjà choisie le garde aussi quand rien n'est trouvé, pendant la
  // lecture ou après une panne (les onglets ont alors disparu) : c'est par lui qu'on la retire.
  // R16 : en grand, la recherche partie et sans réponse encore pose déjà la rangée des onglets et du
  // filtre, à sa place (planche R16-Recherche-Squelette-1920) : à l'arrivée des résultats, rien ne
  // descend. Sous 1 280 points, rien ne change.
  const searching = !tooShort && !failed && !unsearchable && groups === null
  const controlsWait = large && searching
  const filterShown =
    found || controlsWait ? tab === 'all' || tab === 'projects' : category !== null && !tooShort
  // Une catégorie dans l'adresse dont le nom n'est pas (encore) lu : le bouton dit « Catégorie »,
  // jamais « Toutes les catégories », qui mentirait sur le filtre appliqué.
  const filterLabel = chosen
    ? chosen.name
    : category === null
      ? t(($) => $.search.allCategories)
      : t(($) => $.search.category)
  // Rien trouvé dans cette catégorie, alors que l'onglet « Projets » est choisi : la liste serait
  // vide, sans un mot ; on le dit, avec de quoi retirer le filtre.
  const projectsFilteredOut =
    category !== null &&
    found &&
    tab === 'projects' &&
    groups !== null &&
    groups.projects.count === 0

  const openSheet = () => {
    chose.current = false
    setSheetOpen(true)
  }
  const closeSheet = () => {
    focusButton.current = true
    setSheetOpen(false)
  }
  // Choisir écrit la catégorie dans l'adresse (remplacée, sans nouvelle page d'historique : le
  // Retour du navigateur quitte la recherche), puis ferme la feuille. La lecture repart d'elle-même :
  // la catégorie lue de l'adresse change la clé de `useSearch`.
  const chooseCategory = (code: string | null) => {
    if (chose.current) return
    chose.current = true
    if (code !== category) router.setParams({ category: code ?? undefined })
    closeSheet()
  }
  // « Voir tous les projets », sous un onglet Projets vidé par le filtre : la catégorie part de
  // l'adresse ; le focus va au bouton du filtre, qui dit maintenant « Toutes les catégories »
  // (le message qui portait le bouton touché disparaît).
  const chooseAll = () => {
    router.setParams({ category: undefined })
    focusWithoutScroll(categoryButton.current)
  }

  const projectList =
    data && shows('projects') ? (
      <ListGroup title={t(($) => $.search.tabs.projects)}>
        {data.projects.items.map((project) => {
          const path = `/projects/${project.id}`
          const statusLabel = t(($) => $.project.status[project.status])
          const mine = project.visibility === 'private'
          // Sous le titre : l'extrait de la description quand c'est elle qui a correspondu,
          // sinon l'auteur.
          const detail = project.excerpt
            ? t(($) => $.search.excerpt, { excerpt: project.excerpt })
            : project.author.name
          const pill = mine ? t(($) => $.member.private) : statusLabel
          // R12b : un projet du compte d'exemples porte « Exemple » sous sa pastille. Le nom de
          // la ligne cache ses textes : il dit donc aussi « Exemple », après la pastille, par la
          // même forme « titre, précision » (« Le carnet des plantes, Testable, Exemple »).
          const example = project.author.example === true
          const withStatus = t(($) => $.search.projectWithStatus, {
            title: project.title,
            status: pill,
          })
          return (
            <ListRow
              key={project.id}
              label={project.title}
              title={<HighlightedText text={project.title} words={words} weight={600} />}
              detail={
                <HighlightedText
                  variant="callout"
                  tone="muted"
                  text={detail}
                  words={project.excerpt ? words : []}
                />
              }
              // Le nom d'une ligne cache ce qu'elle contient : il dit aussi la pastille.
              spokenLabel={
                example
                  ? t(($) => $.search.projectWithStatus, {
                      title: withStatus,
                      status: t(($) => $.common.example),
                    })
                  : withStatus
              }
              hint={detail}
              trailing={
                example ? (
                  <Stack gap="xs">
                    <StatusPill label={pill} strong={!mine && project.status === 'testable'} />
                    <ExampleBadge />
                  </Stack>
                ) : (
                  <StatusPill label={pill} strong={!mine && project.status === 'testable'} />
                )
              }
              href={path}
              onPress={(event) => open(event, path)}
            />
          )
        })}
      </ListGroup>
    ) : null

  const filteredOut = projectsFilteredOut ? (
    <StateMessage
      kind="empty"
      message={t(($) => $.search.categoryEmpty)}
      actions={[{ label: t(($) => $.search.clearCategory), onPress: () => chooseAll() }]}
    />
  ) : null

  const memberList =
    data && shows('members') ? (
      <ListGroup title={t(($) => $.search.tabs.members)}>
        {data.members.items.map((member) => {
          const path = `/members/${member.id}`
          const meta = t(($) => $.search.memberMeta, {
            handle: member.handle,
            followers: t(($) => $.follow.followers, { count: member.followerCount }),
          })
          return (
            <ListRow
              key={member.id}
              label={member.name}
              // La photo (ou les initiales) : un repère pour l'œil, comme sur la planche. Sans
              // nom à elle : le nom de la ligne dit déjà qui c'est.
              leading={
                <Avatar name={member.name} source={toSource(member.avatarUrl)} label="" size={40} />
              }
              title={<HighlightedText text={member.name} words={words} weight={600} />}
              detail={<HighlightedText variant="callout" tone="muted" text={meta} words={words} />}
              hint={meta}
              trailing="chevron"
              href={path}
              onPress={(event) => open(event, path)}
            />
          )
        })}
      </ListGroup>
    ) : null

  const toolList =
    data && shows('tools') ? (
      <ListGroup title={t(($) => $.search.tabs.tools)}>
        {data.tools.items.map((tool) => {
          const path = `/tags/${encodeURIComponent(tool.slug)}`
          const projects = t(($) => $.tools.projects, { count: tool.projectCount })
          return (
            <ListRow
              key={tool.slug}
              // R6b : un outil du catalogue, nommé par son nom normé (« ChatGPT »), même quand
              // c'est un de ses alias (« Chat GPT ») qui a correspondu.
              label={tool.name}
              title={<HighlightedText text={tool.name} words={words} weight={600} />}
              // La tuile à l'initiale, comme dans « Tous les outils » (ToolsScreen) : même outil,
              // même teinte d'une page à l'autre.
              leading={<InitialTile name={tool.name} variant={tileVariantOf(tool.slug)} />}
              detail={projects}
              spokenLabel={t(($) => $.tools.withCount, { label: tool.name, projects })}
              trailing="chevron"
              href={path}
              onPress={(event) => open(event, path)}
            />
          )
        })}
      </ListGroup>
    ) : null

  // --- R16 : les résultats en grand (dès 1 280 points).
  // Les projets en cartes compactes, chacune un lien vers le projet (`SummaryCard`, comme « Récents »
  // d'Explorer), dans une grille qui compte ses colonnes selon sa place. Chaque carte dit pourquoi
  // elle est trouvée (planches R16-Recherche-1440 et -1920) : les mots cherchés surlignés dans son
  // titre, et l'extrait de la description quand c'est elle qui a correspondu, comme les lignes.
  const projectCards =
    data && shows('projects') ? (
      <ProjectsSection>
        <ProjectGrid>
          {data.projects.items.map((project) => (
            <SummaryCard
              key={project.id}
              project={project}
              match={{
                words,
                excerpt: project.excerpt
                  ? t(($) => $.search.excerpt, { excerpt: project.excerpt })
                  : null,
              }}
            />
          ))}
        </ProjectGrid>
      </ProjectsSection>
    ) : null
  // Le panneau de droite : les membres et les outils trouvés, sur « Tout », à côté des projets. Sans
  // projet à montrer, ou sur un seul onglet, une seule colonne : rien ne reste vide à gauche.
  const withPanel = tab === 'all' && projectCards !== null && Boolean(memberList || toolList)
  const shownResults = !large ? (
    // Sous 1 280 points, rien ne change : une colonne, les projets, puis les membres et les outils.
    <>
      {projectList}
      {filteredOut}
      {memberList}
      {toolList}
    </>
  ) : searching ? (
    // Pendant la recherche, la forme de la planche R16-Recherche-Squelette-1920.
    <ResultsSkeleton />
  ) : withPanel ? (
    <Columns
      sideWidth="panel"
      main={projectCards}
      side={
        <SidePanel>
          {memberList}
          {toolList}
        </SidePanel>
      }
    />
  ) : (
    <>
      {projectCards}
      {filteredOut}
      {/* Un seul groupe de lignes (onglet « Membres » ou « Outils », ou rien trouvé parmi les
          projets) : à la largeur d'une colonne de lecture, pas sur toute la page. */}
      {memberList || toolList ? (
        <Stack gap="lg" align="stretch" readable>
          {memberList}
          {toolList}
        </Stack>
      ) : null}
    </>
  )

  return (
    <SearchPage wide={large}>
      <Stack gap="lg" align="stretch">
        {field}

        <Controls row={large}>
          {(groups && found) || controlsWait ? (
            <Segmented
              label={t(($) => $.search.tabsLabel)}
              value={tab}
              onChange={setTab}
              fill={false}
              options={[
                { value: 'all', label: t(($) => $.search.tabs.all) },
                ...GROUPS.map((group) =>
                  // Pendant la recherche : le vrai nom, une pièce vide à la place du nombre.
                  controlsWait
                    ? { value: group, label: t(($) => $.search.tabs[group]), waiting: true }
                    : { value: group, ...tabLabel(group) },
                ),
              ]}
            />
          ) : null}

          {filterShown ? (
            <FilterButton
              ref={categoryButton}
              label={filterLabel}
              spokenLabel={
                chosen ? t(($) => $.search.categoryChosen, { name: chosen.name }) : filterLabel
              }
              icon={chosen ? chosen.icon : 'squares-four'}
              onPress={openSheet}
            />
          ) : null}
        </Controls>

        {/* Rien trouvé : « 0 projet, 0 membre, 0 outil » reste lu, mais ne se montre pas au-dessus
            de « Aucun résultat », qui le dit déjà à l'œil (relecture de design, 13). */}
        <LiveStatus message={status} visible={!nothingFound} />

        {failed ? (
          errorKey(shownError) === 'rateLimited' ? (
            <StateMessage
              kind="error"
              title={t(($) => $.search.tooManyTitle)}
              message={t(($) => $.search.tooMany)}
              actions={[{ label: t(($) => $.common.retry), onPress: onRetry, loading: retrying }]}
            />
          ) : (
            <StateMessage
              kind="error"
              title={t(($) => $.search.errorTitle)}
              actions={[{ label: t(($) => $.common.retry), onPress: onRetry, loading: retrying }]}
            />
          )
        ) : null}

        {nothingFound ? (
          // Rien trouvé : l'abeille à la loupe, et le texte cherché tel quel (les traductions ne
          // l'interprètent pas : i18n.ts neutralise les « {{ » des valeurs). Sous 3 lettres, le
          // conseil « Essaie un mot plus court » serait faux : la phrase dit plutôt qu'avec un mot
          // plus long, on trouve aussi les membres qu'on ne suit pas.
          <StateMessage
            kind="notFound"
            title={t(($) => $.search.emptyTitle, { q: query.trim() })}
            message={onlyFollowed ? t(($) => $.search.shortQuery) : t(($) => $.search.empty)}
          />
        ) : null}

        {shownResults}
      </Stack>
      <CategoryFilterSheet
        open={sheetOpen}
        categories={choices}
        value={category}
        onChange={chooseCategory}
        onClose={closeSheet}
      />
    </SearchPage>
  )
}

/**
 * Les onglets et le filtre des catégories : l'un sous l'autre, comme aujourd'hui ; en grand, sur une
 * même ligne (planche R16-Recherche-1920). Rien à montrer (pas de résultat, pas de filtre) : rien,
 * pas même une ligne vide qui ajouterait un écart dans la page.
 */
function Controls({ row, children }: { row: boolean; children: ReactNode }) {
  if (Children.toArray(children).length === 0) return null
  if (!row) return children
  return (
    <Row gap="md" align="center" wrap>
      {children}
    </Row>
  )
}

/** Un groupe vide, pour dire « 0 projet, 0 membre, 0 outil » sans réponse de l'API. */
const none = { items: [], more: false }

/** Le nombre de résultats de chaque groupe, et s'il y en avait plus de 20. */
const results = (data: SearchResults) => ({
  projects: { count: data.projects.items.length, more: data.projects.more },
  members: { count: data.members.items.length, more: data.members.more },
  tools: { count: data.tools.items.length, more: data.tools.more },
})
