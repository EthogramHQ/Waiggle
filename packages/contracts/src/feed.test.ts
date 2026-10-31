// Tests du contrat des fils et des abonnements (tranche 4).
import { describe, expect, it } from 'vitest'
import {
  DiscoverFeedPage,
  DiscoverQuery,
  FEED_PAGE_SIZE,
  FeedCursor,
  FeedItem,
  FeedPage,
  FollowingFeedPage,
} from './feed'
import { FollowState } from './follows'

const summary = {
  id: '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6',
  author: { id: 'lea-id', name: 'Léa', avatarUrl: null },
  title: 'Mon agent de recettes',
  pitch: 'Un menu avec ce qu’il y a au frigo.',
  status: 'testable',
  visibility: 'public',
  tools: [{ label: 'Claude Code', slug: 'claude-code' }],
  cover: null,
  demoUrl: null,
  portraitCover: null,
  createdAt: '2026-10-18T08:30:00.000Z',
  updatedAt: '2026-10-18T08:30:00.000Z',
}
const item = { kind: 'project', at: '2026-10-19T09:00:00.000Z', project: summary }

describe('FeedCursor', () => {
  it('accepts the base64url bookmark the API hands out', () => {
    expect(FeedCursor.parse('eyJhdCI6IjIwMjYtMTAtMTlUMDk6MDA6MDAuMDAwWiJ9')).toBeTruthy()
  })

  it('refuses anything else, so a forged cursor cannot smuggle text into a query', () => {
    for (const forged of ['', 'a b', "x' OR 1=1", 'abc%3D', 'abc=', '../etc', 'a'.repeat(201)]) {
      expect(FeedCursor.safeParse(forged).success).toBe(false)
    }
  })
})

describe('FeedPage', () => {
  it('describes a page of new projects and the bookmark of the next one', () => {
    const page = { items: [item], nextCursor: 'abc_DEF-123' }
    expect(FeedPage.parse(page)).toEqual(page)
  })

  it('says the member is up to date with a null bookmark', () => {
    expect(FeedPage.parse({ items: [], nextCursor: null }).nextCursor).toBeNull()
  })

  it('never holds more than one page of items', () => {
    const items = Array.from({ length: FEED_PAGE_SIZE + 1 }, () => item)
    expect(FeedPage.safeParse({ items, nextCursor: null }).success).toBe(false)
  })

  // R3 : « Récents » d'Explorer ne pose la pastille « Suivre » que sur les auteurs pas encore suivis.
  it('says which authors of a discover page are already followed, one page at most', () => {
    const page = { items: [item], nextCursor: null, followedAuthorIds: ['lea-id'] }
    expect(DiscoverFeedPage.parse(page).followedAuthorIds).toEqual(['lea-id'])
    expect(DiscoverFeedPage.safeParse({ items: [], nextCursor: null }).success).toBe(false)
    const tooMany = Array.from({ length: FEED_PAGE_SIZE + 1 }, (_, i) => `u${i}`)
    expect(
      DiscoverFeedPage.safeParse({ items: [], nextCursor: null, followedAuthorIds: tooMany })
        .success,
    ).toBe(false)
  })

  it('carries the demo address of a project in its summary (R3)', () => {
    const withDemo = { ...item, project: { ...summary, demoUrl: 'https://demo.example.org/' } }
    expect(FeedPage.parse({ items: [withDemo], nextCursor: null }).items[0]?.project.demoUrl).toBe(
      'https://demo.example.org/',
    )
  })

  it('tells a member who follows nobody apart from an empty feed', () => {
    const page = { items: [], nextCursor: null, followsAnyone: false }
    expect(FollowingFeedPage.parse(page).followsAnyone).toBe(false)
  })
})

describe('FeedItem', () => {
  it('refuses an item of an unknown kind', () => {
    expect(FeedItem.safeParse({ ...item, kind: 'ad' }).success).toBe(false)
  })
})

describe('DiscoverQuery', () => {
  it('reads the testers filter from the address', () => {
    expect(DiscoverQuery.parse({ testers: 'true' }).testers).toBe('true')
    expect(DiscoverQuery.parse({}).testers).toBeUndefined()
    expect(DiscoverQuery.safeParse({ testers: 'yes please' }).success).toBe(false)
  })
})

describe('FollowState', () => {
  it('only counts followers, it never names them', () => {
    const state = FollowState.parse({ isFollowed: true, followerCount: 2, followers: ['max-id'] })
    expect(state).toEqual({ isFollowed: true, followerCount: 2 })
  })

  it('refuses a negative or fractional count', () => {
    expect(FollowState.safeParse({ isFollowed: false, followerCount: -1 }).success).toBe(false)
    expect(FollowState.safeParse({ isFollowed: false, followerCount: 1.5 }).success).toBe(false)
  })
})
