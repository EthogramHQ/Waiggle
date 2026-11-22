// La page d'Explorer sans ses données, sortie d'ExploreScreen.tsx en R18 : son gabarit
// (`ExploreLayout` : le haut de la page, puis les sections à leur place selon la largeur), les
// pièces vides de chaque section (R16, planche R16-Explorer-Listes) et l'attente entière
// (`ExploreWaiting`).
//
// Pourquoi un module à part (relecture de design de R18) : l'écran d'Explorer se charge à la
// demande (app/explore.tsx, `lazyScreen`), et pendant l'arrivée de son morceau la route montrait le
// squelette commun, une grille plus étroite que la page : sur ordinateur, la barre du haut rétrécissait
// puis se réélargissait sous la souris. La route montre maintenant cette attente-ci, la même que
// pendant la lecture de la session. Elle part dans le script de départ avec la route : ce module
// n'importe donc rien de l'écran, ni ses lectures de l'API.
import { useRouter } from 'expo-router'
import { createContext, type ReactNode, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { NewsPlace } from '../feed/FeedList'
import { TopNav } from '../navigation/TopNav'
import { Carousel, CarouselShapes } from '../ui/Carousel'
import { Columns } from '../ui/Columns'
import { FilterPills } from '../ui/FilterPills'
import { ListGroup, ListRowSkeleton } from '../ui/ListGroup'
import { GridCardsContext } from '../ui/ProjectGrid'
import { Screen } from '../ui/Screen'
import { SearchLink } from '../ui/SearchLink'
import { SHOWCASE_CARD_SHADOW, ShowcaseCardSkeleton } from '../ui/ShowcaseCard'
import { SidePanel } from '../ui/SidePanel'
import { Loading, SkeletonCards } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { TagSkeleton } from '../ui/Tag'
import { TesterCardSkeleton } from '../ui/TesterCard'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { useLayout } from '../ui/theme/layout'
/**
 * R15 : dans le panneau, moins de lignes que dans les carrousels (planche R15-Explorer-1920 :
 * quatre projets, six outils). Le panneau reste en place au défilement seulement s'il tient dans la
 * fenêtre : à 1 920 × 1 080, les dix outils l'en empêcheraient.
 */
export const PANEL_TESTERS = 4
export const PANEL_TOOLS = 6

/** R16 (plan, choix 11) : les cartes vides d'une bande d'Explorer, trois, comme sur la planche. */
const BAND_SKELETONS = 3
/** Les étiquettes vides d'« Outils populaires », en bande : assez pour la remplir sur téléphone. */
const TAG_SKELETONS = 6
/**
 * R16 : les pastilles vides des catégories de « Récents », après « Toutes » : dix, comme une dizaine
 * de vraies catégories (deux lignes à 1 440 et à 1 920 points, une à 2 560).
 */
const CATEGORY_SKELETONS = 10

/** Rien à faire : « Toutes », pendant la lecture de la session, ne filtre encore rien. */
const noop = () => {}

type LayoutProps = {
  /** « À la une ». */
  featured: ReactNode
  /** « Ils cherchent des testeurs », en carrousel ou, dans le panneau, en lignes (`rows`). */
  testers: (rows: boolean) => ReactNode
  /** « Outils populaires », de même. */
  tools: (rows: boolean) => ReactNode
  /** « Récents ». */
  recent: ReactNode
  /** Ce qui enveloppe les sections (le « Chargement… » unique de la page qui attend la session). */
  wrap?: (sections: ReactNode) => ReactNode
}

/**
 * La page d'Explorer, sans ses données : son haut, puis ses sections à leur place selon la largeur.
 * La même pour la page qui attend la session (`ExploreWaiting`) et pour celle du membre : rien ne
 * bouge quand l'une remplace l'autre.
 */
export function ExploreLayout({
  featured,
  testers,
  tools,
  recent,
  wrap = (node) => node,
}: LayoutProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { sizeClass, xwide } = useLayout()
  const compact = sizeClass === 'compact'
  // R15 : le panneau dès 1 536 points. `useLayout` donne une largeur de 0 tant que la page web n'est
  // pas hydratée (`useHydrated`) : la page pré-rendue, qui ne connaît pas la fenêtre, est donc celle
  // sans panneau, et le premier affichage du navigateur la reprend sans écart.
  const withPanel = xwide
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
      {wrap(
        withPanel ? (
          // Le panneau à droite, lu après « Récents » (comme celui du Fil) ; il reste en place au
          // défilement (`sticky`) ; plus haut que la fenêtre, une fois son pied atteint.
          <Columns
            sideWidth="panel"
            sticky
            main={
              <Stack gap="xl">
                {featured}
                {recent}
              </Stack>
            }
            side={
              <SidePanel>
                {testers(true)}
                {tools(true)}
              </SidePanel>
            }
          />
        ) : (
          // L'écart des sections est celui de la colonne de `Screen` : une seule pile, pour que la
          // page qui attend la session (posée dans un seul « Chargement… ») ait les mêmes places.
          <Stack gap="xl">
            {featured}
            {testers(false)}
            {tools(false)}
            {recent}
          </Stack>
        ),
      )}
    </Screen>
  )
}

