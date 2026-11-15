// Tests du contrat des commentaires (tranche 5).
import { describe, expect, it } from 'vitest'
import {
  COMMENT_MAX,
  COMMENT_PAGE_SIZE,
  COMMENT_REPLIES_SHOWN,
  Comment,
  CommentPage,
  CommentsQuery,
  EditedComment,
  MyComment,
  MyCommentsPage,
  MyCommentsQuery,
  NewComment,
} from './comments'
import { MENTIONS_MAX } from './mentions'
import { MY_DATA_PAGE_SIZE } from './my-data'

const rootId = '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6'
const replyId = '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f7'
const lea = { id: 'lea-id', name: 'Léa', handle: 'lea', avatarUrl: null, isTester: false }
const sam = {
  id: 'sam-id',
  name: 'Sam',
  handle: null,
  avatarUrl: 'https://api.example.com/media/avatars/sam.webp',
  isTester: false,
}

describe('NewComment', () => {
  it('accepts a comment over several lines, trimmed, with or without a comment to reply to', () => {
    expect(NewComment.parse({ body: '  Bravo !\nJe teste ce week-end.  ' })).toEqual({
      body: 'Bravo !\nJe teste ce week-end.',
    })
    expect(NewComment.parse({ body: 'Merci !', replyTo: rootId })).toEqual({
      body: 'Merci !',
      replyTo: rootId,
    })
  })

  it('refuses an empty comment, even made of spaces', () => {
    expect(NewComment.safeParse({ body: '' }).success).toBe(false)
    expect(NewComment.safeParse({ body: '   \n  ' }).success).toBe(false)
  })

  it('refuses a comment longer than 1 000 characters', () => {
    expect(NewComment.safeParse({ body: 'a'.repeat(COMMENT_MAX) }).success).toBe(true)
    expect(NewComment.safeParse({ body: 'a'.repeat(COMMENT_MAX + 1) }).success).toBe(false)
  })

  it('refuses invisible and control characters', () => {
    for (const body of ['merci​', 'merci\u0007', 'merci‮']) {
      expect(NewComment.safeParse({ body }).success).toBe(false)
    }
  })

  it('refuses a malformed comment to reply to', () => {
    expect(NewComment.safeParse({ body: 'Merci !', replyTo: 'root' }).success).toBe(false)
  })
})

describe('EditedComment', () => {
  it('follows the same text rules as a new comment', () => {
    expect(EditedComment.parse({ body: ' Corrigé. ' })).toEqual({ body: 'Corrigé.' })
    expect(EditedComment.safeParse({ body: '' }).success).toBe(false)
    expect(EditedComment.safeParse({ body: 'a'.repeat(COMMENT_MAX + 1) }).success).toBe(false)
  })
})

