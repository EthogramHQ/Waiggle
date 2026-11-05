// Tests des lignes de l'aperçu des commentaires (R5b, `comments/lines.ts`) : sous un projet, la
// page montre les premières lignes de la feuille (3 sur téléphone, 5 sur un écran large), réponses
// comprises, dans le même ordre que la feuille : les fils les plus récents d'abord, chacun suivi de
// ses réponses. Seuls les commentaires visibles de tous y entrent (relecture juridique du plan,
// jur-P4, et ui-B7) : un masqué, un retiré ou un emplacement (supprimé, bloqué, indisponible) reste
// dans la feuille, jamais dans l'aperçu.
//
// Le même fichier donne le début du champ quand on répond (`replyPrefill`, choix 3 de Louis) :
// répondre à la réponse d'un autre commence par sa mention (« @zoe »), pour qu'on sache à qui l'on
// répond ; une racine, sa propre réponse ou un auteur sans pseudo (lu malgré un blocage, sec-B1) ne
// préremplissent rien.
//
// Des fonctions pures, sans écran : on leur donne des commentaires tels que l'API les rend (les
// fabriques de `testing/comments.ts`) et on lit ce qu'elles rendent.
import type { Comment, CommentReply } from '@ruche/contracts'
import {
  commentOf,
  leaAuthor,
  leaReply,
  maxAuthor,
  maxComment,
  replyOf,
  zoeComment,
  zoeReply,
} from '../testing/comments'
import { previewLines, replyPrefill } from './lines'

/** Ce qu'on compare d'une ligne : quel commentaire, racine ou réponse, et de quel fil. */
const summary = (items: Comment[], max: number) =>
  previewLines(items, max).map((line) => [line.comment.id, line.kind, line.rootId])

/** Un emplacement, tel qu'un tiers le reçoit : sans auteur, ni texte, ni mentions. */
const placeholder = (
  state: CommentReply['state'],
  fields: Partial<Comment> & { id: string },
): Comment => commentOf({ body: '', author: null, state, ...fields })

// Le retrait d'un commentaire, lu par son seul auteur (tranche 7a).
const removal = {
  ground: 'rules' as const,
  explanation: 'Propos blessants.',
  at: '2026-10-16T08:00:00.000Z',
  afterReport: true,
}

