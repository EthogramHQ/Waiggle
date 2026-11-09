// Lire et écrire le catalogue des outils (tranche R3, puis le catalogue normé de R6b) :
// - la liste des outils (GET /v1/tools), lue par Explorer, « Outils », la feuille « Catégorie et
//   outils » et le profil ;
// - la page d'un outil (GET /v1/tags/{slug}), par pages de 50 projets, filtrée par statut et par
//   catégorie ;
// - les écritures d'un administrateur sur un outil : admettre un « Autre » au catalogue, créer un
//   outil, le modifier (lues par la page d'un outil et par la page « Outils » de la modération).
// Les écrans n'appellent que ces hooks ; leurs tests les remplacent, ou remplacent le réseau.
import {
  AdminCatalogueTool,
  type CategoryCode,
  type ToolAdmit,
  type ToolEdit,
  ToolList,
  ToolPage,
  type ToolStatusFilter,
} from '@ruche/contracts'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { request } from '../api/client'
import { ApiError, type ApiResult } from '../api/errors'

/** La clé de cache de la liste : une seule liste, partagée par Explorer, « Outils » et les champs. */
export const toolsQueryKey = ['tools'] as const

/**
 * Le début des clés de cache des pages d'outil : `['tool', slug, langue, statut, catégorie]`. Une
 * écriture d'administrateur les marque toutes périmées d'un coup (un nom changé, un « Autre » admis).
 */
export const toolPageQueryKey = ['tool'] as const

/**
 * GET /v1/tools : tout le catalogue, du plus utilisé au moins utilisé, chacun avec son nombre de
 * projets que le membre peut voir, et les « Autre » des projets visibles. Lève une ApiError en cas
 * d'échec, comme les autres lectures.
 */
export const getTools = async (): Promise<ToolList> => {
  const result = await request('/v1/tools', {}, ToolList)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : la liste des outils. useQuery la lit une fois, la garde en cache (Explorer puis « Outils »
 * ne la redemandent pas) et la relit quand elle a vieilli.
 */
export const useTools = () => useQuery({ queryKey: toolsQueryKey, queryFn: getTools })

/**
 * Les filtres de la page d'un outil : le statut (`testable`, `done` ; absent : tous) et une
 * catégorie (absente : toutes). Le curseur, lui, est l'affaire du hook.
 */
export type ToolPageFilters = { status?: ToolStatusFilter; category?: CategoryCode }

/**
 * L'adresse d'une page : le slug encodé (il vient de l'adresse de la page : un « ../ » glissé dedans
 * reste un simple texte), puis les filtres et le curseur, encodés par URLSearchParams.
 */
const toolPagePath = (slug: string, filters: ToolPageFilters, cursor?: string) => {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.category) params.set('category', filters.category)
  if (cursor) params.set('cursor', cursor)
  const query = params.toString()
  return `/v1/tags/${encodeURIComponent(slug)}${query ? `?${query}` : ''}`
}

/**
 * GET /v1/tags/{slug} : une page de l'outil (50 projets au plus). La description de l'outil est
 * dans la langue demandée (`Accept-Language`, celle de l'appli : sur le web, le navigateur
 * enverrait la sienne). Un « Autre » ou un nom inconnu : ApiError `notFound`.
 */