/**
 * R16 : vrai dans la page qui attend la session. Elle est une seule zone qui charge, sous un seul
 * « Chargement… » (comme toute page gardée, `sessionError.test.tsx`) : ses sections posent alors
 * leurs pièces sans `Loading` à elles.
 */
const WholePageLoading = createContext(false)

/** Les pièces d'une section qui charge, sous son « Chargement… », sauf dans la page entière. */
function SectionLoading({ children, shown }: { children: ReactNode; shown: boolean }) {
  if (useContext(WholePageLoading)) return children
  return <Loading shown={shown}>{children}</Loading>
}

/**
 * R16 : Explorer pendant la lecture de la session, aux places d'Explorer (planche
 * R16-Explorer-Listes). Rien n'y lit l'API : on ne sait pas encore qui regarde.
 */
export function ExploreWaiting() {
  return (
    <ExploreLayout
      featured={<FeaturedSkeleton />}
      testers={(rows) => <TestersSkeleton rows={rows} />}
      tools={(rows) => <PopularToolsSkeleton rows={rows} />}
      recent={<RecentSkeleton />}
      wrap={(sections) => (
        <Loading>
          <WholePageLoading.Provider value={true}>{sections}</WholePageLoading.Provider>
        </Loading>
      )}
    />
  )
}

/** Le titre d'une section d'Explorer : le vrai, lu, hors de tout « Chargement… ». */
export function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="heading" heading={2}>
      {children}
    </Text>
  )
}

/**
 * Les cartes vides d'une bande, sous un seul « Chargement… » : une seule case de la bande, à
 * l'écart des vraies cartes, celui que donne le carrousel lui-même (`CarouselShapes`) : jamais
 * recopié ici, il ne peut pas s'en écarter.
 */
function BandSkeleton({
  children,
  shown = false,
  chips = false,
}: {
  children: ReactNode
  shown?: boolean
  chips?: boolean
}) {
  return (
    <SectionLoading shown={shown}>
      <CarouselShapes variant={chips ? 'chips' : 'cards'}>{children}</CarouselShapes>
    </SectionLoading>
  )
}

/**
 * Des lignes vides dans le groupe blanc d'une vraie liste, sous un seul « Chargement… » : le
 * panneau des grands écrans (planche R16-Explorer-Listes : une vignette carrée, puis « Tester » ou
 * le nombre de projets à droite).
 */
function RowsSkeleton({
  count,
  trailing,
  shown = false,
}: {
  count: number
  trailing: 'pill' | 'line'
  shown?: boolean
}) {
  return (
    <SectionLoading shown={shown}>
      <ListGroup>
        {Array.from({ length: count }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: des lignes identiques, jamais réordonnées.
          <ListRowSkeleton key={index} leading="square" trailing={trailing} />
        ))}
      </ListGroup>
    </SectionLoading>
  )
}

/**
 * R16 : « À la une » qui se lit : son titre et sa bande, en cartes vides aux mesures des vraies.
 * `shown` : montrées tout de suite (elles prennent la suite du squelette de la session).
 */
export function FeaturedSkeleton({ shown = false }: { shown?: boolean }) {
  return (
    <FeaturedBand>
      <BandSkeleton key="loading" shown={shown}>
        {Array.from({ length: BAND_SKELETONS }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: des cartes vides, jamais réordonnées.
          <ShowcaseCardSkeleton key={index} column={index} />
        ))}
      </BandSkeleton>
    </FeaturedBand>
  )
}

