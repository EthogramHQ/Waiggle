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

const projectId = '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6'
const commentId = '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f7'
const meteo = { id: projectId, title: 'Météo' }
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

const all = [reactions, projectFollows, memberFollows, comment, hidden, handle]

describe('Notification', () => {
  it('describes each of the six kinds', () => {
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