describe('Comment', () => {
  const reply = {
    id: replyId,
    author: lea,
    body: 'Merci Sam !',
    createdAt: '2026-10-19T10:00:00.000Z',
    editedAt: null,
    state: 'visible',
    isMine: true,
    mentions: [],
    removal: null,
  }
  const root = {
    id: rootId,
    author: sam,
    body: 'Bravo, je teste ce week-end.',
    createdAt: '2026-10-19T09:00:00.000Z',
    editedAt: '2026-10-19T09:05:00.000Z',
    state: 'visible',
    isMine: false,
    // Les mentions (tranche 6b) : Sam y désigne Léa par son pseudo.
    mentions: [{ handle: 'lea', memberId: 'lea-id', name: 'Léa' }],
    removal: null,
    replies: [reply],
  }

  it('describes a root comment with its replies, oldest first', () => {
    expect(Comment.parse(root)).toEqual(root)
  })

  it('describes a deleted or hidden placeholder, without author nor text', () => {
    for (const state of ['deleted', 'hidden']) {
      const placeholder = { ...root, author: null, body: '', state, mentions: [] }
      expect(Comment.parse(placeholder)).toEqual(placeholder)
    }
  })

  // R5b : l'auteur porte son pseudo actuel (« Répondre » sous une réponse préremplit sa mention),
  // ou null quand il ne doit pas sortir : un commentaire lu malgré un blocage (sec-B1, jur-P5).
  it('gives the author handle of a root and of a reply, or null, but never leaves it out', () => {
    expect(Comment.parse(root).replies[0]?.author?.handle).toBe('lea')
    expect(Comment.parse(root).author?.handle).toBeNull()
    const { handle: _omitted, ...withoutHandle } = lea
    expect(Comment.safeParse({ ...root, author: withoutHandle }).success).toBe(false)
    expect(
      Comment.safeParse({ ...root, replies: [{ ...reply, author: withoutHandle }] }).success,
    ).toBe(false)
  })

  it('refuses an unknown state', () => {
    expect(Comment.safeParse({ ...root, state: 'flagged' }).success).toBe(false)
  })

  it('never lets a reply carry replies of its own: one level only', () => {
    // z.object ne garde que les champs listés : des « réponses de réponse » ne sortent jamais.
    const nested = Comment.parse({ ...root, replies: [{ ...reply, replies: [reply] }] })
    expect(nested.replies[0]).toEqual(reply)
  })

  it('shows at most 50 replies per root', () => {
    const replies = Array.from({ length: COMMENT_REPLIES_SHOWN + 1 }, (_, i) => ({
      ...reply,
      id: `0192abcd-ef01-7c2d-9e3f-${String(i).padStart(12, '0')}`,
    }))
    expect(Comment.safeParse({ ...root, replies: replies.slice(0, -1) }).success).toBe(true)
    expect(Comment.safeParse({ ...root, replies }).success).toBe(false)
  })

  it('carries at most 5 mentions, each with the handle as written and the member it named', () => {
    const mentions = Array.from({ length: MENTIONS_MAX + 1 }, (_, i) => ({
      handle: `membre${i}`,
      memberId: `member-${i}`,
      name: `Membre ${i}`,
    }))
    expect(Comment.safeParse({ ...root, mentions: mentions.slice(0, -1) }).success).toBe(true)
    expect(Comment.safeParse({ ...root, mentions }).success).toBe(false)
    // Une mention sans membre n'en est pas une : l'appli ne ferait pas de lien.
    expect(Comment.safeParse({ ...root, mentions: [{ handle: 'lea' }] }).success).toBe(false)
    // Le champ est obligatoire : vide quand le commentaire ne mentionne personne.
    const { mentions: _omitted, ...withoutMentions } = root
    expect(Comment.safeParse(withoutMentions).success).toBe(false)
  })

  it('paginates roots 20 by 20, with an opaque cursor', () => {
    const page = { items: [root], nextCursor: 'eyJhdCI6IjIwMjYifQ' }
    expect(CommentPage.parse(page)).toEqual(page)
    expect(CommentPage.parse({ items: [], nextCursor: null }).nextCursor).toBeNull()
    const tooMany = Array.from({ length: COMMENT_PAGE_SIZE + 1 }, () => root)
    expect(CommentPage.safeParse({ items: tooMany, nextCursor: null }).success).toBe(false)
    expect(CommentsQuery.safeParse({ cursor: 'eyJhdCI6IjIwMjYifQ' }).success).toBe(true)
    expect(CommentsQuery.safeParse({ cursor: '{"at":"2026"}' }).success).toBe(false)
  })
})

// R11, « Mes commentaires » : ce que la liste montre d'un commentaire du membre.
describe('MyComment', () => {
  const projectId = '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e500'
  const mine = {
    id: replyId,
    projectId,
    project: { id: projectId, title: 'Recettes', cover: null, author: { name: 'Sam' } },
    replyTo: rootId,
    hasReplies: false,
    body: 'Bravo !',
    createdAt: '2026-11-15T08:30:00.000Z',
    editedAt: null,
    hidden: false,
    removed: false,
  }

  it('reads a reply back as the API sends it', () => {
    expect(MyComment.parse(mine)).toEqual(mine)
  })

  it('gives a project it no longer sees as null, and keeps its identifier', () => {
    expect(MyComment.parse({ ...mine, project: null })).toMatchObject({ project: null, projectId })
  })

  it('names the comment it answers by its identifier alone', () => {
    expect(MyComment.parse({ ...mine, replyTo: null }).replyTo).toBeNull()
    // z.object ne garde que les champs listés : l'auteur ou le texte de la racine ne sortent jamais.
    const leaked = MyComment.parse({ ...mine, replyTo: rootId, replyToAuthor: lea })
    expect(leaked).not.toHaveProperty('replyToAuthor')
    expect(MyComment.safeParse({ ...mine, replyTo: { id: rootId } }).success).toBe(false)
  })

  it('never gives the handle or the photo of the author of the project', () => {
    const project = { ...mine.project, author: { name: 'Sam', handle: 'sam', avatarUrl: null } }
    expect(MyComment.parse({ ...mine, project }).project?.author).toEqual({ name: 'Sam' })
  })

  it('pages 30 by 30, with the opaque cursor of the feed', () => {
    const items = Array.from({ length: MY_DATA_PAGE_SIZE + 1 }, () => mine)
    expect(MY_DATA_PAGE_SIZE).toBe(30)
    expect(MyCommentsPage.safeParse({ items: items.slice(0, -1), nextCursor: null }).success).toBe(
      true,
    )
    expect(MyCommentsPage.safeParse({ items, nextCursor: null }).success).toBe(false)
    expect(MyCommentsQuery.safeParse({}).success).toBe(true)
    expect(MyCommentsQuery.safeParse({ cursor: 'eyJhdCI6IjIwMjYifQ' }).success).toBe(true)
    expect(MyCommentsQuery.safeParse({ cursor: '{"at":"2026"}' }).success).toBe(false)
  })
})
