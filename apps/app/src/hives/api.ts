// Les ruches (R10) : lire mes ruches, la page d'une ruche et ses listes, et tous les gestes (créer,
// inviter, rejoindre, retirer, quitter…). Les écrans n'appellent que ces hooks ; leurs tests les
// remplacent par de faux résultats.
//
// Les lectures passent par les schémas du contrat (`request(..., Schema)`) : une réponse d'une autre
// forme devient une erreur plutôt qu'un écran à moitié rempli. Les clés de cache commencent toutes
// par « hives » : on peut les invalider d'un coup. Le Fil d'une ruche, lui, est un fil : sa clé
// commence par « feed » (voir `feedQueryKey`), comme les deux autres.
//
// Les écritures sont des « mutations » React Query. Chaque hook rend la mutation elle-même :
// `mutateAsync(...)` rend la réponse, ou lève une `ApiError` (`errorKey(error)` donne la clé du
// message : `hiveFull`, `invitationExpired`…), et `isPending` dit qu'un envoi est en cours (les
// boîtes de dialogue refusent de se fermer pendant ce temps). Aucune ne change le cache avant la
// réponse : rejoindre, retirer ou supprimer touchent des listes que seul le serveur sait remettre
// dans l'ordre. Toute écriture réussie (ou refusée : l'état a pu changer sous nos yeux) invalide
// `['hives']` et `['feed']` : « mes ruches », les pages, les nouveautés et les fils se relisent.
import {
  FollowingFeedPage,
  type FollowingFeedPage as FollowingFeedPageType,
  HiveActivityPage,
  type HiveAnimator,
  type HiveCreate,
  HiveMembers,
  HivePage,
  type HivePatch,
  HiveProjectsPage,
  HiveSummary,
  INVITABLE_QUERY_MAX,
  INVITABLE_QUERY_MIN,
  InvitableMembers,
  type Me,
  MyHives,
} from '@ruche/contracts'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { ApiError } from '../api/errors'
import { feedQueryKey } from '../feed/api'
import { getMe, updateProfile } from '../profile/api'
import { meQueryKey } from '../profile/hooks'
import { suggestionsQueryKey } from '../suggestions/api'

// La tête commune des clés de « Proches à suivre » : invalider `['suggestions']` relit la liste.
// Lue à l'appel, jamais au chargement du module : les tests du Fil remplacent suggestions/api par un
// faux module sans cette clé, et le Fil charge ce fichier (les pastilles, « Tes ruches »).
const suggestionsRootKey = () => suggestionsQueryKey.slice(0, 1)

/** Toutes les clés de cache des ruches commencent par « hives » : on peut les invalider d'un coup. */
export const hivesQueryKey = ['hives'] as const

/** Mes ruches et mes invitations. */
export const myHivesQueryKey = ['hives', 'mine'] as const
/** La page d'une ruche ; ses listes ont la même tête (`['hives', id, 'activity']`…). */
export const hiveQueryKey = (id: string) => ['hives', id] as const

const hivePath = (id: string) => `/v1/hives/${encodeURIComponent(id)}`

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/**
 * L'adresse d'une page d'une liste. Le curseur est un texte opaque rendu par l'API avec la page
 * précédente ; URLSearchParams l'encode : il reste un paramètre, sans pouvoir changer le reste de
 * l'adresse.
 */
const pagePath = (base: string, params: Record<string, string | undefined>) => {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(params)) if (value) query.set(name, value)
  const text = query.toString()
  return text ? `${base}?${text}` : base
}

// --- Lectures ---