describe('previewLines', () => {
  it('lists each root followed by its replies, in the order of the sheet', () => {
    expect(summary([maxComment, zoeComment], 10)).toEqual([
      [maxComment.id, 'root', maxComment.id],
      [zoeReply.id, 'reply', maxComment.id],
      [leaReply.id, 'reply', maxComment.id],
      [zoeComment.id, 'root', zoeComment.id],
    ])
  })

  it('gives each line the comment itself, to draw its card', () => {
    const [first, second] = previewLines([maxComment], 3)

    expect(first?.comment.body).toBe('Super idée, je teste ce soir.')
    expect(first?.comment.author).toEqual(maxAuthor)
    expect(second?.comment.body).toBe('Moi aussi, dis-nous !')
  })

  it('stops at max lines, replies included', () => {
    // Le fil de Max fait 3 lignes à lui seul (sa racine et deux réponses) : le fil de Zoé n'y est pas.
    expect(summary([maxComment, zoeComment], 3)).toEqual([
      [maxComment.id, 'root', maxComment.id],
      [zoeReply.id, 'reply', maxComment.id],
      [leaReply.id, 'reply', maxComment.id],
    ])
    // Coupé au milieu d'un fil : la racine et sa première réponse seulement.
    expect(summary([maxComment, zoeComment], 2)).toEqual([
      [maxComment.id, 'root', maxComment.id],
      [zoeReply.id, 'reply', maxComment.id],
    ])
  })

  it('previewLines keeps only visible comments: no hidden, removed or placeholder line', () => {
    // Un masqué que voit encore l'auteur du projet (avec son auteur et son texte), le même vu par un
    // tiers (un emplacement), le sien retiré par la modération (lu par lui seul, avec `removal`),
    // et les emplacements d'un supprimé, d'un bloqué et d'un indisponible. Une réponse masquée
    // dans un fil visible n'y entre pas non plus.
    const hiddenSeenByProjectAuthor = commentOf({
      id: 'a1000000-0000-4000-8000-000000000001',
      author: maxAuthor,
      body: 'Un avis masqué.',
      state: 'hidden',
    })
    const hiddenPlaceholder = placeholder('hidden', {
      id: 'a1000000-0000-4000-8000-000000000002',
      replies: [
        replyOf({
          id: 'a1000000-0000-4000-8000-000000000012',
          body: 'Réponse masquée.',
          state: 'hidden',
        }),
      ],
    })
    const removedOwn = commentOf({
      id: 'a1000000-0000-4000-8000-000000000003',
      author: leaAuthor,
      body: 'Un texte retiré.',
      state: 'removed',
      isMine: true,
      removal,
    })
    const deleted = placeholder('deleted', {
      id: 'a1000000-0000-4000-8000-000000000004',
      replies: [
        replyOf({
          id: 'a1000000-0000-4000-8000-000000000014',
          body: '',
          author: null,
          state: 'removed',
        }),
      ],
    })
    const blocked = placeholder('blocked', { id: 'a1000000-0000-4000-8000-000000000005' })
    const unavailable = placeholder('unavailable', { id: 'a1000000-0000-4000-8000-000000000006' })
    const hiddenReply = replyOf({
      id: 'a1000000-0000-4000-8000-000000000016',
      body: 'Réponse masquée par Léa.',
      state: 'hidden',
    })
    const visibleThread = { ...maxComment, replies: [zoeReply, hiddenReply, leaReply] }

    const lines = previewLines(
      [
        hiddenSeenByProjectAuthor,
        hiddenPlaceholder,
        removedOwn,
        visibleThread,
        deleted,
        blocked,
        unavailable,
        zoeComment,
      ],
      20,
    )

    expect(lines.map((line) => line.comment.id)).toEqual([
      maxComment.id,
      zoeReply.id,
      leaReply.id,
      zoeComment.id,
    ])
    expect(lines.every((line) => line.comment.state === 'visible')).toBe(true)
  })

  it('fills the max with visible comments: a line left out takes no place', () => {
    const blocked = placeholder('blocked', { id: 'a1000000-0000-4000-8000-000000000005' })

    expect(summary([blocked, zoeComment, maxComment], 3)).toEqual([
      [zoeComment.id, 'root', zoeComment.id],
      [maxComment.id, 'root', maxComment.id],
      [zoeReply.id, 'reply', maxComment.id],
    ])
  })

  it('keeps the visible replies of a deleted root, as replies of its thread', () => {
    // Une racine supprimée reste dans la feuille pour ses réponses (« Commentaire supprimé ») ;
    // ses réponses visibles sont des commentaires visibles de tous, et gardent leur fil.
    const deleted = placeholder('deleted', {
      id: 'a1000000-0000-4000-8000-000000000004',
      replies: [zoeReply],
    })

    expect(summary([deleted, zoeComment], 3)).toEqual([
      [zoeReply.id, 'reply', deleted.id],
      [zoeComment.id, 'root', zoeComment.id],
    ])
  })

  it('gives no line without a comment, or with a max of 0', () => {
    expect(previewLines([], 3)).toEqual([])
    expect(previewLines([maxComment], 0)).toEqual([])
  })
})

describe('replyPrefill', () => {
  it("starts with « @handle » and a space for another member's reply", () => {
    expect(replyPrefill(zoeReply, 'reply')).toBe('@zoe ')
  })

  it('gives nothing for a root: the reply goes to its own thread', () => {
    expect(replyPrefill(maxComment, 'root')).toBe('')
  })

  it('gives nothing for your own reply', () => {
    expect(replyPrefill({ ...leaReply, isMine: true }, 'reply')).toBe('')
  })

  it('gives nothing when the author has no handle (read despite a block)', () => {
    // Sous un blocage, l'API rend `handle: null` (sécurité B1, jur-P5) : aucune mention possible.
    const blockedAuthor = { ...zoeReply, author: { ...leaAuthor, handle: null } }
    expect(replyPrefill(blockedAuthor, 'reply')).toBe('')
  })

  it('gives nothing for a reply without author', () => {
    expect(replyPrefill({ ...zoeReply, author: null, body: '' }, 'reply')).toBe('')
  })
})
