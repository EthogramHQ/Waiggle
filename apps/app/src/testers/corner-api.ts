// Le coin des testeurs (R7b) : lire le coin, ses appels, ses fils et leurs messages, et tout ce qu'on
// y fait (lancer ou supprimer un appel, écrire ou supprimer un message, régler un retour, marquer un
// fil comme lu, retirer un testeur, envoyer une image). Les écrans n'appellent que ces hooks ; les
// tests les remplacent.
//
// Les écritures suivent la manière de `follows/api.ts` et `updates/api.ts` : ce qu'on retire ou coche
// change dans le cache au toucher (pas dans un `onMutate` asynchrone : un second toucher lirait
// l'ancien état), revient en arrière si l'API refuse, et les lectures sont relues après la dernière
// demande seulement. Ce qu'on crée (un appel, un message) attend la réponse : l'API peut refuser, et
// c'est elle qui donne l'identifiant et la date.
import {
  type NewTesterCall,
  type NewTesterMessage,
  OpenFeedbackList,
  TesterCall,
  TesterCallPage,
  TesterCorner,
  TesterMedia,
  type TesterMediaKind,
  TesterMessage,
  TesterMessagePage,
  TesterThreadPage,
  type TesterThreadState,
} from '@ruche/contracts'
import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { ApiError, errorKey } from '../api/errors'
import { appendImage } from '../media/pick'
import { notificationsQueryKey } from '../notifications/api'
import { projectQueryKey } from '../projects/hooks'

/**
 * Pourquoi la dernière demande a échoué, quand réessayer ne servirait à rien :
 * - limited : trop de demandes (429), dont le quota du membre (20 appels en 24 h) ;
 * - callsLimited : les 5 appels du jour du projet sont lancés (429 `project_calls_limited`) ;
 * - expired : la session a expiré (401) ;
 * - invalidPhoto : l'image n'est plus en attente (400 `invalid_photo`) ;
 * - closed : le coin ou le fil est fermé (409 `corner_closed` ou `thread_closed`) ;
 * - full : le fil ou le projet garde déjà 100 images (409 `tester_media_full`).
 * Absent : une autre erreur (réseau, serveur), qu'un nouvel essai peut régler.
 */
export type CornerFailure =
  | 'limited'
  | 'callsLimited'
  | 'expired'
  | 'invalidPhoto'
  | 'closed'
  | 'full'

const reasonOf = (error: unknown): CornerFailure | undefined => {
  if (!error) return undefined
  switch (errorKey(error)) {
    case 'rateLimited':
      // Le même 429 pour deux quotas : celui du projet se lit sur l'indicateur de l'erreur.
      return error instanceof ApiError && error.projectLimit ? 'callsLimited' : 'limited'
    case 'unauthorized':
      return 'expired'
    case 'invalidPhoto':
      return 'invalidPhoto'
    case 'cornerClosed':
    case 'threadClosed':
      return 'closed'
    case 'testerMediaFull':
      return 'full'
    default:
      return undefined
  }
}

// --- Clés de cache et adresses ---

const cornerKey = (projectId: string) => ['tester-corner', projectId] as const
const callsKey = (projectId: string) => ['tester-calls', projectId] as const
// Sans le filtre : « tous les fils de ce projet », pour changer « À traiter » et « Réglés » ensemble.
const threadsKeyOf = (projectId: string) => ['tester-threads', projectId] as const
const threadsKey = (projectId: string, state: TesterThreadState) =>
  [...threadsKeyOf(projectId), state] as const
const messagesKey = (projectId: string, testerId: string) =>
  ['tester-messages', projectId, testerId] as const
const openFeedbackKey = (projectId: string) => ['tester-open-feedback', projectId] as const

