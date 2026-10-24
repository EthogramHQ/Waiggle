// Les commentaires d'un projet (tranche 5) : les lire page par page, en publier un (ou répondre),
// le modifier, le supprimer, et, pour l'auteur du projet, le masquer. Les écrans n'appellent que
// les hooks ci-dessous ; les tests les remplacent.
// Comme pour les notes (notes/api.ts), pas de mise à jour optimiste pour ce qui s'écrit : un
// commentaire n'apparaît qu'une fois l'API d'accord (elle peut le refuser : texte invalide, 60
// commentaires par heure). La liste en cache change alors à la bonne place, sans tout relire : rien
// ne bouge ailleurs sous les yeux du membre.
import { Comment, CommentPage, CommentReply, type NewComment, type Project } from '@ruche/contracts'
import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useMemo } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { ApiError, type ApiErrorKey, errorKey } from '../api/errors'
import { projectQueryKey } from '../projects/hooks'

/**
 * Pourquoi le dernier envoi a échoué, quand « Réessaie » ne servirait à rien :
 * - limited : la limite est atteinte (60 commentaires par heure, réponse 429) ;
 * - expired : la session a expiré (401), il faut se reconnecter ;
 * - gone : ce que l'on vise n'existe plus pour soi (404) : le commentaire auquel on répond a été
 *   supprimé ou masqué entre-temps, par exemple.
 * - blockedMention : le texte mentionne un membre qu'on a bloqué (422 `blocked_mention`, tranche
 *   7b) : on ne peut pas l'interpeller ; l'API ne dit pas lequel, le message non plus.
 * Absent : une autre erreur (réseau, serveur), qu'un nouvel essai peut régler.
 */
export type CommentFailure = 'limited' | 'expired' | 'gone' | 'blockedMention'

// `| 'blockedMention'` : la clé du refus, que `api/errors.ts` reçoit dans la même tranche ; l'union
// garde ce fichier juste avant comme après (une fois la clé dans ApiErrorKey, elle ne change rien).
const reasons: Partial<Record<ApiErrorKey | 'blockedMention', CommentFailure>> = {
  rateLimited: 'limited',
  unauthorized: 'expired',
  notFound: 'gone',
  blockedMention: 'blockedMention',
}

const reasonOf = (error: unknown): CommentFailure | undefined =>
  error ? reasons[errorKey(error)] : undefined

// Ce que rendent les hooks d'écriture. `reason` est facultatif : un faux hook (dans les tests) peut
// s'en passer.
type Failure = { error: boolean; reason?: CommentFailure | undefined }
type PostState = Failure & { post: (comment: NewComment) => Promise<boolean>; pending: boolean }
type EditState = Failure & {
  edit: (change: { id: string; body: string }) => Promise<boolean>
  pending: boolean
}
type DeleteState = Failure & { remove: (commentId: string) => Promise<boolean> }
type HideState = Failure & {
  setHidden: (change: { id: string; hidden: boolean }) => Promise<boolean>
}

/** La clé de la liste en cache : une par projet. */
export const commentsQueryKey = (projectId: string) => ['comments', projectId] as const

