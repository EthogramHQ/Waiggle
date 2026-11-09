// Lire les deux fils de l'accueil, « Abonnements » et « Découvrir », page par page, et guetter les
// nouveautés. Les écrans n'appellent que ces hooks ; les tests les remplacent par de faux résultats.
import {
  DiscoverFeedPage,
  FEED_PAGE_SIZE,
  type FeedItem,
  type FeedPage,
  type FeedReadBody,
  FollowingFeedPage,
  type ProjectSummary,
} from '@ruche/contracts'
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { request, requestWithoutBody } from '../api/client'
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
 * `count` null : rien de neuf. `more` vrai : plus d'une page de nouveautés. R4 : `authors` (qui les
 * a publiées) et `kinds` (projets, notes) pour le bouton des nouveautés.
 *
 * R6a (décision de Louis du 8/11/2026) : ses propres projets entrent dans son fil, mais ne sont
 * jamais une nouveauté pour lui, ni les notes sur ses projets (leur auteur est celui du projet).
 * `viewerId`, l'identifiant du membre connecté, les laisse hors du compte et des visages.
 */
export const useFeedNews = (
  kind: FeedKind,
  first: FeedItem | undefined,
  testers = false,
  viewerId?: string,
): FeedNews => {
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
  const page = head.data
  const firstAt = first?.at
  const firstId = first ? feedItemId(first) : undefined
  // useMemo : le résultat n'est recalculé que si la page relue ou le premier élément affiché
  // changent. Les listes rendues gardent ainsi la même identité d'un rendu à l'autre, et le bouton
  // des nouveautés ne croit pas à une nouvelle arrivée à chaque rendu de l'écran.
  return useMemo(() => newsOf(page, firstAt, firstId, viewerId), [page, firstAt, firstId, viewerId])
}

/** Ce que dit le bouton des nouveautés : combien, s'il y en a plus d'une page, qui, et quoi. */
export type FeedNews = {
  count: number | null
  more: boolean
  /** Les auteurs des nouveautés, 3 au plus, chacun une fois, le plus récent d'abord. */
  authors: ProjectSummary['author'][]
  /** Les sortes de nouveautés (projets, notes), chacune une fois. */
  kinds: FeedItem['kind'][]
}

/** Au plus trois visages sur le bouton des nouveautés (planche R4-Fil). */
const NEWS_AUTHORS_MAX = 3

// Rien de neuf : toujours les mêmes listes vides, pour la même raison que le useMemo plus haut.
const nothingNew: FeedNews = { count: null, more: false, authors: [], kinds: [] }

const newsOf = (
  page: FeedPage | undefined,
  firstAt: string | undefined,
  firstId: string | undefined,
  viewerId: string | undefined,
): FeedNews => {
  const items = page?.items ?? []
  // Plus récent : publié après le premier élément affiché (à date égale, l'API range par
  // identifiant décroissant). Comparer les dates plutôt que chercher l'identifiant : si le premier
  // élément a disparu (passé en privé), on ne croit pas pour autant à 20 nouveautés.
  const above =
    firstAt !== undefined && firstId !== undefined
      ? items.filter(
          (item) => item.at > firstAt || (item.at === firstAt && feedItemId(item) > firstId),
        )
      : items
  // R6a : ce que le membre a publié lui-même (un projet, ou une note sur son projet) n'est jamais
  // une nouveauté pour lui. `more` se lit avant ce tri : une page pleine au-dessus annonce une suite.
  const newer = viewerId ? above.filter((item) => item.project.author.id !== viewerId) : above
  if (newer.length === 0) return nothingNew
  // La page est rangée du plus récent au plus ancien : le premier auteur rencontré est celui de la
  // dernière nouveauté. Une note a pour auteur celui de son projet. Une Map garde l'ordre
  // d'insertion et ne garde qu'une entrée par clé : chaque auteur une fois.
  const authors = new Map<string, ProjectSummary['author']>()
  for (const item of newer) {
    if (authors.size >= NEWS_AUTHORS_MAX) break
    const { author } = item.project
    if (!authors.has(author.id)) authors.set(author.id, author)
  }
  return {
    count: newer.length,
    more: above.length >= FEED_PAGE_SIZE && page?.nextCursor != null,
    authors: [...authors.values()],
    kinds: [...new Set(newer.map((item) => item.kind))],
  }
}

/** PUT /v1/feed/read : le fil est lu jusqu'à `upTo`, le `at` d'un élément affiché. */
export const putFeedRead = async (upTo: string): Promise<void> => {
  const body: FeedReadBody = { upTo }
  const result = await requestWithoutBody('/v1/feed/read', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!result.ok) throw new ApiError(result.error)
}

/**
 * Hook (R4, « Tu es à jour ») : quand la première page du fil s'affiche, dire à l'API jusqu'où le
 * membre a lu. `first` : le premier élément de la **première** page (rien tant qu'elle se charge).
 *
 * La date envoyée est le `at` de cet élément, jamais l'heure de l'appareil : la base garde jusqu'où
 * il a lu, pas quand il était là (relecture juridique J3). Une seule fois par élément, même si le
 * fil se redessine ; de nouveau quand des nouveautés arrivent en haut (après « nouveautés »). Une
 * date plus ancienne que la dernière envoyée ne part pas : le serveur ne recule jamais, inutile de
 * lui écrire pour rien (le premier élément a pu disparaître, passé en privé).
 *
 * Un échec (réseau, quota) ne se dit pas : rien ne change à l'écran, et la prochaine visite
 * marquera le fil lu.
 *
 * R6a : `first` n'est jamais un élément du membre lui-même (ses projets entrent dans son fil) :
 * l'écran donne le premier élément d'un autre (`firstOfOthers` de feed/items.ts). La date de sa
 * propre publication, toute récente, dirait quand il était là plutôt que jusqu'où il a lu (J3).
 */
export const useMarkFeedRead = (first: FeedItem | undefined) => {
  // Un `ref` : une valeur gardée d'un rendu à l'autre, sans redessiner quand elle change. Ici, la
  // dernière date envoyée.
  const sent = useRef<string | null>(null)
  const upTo = first?.at
  useEffect(() => {
    if (upTo === undefined) return
    if (sent.current !== null && upTo <= sent.current) return
    sent.current = upTo
    putFeedRead(upTo).catch(() => {})
  }, [upTo])
}
