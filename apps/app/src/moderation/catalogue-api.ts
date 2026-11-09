// Lire et décider l'administration du catalogue (tranche R6b), réservée aux administrateurs : les
// pages « Outils » (`/moderation/tools`) et « Catégories » (`/moderation/categories`) de la
// Modération.
// - les lectures : les « Autre » à vérifier, le catalogue (avec sa recherche), les projets à ranger,
//   le journal « Changements récents », et ce que changera un rattachement (`impact`) ;
// - les décisions sur un « Autre » qui ne passent pas par la feuille d'un outil : « Rattacher à un
//   outil » et « Laisser hors du catalogue » ; et « Ranger » un projet dans une catégorie.
// Les écritures d'un outil (admettre un « Autre », créer, modifier) sont dans `tools/api.ts`, avec
// la page d'un outil qui s'en sert aussi.
//
// Comme le reste de la Modération, l'API refait la vérification « administrateur » à chaque
// demande : pour tout autre membre, ces routes répondent 404, comme une adresse qui n'existe pas.
// Les écrans n'appellent que ces hooks.
import {
  AdminCatalogueToolsPage,
  CatalogueChangesPage,
  type CategoryCode,
  PendingToolsPage,
  ToolImpact,
  UncategorizedPage,
} from '@ruche/contracts'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { ApiError, type ApiResult } from '../api/errors'
import { toolPageQueryKey, toolsQueryKey } from '../tools/api'
import { moderationQueryKey } from './api'

/**
 * Les clés de cache de l'administration du catalogue, toutes sous « moderation » (une session qui se
 * ferme les efface avec le reste de la Modération).
 */
const catalogueKey = [...moderationQueryKey, 'catalogue'] as const
export const pendingToolsKey = [...catalogueKey, 'pending-tools'] as const
/** Le catalogue d'administration : une liste par recherche (`null` : tout le catalogue). */
export const adminToolsKey = [...catalogueKey, 'tools'] as const
export const uncategorizedKey = [...catalogueKey, 'uncategorized'] as const
export const catalogueChangesKey = [...catalogueKey, 'changes'] as const
const impactKey = [...catalogueKey, 'impact'] as const

/** La recherche du catalogue demande 2 à 80 caractères (contrat, sec-B7). */
export const CATALOGUE_SEARCH_MIN = 2

// L'adresse d'une page : le curseur (un texte opaque rendu avec la page précédente) et les autres
// paramètres passent par URLSearchParams, qui les encode : ils restent des paramètres, sans pouvoir
// changer le reste de l'adresse.
const withParams = (path: string, params: Record<string, string | undefined>) => {
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ).toString()
  return query ? `${path}?${query}` : path
}

/** Le slug d'un outil dans une adresse : encodé (il vient de l'API, mais reste un simple texte). */
const toolPath = (slug: string, action?: string) =>
  `/v1/moderation/tools/${encodeURIComponent(slug)}${action ? `/${action}` : ''}`

