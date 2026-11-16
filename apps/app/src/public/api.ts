// Ce qu'un visiteur sans compte peut lire (tranche R12, plan, choix 2 et 3) : un
// projet public, ses mises à jour, une mise à jour seule, et la page publique d'un membre. Ces
// lectures vont aux routes /v1/public/*, jamais à celles des membres, et partent **sans session**
// (`requestWithoutSession`, api/client.ts) : sur le web, le navigateur n'y joint aucun cookie. Elles
// servent aux écrans d'un visiteur, à la page de sortie (`/out`) et à l'aperçu « comme un visiteur »
// de la page publique d'un membre connecté, qui doit voir exactement ce qu'un inconnu verrait.
//
// Les clés du cache commencent toutes par « public » : elles ne se mêlent jamais à celles des
// membres (['project', id]…), qui portent des champs qu'un visiteur ne doit pas voir (commentaires,
// abonnés, ruche). Un projet lu ici n'écrase donc jamais le projet lu par un membre, ni l'inverse.
import { PublicMember, PublicProject, PublicUpdate, PublicUpdatesPage } from '@ruche/contracts'
import { type Language, resolveLanguage } from '@ruche/i18n'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { requestWithoutSession } from '../api/client'
import { ApiError } from '../api/errors'

// encodeURIComponent : l'identifiant vient de l'adresse de la page ; il reste un seul morceau du
// chemin de la requête (un « ../ » glissé dedans resterait un simple texte, voir projects/api.ts).
const projectPath = (id: string) => `/v1/public/projects/${encodeURIComponent(id)}`
const updatesPath = (id: string) => `${projectPath(id)}/updates`
const memberPath = (id: string) => `/v1/public/members/${encodeURIComponent(id)}`

