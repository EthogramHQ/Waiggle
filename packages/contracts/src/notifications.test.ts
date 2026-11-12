// Tests du contrat des notifications (tranche 6b) : ce que l'API peut dire d'une notification, et
// surtout ce qu'elle ne peut pas dire (qui a réagi, qui suit). Scénario :
// docs/scenarios/phase-1.md, « Précisions (tranche 6b) ».
import { describe, expect, it } from 'vitest'
import {
  EXCERPT_MAX,
  NOTIFICATION_DAYS,
  NOTIFICATION_PAGE_SIZE,
  Notification,
  NotificationPage,
  NotificationsQuery,
  SeenUpTo,
  UNREAD_COUNT_MAX,
  UnreadCount,
} from './notifications'
import { TESTER_EXCERPT_MAX } from './testers'
import { TOOL_NAME_MAX } from './tools'

const projectId = '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6'
const commentId = '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f7'
// R8 : chaque projet nommé porte sa miniature (`cover`), null quand il n'a pas de photo.
const meteo = { id: projectId, title: 'Météo', cover: null }
/** Une couverture : l'adresse de la photo et son ThumbHash, rien d'autre (R8, relecture ui-B1). */
const cover = {
  url: 'http://localhost:3000/v1/media/0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f9',
  thumbhash: 'HBkSHYSIeHiPiHh8eJd4eTN0EEQG',
}
const at = '2026-10-20T09:30:00.000Z'

const reactions = {
  id: `reactions:${projectId}:2026-10-20`,
  at,
  isNew: true,
  kind: 'reactions',
  project: meteo,
  day: '2026-10-20',
  counts: { amazing: 0, inspiring: 0, useful: 0, funny: 0, bravo: 2 },
  total: 2,
}
const projectFollows = {
  id: `project_follows:${projectId}:2026-10-20`,
  at,
  isNew: false,
  kind: 'project_follows',
  project: meteo,
  day: '2026-10-20',
  count: 2,
}
const memberFollows = {
  id: 'member_follows:2026-10-20',
  at,
  isNew: false,
  kind: 'member_follows',
  day: '2026-10-20',
  count: 3,
}
const comment = {
  id: `comment:${commentId}`,
  at,
  isNew: true,
  kind: 'comment',
  reason: 'mention',
  project: meteo,
  comment: { id: commentId, excerpt: 'Super idée…' },
  author: { id: 'malik-id', name: 'Malik', avatarUrl: null, handle: 'malik' },
}
const hidden = {
  id: `hidden:${commentId}`,
  at,
  isNew: true,
  kind: 'hidden',
  project: meteo,
  comment: { id: commentId, excerpt: 'Super idée…' },
}
const handle = { id: 'handle', at, isNew: false, kind: 'handle', handle: 'ines_morel' }

// R7b : les trois sortes du coin des testeurs.
const papiJean = { id: 'jean-id', name: 'Papi Jean', avatarUrl: null }
const testerCall = {
  id: 'tester_call:4b1c2d3e-0000-4000-8000-000000000001',
  at,
  isNew: true,
  kind: 'tester_call',
  project: meteo,
  author: papiJean,
  call: { id: '4b1c2d3e-0000-4000-8000-000000000001', excerpt: 'Essayez le niveau 3' },
}
const testerMessage = {
  id: 'tester_message:4b1c2d3e-0000-4000-8000-000000000002',
  at,
  isNew: false,
  kind: 'tester_message',
  project: meteo,
  from: papiJean,
  role: 'author',
  message: { id: '4b1c2d3e-0000-4000-8000-000000000002', kind: 'reply', testerId: 'ines-id' },
}
const feedbackSettled = {
  id: 'feedback_settled:4b1c2d3e-0000-4000-8000-000000000003',
  at,
  isNew: true,
  kind: 'feedback_settled',
  project: meteo,
  author: papiJean,
  update: { id: '4b1c2d3e-0000-4000-8000-000000000004', version: 'v1.3', createdAt: at },
}

// R7a : une mise à jour d'un projet suivi ; R8 lui ajoute le nombre des autres lignes.
const projectUpdate = {
  id: 'project_update:4b1c2d3e-0000-4000-8000-000000000006',
  at,
  isNew: true,
  kind: 'project_update',
  project: { ...meteo, cover },
  author: papiJean,
  update: {
    id: '4b1c2d3e-0000-4000-8000-000000000006',
    title: 'Le vent',
    version: 'v1.4',
    firstLine: { family: 'new', text: 'La force du vent, heure par heure' },
    moreLines: 2,
  },
}

