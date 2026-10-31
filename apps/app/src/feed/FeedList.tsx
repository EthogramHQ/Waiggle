// Les morceaux d'un fil de projets, partagés par le Fil (l'accueil d'un membre) et Explorer : la
// liste des cartes avec son bandeau des nouveautés et sa fin, l'erreur d'un fil qui n'a pas pu se
// charger, et le fil « Découvrir » (tous les projets publics, ou ceux qui cherchent des testeurs).
// Ils ont quitté `HomeScreen.tsx` tels quels en R3, quand « Découvrir » est parti dans Explorer.
import { FEED_PAGE_SIZE, type FeedItem, type ProjectSummary } from '@ruche/contracts'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { errorKey } from '../api/errors'
import { FeedNoteCard } from '../notes/FeedNoteCard'
import { SummaryCard } from '../projects/SummaryCard'
import { FeedEnd } from '../ui/FeedEnd'
import { NewItemsBanner } from '../ui/NewItemsBanner'
import { Notice } from '../ui/Notice'
import { ProjectGrid } from '../ui/ProjectGrid'
import { SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { useDiscoverFeed, useFeedNews } from './api'
import { feedItemId } from './items'

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
 */
export function DiscoverFeed({
  overlay,
  errorMessage,
}: {
  overlay?: CardOverlay
  /** Le message d'une section en panne (voir FeedError, `section`) : ce fil n'est qu'une section. */
  errorMessage?: string
}) {
  const { t } = useTranslation()
  const feed = useDiscoverFeed({ testers: false })
  const pages = feed.data?.pages ?? []
  const items = pages.flatMap((page) => page.items)
  const news = useFeedNews('discover', items[0], false)
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
      feed={feed}
      items={items}
      news={news}
      empty={t(($) => $.feed.discoverEmpty)}
      caption={t(($) => $.feed.discoverCaption)}
      overlay={overlay ? (project) => overlay(project, followed) : undefined}
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

type FeedListProps = {
  feed: LoadedFeed
  items: FeedItem[]
  news: { count: number | null; more: boolean }
  /** Le message d'un fil vide. */
  empty: string
  /** La phrase en haut du fil, qui dit ce qu'il montre (remplacée par le bandeau des nouveautés). */
  caption: string
  /** Ce qui se pose sur la photo de la carte d'un projet (pas sur celle d'une note). */
  overlay?: ((project: ProjectSummary) => ReactNode) | undefined
}

/** Les cartes d'un fil, le bandeau des nouveautés au-dessus, et la fin du fil en dessous. */
export function FeedList({ feed, items, news, empty, caption, overlay }: FeedListProps) {
  const { t } = useTranslation()
  return (
    <Stack gap="lg">
      {/* Toujours là, à la même hauteur : le bandeau y remplace la phrase, sans rien décaler. */}
      <NewItemsBanner
        label={
          news.count === null
            ? null
            : news.more
              ? t(($) => $.feed.newsMany, { max: FEED_PAGE_SIZE })
              : t(($) => $.feed.news, { count: news.count })
        }
        // Relire le fil depuis le début : les nouveautés arrivent en haut, à la place du bandeau.
        onPress={() => feed.refetch()}
        caption={caption}
      />
      {/* La relecture du fil a échoué : on le dit, les cartes déjà là restent. */}
      {feed.isRefetchError ? <Notice message={t(($) => $.errors[errorKey(feed.error)])} /> : null}
      <ProjectGrid empty={empty}>
        {/* Un nouveau projet : sa carte ; la note d'un projet suivi : une carte de note, plus
            discrète, qui mène elle aussi au projet. */}
        {items.map((item) =>
          item.kind === 'note' ? (
            <FeedNoteCard key={feedItemId(item)} note={item.note} project={item.project} />
          ) : (
            <SummaryCard
              key={feedItemId(item)}
              project={item.project}
              at={item.at}
              overlay={overlay?.(item.project)}
            />
          ),
        )}
      </ProjectGrid>
      {items.length > 0 ? (
        <FeedEnd
          state={
            feed.isFetchingNextPage
              ? 'loading'
              : feed.isFetchNextPageError
                ? 'error'
                : feed.hasNextPage
                  ? 'more'
                  : 'end'
          }
          moreLabel={t(($) => $.feed.more)}
          endLabel={t(($) => $.feed.end)}
          // « Tu es à jour » : le bout du fil est un petit moment de marque, sur le miel vif.
          ambiance="brand"
          errorLabel={t(($) => $.feed.moreError)}
          retryLabel={t(($) => $.common.retry)}
          // Une seule demande à la fois, même après un double clic.
          onMore={() => {
            if (!feed.isFetchingNextPage) void feed.fetchNextPage()
          }}
        />
      ) : null}
    </Stack>
  )
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