/** Une lecture : la page si tout va bien, sinon une ApiError (que React Query garde dans `error`). */
const read = async <T>(path: string, schema: Parameters<typeof request<T>>[2]): Promise<T> => {
  const result = await request(path, {}, schema)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

// Une erreur qui ne s'arrangera pas en réessayant (page inconnue, session expirée) : React Query
// ne relance pas la lecture. Les autres (réseau, serveur) ont droit à deux essais de plus.
const retry = (failures: number, error: unknown) =>
  !(error instanceof ApiError && (error.key === 'notFound' || error.key === 'unauthorized')) &&
  failures < 2

/**
 * Ce que partagent les listes d'administration : 20 lignes par page, la suivante par son curseur
 * (useInfiniteQuery garde les pages lues, dans l'ordre), et jamais de relecture d'elles-mêmes (ni
 * au retour sur l'onglet du navigateur, ni au retour du réseau) : une carte ne vient pas remplacer,
 * sous le doigt, celle qu'on allait toucher. L'écran décide quand relire.
 */
const listOptions = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor ?? undefined,
  retry,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const

/**
 * Hook : les « Autre » à vérifier (GET /v1/moderation/tools/pending), du plus récent au plus ancien,
 * chacun avec ses projets visibles des membres (5 au plus) et leur nombre.
 */
export const usePendingTools = (enabled = true) =>
  useInfiniteQuery({
    ...listOptions,
    queryKey: pendingToolsKey,
    queryFn: ({ pageParam }) =>
      read(withParams('/v1/moderation/tools/pending', { cursor: pageParam }), PendingToolsPage),
    enabled,
  })

/**
 * Hook : le catalogue tel que l'administrateur le modifie (GET /v1/moderation/tools), tout entier,
 * ou ce qui répond à une recherche de 2 caractères au moins (`search` plus court : tout le
 * catalogue). Chaque recherche a son cache ; la liste affichée reste jusqu'à la réponse de la
 * suivante (`placeholderData`), pour que la page ne clignote pas à chaque lettre tapée.
 */
export const useAdminTools = (search: string, enabled = true) => {
  const trimmed = search.trim()
  const q = trimmed.length >= CATALOGUE_SEARCH_MIN ? trimmed : undefined
  return useInfiniteQuery({
    ...listOptions,
    queryKey: [...adminToolsKey, q ?? null],
    queryFn: ({ pageParam }) =>
      read(withParams('/v1/moderation/tools', { q, cursor: pageParam }), AdminCatalogueToolsPage),
    placeholderData: (previous) => previous,
    enabled,
  })
}

/**
 * Hook : les projets classés « Autre » à ranger (GET /v1/moderation/categories/pending), visibles
 * des membres, que leur auteur n'a pas remis en « Autre » après un rangement (jur-T4).
 */
export const useUncategorizedProjects = (enabled = true) =>
  useInfiniteQuery({
    ...listOptions,
    queryKey: uncategorizedKey,
    queryFn: ({ pageParam }) =>
      read(
        withParams('/v1/moderation/categories/pending', { cursor: pageParam }),
        UncategorizedPage,
      ),
    enabled,
  })

/**
 * Hook : « Changements récents » (GET /v1/moderation/catalogue-changes), du plus récent au plus
 * ancien : qui a changé quoi au catalogue, outils et catégories ensemble.
 */
export const useCatalogueChanges = (enabled = true) =>
  useInfiniteQuery({
    ...listOptions,
    queryKey: catalogueChangesKey,
    queryFn: ({ pageParam }) =>
      read(
        withParams('/v1/moderation/catalogue-changes', { cursor: pageParam }),
        CatalogueChangesPage,
      ),
    enabled,
  })

/**
 * Hook : ce que changera le rattachement d'un « Autre » (GET /v1/moderation/tools/{slug}/impact) :
 * combien de projets, privés compris, et de profils le citent (jur-T5). Lu dès que la feuille
 * « Rattacher » s'ouvre (`enabled`), pour que la fenêtre de confirmation ait ses nombres aussitôt.
 */
export const useToolImpact = (slug: string | null, enabled: boolean) =>
  useQuery({
    queryKey: [...impactKey, slug],
    queryFn: () => read(toolPath(slug ?? '', 'impact'), ToolImpact),
    enabled: enabled && slug !== null,
    retry,
    // Les nombres changent quand un membre publie : relus à chaque ouverture de la feuille.
    staleTime: 0,
    gcTime: 0,
  })

/** Un corps JSON envoyé par POST. */
const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/**
 * Hook : de quoi dire aux autres listes que le catalogue a changé. Le journal est relu tout de suite
 * (il est en bas de la page, sous les cartes : une ligne de plus ne fait rien bouger sous le doigt) ;
 * la liste des outils des membres et les pages d'outil sont marquées périmées. Les listes de
 * décisions (« À vérifier », « À ranger ») ne sont pas touchées : une carte décidée garde sa place
 * jusqu'au changement d'onglet (règle 7a), c'est l'écran qui les relit alors (`refreshList`).
 */
export const useCatalogueRefresh = () => {
  const queryClient = useQueryClient()
  const changed = useCallback(
    ({ tools = false, catalogue = false }: { tools?: boolean; catalogue?: boolean } = {}) => {
      void queryClient.invalidateQueries({ queryKey: catalogueChangesKey })
      if (catalogue) void queryClient.invalidateQueries({ queryKey: adminToolsKey })
      if (tools) {
        void queryClient.invalidateQueries({ queryKey: toolsQueryKey })
        void queryClient.invalidateQueries({ queryKey: toolPageQueryKey })
      }
    },
    [queryClient],
  )
  /** Relit une liste de décisions (au changement d'onglet), sans attendre. */
  const refreshList = useCallback(
    (key: typeof pendingToolsKey | typeof uncategorizedKey) =>
      void queryClient.invalidateQueries({ queryKey: key }),
    [queryClient],
  )
  return { changed, refreshList }
}

/**
 * Un hook de décision : useMutation suit l'écriture en cours (`pending`) ; `scope` range les
 * décisions du même genre en file (une seconde partie avant la réponse de la première attend son
 * tour). La fonction rend toujours un résultat (`{ ok }` ou `{ ok: false, error }`), sans lever.
 * La réponse n'est pas lue (204, ou l'outil du catalogue pour un rattachement) : l'écran sait déjà
 * ce qu'il a décidé.
 */
const useDecision = <Args extends unknown[]>(
  scope: string,
  send: (...args: Args) => Promise<ApiResult<null>>,
  touchesTools: boolean,
) => {
  const { changed } = useCatalogueRefresh()
  const mutation = useMutation({
    mutationFn: (args: Args) => send(...args),
    scope: { id: scope },
    onSuccess: (result) => {
      if (result.ok) changed({ tools: touchesTools, catalogue: touchesTools })
    },
  })
  const { mutateAsync } = mutation
  const write = useCallback((...args: Args) => mutateAsync(args), [mutateAsync])
  return { write, pending: mutation.isPending }
}

/**
 * Hook : `merge(slug, into)` rattache un « Autre » à un outil du catalogue (POST
 * /v1/moderation/tools/{slug}/merge) : ses projets et profils citent désormais cet outil, et son nom
 * en devient un autre nom. Cela ne s'annule pas dans l'appli.
 */
export const useMergeTool = () => {
  const { write, pending } = useDecision(
    'tool-merge',
    (slug: string, into: string) => requestWithoutBody(toolPath(slug, 'merge'), jsonPost({ into })),
    true,
  )
  return { merge: write, pending }
}

/**
 * Hook : `dismiss(slug)` laisse un « Autre » hors du catalogue (POST
 * /v1/moderation/tools/{slug}/dismiss, 204) : il quitte « À vérifier » et reste en texte simple sur
 * ses projets.
 */
export const useDismissTool = () => {
  const { write, pending } = useDecision(
    'tool-dismiss',
    (slug: string) => requestWithoutBody(toolPath(slug, 'dismiss'), { method: 'POST' }),
    true,
  )
  return { dismiss: write, pending }
}

/**
 * Hook : `recategorize(projectId, category)` range un projet classé « Autre » dans une catégorie
 * (POST /v1/moderation/projects/{id}/category, 204). Son propre projet : 403 `own_project`.
 */
export const useRecategorize = () => {
  const { write, pending } = useDecision(
    'project-recategorize',
    (projectId: string, category: CategoryCode) =>
      requestWithoutBody(
        `/v1/moderation/projects/${encodeURIComponent(projectId)}/category`,
        jsonPost({ category }),
      ),
    false,
  )
  return { recategorize: write, pending }
}