/** GET /v1/hives. Lève une ApiError en cas d'échec, comme les autres lectures. */
export const getMyHives = async (): Promise<MyHives> => {
  const result = await request('/v1/hives', {}, MyHives)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : mes ruches (de la plus récemment active à la plus calme) et mes invitations valables.
 * `staleTime: 0` : les nouveautés de chaque ruche changent à chaque visite de sa page ; on relit à
 * chaque retour sur l'onglet plutôt que de montrer le compte d'avant.
 */
export const useMyHives = () =>
  useQuery({ queryKey: myHivesQueryKey, queryFn: getMyHives, staleTime: 0 })

/** GET /v1/hives/{id} : la page d'une ruche (404, le même, si on n'y a pas droit). */
export const getHive = async (id: string): Promise<HivePage> => {
  const result = await request(hivePath(id), {}, HivePage)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Hook : la page d'une ruche. L'ouvrir pose la date de visite : relue à chaque ouverture. */
export const useHive = (id: string) =>
  useQuery({ queryKey: hiveQueryKey(id), queryFn: () => getHive(id), staleTime: 0 })

/** GET /v1/hives/{id}/activity : une page de l'actualité (30 jours, par 20). */
export const getHiveActivityPage = async (id: string, cursor?: string) => {
  const result = await request(
    pagePath(`${hivePath(id)}/activity`, { cursor }),
    {},
    HiveActivityPage,
  )
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : l'actualité de la ruche, page par page (`useInfiniteQuery` garde les pages lues et sait
 * demander la suivante : `getNextPageParam` lit le curseur de la dernière, `undefined` veut dire
 * que c'est fini).
 */
export const useHiveActivity = (id: string) =>
  useInfiniteQuery({
    queryKey: [...hiveQueryKey(id), 'activity'],
    queryFn: ({ pageParam }) => getHiveActivityPage(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

/** GET /v1/hives/{id}/projects : une page des projets réservés à la ruche. */
export const getHiveProjectsPage = async (id: string, cursor?: string) => {
  const result = await request(
    pagePath(`${hivePath(id)}/projects`, { cursor }),
    {},
    HiveProjectsPage,
  )
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Hook : les projets réservés à la ruche, page par page. */
export const useHiveProjects = (id: string) =>
  useInfiniteQuery({
    queryKey: [...hiveQueryKey(id), 'projects'],
    queryFn: ({ pageParam }) => getHiveProjectsPage(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

/** GET /v1/hives/{id}/members : l'animateur d'abord, puis les membres par date d'entrée. */
export const getHiveMembers = async (id: string): Promise<HiveMembers> => {
  const result = await request(`${hivePath(id)}/members`, {}, HiveMembers)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Hook : les membres de la ruche. */
export const useHiveMembers = (id: string) =>
  useQuery({
    queryKey: [...hiveQueryKey(id), 'members'],
    queryFn: () => getHiveMembers(id),
    staleTime: 0,
  })

/** GET /v1/hives/{id}/invitable?q= : la recherche de la feuille « Inviter ». */
export const getInvitable = async (id: string, q: string) => {
  const result = await request(pagePath(`${hivePath(id)}/invitable`, { q }), {}, InvitableMembers)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : la recherche d'un membre à inviter. Rien ne part tant que le texte (blancs retirés) a
 * moins de 2 caractères, ni au-delà de 50 : l'API refuserait de toute façon, et chaque lecture
 * compte dans le quota de recherche. Un état (« Déjà membre », « Invitation envoyée ») vient du
 * serveur au moment de la lecture : `staleTime: 0`, pour qu'un retour sur un texte déjà cherché
 * le relise (une invitation a pu partir entre-temps).
 */
export const useInvitable = (id: string, q: string) => {
  const text = q.trim()
  const enabled = text.length >= INVITABLE_QUERY_MIN && text.length <= INVITABLE_QUERY_MAX
  return useQuery({
    queryKey: [...hiveQueryKey(id), 'invitable', text],
    queryFn: () => getInvitable(id, text),
    enabled,
    staleTime: 0,
  })
}

// --- Le Fil d'une ruche ---

/**
 * GET /v1/feed/following?hive=<id> : une page du Fil d'une ruche (même forme que « Abonnements » ;
 * `followsAnyone` toujours vrai, `lastReadAt` : la dernière visite de la ruche). La première page
 * avance cette date côté serveur, comme l'ouverture de la page de la ruche.
 */
export const getHiveFeedPage = async (
  id: string,
  cursor?: string,
): Promise<FollowingFeedPageType> => {
  const result = await request(
    pagePath('/v1/feed/following', { hive: id, cursor }),
    {},
    FollowingFeedPage,
  )
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : le Fil d'une ruche (la pastille du Fil). Sa clé commence par « feed » : toute écriture
 * qui relit les fils le relit aussi. `enabled: false` tant que l'écran ne sait pas quelle pastille
 * est choisie (la page web pas encore hydratée ne connaît pas son adresse).
 */
export const useHiveFeed = (id: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: [...feedQueryKey, 'hive', id],
    queryFn: ({ pageParam }) => getHiveFeedPage(id, pageParam),
    enabled,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

// --- Écritures ---

/**
 * La partie commune des écritures : envoyer, puis relire ce que le geste a pu changer. Même refusée,
 * une écriture relit (« déjà membre », « invitation expirée » : l'état affiché était périmé).
 * `scope` : les écritures d'une même ruche partent l'une après l'autre, jamais en même temps (deux
 * retraits rapides, « Confier » puis « Quitter »).
 */
const useHiveWrite = <Variables, Data>(
  scope: string,
  send: (variables: Variables) => Promise<Data>,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['hives-write', scope],
    mutationFn: send,
    scope: { id: `hives-write:${scope}` },
    // `onSettled` : après la réponse, bonne ou mauvaise. Relire quand la dernière écriture de la
    // portée se termine seulement (`isMutating` compte encore celle qui finit, d'où « 1 ») : relire
    // entre deux gestes rapides ferait clignoter les listes.
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: ['hives-write', scope] }) > 1) return
      void queryClient.invalidateQueries({ queryKey: hivesQueryKey })
      void queryClient.invalidateQueries({ queryKey: feedQueryKey })
    },
  })
}

/** Une écriture sans contenu en réponse (204) : lève une ApiError si l'API refuse. */
const send204 = async (path: string, init: RequestInit): Promise<void> => {
  const result = await requestWithoutBody(path, init)
  if (!result.ok) throw new ApiError(result.error)
}

/** POST /v1/hives : crée la ruche (201) ; `mutateAsync({ name, icon })` rend sa `HiveSummary`. */
export const useCreateHive = () =>
  useHiveWrite('all', async (body: HiveCreate): Promise<HiveSummary> => {
    const result = await request('/v1/hives', jsonInit('POST', body), HiveSummary)
    if (!result.ok) throw new ApiError(result.error)
    return result.data
  })

/**
 * PATCH /v1/hives/{id} (l'animateur seul) : `mutateAsync({ name?, icon?, invitePolicy?,
 * pinnedProjectId? })` ; `pinnedProjectId: null` retire l'épingle.
 */
export const usePatchHive = (id: string) =>
  useHiveWrite(id, (body: HivePatch) => send204(hivePath(id), jsonInit('PATCH', body)))

/** DELETE /v1/hives/{id} (l'animateur seul) : `mutateAsync()`. */
export const useDeleteHive = (id: string) =>
  useHiveWrite(id, () => send204(hivePath(id), { method: 'DELETE' }))

/** POST /v1/hives/{id}/invitations : `mutateAsync(userId)` invite ce membre. */
export const useInvite = (id: string) =>
  useHiveWrite(id, (userId: string) =>
    send204(`${hivePath(id)}/invitations`, jsonInit('POST', { userId })),
  )

/** POST /v1/hive-invitations/{id}/accept : `mutateAsync(invitationId)` rend la `HiveSummary`. */
export const useAcceptInvitation = () =>
  useHiveWrite('all', async (invitationId: string): Promise<HiveSummary> => {
    const result = await request(
      `/v1/hive-invitations/${encodeURIComponent(invitationId)}/accept`,
      { method: 'POST' },
      HiveSummary,
    )
    if (!result.ok) throw new ApiError(result.error)
    return result.data
  })

/** DELETE /v1/hive-invitations/{id} : `mutateAsync(invitationId)` refuse, sans prévenir personne. */
export const useRefuseInvitation = () =>
  useHiveWrite('all', (invitationId: string) =>
    send204(`/v1/hive-invitations/${encodeURIComponent(invitationId)}`, { method: 'DELETE' }),
  )

const memberPath = (id: string, userId: string) =>
  `${hivePath(id)}/members/${encodeURIComponent(userId)}`

/** DELETE /v1/hives/{id}/members/{userId} : `mutateAsync(userId)` retire ce membre (animateur). */
export const useRemoveMember = (id: string) =>
  useHiveWrite(id, (userId: string) => send204(memberPath(id, userId), { method: 'DELETE' }))

/**
 * Quitter la ruche : la même route, avec son propre identifiant. `mutateAsync()` le lit dans le
 * profil gardé en cache (et le demande à l'API s'il n'y est pas encore). Quitter une ruche dont on
 * est le seul membre la supprime ; l'animateur qui part la confie au plus ancien membre.
 */
export const useLeaveHive = (id: string) => {
  const queryClient = useQueryClient()
  return useHiveWrite(id, async () => {
    const me = await queryClient.fetchQuery<Me>({
      queryKey: meQueryKey,
      queryFn: getMe,
      staleTime: Infinity,
    })
    await send204(memberPath(id, me.id), { method: 'DELETE' })
  })
}

/** POST /v1/hives/{id}/animator : `mutateAsync(userId)` confie l'animation à ce membre. */
export const useSetAnimator = (id: string) =>
  useHiveWrite(id, (userId: string) => {
    const body: HiveAnimator = { userId }
    return send204(`${hivePath(id)}/animator`, jsonInit('POST', body))
  })

// --- « Ne pas me proposer aux autres » ---

/**
 * Hook : l'interrupteur de l'onglet Membres et de « Mes données ». `set(hide)` change `Me` en cache
 * au toucher (le curseur bouge tout de suite, un second toucher lit déjà le nouvel état), envoie
 * PATCH /v1/me `{ hideFromSuggestions }`, et remet le profil d'avant si l'API refuse. Rend vrai si
 * l'API a accepté. Une fois fini, `['me']` et `['suggestions']` sont relus : la liste « Proches à
 * suivre » des autres change avec ce réglage.
 */
export const useSetHideFromSuggestions = () => {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationKey: ['hide-from-suggestions'],
    mutationFn: async ({ hide }: { hide: boolean; previous: Me | undefined }) => {
      const result = await updateProfile({ hideFromSuggestions: hide })
      if (!result.ok) throw new ApiError(result.error)
      return result.data
    },
    scope: { id: 'hide-from-suggestions' },
    onError: (_error, { previous }) => {
      if (previous) queryClient.setQueryData(meQueryKey, previous)
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: ['hide-from-suggestions'] }) > 1) return
      void queryClient.invalidateQueries({ queryKey: meQueryKey })
      void queryClient.invalidateQueries({ queryKey: suggestionsRootKey() })
    },
  })
  const { mutateAsync } = mutation
  const set = useCallback(
    async (hide: boolean): Promise<boolean> => {
      // Le profil change ici, au toucher, avant tout envoi (pas dans un `onMutate` asynchrone).
      void queryClient.cancelQueries({ queryKey: meQueryKey })
      const previous = queryClient.getQueryData<Me>(meQueryKey)
      if (previous)
        queryClient.setQueryData<Me>(meQueryKey, { ...previous, hideFromSuggestions: hide })
      try {
        await mutateAsync({ hide, previous })
        return true
      } catch {
        return false
      }
    },
    [queryClient, mutateAsync],
  )
  return { set, pending: mutation.isPending, error: mutation.isError }
}
