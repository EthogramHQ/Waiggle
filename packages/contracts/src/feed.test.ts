// Tests du contrat des fils et des abonnements (tranche 4).
import { describe, expect, it } from 'vitest'
import {
  DiscoverFeedPage,
  DiscoverQuery,
  FEED_PAGE_SIZE,
  FeedCursor,
  FeedItem,
  FeedPage,
  FeedReadBody,
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
  tools: [{ label: 'Claude Code', slug: 'claude-code', inCatalogue: true }],
  cover: null,
  demoUrl: null,
  portraitCover: null,
  primaryCategory: null,
  secondaryCategory: null,
  createdAt: '2026-10-18T08:30:00.000Z',
  updatedAt: '2026-10-18T08:30:00.000Z',
  reactionTotal: 0,
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
    const page = { items: [], nextCursor: null, followsAnyone: false, lastReadAt: null }
    expect(FollowingFeedPage.parse(page).followsAnyone).toBe(false)
  })

  // R4 : chaque page du fil « Abonnements » dit jusqu'où le membre l'avait lu, avant cette
  // lecture-ci (null s'il ne l'a jamais lu) : l'appli y pose « Tu es à jour ».
  it('carries the date the following feed was last read, or null if it never was', () => {
    const read = {
      items: [item],
      nextCursor: null,
      followsAnyone: true,
      lastReadAt: '2026-10-18T09:00:00.000Z',
    }
    expect(FollowingFeedPage.parse(read).lastReadAt).toBe('2026-10-18T09:00:00.000Z')
    expect(FollowingFeedPage.parse({ ...read, lastReadAt: null }).lastReadAt).toBeNull()
  })

  it('refuses a following page without its last reading, or with something else than a date', () => {
    const page = { items: [], nextCursor: null, followsAnyone: true }
    expect(FollowingFeedPage.safeParse(page).success).toBe(false)
    for (const lastReadAt of ['hier', 12, '2026-10-18']) {
      expect(FollowingFeedPage.safeParse({ ...page, lastReadAt }).success, String(lastReadAt)).toBe(
        false,
      )
    }
  })

  it('carries the reaction total of each project of a page (R4)', () => {
    const page = { items: [{ ...item, project: { ...summary, reactionTotal: 49 } }] }
    expect(FeedPage.parse({ ...page, nextCursor: null }).items[0]?.project.reactionTotal).toBe(49)
    const { reactionTotal: _total, ...without } = summary
    expect(
      FeedPage.safeParse({ items: [{ ...item, project: without }], nextCursor: null }).success,
    ).toBe(false)
  })
})

describe('FeedReadBody', () => {
  it('takes the date of the newest item shown, a full date and time', () => {
    expect(FeedReadBody.parse({ upTo: '2026-10-19T09:00:00.000Z' })).toEqual({
      upTo: '2026-10-19T09:00:00.000Z',
    })
  })

  it('refuses something that is not a date and time', () => {
    for (const upTo of ['maintenant', '', '2026-10-19', 12, null, undefined]) {
      expect(FeedReadBody.safeParse({ upTo }).success, String(upTo)).toBe(false)
    }
    expect(FeedReadBody.safeParse({}).success).toBe(false)
  })

  // Relecture de sécurité sec-A2 : une date bien formée mais absurde (l'an 0000, l'an 9999) passe
  // le contrat ; c'est l'API qui la borne (pas avant le 1/1/2026, pas après son heure) et répond
  // 204 sans rien enregistrer. Ce test dit où vit la borne : un contrat qui la refuserait en 400
  // changerait la réponse promise.
  it('lets a well-formed date of any year through, the API bounds it', () => {
    for (const upTo of ['0000-01-01T00:00:00Z', '9999-12-31T23:59:59Z']) {
      expect(FeedReadBody.parse({ upTo }).upTo).toBe(upTo)
    }
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