// encodeURIComponent : les identifiants restent de simples morceaux de l'adresse (voir projects/api).
const commentsPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}/comments`
const commentPath = (projectId: string, commentId: string) =>
  `${commentsPath(projectId)}/${encodeURIComponent(commentId)}`

/** Une page de commentaires. Le curseur est un texte opaque rendu par l'API avec la page d'avant. */
export const getCommentPage = async (projectId: string, cursor?: string): Promise<CommentPage> => {
  // URLSearchParams encode le curseur : il reste un paramètre, sans pouvoir changer l'adresse.
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : ''
  const result = await request(`${commentsPath(projectId)}${query}`, {}, CommentPage)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : les commentaires du projet. useInfiniteQuery garde les pages déjà lues, dans l'ordre, et
 * sait demander la suivante : getNextPageParam lit le curseur de la dernière page (undefined :
 * c'est fini, hasNextPage devient faux).
 */
export const useComments = (projectId: string) =>
  useInfiniteQuery({
    queryKey: commentsQueryKey(projectId),
    queryFn: ({ pageParam }) => getCommentPage(projectId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

// --- Changer la liste en cache, à la bonne place -------------------------------------------------

type Threads = InfiniteData<CommentPage>

/** Change chaque fil de la liste en cache (s'il y en a une) avec `change`, sans rien perdre d'autre. */
const updateThreads = (
  queryClient: QueryClient,
  projectId: string,
  change: (threads: Comment[], pageIndex: number) => Comment[],
) =>
  queryClient.setQueryData<Threads>(commentsQueryKey(projectId), (data) =>
    data
      ? { ...data, pages: data.pages.map((page, i) => ({ ...page, items: change(page.items, i) })) }
      : data,
  )

/** Change le commentaire `id`, qu'il soit une racine ou une réponse. */
const updateComment = (
  queryClient: QueryClient,
  projectId: string,
  id: string,
  change: (comment: CommentReply) => CommentReply,
) =>
  updateThreads(queryClient, projectId, (threads) =>
    threads.map((root) =>
      root.id === id
        ? { ...change(root), replies: root.replies }
        : root.replies.some((reply) => reply.id === id)
          ? {
              ...root,
              replies: root.replies.map((reply) => (reply.id === id ? change(reply) : reply)),
            }
          : root,
    ),
  )

/** Le nombre de commentaires du projet en cache, plus `delta`. */
const countComment = (queryClient: QueryClient, projectId: string, delta: number) =>
  queryClient.setQueryData<Project>(projectQueryKey(projectId), (project) =>
    project ? { ...project, commentCount: Math.max(0, project.commentCount + delta) } : project,
  )

/** mutateAsync lève une erreur si l'API refuse : on la traduit en vrai / faux pour l'écran. */
const asBoolean =
  <T>(mutateAsync: (value: T) => Promise<unknown>) =>
  async (value: T) => {
    try {
      await mutateAsync(value)
      return true
    } catch {
      return false
    }
  }

// --- Les écritures --------------------------------------------------------------------------------

/** Publie un commentaire ou une réponse (POST /v1/projects/{id}/comments). */
export const postComment = async (projectId: string, comment: NewComment): Promise<Comment> => {
  const result = await request(
    commentsPath(projectId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(comment),
    },
    Comment,
  )
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Modifie son commentaire (PATCH /v1/projects/{id}/comments/{commentId}). */
export const patchComment = async (
  projectId: string,
  { id, body }: { id: string; body: string },
): Promise<CommentReply> => {
  const result = await request(
    commentPath(projectId, id),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    },
    CommentReply,
  )
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Supprime son commentaire (DELETE …/comments/{commentId}) ; l'API répond 204, sans contenu. */
export const deleteComment = async (projectId: string, commentId: string): Promise<void> => {
  const result = await requestWithoutBody(commentPath(projectId, commentId), { method: 'DELETE' })
  if (!result.ok) throw new ApiError(result.error)
}

/** Masque (PUT) ou démasque (DELETE) un commentaire, pour l'auteur du projet ; réponse 204. */
export const hideComment = async (
  projectId: string,
  { id, hidden }: { id: string; hidden: boolean },
): Promise<void> => {
  const result = await requestWithoutBody(`${commentPath(projectId, id)}/hide`, {
    method: hidden ? 'PUT' : 'DELETE',
  })
  if (!result.ok) throw new ApiError(result.error)
}

/**
 * Hook : publier un commentaire sur ce projet, ou répondre (`replyTo` : la racine du fil). `post`
 * renvoie vrai une fois publié (l'écran vide alors le champ), faux sinon (le texte reste dans le
 * champ, et `error` devient vrai). Un nouveau fil se range en tête de la liste ; une réponse, à la
 * fin de son fil (les réponses vont du plus ancien au plus récent). Le nombre affiché dans le titre
 * (« Commentaires (5) ») monte de un.
 */
export const usePostComment = (projectId: string): PostState => {
  const queryClient = useQueryClient()
  // useMutation : une écriture vers l'API, dont React Query suit l'état (en cours, échouée).
  const mutation = useMutation({
    mutationFn: (comment: NewComment) => postComment(projectId, comment),
    onSuccess: (comment, { replyTo }) => {
      if (replyTo) {
        // Une réponse n'a pas de réponses à elle : on ne garde que ses champs de réponse.
        const { replies: _none, ...reply } = comment
        updateThreads(queryClient, projectId, (threads) =>
          threads.map((root) =>
            root.id === replyTo ? { ...root, replies: [...root.replies, reply] } : root,
          ),
        )
      } else {
        updateThreads(queryClient, projectId, (threads, pageIndex) =>
          pageIndex === 0 ? [comment, ...threads] : threads,
        )
      }
      countComment(queryClient, projectId, 1)
    },
  })
  return {
    post: useMemo(() => asBoolean(mutation.mutateAsync), [mutation.mutateAsync]),
    pending: mutation.isPending,
    error: mutation.isError,
    reason: reasonOf(mutation.error),
  }
}

/**
 * Hook : modifier son commentaire. `edit` renvoie vrai une fois enregistré : le nouveau texte
 * remplace l'ancien à sa place, marqué « modifié » (editedAt).
 */
export const useEditComment = (projectId: string): EditState => {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (change: { id: string; body: string }) => patchComment(projectId, change),
    onSuccess: (edited) => updateComment(queryClient, projectId, edited.id, () => edited),
  })
  return {
    edit: useMemo(() => asBoolean(mutation.mutateAsync), [mutation.mutateAsync]),
    pending: mutation.isPending,
    error: mutation.isError,
    reason: reasonOf(mutation.error),
  }
}

/**
 * Hook : supprimer son commentaire (après confirmation, demandée par l'écran). Une réponse, ou une
 * racine sans réponse, disparaît de la liste ; une racine qui a des réponses devient « Commentaire
 * supprimé » (sans auteur ni texte), et ses réponses restent. Le nombre du titre se relit auprès de
 * l'API : elle seule sait ce qui comptait (un commentaire masqué ne compte pas).
 */
export const useDeleteComment = (projectId: string): DeleteState => {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (commentId: string) => deleteComment(projectId, commentId),
    onSuccess: (_nothing, commentId) => {
      updateThreads(queryClient, projectId, (threads) =>
        threads.flatMap((root) => {
          if (root.id !== commentId) {
            return [{ ...root, replies: root.replies.filter((reply) => reply.id !== commentId) }]
          }
          if (root.replies.length === 0) return []
          return [{ ...root, state: 'deleted' as const, author: null, body: '', isMine: false }]
        }),
      )
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) })
    },
  })
  return {
    remove: useMemo(() => asBoolean(mutation.mutateAsync), [mutation.mutateAsync]),
    error: mutation.isError,
    reason: reasonOf(mutation.error),
  }
}

/**
 * Hook : pour l'auteur du projet, masquer ou démasquer le commentaire d'un autre. Le commentaire
 * reste à sa place, avec son texte (l'auteur du projet le lit encore), marqué « masqué » ou non.
 * Le nombre du titre se relit auprès de l'API, comme après une suppression.
 */
export const useHideComment = (projectId: string): HideState => {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (change: { id: string; hidden: boolean }) => hideComment(projectId, change),
    onSuccess: (_nothing, { id, hidden }) => {
      updateComment(queryClient, projectId, id, (comment) => ({
        ...comment,
        state: hidden ? 'hidden' : 'visible',
      }))
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) })
    },
  })
  return {
    setHidden: useMemo(() => asBoolean(mutation.mutateAsync), [mutation.mutateAsync]),
    error: mutation.isError,
    reason: reasonOf(mutation.error),
  }
}