export const getToolPage = async (
  slug: string,
  filters: ToolPageFilters,
  language: string,
  cursor?: string,
): Promise<ToolPage> => {
  const result = await request(
    toolPagePath(slug, filters, cursor),
    { headers: { 'Accept-Language': language } },
    ToolPage,
  )
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : la page d'un outil, par pages. useInfiniteQuery garde les pages déjà lues, dans l'ordre,
 * et sait demander la suivante (`fetchNextPage`) : getNextPageParam lit le curseur de la dernière
 * page (null : c'est fini, `hasNextPage` devient faux). Chaque filtre a son cache : revenir à
 * « Tous » montre aussitôt ce qui était déjà lu. La langue est dans la clé : changer la langue de
 * l'appli relit la description dans la nouvelle langue.
 *
 * `enabled: false` (la page n'est pas encore hydratée, les filtres de l'adresse pas encore lus) :
 * aucune requête, pour n'envoyer qu'une seule lecture, déjà filtrée.
 */
export const useToolPage = (slug: string, filters: ToolPageFilters, enabled = true) => {
  const { i18n } = useTranslation()
  const language = i18n.language
  const status = filters.status ?? null
  const category = filters.category ?? null
  return useInfiniteQuery({
    queryKey: [...toolPageQueryKey, slug, language, status, category] as const,
    queryFn: ({ pageParam }) => getToolPage(slug, filters, language, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  })
}

// --- Les écritures d'un administrateur ---

/** Un corps JSON envoyé par POST ou PATCH. */
const jsonInit = (method: 'POST' | 'PATCH', body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** POST /v1/moderation/tools/{slug}/admit : un « Autre » entre au catalogue, tel que l'API l'a écrit. */
export const postAdmitTool = (slug: string, values: ToolAdmit) =>
  request(
    `/v1/moderation/tools/${encodeURIComponent(slug)}/admit`,
    jsonInit('POST', values),
    AdminCatalogueTool,
  )

/** POST /v1/moderation/tools : un outil nouveau au catalogue (201). */
export const postCreateTool = (values: ToolAdmit) =>
  request('/v1/moderation/tools', jsonInit('POST', values), AdminCatalogueTool)

/** PATCH /v1/moderation/tools/{slug} : un outil du catalogue modifié (seuls les champs envoyés). */
export const patchTool = (slug: string, values: ToolEdit) =>
  request(
    `/v1/moderation/tools/${encodeURIComponent(slug)}`,
    jsonInit('PATCH', values),
    AdminCatalogueTool,
  )

/**
 * Après une écriture réussie : la liste des outils et les pages d'outil sont marquées périmées. Les
 * écrans montés les relisent (le nom changé paraît sur la page de l'outil) ; les autres, à leur
 * prochaine ouverture. Les listes de la modération (« À vérifier », le catalogue, le journal) ne
 * sont pas touchées ici : leur écran décide quand les relire (une carte décidée reste à sa place
 * jusqu'au changement d'onglet, règle 7a).
 */
const useCatalogueChanged = () => {
  const queryClient = useQueryClient()
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: toolsQueryKey })
    void queryClient.invalidateQueries({ queryKey: toolPageQueryKey })
  }, [queryClient])
}

/**
 * Le résultat commun des trois hooks d'écriture : la fonction qui écrit, et `pending`, vrai pendant
 * l'écriture (la feuille s'en sert pour refuser de se fermer). La fonction rend toujours un résultat
 * (`{ ok, data }` ou `{ ok: false, error }`) et ne lève jamais : la feuille montre l'erreur près du
 * champ concerné (`toolNameTaken` sous le nom).
 */
type Write<Args extends unknown[]> = {
  write: (...args: Args) => Promise<ApiResult<AdminCatalogueTool>>
  pending: boolean
}

/**
 * Un hook d'écriture : useMutation suit l'écriture en cours (`isPending`). `scope` range les
 * écritures du même genre en file : une seconde tape partie avant la réponse de la première attend
 * son tour au lieu de croiser la première (la garde contre la double tape reste celle de l'écran).
 */
const useWrite = <Args extends unknown[]>(
  scope: string,
  send: (...args: Args) => Promise<ApiResult<AdminCatalogueTool>>,
): Write<Args> => {
  const changed = useCatalogueChanged()
  const mutation = useMutation({
    mutationFn: (args: Args) => send(...args),
    scope: { id: scope },
    onSuccess: (result) => {
      if (result.ok) changed()
    },
  })
  const { mutateAsync } = mutation
  const write = useCallback((...args: Args) => mutateAsync(args), [mutateAsync])
  return { write, pending: mutation.isPending }
}

/**
 * Hook : `admit(slug, values)` fait entrer un « Autre » au catalogue (nom corrigé, famille,
 * descriptions, site) et rend l'outil admis (200 `AdminCatalogueTool`).
 */
export const useAdmitTool = () => {
  const { write, pending } = useWrite('tool-admit', postAdmitTool)
  return { admit: write, pending }
}

/** Hook : `create(values)` ajoute un outil nouveau au catalogue et le rend (201 `AdminCatalogueTool`). */
export const useCreateTool = () => {
  const { write, pending } = useWrite('tool-create', postCreateTool)
  return { create: write, pending }
}

/**
 * Hook : `edit(slug, values)` modifie un outil du catalogue et le rend tel qu'enregistré (200
 * `AdminCatalogueTool` ; son slug peut changer avec son nom, l'ancien mène encore à sa page).
 */
export const useEditTool = () => {
  const { write, pending } = useWrite('tool-edit', patchTool)
  return { edit: write, pending }
}