// R8 : les deux notifications du catalogue, signées par l'équipe, sans nom d'administrateur.
const projectCategory = {
  id: 'project_category:4b1c2d3e-0000-4000-8000-000000000007',
  at,
  isNew: true,
  kind: 'project_category',
  project: { id: projectId, title: 'Quel papillon ?', cover },
  category: 'animals',
}
const toolAdded = {
  id: 'tool_added:4b1c2d3e-0000-4000-8000-000000000008',
  at,
  isNew: false,
  kind: 'tool_added',
  merged: false,
  typedName: 'glide',
  toolSlug: 'glide',
  toolName: 'Glide',
}

const all = [
  reactions,
  projectFollows,
  memberFollows,
  comment,
  hidden,
  handle,
  testerCall,
  testerMessage,
  feedbackSettled,
  projectUpdate,
  projectCategory,
  toolAdded,
]

describe('Notification', () => {
  it('describes each kind', () => {
    for (const notification of all) {
      expect(Notification.parse(notification), notification.kind).toEqual(notification)
    }
  })

  it('refuses an unknown kind', () => {
    expect(Notification.safeParse({ ...handle, kind: 'like' }).success).toBe(false)
  })

  it('never carries who reacted or who follows: only numbers', () => {
    const withNames = [
      { ...reactions, members: [{ id: 'malik-id', name: 'Malik' }] },
      { ...projectFollows, followers: ['malik-id'] },
      { ...memberFollows, author: { id: 'malik-id', name: 'Malik', avatarUrl: null } },
    ]
    for (const notification of withNames) {
      const text = JSON.stringify(Notification.parse(notification))
      expect(text, notification.kind).not.toContain('malik')
      expect(text, notification.kind).not.toContain('Malik')
    }
  })

  it('counts at least one reaction or follower: an empty group does not exist', () => {
    expect(Notification.safeParse({ ...reactions, total: 0 }).success).toBe(false)
    expect(Notification.safeParse({ ...projectFollows, count: 0 }).success).toBe(false)
    expect(Notification.safeParse({ ...memberFollows, count: 0 }).success).toBe(false)
  })

  it('gives the day of a group as a calendar date', () => {
    expect(Notification.safeParse({ ...reactions, day: '2026-10-20T00:00:00Z' }).success).toBe(
      false,
    )
    expect(Notification.safeParse({ ...memberFollows, day: '20/10/2026' }).success).toBe(false)
  })

  it('tells why a comment is signalled: a mention, a reply or a comment', () => {
    for (const reason of ['mention', 'reply', 'comment']) {
      expect(Notification.safeParse({ ...comment, reason }).success, reason).toBe(true)
    }
    expect(Notification.safeParse({ ...comment, reason: 'hidden' }).success).toBe(false)
  })

  it('gives the handle of the author of a comment, never her email address', () => {
    const { handle: _omitted, ...withoutHandle } = comment.author
    expect(Notification.safeParse({ ...comment, author: withoutHandle }).success).toBe(false)
    const parsed = Notification.parse({
      ...comment,
      author: { ...comment.author, email: 'malik@example.com' },
    })
    expect(JSON.stringify(parsed)).not.toContain('malik@example.com')
  })

  it('cuts the excerpt of a comment at 80 characters, plus the ellipsis', () => {
    const excerpt = (length: number) => ({ id: commentId, excerpt: 'a'.repeat(length) })
    expect(Notification.safeParse({ ...comment, comment: excerpt(EXCERPT_MAX + 1) }).success).toBe(
      true,
    )
    expect(Notification.safeParse({ ...comment, comment: excerpt(EXCERPT_MAX + 2) }).success).toBe(
      false,
    )
    expect(Notification.safeParse({ ...hidden, comment: excerpt(EXCERPT_MAX + 2) }).success).toBe(
      false,
    )
  })

  it('says whether it is new, and when its latest gesture happened', () => {
    const { isNew: _isNew, ...withoutIsNew } = reactions
    expect(Notification.safeParse(withoutIsNew).success).toBe(false)
    expect(Notification.safeParse({ ...reactions, at: 'hier' }).success).toBe(false)
  })
})

