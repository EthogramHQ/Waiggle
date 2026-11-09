// Les morceaux d'un fil de projets, partagés par le Fil (l'accueil d'un membre) et Explorer : la
// liste des cartes avec son bouton des nouveautés et sa fin, l'erreur d'un fil qui n'a pas pu se
// charger, et le fil « Découvrir » (tous les projets publics, ou ceux qui cherchent des testeurs).
// Ils ont quitté `HomeScreen.tsx` tels quels en R3, quand « Découvrir » est parti dans Explorer.
//
// R4 : le Fil y gagne « Tu es à jour » (la sphère de miel posée avant le premier élément déjà vu,
// qui coupe le fil en deux listes), la lumière qui suit la carte du milieu de l'écran, et un bouton
// des nouveautés qui montre les visages des auteurs (posé ici sur téléphone, à côté du titre de la
// page sur ordinateur : `FeedNews`).
import type { FeedItem, ProjectSummary } from '@ruche/contracts'
import { type ReactNode, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { FeedNoteCard } from '../notes/FeedNoteCard'
import { SummaryCard } from '../projects/SummaryCard'
import { Arrival } from '../ui/Arrival'
import { FeedEnd, useFirstArrived } from '../ui/FeedEnd'
import { NewItemsBanner } from '../ui/NewItemsBanner'
import { Notice } from '../ui/Notice'
import { ProjectGrid } from '../ui/ProjectGrid'
import { SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { useScrollLight } from '../ui/scrollLight'
import { UpToDate } from '../ui/UpToDate'
import { type FeedNews as News, useDiscoverFeed, useFeedNews } from './api'
import { feedItemId, upToDateIndex } from './items'

/**
 * Ce qu'un écran pose sur la photo d'une carte de projet (`overlay` de SummaryCard) : Explorer y met
 * la pastille « Suivre Nora » (R3). `followedAuthorIds` : les auteurs que le membre suit déjà,
 * d'après les pages lues du fil.
 */
export type CardOverlay = (
  project: ProjectSummary,
  followedAuthorIds: ReadonlySet<string>,
) => ReactNode

/**
 * Le fil « Découvrir » : tous les projets publics, du plus récent au plus ancien (R3 : « Récents »
 * d'Explorer). Le choix « Cherchent des testeurs » a quitté ce fil en R3 : ces projets ont leur
 * carrousel en tête d'Explorer. La suite ne se charge que sur demande, par « Afficher la suite »
 * (relecture juridique de R3, jur-J7 : pas de fil sans fin qui se charge tout seul).
 *
 * R6b : `category` filtre le fil (les pastilles d'Explorer, au-dessus). Changer de filtre change
 * toute la liste, sans que rien n'arrive : la liste repart de zéro pour chaque filtre (une `key`),
 * sans cartes qui tombent en place ni focus rendu à une « première carte arrivée », et les
 * nouveautés comparent la tête du même fil filtré (voir useFeedNews).
 */
export function DiscoverFeed({
  viewerId,
  overlay,
  errorMessage,
  category = null,
  ready = true,
  emptyMessage,
}: {
  /**
   * L'identifiant du membre connecté : R6a, ses propres projets ne comptent jamais comme
   * nouveautés, ici comme dans son fil. Donné par l'écran, qui n'affiche ce fil qu'à un membre
   * (correction C2, ui-C3 : lu ici par `useSession`, il manquait pendant une lecture de la session).
   */
  viewerId: string
  overlay?: CardOverlay
  /** Le message d'une section en panne (voir FeedError, `section`) : ce fil n'est qu'une section. */
  errorMessage?: string
  /** R6b : seulement les projets de cette catégorie (son code) ; `null` : tous. */
  category?: string | null
  /**
   * R6b : faux tant que l'écran ne sait pas encore quel filtre demander (voir useDiscoverFeed,
   * `enabled`) : le fil attend, en squelette, au lieu de lire sans filtre pour rien.
   */
  ready?: boolean
  /**
   * Le message d'un fil vide, s'il n'est pas celui de « Découvrir » (« Aucun projet public pour
   * l'instant. ») : celui d'une catégorie sans projet, nommée par l'écran.
   */
  emptyMessage?: string
}) {
  const { t } = useTranslation()
  const feed = useDiscoverFeed({ testers: false, category, enabled: ready })
  const pages = feed.data?.pages ?? []
  const items = pages.flatMap((page) => page.items)
  const news = useFeedNews('discover', items[0], false, viewerId, category)
  // Les auteurs suivis, d'après chaque page lue (l'API le dit page par page, pour ses auteurs).
  // `?? []` : une page sans ce champ (un faux fil de test, une ancienne réponse) n'en suit aucun.
  const followed = new Set(pages.flatMap((page) => page.followedAuthorIds ?? []))

  return !feed.data ? (
    feed.isError ? (
      <FeedError error={feed.error} onRetry={() => void feed.refetch()} section={errorMessage} />
    ) : (
      <SkeletonList count={3} />
    )
  ) : (
    <FeedList
      // Une liste neuve par filtre : sa mémoire des cartes déjà vues (useArrivals) est celle de ce
      // filtre. Sans elle, revenir à « Toutes », déjà lue, ferait tomber toutes ses cartes comme
      // des nouveautés. « ~ » ne peut pas être dans un code de catégorie.
      key={category ?? '~'}
      feed={feed}
      items={items}
      news={
        <FeedNews
          news={news}
          onPress={() => feed.refetch()}
          caption={t(($) => $.feed.discoverCaption)}
        />
      }
      empty={emptyMessage ?? t(($) => $.feed.discoverEmpty)}
      overlay={overlay ? (project) => overlay(project, followed) : undefined}
    />
  )
}

type FeedNewsProps = {
  /** Ce que dit `useFeedNews` : combien, s'il y en a plus d'une page, qui, et quoi. */
  news: News
  /** Relire le fil depuis le début : les nouveautés arrivent en haut. */
  onPress: () => unknown
  /** La phrase qui dit ce que montre le fil, à la place du bouton quand rien n'est neuf. */
  caption?: string | undefined
}

/**
 * Le bouton des nouveautés d'un fil, branché : les photos des auteurs passent de l'adresse de l'API
 * à une image qu'on peut dessiner (`useMediaSources`). Le Fil le pose à côté de son titre sur
 * ordinateur (`titleAside` de Screen), et en tête de la liste sur téléphone, où le logo remplace le
 * titre.
 */
export function FeedNews({ news, onPress, caption }: FeedNewsProps) {
  const toSource = useMediaSources()
  const authors = news.authors.map((author) => ({
    name: author.name,
    source: toSource(author.avatarUrl),
  }))
  return (
    <NewItemsBanner
      count={news.count}
      more={news.more}
      kinds={news.kinds}
      authors={authors}
      onPress={onPress}
      {...(caption ? { caption } : null)}
    />
  )
}

// Ce dont la liste a besoin d'un fil chargé (une partie du résultat de useInfiniteQuery).
type LoadedFeed = {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  /** La dernière demande de suite a échoué (les pages déjà lues restent). */
  isFetchNextPageError?: boolean
  /** La dernière relecture du fil a échoué (après le bandeau des nouveautés). */
  isRefetchError?: boolean
  error?: unknown
  fetchNextPage: () => Promise<unknown>
  refetch: () => Promise<unknown>
}

// Le message d'un fil vide (`empty`) ou « Tu es à jour » (`upToDate`), l'un ou l'autre, jamais les
// deux (relecture de l'interface de R4) : un fil vide du Fil finit sur « Tu es à jour », jamais sur
// un message de fil vide, qui ne serait donc jamais affiché. `never` : TypeScript refuse qu'un
// écran donne les deux.
type FeedListProps = {
  feed: LoadedFeed
  items: FeedItem[]
  /**
   * Le haut du fil : le bouton des nouveautés (`FeedNews`), toujours à la même place. Absent quand
   * l'écran le pose ailleurs (le Fil sur ordinateur, à côté de son titre).
   */
  news?: ReactNode
  /** Ce qui se pose sur la photo de la carte d'un projet (pas sur celle d'une note). */
  overlay?: ((project: ProjectSummary) => ReactNode) | undefined
  /** Le nombre de colonnes de la grille, imposé par l'écran (voir ProjectGrid). */
  columns?: number | undefined
} & (
  | {
      /** Le message d'un fil vide (Explorer, sans « Tu es à jour »). */
      empty: string
      upToDate?: never
    }
  | {
      /**
       * « Tu es à jour » (le Fil, R4) : la date de la dernière lecture, lue sur la première page et
       * figée pour la visite (`useReadBefore`), et ce que fait « Explorer d'autres projets ». Sans
       * elle (Explorer), une seule liste, et la fin ordinaire.
       */
      upToDate: {
        readBefore: string | null
        onExplore: () => void
        /** Cache l'abeille de « Tu es à jour » (le temps de l'avis « Projet publié », H1). */
        hideMascot?: boolean
      }
      empty?: never
    }
)

/**
 * Hook : les éléments qui viennent d'arriver en haut du fil (après « 3 nouveaux projets »), ceux
 * dont la carte tombe en place (`Arrival`, R4).
 *
 * Il retient les éléments déjà affichés (un `useRef` : une mémoire qui survit aux affichages sans
 * en provoquer). Au premier affichage, tous sont déjà là : rien ne bouge. Ensuite, un élément est
 * « arrivé » s'il est nouveau et posé avant le premier élément déjà vu, en haut du fil : la suite
 * (« Afficher la suite », plus ancienne) s'ajoute en bas sans animation. Après chaque affichage,
 * les éléments montrés rejoignent les éléments vus : une carte ne tombe qu'une fois, même si elle
 * est redessinée (une grille qui se recompose à l'arrivée de la suivante).
 */
const useArrivals = (items: readonly FeedItem[]): ReadonlySet<string> => {
  const known = useRef<Set<string> | null>(null)
  // Rempli pendant le premier affichage : aucun rendu ne passe sans cette mémoire.
  if (known.current === null) known.current = new Set(items.map(feedItemId))
  const seen = known.current
  const firstSeen = items.findIndex((item) => seen.has(feedItemId(item)))
  const arrived = items.slice(0, firstSeen === -1 ? items.length : firstSeen).map(feedItemId)
  // Sans liste de dépendances : après chaque affichage, une fois les cartes posées à l'écran.
  useEffect(() => {
    for (const item of items) seen.add(feedItemId(item))
  })
  return new Set(arrived)
}

/**
 * Les cartes d'un fil, le bouton des nouveautés au-dessus, « Tu es à jour » à sa place, et la fin du
 * fil en dessous.
 */
export function FeedList({ feed, items, news, empty, overlay, upToDate, columns }: FeedListProps) {
  const { t } = useTranslation()
  // La lumière suit la carte du milieu de l'écran (R4). Ce hook s'appelle ici, dans un enfant de
  // Screen, jamais dans le corps de l'écran : la lumière d'ambiance est fournie par Screen
  // (relecture de l'interface, ui-B5). Le résumé flou d'une note est celui de son projet.
  const { cardRef } = useScrollLight(
    items.map((item) => ({ id: feedItemId(item), thumbhash: item.project.cover?.thumbhash })),
  )
  const arrivals = useArrivals(items)
  // La première carte arrivée avec la dernière page : sans phrase de fin, le focus du clavier y va
  // quand « Afficher la suite » disparaît (jur-RF2).
  const lastPage = useFirstArrived(items.length, feed.isFetchingNextPage)
  const firstArrivedItem = lastPage.index === null ? undefined : items[lastPage.index]
  const firstArrivedId = firstArrivedItem ? feedItemId(firstArrivedItem) : null

  const cardOf = (item: FeedItem) => {
    const id = feedItemId(item)
    return (
      // La vue que la lumière mesure : la carte entière, à sa place dans la fenêtre. Une carte
      // arrivée par le bouton des nouveautés y tombe en place.
      <Arrival
        key={id}
        ref={cardRef(id)}
        arriving={arrivals.has(id)}
        focusRef={id === firstArrivedId ? lastPage.ref : undefined}
      >
        {/* Un nouveau projet : sa carte ; la note d'un projet suivi : une carte de note, plus
            discrète, qui mène elle aussi au projet. */}
        {item.kind === 'note' ? (
          <FeedNoteCard note={item.note} project={item.project} />
        ) : (
          <SummaryCard project={item.project} at={item.at} overlay={overlay?.(item.project)} />
        )}
      </Arrival>
    )
  }

  // Où se pose la sphère : avant le premier élément déjà vu, au bout, ou nulle part (voir
  // upToDateIndex). Sans `upToDate` (Explorer), nulle part.
  const sphereAt = upToDate ? upToDateIndex(items, upToDate.readBefore, feed.hasNextPage) : null
  const state = feed.isFetchingNextPage
    ? 'loading'
    : feed.isFetchNextPageError
      ? 'error'
      : feed.hasNextPage
        ? 'more'
        : 'end'
  // Le bas du fil reste monté même quand la sphère clôt le fil : depuis RF, il ne dit plus rien à
  // la fin (« Tu es à jour » en petit retiré, T3), mais c'est lui qui rend le focus du clavier à la
  // première carte arrivée quand « Afficher la suite » disparaît (jur-RF2). Démonté, il le
  // laisserait tomber sur toute la page.
  const showEnd = items.length > 0

  return (
    <Stack gap="lg">
      {/* Toujours là, à la même hauteur : le bouton y remplace la phrase, sans rien décaler. */}
      {news}
      {/* La relecture du fil a échoué : on le dit, les cartes déjà là restent. */}
      {feed.isRefetchError ? <Notice message={t(($) => $.errors[errorKey(feed.error)])} /> : null}
      {upToDate ? (
        // Le Fil : deux grilles autour de la sphère, chacune une liste complète (ui-B6). Une grille
        // vide n'est pas dessinée (elle dirait « rien de neuf » au-dessus de « Tu es à jour ») ; un
        // fil vide finit donc sur la sphère seule.
        <>
          {segment(items.slice(0, sphereAt ?? items.length), cardOf, columns)}
          {sphereAt !== null ? (
            <UpToDate
              onExplore={upToDate.onExplore}
              {...(upToDate.hideMascot ? { hideMascot: true } : null)}
            />
          ) : null}
          {sphereAt !== null ? segment(items.slice(sphereAt), cardOf, columns) : null}
        </>
      ) : (
        <ProjectGrid empty={empty} {...(columns ? { columns } : null)}>
          {items.map(cardOf)}
        </ProjectGrid>
      )}
      {showEnd ? (
        <FeedEnd
          state={state}
          moreLabel={t(($) => $.feed.more)}
          errorLabel={t(($) => $.feed.moreError)}
          retryLabel={t(($) => $.common.retry)}
          firstArrived={lastPage.ref}
          // Une seule demande à la fois, même après un double clic.
          onMore={() => {
            if (!feed.isFetchingNextPage) void feed.fetchNextPage()
          }}
        />
      ) : null}
    </Stack>
  )
}

/** Une des deux grilles autour de « Tu es à jour » ; rien quand elle n'a aucun élément. */
function segment(
  items: FeedItem[],
  cardOf: (item: FeedItem) => ReactNode,
  columns: number | undefined,
) {
  if (items.length === 0) return null
  return <ProjectGrid {...(columns ? { columns } : null)}>{items.map(cardOf)}</ProjectGrid>
}

type FeedErrorProps = {
  error: unknown
  onRetry: () => void
  /**
   * Le fil n'est qu'une section de la page (« Récents » d'Explorer) : une notice compacte qui dit
   * ce qui manque (« Les projets récents n'ont pas pu se charger. »), avec « Réessayer » sous la
   * même forme que les autres sections. Sans elle, le fil est toute la page (le Fil) : l'état
   * d'erreur complet, avec son titre et la raison.
   */
  section?: string | undefined
}

/** Un fil qui n'a pas pu se charger : on dit pourquoi, et on propose de réessayer. */
export function FeedError({ error, onRetry, section }: FeedErrorProps) {
  const { t } = useTranslation()
  // Relecture de design de R3 (#3) : Explorer en panne disait deux fois « Le fil n'a pas pu se
  // charger » (le carrousel et « Récents »), avec deux formes de « Réessayer ». Dans une page à
  // plusieurs sections, chacune dit la sienne, dans le même cadre que ses voisines.
  if (section) {
    return (
      <Notice message={section} action={{ label: t(($) => $.common.retry), onPress: onRetry }} />
    )
  }
  return (
    <StateMessage
      kind="error"
      title={t(($) => $.feed.errorTitle)}
      message={t(($) => $.errors[errorKey(error)])}
      // « Réessayer » en blanc : sur l'accueil, la seule action miel reste « Publier un projet »,
      // dans la barre du haut (une seule action miel par écran).
      actions={[{ label: t(($) => $.common.retry), onPress: onRetry, variant: 'secondary' }]}
    />
  )
}