// encodeURIComponent : les identifiants restent de simples morceaux de l'adresse (voir projects/api).
const cornerPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}`
const threadPath = (projectId: string, testerId: string) =>
  `${cornerPath(projectId)}/threads/${encodeURIComponent(testerId)}`

// L'adresse d'une page ; le curseur et le filtre restent des paramètres (URLSearchParams les encode).
const withQuery = (path: string, params: Record<string, string | undefined>) => {
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ).toString()
  return query ? `${path}?${query}` : path
}

// Lecture d'une page : lève une ApiError en cas d'échec, comme l'attend React Query.
const read = async <T>(path: string, schema: Parameters<typeof request<T>>[2]): Promise<T> => {
  const result = await request(path, {}, schema)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// Écriture sans contenu en retour (204).
const writeEmpty = async (path: string, method: string): Promise<void> => {
  const result = await requestWithoutBody(path, { method })
  if (!result.ok) throw new ApiError(result.error)
}

type Pages<P> = InfiniteData<P, string | undefined>
const nextCursor = (last: { nextCursor: string | null }) => last.nextCursor ?? undefined

// --- Les lectures ---

/** Hook : le coin du projet (rôle de celui qui regarde, nombre de testeurs, liste pour l'auteur). */
export const useTesterCorner = (projectId: string) =>
  useQuery({
    queryKey: cornerKey(projectId),
    queryFn: () => read(`${cornerPath(projectId)}/testers`, TesterCorner),
  })

/** Hook : les appels du projet, 20 par page, du plus récent au plus ancien. */
export const useCalls = (projectId: string) =>
  useInfiniteQuery({
    queryKey: callsKey(projectId),
    queryFn: ({ pageParam }) =>
      read(withQuery(`${cornerPath(projectId)}/calls`, { cursor: pageParam }), TesterCallPage),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  })

/** Hook : les fils de l'auteur d'un filtre (« À traiter » ou « Réglés »), 20 par page. */
export const useThreads = (projectId: string, state: TesterThreadState) =>
  useInfiniteQuery({
    queryKey: threadsKey(projectId, state),
    queryFn: ({ pageParam }) =>
      read(
        withQuery(`${cornerPath(projectId)}/threads`, { state, cursor: pageParam }),
        TesterThreadPage,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  })

/** Hook : les messages d'un fil, 30 par page, du plus récent au plus ancien (comme l'API). */
export const useThreadMessages = (projectId: string, testerId: string) =>
  useInfiniteQuery({
    queryKey: messagesKey(projectId, testerId),
    queryFn: ({ pageParam }) =>
      read(
        withQuery(`${threadPath(projectId, testerId)}/messages`, { cursor: pageParam }),
        TesterMessagePage,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  })

/** Hook : les retours encore à traiter, pour la partie « Retours réglés » de la feuille de mise à jour. */
export const useOpenFeedback = (projectId: string) =>
  useQuery({
    queryKey: openFeedbackKey(projectId),
    queryFn: () => read(`${cornerPath(projectId)}/feedback/open`, OpenFeedbackList),
  })

// --- Le geste commun aux écritures ---

type Write<Arg, Out> = {
  /** Identifie la file : les gestes d'une même file partent l'un après l'autre. */
  name: string
  projectId: string
  send: (arg: Arg) => Promise<Out>
  /**
   * Les caches (préfixes de clés) que le geste change au toucher : ils sont copiés avant, et remis
   * tels quels si l'API refuse.
   */
  touched?: QueryKey[]
  /** Le changement au toucher, avant tout envoi. */
  touch?: (queryClient: QueryClient, arg: Arg) => void
  /** Ce que la réponse change (ranger l'appel créé en tête). */
  onSuccess?: (queryClient: QueryClient, out: Out, arg: Arg) => void
  /** Les lectures à relire après la dernière demande. */
  refresh?: QueryKey[]
  /** Les lectures seulement marquées périmées (déjà à jour d'après la réponse : relues à l'ouverture). */
  stale?: QueryKey[]
}

type Snapshot = [QueryKey, unknown][]

/**
 * Le geste d'une écriture : annule les lectures en route (elles écraseraient le changement), copie
 * les caches touchés, les change au toucher, envoie, puis rend vrai si l'API a accepté. Refusé : les
 * copies reviennent. `refresh` ne part qu'après la dernière demande (`isMutating` compte encore celle
 * qui finit, d'où « 1 »).
 */
const useCornerWrite = <Arg, Out>(options: Write<Arg, Out>) => {
  const queryClient = useQueryClient()
  // Les options sont écrites en ligne dans chaque hook : on garde les dernières, pour que `run` reste
  // le même d'un rendu à l'autre.
  const latest = useRef(options)
  latest.current = options
  const mutationKey = ['tester-corner-write', options.projectId, options.name]

  const mutation = useMutation({
    mutationKey,
    mutationFn: ({ arg }: { arg: Arg; snapshot: Snapshot }) => latest.current.send(arg),
    scope: { id: mutationKey.join(':') },
    onSuccess: (out, { arg }) => latest.current.onSuccess?.(queryClient, out, arg),
    onError: (_error, { snapshot }) => {
      for (const [key, data] of snapshot) queryClient.setQueryData(key, data)
    },
    onSettled: () => {
      const { refresh = [], stale = [] } = latest.current
      for (const queryKey of stale)
        void queryClient.invalidateQueries({ queryKey, refetchType: 'none' })
      if (queryClient.isMutating({ mutationKey }) > 1) return
      for (const queryKey of refresh) void queryClient.invalidateQueries({ queryKey })
    },
  })
  const { mutateAsync } = mutation

  const run = useCallback(
    async (arg: Arg) => {
      const { touched = [], touch } = latest.current
      const snapshot: Snapshot = []
      for (const prefix of touched) {
        void queryClient.cancelQueries({ queryKey: prefix })
        snapshot.push(...queryClient.getQueriesData({ queryKey: prefix }))
      }
      // Au toucher, avant tout envoi : un second toucher lit déjà le nouvel état.
      touch?.(queryClient, arg)
      try {
        await mutateAsync({ arg, snapshot })
        return true
      } catch {
        return false
      }
    },
    [queryClient, mutateAsync],
  )
  return {
    run,
    pending: mutation.isPending,
    error: mutation.isError,
    reason: reasonOf(mutation.error),
  }
}

// Change chaque page d'une liste en cache (retirer un élément, en modifier un).
const mapPages = <P extends { items: unknown[] }>(
  queryClient: QueryClient,
  key: QueryKey,
  change: (page: P) => P,
) => {
  queryClient.setQueriesData<Pages<P>>({ queryKey: key }, (cache) =>
    cache ? { ...cache, pages: cache.pages.map(change) } : cache,
  )
}

// Range un élément neuf en tête de la première page.
const prepend = <P extends { items: unknown[] }>(
  queryClient: QueryClient,
  key: QueryKey,
  item: P['items'][number],
) => {
  queryClient.setQueriesData<Pages<P>>({ queryKey: key }, (cache) => {
    const [first, ...others] = cache?.pages ?? []
    return cache && first
      ? { ...cache, pages: [{ ...first, items: [item, ...first.items] }, ...others] }
      : cache
  })
}

// --- Les écritures ---

/**
 * Hook : retirer un testeur (l'auteur, après confirmation). `remove` rend vrai si l'API a accepté ;
 * le testeur quitte la liste et le compte au toucher, et revient si l'API refuse.
 */
export const useRemoveTester = (projectId: string) => {
  const { run, ...state } = useCornerWrite<string, void>({
    name: 'remove-tester',
    projectId,
    send: (memberId) =>
      writeEmpty(`${cornerPath(projectId)}/testers/${encodeURIComponent(memberId)}`, 'DELETE'),
    touched: [cornerKey(projectId)],
    touch: (queryClient, memberId) =>
      queryClient.setQueryData<TesterCorner>(cornerKey(projectId), (corner) => {
        if (!corner?.testers?.some((one) => one.id === memberId)) return corner
        return {
          ...corner,
          testers: corner.testers.filter((one) => one.id !== memberId),
          testerCount: corner.testerCount === null ? null : Math.max(0, corner.testerCount - 1),
        }
      }),
    // Le projet porte aussi le nombre de testeurs (« 12 testeurs »), et le fil du testeur change d'état.
    refresh: [cornerKey(projectId), projectQueryKey(projectId), threadsKeyOf(projectId)],
  })
  return { remove: run, ...state }
}

/**
 * Hook : lancer un appel (l'auteur). `send` rend vrai si l'API l'a accepté ; l'appel se range en tête
 * des appels dès la réponse.
 */
export const useSendCall = (projectId: string) => {
  const { run, ...state } = useCornerWrite<NewTesterCall, TesterCall>({
    name: 'send-call',
    projectId,
    send: async (call) => {
      const result = await request(`${cornerPath(projectId)}/calls`, json('POST', call), TesterCall)
      if (!result.ok) throw new ApiError(result.error, result.projectLimit === true)
      return result.data
    },
    onSuccess: (queryClient, created) =>
      prepend<TesterCallPage>(queryClient, callsKey(projectId), created),
    // La liste vient d'être mise à jour d'après la réponse : relue à la prochaine ouverture seulement.
    stale: [callsKey(projectId)],
  })
  return { send: run, ...state }
}

/** Hook : supprimer un appel (l'auteur). Il quitte la liste au toucher et revient si l'API refuse. */
export const useDeleteCall = (projectId: string) => {
  const { run, ...state } = useCornerWrite<string, void>({
    name: 'delete-call',
    projectId,
    send: (callId) =>
      writeEmpty(`${cornerPath(projectId)}/calls/${encodeURIComponent(callId)}`, 'DELETE'),
    touched: [callsKey(projectId)],
    touch: (queryClient, callId) =>
      mapPages<TesterCallPage>(queryClient, callsKey(projectId), (page) => ({
        ...page,
        items: page.items.filter((one) => one.id !== callId),
      })),
    refresh: [callsKey(projectId)],
  })
  return { remove: run, ...state }
}

/**
 * Hook : écrire dans le fil d'un testeur (un retour ou une réponse). `send` rend vrai si l'API l'a
 * accepté ; le message se range en tête du fil dès la réponse, et la liste des fils est relue (son
 * extrait et sa date changent).
 */
export const useSendMessage = (projectId: string, testerId: string) => {
  const { run, ...state } = useCornerWrite<NewTesterMessage, TesterMessage>({
    name: `send-message:${testerId}`,
    projectId,
    send: async (message) => {
      const result = await request(
        `${threadPath(projectId, testerId)}/messages`,
        json('POST', message),
        TesterMessage,
      )
      if (!result.ok) throw new ApiError(result.error)
      return result.data
    },
    onSuccess: (queryClient, created) =>
      prepend<TesterMessagePage>(queryClient, messagesKey(projectId, testerId), created),
    stale: [messagesKey(projectId, testerId)],
    refresh: [threadsKeyOf(projectId)],
  })
  return { send: run, ...state }
}

/**
 * Hook : supprimer son propre message. Il quitte le fil au toucher et revient si l'API refuse.
 * `testerId` désigne le fil à changer.
 */
export const useDeleteMessage = (projectId: string, testerId: string) => {
  const { run, ...state } = useCornerWrite<string, void>({
    name: `delete-message:${testerId}`,
    projectId,
    send: (messageId) =>
      writeEmpty(`${cornerPath(projectId)}/messages/${encodeURIComponent(messageId)}`, 'DELETE'),
    touched: [messagesKey(projectId, testerId)],
    touch: (queryClient, messageId) =>
      mapPages<TesterMessagePage>(queryClient, messagesKey(projectId, testerId), (page) => ({
        ...page,
        items: page.items.filter((one) => one.id !== messageId),
      })),
    refresh: [messagesKey(projectId, testerId), threadsKeyOf(projectId)],
  })
  return { remove: run, ...state }
}

/**
 * Hook : régler un retour (« Marquer comme réglé ») ou le remettre à traiter. « Réglé » paraît au
 * toucher dans tous les fils en cache et revient si l'API refuse. Réglé à la main, un retour n'a
 * pas de mise à jour (`update: null`) : seule la publication d'une mise à jour en donne une.
 */
export const useSettleFeedback = (projectId: string) => {
  const messagesPrefix = ['tester-messages', projectId] as const
  const setSettled = (queryClient: QueryClient, messageId: string, settled: boolean) => {
    const at = new Date().toISOString()
    mapPages<TesterMessagePage>(queryClient, messagesPrefix, (page) => ({
      ...page,
      items: page.items.map((one) =>
        one.id === messageId ? { ...one, settled: settled ? { at, update: null } : null } : one,
      ),
    }))
  }
  const settleWrite = (settled: boolean) => ({
    projectId,
    send: (messageId: string) =>
      writeEmpty(
        `${cornerPath(projectId)}/messages/${encodeURIComponent(messageId)}/settled`,
        settled ? 'POST' : 'DELETE',
      ),
    touched: [messagesPrefix] as QueryKey[],
    touch: (queryClient: QueryClient, messageId: string) =>
      setSettled(queryClient, messageId, settled),
    // Le fil change d'état (« À traiter » ↔ « Réglés ») et la feuille de mise à jour relit ses retours.
    refresh: [messagesPrefix, threadsKeyOf(projectId), openFeedbackKey(projectId)] as QueryKey[],
  })
  // Un seul nom de file pour les deux gestes : « régler » puis « remettre à traiter » partent dans l'ordre.
  const settle = useCornerWrite<string, void>({ name: 'settle', ...settleWrite(true) })
  const unsettle = useCornerWrite<string, void>({ name: 'settle', ...settleWrite(false) })
  return {
    settle: settle.run,
    unsettle: unsettle.run,
    pending: settle.pending || unsettle.pending,
    error: settle.error || unsettle.error,
    reason: settle.reason ?? unsettle.reason,
  }
}

/**
 * Hook : marquer le fil comme lu (à son affichage). Le point « non lu » de sa ligne s'éteint au
 * toucher, dans les deux filtres. Aucune relecture des fils : l'API a posé la même chose.
 */
export const useMarkThreadRead = (projectId: string, testerId: string) => {
  const { run, ...state } = useCornerWrite<void, void>({
    name: `read:${testerId}`,
    projectId,
    send: () => writeEmpty(`${threadPath(projectId, testerId)}/read`, 'POST'),
    touched: [threadsKeyOf(projectId)],
    touch: (queryClient) =>
      mapPages<TesterThreadPage>(queryClient, threadsKeyOf(projectId), (page) => ({
        ...page,
        items: page.items.map((one) =>
          one.tester.id === testerId ? { ...one, unread: false } : one,
        ),
      })),
    // Le compte de la cloche (« non lus ») change : on le relit.
    stale: [notificationsQueryKey],
  })
  return { markRead: useCallback(() => run(), [run]), ...state }
}

// --- Les images ---

/**
 * Hook : envoyer une image du coin (POST …/testers/media, multipart `file` et `kind`) : la photo d'un
 * appel (`call`, auteur) ou la capture d'un retour (`capture`, testeur). `upload` rend l'image en
 * attente, à citer dans l'appel ou le message, ou `null` si l'API a refusé (voir `reason`).
 */
export const useUploadTesterMedia = (projectId: string, kind: TesterMediaKind) => {
  const mutation = useMutation({
    mutationFn: async (image: { uri: string }) => {
      // FormData : l'équivalent d'un formulaire HTML avec un champ fichier.
      const form = new FormData()
      await appendImage(form, 'file', image)
      form.append('kind', kind)
      const result = await request(
        `${cornerPath(projectId)}/testers/media`,
        { method: 'POST', body: form },
        TesterMedia,
      )
      if (!result.ok) throw new ApiError(result.error)
      return result.data
    },
  })
  const { mutateAsync } = mutation
  const upload = useCallback(
    async (image: { uri: string }) => {
      try {
        return await mutateAsync(image)
      } catch {
        return null
      }
    },
    [mutateAsync],
  )
  return {
    upload,
    pending: mutation.isPending,
    error: mutation.isError,
    reason: reasonOf(mutation.error),
  }
}