// R7b : ce que les notifications du coin des testeurs ne disent jamais. Le fil est privé : une
// notification de message ne porte ni son texte, ni son issue ; l'extrait d'un appel est court.
describe('the notifications of the testers corner (R7b)', () => {
  it('never carries the text, the outcome nor the device of a thread message', () => {
    const parsed = Notification.parse({
      ...testerMessage,
      text: 'Le score repart à zéro',
      message: { ...testerMessage.message, text: 'Le score', outcome: 'partly', device: 'phone' },
    })
    const raw = JSON.stringify(parsed)
    for (const secret of ['Le score', 'partly', 'phone']) expect(raw).not.toContain(secret)
    expect(parsed).toEqual(testerMessage)
  })

  it('cuts the excerpt of a call at 80 characters, plus the ellipsis', () => {
    const call = (length: number) => ({ ...testerCall.call, excerpt: 'a'.repeat(length) })
    expect(TESTER_EXCERPT_MAX).toBe(80)
    expect(Notification.safeParse({ ...testerCall, call: call(81) }).success).toBe(true)
    expect(Notification.safeParse({ ...testerCall, call: call(82) }).success).toBe(false)
  })

  it('tells who sent a message by role only: the author or the tester', () => {
    for (const role of ['author', 'tester']) {
      expect(Notification.safeParse({ ...testerMessage, role }).success, role).toBe(true)
    }
    expect(Notification.safeParse({ ...testerMessage, role: 'admin' }).success).toBe(false)
  })

  it('settles a feedback by hand without an update', () => {
    expect(Notification.parse({ ...feedbackSettled, update: null })).toMatchObject({
      update: null,
    })
  })

  it('names a removed call or thread message, and nothing else of the corner', () => {
    const removed = {
      id: 'removed:4b1c2d3e-0000-4000-8000-000000000005',
      at,
      isNew: true,
      kind: 'removed',
      project: meteo,
      excerpt: 'Un appel publicitaire',
      ground: 'rules',
      explanation: 'Publicité déguisée.',
      afterReport: false,
      projectHidden: false,
    }
    for (const targetKind of ['call', 'message']) {
      expect(Notification.parse({ ...removed, targetKind }), targetKind).toMatchObject({
        targetKind,
      })
    }
    expect(Notification.safeParse({ ...removed, targetKind: 'thread' }).success).toBe(false)
  })
})

// R8 : la miniature du projet nommé (relecture du plan ui-B1). Elle reprend l'adresse et le
// ThumbHash d'une photo du projet, et rien d'autre : ni ses dimensions, ni sa description.
describe('the cover of a notified project (R8)', () => {
  it('gives the address and the thumbhash of the cover, or null without a photo', () => {
    expect(Notification.parse(projectCategory)).toMatchObject({ project: { cover } })
    expect(Notification.parse(reactions)).toMatchObject({ project: { cover: null } })
  })

  it('always says whether there is a cover: a project without the field is refused', () => {
    const { cover: _cover, ...withoutCover } = meteo
    expect(Notification.safeParse({ ...comment, project: withoutCover }).success).toBe(false)
  })

  it('refuses a cover without its thumbhash, or with an address that is not one', () => {
    const { thumbhash: _thumbhash, ...urlOnly } = cover
    expect(
      Notification.safeParse({ ...hidden, project: { ...meteo, cover: urlOnly } }).success,
    ).toBe(false)
    expect(
      Notification.safeParse({
        ...hidden,
        project: { ...meteo, cover: { ...cover, url: 'photo' } },
      }).success,
    ).toBe(false)
  })

  it('carries nothing else of the photo than its address and its thumbhash', () => {
    const parsed = Notification.parse({
      ...hidden,
      project: {
        ...meteo,
        cover: { ...cover, width: 800, height: 600, description: 'Le jardin de Léa' },
      },
    })
    expect(parsed).toMatchObject({ project: { cover } })
    expect(JSON.stringify(parsed)).not.toContain('Le jardin de Léa')
    expect(JSON.stringify(parsed)).not.toContain('800')
  })
})

describe('the update of a followed project (R8)', () => {
  it('counts the other lines of the update, zero when it has only one', () => {
    expect(Notification.parse(projectUpdate)).toMatchObject({ update: { moreLines: 2 } })
    const single = { ...projectUpdate, update: { ...projectUpdate.update, moreLines: 0 } }
    expect(Notification.parse(single)).toMatchObject({ update: { moreLines: 0 } })
  })

  it('refuses an update without the number of other lines, or with a negative or broken one', () => {
    const { moreLines: _moreLines, ...withoutMore } = projectUpdate.update
    expect(Notification.safeParse({ ...projectUpdate, update: withoutMore }).success).toBe(false)
    for (const moreLines of [-1, 1.5, '2']) {
      const update = { ...projectUpdate.update, moreLines }
      expect(Notification.safeParse({ ...projectUpdate, update }).success, String(moreLines)).toBe(
        false,
      )
    }
  })
})

