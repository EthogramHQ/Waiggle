// Lire les deux fils de l'accueil, « Abonnements » et « Découvrir », page par page, et guetter les
// nouveautés. Les écrans n'appellent que ces hooks ; les tests les remplacent par de faux résultats.
import {
  DiscoverFeedPage,
  FEED_PAGE_SIZE,
  type FeedItem,
  type FeedPage,
  FollowingFeedPage,
} from '@ruche/contracts'
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { request } from '../api/client'
import { ApiError } from '../api/errors'
import { feedItemId } from './items'

export type FeedKind = 'following' | 'discover'

/** Toutes les clés de cache des fils commencent par « feed » : on peut les invalider d'un coup. */
export const feedQueryKey = ['feed'] as const
const keyOf = (kind: FeedKind, testers: boolean) => ['feed', kind, testers] as const

/** Toutes les minutes, l'appli regarde s'il y a du nouveau en haut du fil. */
const NEWS_INTERVAL_MS = 60_000

// L'adresse d'une page. Le curseur est un texte opaque rendu par l'API avec la page précédente ;
// URLSearchParams l'encode : il reste un paramètre, sans pouvoir changer le reste de l'adresse.
const pathOf = (kind: FeedKind, testers: boolean, cursor?: string) => {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  if (kind === 'discover' && testers) params.set('testers', 'true')
  const query = params.toString()
  return `/v1/feed/${kind}${query ? `?${query}` : ''}`
}

/** Une page du fil « Abonnements ». Lève une ApiError en cas d'échec, comme les autres lectures. */
export const getFollowingPage = async (cursor?: string): Promise<FollowingFeedPage> => {
  const result = await request(pathOf('following', false, cursor), {}, FollowingFeedPage)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Une page du fil « Découvrir » (testers : seulement les projets qui cherchent des testeurs). */
export const getDiscoverPage = async (
  testers: boolean,
  cursor?: string,
): Promise<DiscoverFeedPage> => {
  const result = await request(pathOf('discover', testers, cursor), {}, DiscoverFeedPage)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : le fil « Abonnements ». useInfiniteQuery garde les pages déjà lues, dans l'ordre, et sait
 * demander la suivante : getNextPageParam lit le curseur de la dernière page (undefined : c'est
 * fini, hasNextPage devient faux).
 */
export const useFollowingFeed = () =>
  useInfiniteQuery({
    queryKey: keyOf('following', false),
    queryFn: ({ pageParam }) => getFollowingPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

/** Hook : le fil « Découvrir », avec ou sans le filtre des testeurs (un cache par choix). */
export const useDiscoverFeed = ({ testers }: { testers: boolean }) =>
  useInfiniteQuery({
    queryKey: keyOf('discover', testers),
    queryFn: ({ pageParam }) => getDiscoverPage(testers, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

/**
 * Hook : y a-t-il du nouveau au-dessus de ce que le membre voit ? On relit la première page toutes
 * les minutes (et au retour sur l'appli, si elle a plus d'une minute), dans un cache à part : le
 * fil affiché, lui, ne bouge pas. On compte les éléments plus récents que le premier affiché.
 * `count` null : rien de neuf. `more` vrai : plus d'une page de nouveautés.
 */
export const useFeedNews = (kind: FeedKind, first: FeedItem | undefined, testers = false) => {
  const queryClient = useQueryClient()
  const shown = keyOf(kind, testers)
  const head = useQuery({
    queryKey: [...shown, 'head'],
    queryFn: () => (kind === 'following' ? getFollowingPage() : getDiscoverPage(testers)),
    // Au départ, la première page du fil affiché fait l'affaire : pas de requête en double.
    initialData: () => queryClient.getQueryData<InfiniteData<FeedPage>>(shown)?.pages[0],
    initialDataUpdatedAt: () => queryClient.getQueryState(shown)?.dataUpdatedAt,
    // Seulement une fois le fil affiché chargé : la première vérification attend sa minute.
    enabled: queryClient.getQueryState(shown)?.status === 'success',
    staleTime: NEWS_INTERVAL_MS,
    refetchInterval: NEWS_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })
  const items = head.data?.items ?? []
  // Plus récent : publié après le premier élément affiché (à date égale, l'API range par
  // identifiant décroissant). Comparer les dates plutôt que chercher l'identifiant : si le premier
  // élément a disparu (passé en privé), on ne croit pas pour autant à 20 nouveautés.
  const newer = first
    ? items.filter(
        (item) =>
          item.at > first.at || (item.at === first.at && feedItemId(item) > feedItemId(first)),
      )
    : items
  if (newer.length === 0) return { count: null, more: false }
  return {
    count: newer.length,
    more: newer.length >= FEED_PAGE_SIZE && head.data?.nextCursor != null,
  }
}
