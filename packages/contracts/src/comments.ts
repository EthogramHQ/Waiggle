// Les commentaires d'un projet (tranche 5) : un membre commente un projet qu'il voit, un autre lui
// répond. Un commentaire « racine » et ses réponses forment un fil, sur un seul niveau : répondre à
// une réponse ajoute au même fil. L'auteur d'un commentaire le modifie ou le supprime ; l'auteur du
// projet peut le masquer. Un commentaire peut mentionner des membres par leur pseudo (tranche 6b,
// voir mentions.ts).
import { z } from 'zod'
import { FeedCursor } from './feed'
import { MENTIONS_MAX, Mention } from './mentions'
import { ProjectAuthor } from './projects'
import { Removal } from './removal'
import { VisibleFreeText } from './text'

/** Un commentaire fait au plus 1 000 caractères, comme une note. */
export const COMMENT_MAX = 1_000
/** La page d'un projet charge ses commentaires racines 20 par 20, du plus récent au plus ancien. */
export const COMMENT_PAGE_SIZE = 20
/** Chaque racine vient avec ses réponses, du plus ancien au plus récent, 50 au plus. */
export const COMMENT_REPLIES_SHOWN = 50

/** L'identifiant d'un commentaire dans une adresse. */
export const CommentId = z.uuid()

/**
 * Le texte d'un commentaire : du texte brut, affiché tel quel (pas de Markdown), sur plusieurs
 * lignes si besoin, sans caractères interdits, et jamais vide ni fait seulement de caractères qui ne
 * se voient pas.
 */
export const CommentText = VisibleFreeText(COMMENT_MAX)

/**
 * Ce que l'appli envoie pour commenter (POST /v1/projects/{id}/comments). `replyTo` est
 * l'identifiant du commentaire racine auquel on répond ; absent, c'est un nouveau fil.
 */
export const NewComment = z
  .object({ body: CommentText, replyTo: CommentId.optional() })
  .meta({ id: 'NewComment' })
export type NewComment = z.infer<typeof NewComment>

/** Ce que l'appli envoie pour modifier son commentaire (PATCH /v1/projects/{id}/comments/{commentId}). */
export const EditedComment = z.object({ body: CommentText }).meta({ id: 'EditedComment' })
export type EditedComment = z.infer<typeof EditedComment>

/**
 * L'état d'un commentaire, tel que le membre qui regarde le voit :
 * - visible : le commentaire, avec son auteur et son texte ;
 * - hidden : masqué par l'auteur du projet. Son auteur et l'auteur du projet le voient encore, avec
 *   son texte ; pour les autres, une racine masquée qui a des réponses n'est plus qu'un
 *   « Commentaire masqué » sans auteur ni texte (et sans réponse, elle n'apparaît pas) ;
 * - deleted : une racine supprimée par son auteur, gardée parce qu'elle a des réponses :
 *   « Commentaire supprimé », sans auteur ni texte ;
 * - removed : retiré par la modération (tranche 6d). Seul son auteur le voit encore, avec son
 *   texte et `removal` ; pour tous les autres, l'auteur du projet compris, ce n'est plus qu'un
 *   « Contenu retiré par la modération » sans auteur, ni texte, ni mentions (et sans réponse
 *   visible, il n'apparaît pas). On ne peut plus y répondre ni y réagir.
 */
export const CommentState = z.enum(['visible', 'hidden', 'deleted', 'removed'])
export type CommentState = z.infer<typeof CommentState>

/** Une réponse, ou une racine sans ses réponses. */
export const CommentReply = z
  .object({
    id: CommentId,
    /** Null quand le commentaire n'est qu'un emplacement (« supprimé », « masqué » pour un tiers). */
    author: ProjectAuthor.nullable(),
    /** Le texte tel qu'écrit ; vide quand l'auteur est null. */
    body: z.string(),
    createdAt: z.iso.datetime(),
    /** La dernière modification par son auteur ; null s'il n'y en a pas eu (« modifié »). */
    editedAt: z.iso.datetime().nullable(),
    state: CommentState,
    /** Vrai si le membre qui regarde l'a écrit : l'appli affiche alors « Modifier » et « Supprimer ». */
    isMine: z.boolean(),
    /**
     * Les membres mentionnés (tranche 6b), dans l'ordre du texte ; vide quand l'auteur est null.
     * L'appli ne fait un lien que de ces pseudos-là.
     */
    mentions: z.array(Mention).max(MENTIONS_MAX),
    /** Le retrait par la modération (tranche 6d), rempli pour son auteur seul ; null sinon. */
    removal: Removal.nullable(),
  })
  .meta({ id: 'CommentReply' })
export type CommentReply = z.infer<typeof CommentReply>

/** Un commentaire racine avec son fil de réponses, du plus ancien au plus récent. */
export const Comment = CommentReply.extend({
  replies: z.array(CommentReply).max(COMMENT_REPLIES_SHOWN),
}).meta({ id: 'Comment' })
export type Comment = z.infer<typeof Comment>

/** Les paramètres d'adresse de la liste (GET /v1/projects/{id}/comments) : sans curseur, la première page. */
export const CommentsQuery = z.object({ cursor: FeedCursor.optional() })
export type CommentsQuery = z.infer<typeof CommentsQuery>

/**
 * Une page de commentaires : les racines les plus récentes d'abord, chacune avec ses réponses, et
 * le marque-page de la page suivante (le même curseur opaque que le fil), ou null tout au bout.
 */
export const CommentPage = z
  .object({
    items: z.array(Comment).max(COMMENT_PAGE_SIZE),
    nextCursor: FeedCursor.nullable(),
  })
  .meta({ id: 'CommentPage' })
export type CommentPage = z.infer<typeof CommentPage>