/** Lit une réponse vérifiée par son schéma, ou lève l'erreur que React Query rangera dans `error`. */
const read = async <T>(
  path: string,
  schema: Parameters<typeof requestWithoutSession<T>>[2],
  init: RequestInit = {},
): Promise<T> => {
  const result = await requestWithoutSession(path, init, schema)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Lit un projet public (GET /v1/public/projects/{id}?lang=). `lang` : la langue où l'API nomme les
 * catégories. Lève une `ApiError` : `notFound` pour un projet qui n'est pas public, inconnu ou
 * retiré (le même 404 pour tous, l'appli ne peut pas les distinguer).
 */
export const getPublicProject = (id: string, lang: Language): Promise<PublicProject> =>
  read(`${projectPath(id)}?${new URLSearchParams({ lang }).toString()}`, PublicProject)

/** Une page de la frise d'un projet public, de la plus récente à la plus ancienne. */
export const getPublicUpdatesPage = (id: string, cursor?: string): Promise<PublicUpdatesPage> =>
  read(
    cursor ? `${updatesPath(id)}?${new URLSearchParams({ cursor }).toString()}` : updatesPath(id),
    PublicUpdatesPage,
  )

/** Une mise à jour d'un projet public (GET …/updates/{updateId}), par exemple pour la signaler. */
export const getPublicUpdate = (id: string, updateId: string): Promise<PublicUpdate> =>
  read(`${updatesPath(id)}/${encodeURIComponent(updateId)}`, PublicUpdate)

/**
 * La page publique d'un membre (GET /v1/public/members/{id}). `notFound` si elle est fermée.
 * `fresh` : demander au navigateur une copie neuve (`cache: 'no-store'`) plutôt que celle qu'il
 * garde. L'API dit aux navigateurs de garder la page d'un visiteur une minute (`max-age=60`) ; c'est
 * bien pour un visiteur, mais l'aperçu d'un membre qui vient de changer une case montrerait l'ancienne.
 */
export const getPublicMember = (id: string, fresh = false): Promise<PublicMember> =>
  read(memberPath(id), PublicMember, fresh ? { cache: 'no-store' } : {})

/** Les clés du cache des lectures d'un visiteur, toutes sous « public » (voir l'en-tête). */
export const publicKeys = {
  project: (id: string, lang: Language) => ['public', 'project', id, lang] as const,
  updates: (id: string) => ['public', 'updates', id] as const,
  update: (id: string, updateId: string) => ['public', 'update', id, updateId] as const,
  member: (id: string) => ['public', 'member', id] as const,
  /** L'aperçu d'un membre connecté : sous la clé de la page (une invalidation de `member` l'atteint). */
  memberPreview: (id: string) => ['public', 'member', id, 'preview'] as const,
}

/**
 * Hook : la langue de la page, `fr` ou `en`. Sous une adresse à langue (`/en/projects/…`), la page
 * a déjà sa propre instance de traduction dans la langue de l'adresse (navigation/PageLanguage.tsx) :
 * on la lit plutôt que l'adresse, qui n'est connue qu'après l'hydratation sur le web. Ailleurs
 * (`/out`), la langue de l'appli.
 */
export const usePageLanguage = (): Language => {
  const { i18n } = useTranslation()
  return resolveLanguage([i18n.language])
}

/**
 * Hook : un projet public, tel qu'un visiteur le voit, les catégories nommées dans la langue de la
 * page. `enabled: false` : aucune requête (un identifiant mal formé, une page pas encore prête).
 * `data` : `PublicProject` ; `error` : une `ApiError`.
 */
export const usePublicProject = (id: string, enabled = true) => {
  const lang = usePageLanguage()
  return useQuery({
    queryKey: publicKeys.project(id, lang),
    queryFn: () => getPublicProject(id, lang),
    enabled,
  })
}

/**
 * Hook : la frise d'un projet public, page par page (`fetchNextPage`), comme `useProjectUpdates`
 * pour un membre (updates/api.ts). `data.pages[n].items` : des `PublicUpdate`.
 */
export const usePublicUpdates = (id: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: publicKeys.updates(id),
    queryFn: ({ pageParam }) => getPublicUpdatesPage(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  })

/** Hook : une mise à jour d'un projet public. `data` : `PublicUpdate`. */
export const usePublicUpdate = (id: string, updateId: string, enabled = true) =>
  useQuery({
    queryKey: publicKeys.update(id, updateId),
    queryFn: () => getPublicUpdate(id, updateId),
    enabled,
  })

/**
 * Hook : la page publique d'un membre, telle qu'un visiteur la voit. Une case décochée par le
 * membre donne un champ **absent** (`bio`, `favoriteTools`, `projects`, `followerCount`) : l'écran
 * ne montre que ce qui est là. Même lecture pour la page d'un visiteur et pour l'aperçu d'un membre
 * connecté (« Voir ma page comme un visiteur ») : toutes deux partent sans session.
 * `data` : `PublicMember` ; `error` : une `ApiError` (`notFound` si la page est fermée).
 *
 * `preview` (l'aperçu, relecture de sécurité R12) : il ne montre jamais la page d'avant.
 * - Une clé à lui, oubliée dès que l'aperçu se ferme (`gcTime: 0`, le temps qu'une lecture finie
 *   reste en cache sans écran qui la lit) : rouvert, il attend sa nouvelle lecture au lieu de
 *   montrer un instant la page lue la fois d'avant (une bio changée entre-temps dans « Mon profil »).
 * - Une copie neuve du navigateur (`getPublicMember(id, true)`), jamais celle qu'il garde.
 * - Après chaque changement de case, `usePublicPageChange` (profile/api.ts) le vide et le relit.
 */
export const usePublicMember = (id: string, enabled = true, preview = false) =>
  useQuery({
    queryKey: preview ? publicKeys.memberPreview(id) : publicKeys.member(id),
    queryFn: () => getPublicMember(id, preview),
    enabled,
    ...(preview ? { gcTime: 0 } : null),
  })