/** R16 : « Ils cherchent des testeurs » qui se lit, en carrousel ou en lignes (`rows`). */
export function TestersSkeleton({ rows, shown = false }: { rows: boolean; shown?: boolean }) {
  const { t } = useTranslation()
  const title = <SectionTitle>{t(($) => $.explore.testers)}</SectionTitle>
  if (rows) {
    return (
      <Stack gap="md" align="stretch">
        {title}
        <RowsSkeleton count={PANEL_TESTERS} trailing="pill" shown={shown} />
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
      <BandSkeleton key="loading" shown={shown}>
        {Array.from({ length: BAND_SKELETONS }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: des cartes vides, jamais réordonnées.
          <TesterCardSkeleton key={index} column={index} />
        ))}
      </BandSkeleton>
    </Carousel>
  )
}

/** R16 : « Outils populaires » qui se lit, en bande d'étiquettes ou en lignes (`rows`). */
export function PopularToolsSkeleton({ rows, shown = false }: { rows: boolean; shown?: boolean }) {
  const { t } = useTranslation()
  const { header, allTools } = usePopularToolsHeader(rows)
  if (rows) {
    return (
      <Stack gap="md" align="stretch">
        {header}
        <RowsSkeleton count={PANEL_TOOLS} trailing="line" shown={shown} />
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
      <BandSkeleton key="loading" shown={shown} chips>
        {Array.from({ length: TAG_SKELETONS }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: des étiquettes vides, jamais réordonnées.
          <TagSkeleton key={index} index={index} />
        ))}
      </BandSkeleton>
    </Carousel>
  )
}

/**
 * R16 : « Récents » pendant la lecture de la session : son titre, puis les cartes vides que dessine
 * le fil « Découvrir » en attendant ses projets (`DiscoverFeed`), aux colonnes des compactes.
 */
function RecentSkeleton() {
  const { t } = useTranslation()
  return (
    <GridCardsContext.Provider value="compact">
      <Stack gap="md">
        <SectionTitle>{t(($) => $.explore.recent)}</SectionTitle>
        {/* Les places de « Récents » qui charge (`Recent`) : la rangée des catégories, puis la
            place du bouton des nouveautés et les cartes, au même écart que le fil (`DiscoverFeed`). */}
        <CategoriesWaiting category={null} onChange={noop} />
        <Stack gap="lg">
          <NewsPlace />
          <SectionLoading shown={false}>
            <SkeletonCards count={3} shape="feed" />
          </SectionLoading>
        </Stack>
      </Stack>
    </GridCardsContext.Provider>
  )
}

/**
 * R16 : la rangée des catégories pendant leur lecture (ou celle de la session) : le vrai « Toutes »,
 * qui se touche déjà, puis des pastilles vides à la place des catégories à venir, sur une ligne qui
 * défile (téléphone) ou qui passe à la ligne (ordinateur), comme la vraie.
 */
export function CategoriesWaiting({
  category,
  onChange,
}: {
  category: string | null
  onChange: (code: string | null) => void
}) {
  const { t } = useTranslation()
  const compact = useLayout().sizeClass === 'compact'
  return (
    <FilterPills
      label={t(($) => $.explore.categoriesLabel)}
      allLabel={t(($) => $.explore.allCategories)}
      value={category}
      options={[]}
      waiting={CATEGORY_SKELETONS}
      scroll={compact}
      onChange={onChange}
    />
  )
}

/** La bande d'« À la une », avec son titre : la même pour les cartes vides et les vraies. */
export function FeaturedBand({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Carousel
      label={t(($) => $.explore.featured)}
      previousLabel={t(($) => $.explore.featuredPrevious)}
      nextLabel={t(($) => $.explore.featuredNext)}
      header={<SectionTitle>{t(($) => $.explore.featured)}</SectionTitle>}
      bleed
      cardShadow={SHOWCASE_CARD_SHADOW}
    >
      {children}
    </Carousel>
  )
}

/**
 * Le titre d'« Outils populaires » et son lien « Tous les outils » : à côté du titre dans la bande
 * (à 200 %, le lien passe dessous), sous la liste dans le panneau (`rows`).
 */
export function usePopularToolsHeader(rows: boolean) {
  const { t } = useTranslation()
  const router = useRouter()
  const title = <SectionTitle>{t(($) => $.explore.popularTools)}</SectionTitle>
  const allTools = (
    <TextLink label={t(($) => $.explore.allTools)} onPress={() => router.push('/tools')} />
  )
  const header = rows ? (
    title
  ) : (
    <Stack direction="row" gap="md" align="center" justify="between" wrap>
      {title}
      {allTools}
    </Stack>
  )
  return { header, allTools: rows ? allTools : null }
}