// R8 : les deux notifications du catalogue (renvoyées de R6b). Elles sont signées « L'équipe de
// {{appName}} » par l'appli : rien dans le contrat ne peut porter l'administrateur qui a agi.
describe('the notifications of the catalogue (R8)', () => {
  it('gives the project filed and the code of its category, never the administrator', () => {
    const parsed = Notification.parse({
      ...projectCategory,
      admin: { id: 'louis-id', name: 'Louis' },
      adminId: 'louis-id',
    })
    expect(parsed).toEqual(projectCategory)
    expect(JSON.stringify(parsed)).not.toContain('louis')
  })

  it('refuses a category that is not a code, and a filed project without its project', () => {
    for (const category of ['Animaux', '', 'a/b']) {
      expect(Notification.safeParse({ ...projectCategory, category }).success, category).toBe(false)
    }
    const { project: _project, ...withoutProject } = projectCategory
    expect(Notification.safeParse(withoutProject).success).toBe(false)
  })

  it('tells an added tool from a merged one, with the name typed and the catalogue tool', () => {
    const merged = {
      ...toolAdded,
      merged: true,
      typedName: 'Glide app',
      toolSlug: 'glide-apps',
      toolName: 'Glide Apps',
    }
    expect(Notification.parse(merged)).toEqual(merged)
    const { merged: _merged, ...withoutMerged } = toolAdded
    expect(Notification.safeParse(withoutMerged).success).toBe(false)
  })

  it('keeps the typed name to 40 characters, like an « other » tool', () => {
    expect(TOOL_NAME_MAX).toBe(40)
    const typed = (length: number) => ({ ...toolAdded, typedName: 'g'.repeat(length) })
    expect(Notification.safeParse(typed(TOOL_NAME_MAX)).success).toBe(true)
    expect(Notification.safeParse(typed(TOOL_NAME_MAX + 1)).success).toBe(false)
  })

  it('refuses a tool slug that could slip something else into the address', () => {
    for (const toolSlug of ['glide/../admin', 'glide apps', 'glide.app', '']) {
      expect(Notification.safeParse({ ...toolAdded, toolSlug }).success, toolSlug).toBe(false)
    }
  })

  it('names no project and no member in a tool notification', () => {
    const parsed = Notification.parse({
      ...toolAdded,
      project: meteo,
      projects: [projectId],
      admin: { id: 'louis-id', name: 'Louis' },
    })
    expect(parsed).toEqual(toolAdded)
  })
})

describe('NotificationPage', () => {
  it('pages 20 by 20, with the cursor of the next page and the time of the server', () => {
    const items = Array.from({ length: NOTIFICATION_PAGE_SIZE }, () => handle)
    const page = { items, nextCursor: 'eyJhdCI6IjIwMjYifQ', asOf: at }
    expect(NotificationPage.parse(page)).toEqual(page)
    expect(NotificationPage.safeParse({ ...page, items: [...items, handle] }).success).toBe(false)
    expect(NotificationPage.parse({ items: [], nextCursor: null, asOf: at }).nextCursor).toBeNull()
    const { asOf: _asOf, ...withoutAsOf } = page
    expect(NotificationPage.safeParse(withoutAsOf).success).toBe(false)
  })

  it('takes an opaque cursor, never raw JSON', () => {
    expect(NotificationsQuery.safeParse({}).success).toBe(true)
    expect(NotificationsQuery.safeParse({ cursor: 'eyJhdCI6IjIwMjYifQ' }).success).toBe(true)
    expect(NotificationsQuery.safeParse({ cursor: '{"at":"2026"}' }).success).toBe(false)
  })
})

describe('UnreadCount', () => {
  it('stops at 10: the app shows « 9+ » beyond 9', () => {
    expect(UNREAD_COUNT_MAX).toBe(10)
    expect(UnreadCount.parse({ count: 0 })).toEqual({ count: 0 })
    expect(UnreadCount.parse({ count: UNREAD_COUNT_MAX })).toEqual({ count: 10 })
    expect(UnreadCount.safeParse({ count: UNREAD_COUNT_MAX + 1 }).success).toBe(false)
    expect(UnreadCount.safeParse({ count: -1 }).success).toBe(false)
    expect(UnreadCount.safeParse({ count: 1.5 }).success).toBe(false)
  })
})

describe('SeenUpTo', () => {
  it('takes a date and time', () => {
    expect(SeenUpTo.parse({ upTo: at })).toEqual({ upTo: at })
    expect(SeenUpTo.safeParse({ upTo: 'now' }).success).toBe(false)
    expect(SeenUpTo.safeParse({}).success).toBe(false)
  })
})

describe('the promises written in the scenario', () => {
  it('keeps notifications 90 days and loads them 20 by 20, with 80-character excerpts', () => {
    expect(NOTIFICATION_DAYS).toBe(90)
    expect(NOTIFICATION_PAGE_SIZE).toBe(20)
    expect(EXCERPT_MAX).toBe(80)
  })
})
