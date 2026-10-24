// Tests d'intégration de la tranche 7b : bloquer un membre. Les trois routes (PUT et DELETE
// /v1/members/{id}/block, GET /v1/me/blocks), la page d'un membre bloqué, ce qu'on ne peut plus
// faire chez l'autre et ce qu'on peut toujours défaire. Scénario : docs/scenarios/phase-1.md,
// « Tranche 7b — Bloquer » ; règles 5 à 7, 10 et 11 de la relecture du plan (24/10/2026).
//
// Trois membres, comme au scénario : Malik (qui bloque), Inès (bloquée) et Zoé (une troisième, qui
// montre que les autres ne voient aucune différence). Ce qu'un blocage cache dans les fils,
// commentaires, mentions et notifications est testé dans le fichier de chaque fonctionnalité
// (feed, comments, mentions, notifications…).
//
// Le temps est maîtrisé par le test (fausse horloge) : la liste se range par date de blocage, et le
// quota de 100 par jour se vérifie sans attendre.
import {
  BLOCKS_PAGE_SIZE,
  BLOCKS_PER_DAY,
  BlockedPage,
  ErrorResponse,
  Member,
  UNBLOCKS_PER_DAY,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { avatarForm, jpegImage } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let malik: string // cookies de session
let ines: string
let zoe: string
let malikId: string
let inesId: string
let zoeId: string

const SECOND = 1000
const HOUR = 60 * 60 * SECOND
const DAY = 24 * HOUR
const START = new Date('2026-06-15T08:00:00.000Z')

/** Un identifiant de membre bien formé, qui ne désigne personne. */
const UNKNOWN_MEMBER = 'no-such-member'

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  malik = await ctx.verifiedMember({
    name: 'Malik',
    email: 'malik@example.com',
    password: 'malik-long-password',
  })
  ines = await ctx.verifiedMember({
    name: 'Inès',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  malikId = (await act.me(malik)).id
  inesId = (await act.me(ines)).id
  zoeId = (await act.me(zoe)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

const blockPath = (id: string) => `/v1/members/${encodeURIComponent(id)}/block`
const putBlock = (id: string, cookie: string | null) => {
  later()
  return act.send('PUT', blockPath(id), cookie)
}
const deleteBlock = (id: string, cookie: string | null) => {
  later()
  return act.send('DELETE', blockPath(id), cookie)
}

/** Une réponse 204 : réussie, et sans corps (rien à lire, rien qui puisse fuiter). */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Deux réponses 404 identiques, mot pour mot : rien ne distingue l'une de l'autre. */
const expectSameNotFound = async (res: Response, reference: Response) => {
  expect(res.status).toBe(404)
  expect(reference.status).toBe(404)
  expect(await res.json()).toEqual(await reference.json())
}

/** Les lignes de blocage en base, « qui a bloqué qui ». */
const storedBlocks = async () =>
  (
    await ctx.db
      .select({ blocker: schema.memberBlock.blockerId, blocked: schema.memberBlock.blockedId })
      .from(schema.memberBlock)
  ).map((row) => `${row.blocker}>${row.blocked}`)

/** Range directement un compteur, comme si le membre avait déjà fait `count` demandes. */
const alreadyUsed = (key: string, count: number) =>
  ctx.db.insert(schema.apiRateLimit).values({ key, count, windowStart: Date.now() })

const memberPage = (id: string, cookie: string) =>
  act.send('GET', `/v1/members/${encodeURIComponent(id)}`, cookie)
const readMember = async (id: string, cookie: string) => {
  const res = await memberPage(id, cookie)
  expect(res.status).toBe(200)
  return Member.parse(await res.json())
}

const readBlocks = async (cookie: string, cursor?: string) => {
  const query = cursor === undefined ? '' : `?${new URLSearchParams({ cursor })}`
  const res = await act.send('GET', `/v1/me/blocks${query}`, cookie)
  expect(res.status).toBe(200)
  return BlockedPage.parse(await res.json())
}

// ─── Bloquer ─────────────────────────────────────────────────────────────────────────────────────

describe('blocking a member', () => {
  it('asks to sign in without a session', async () => {
    await expectError(await putBlock(inesId, null), 401, 'unauthorized')
    expect(await storedBlocks()).toEqual([])
    // Témoin : avec la session de Malik, le blocage passe (sinon ce 401 ne prouverait rien).
    await expectDone(await putBlock(inesId, malik))
  })

  it('blocks, answers 204 without a body, and blocking twice changes nothing', async () => {
    await expectDone(await putBlock(inesId, malik))
    await expectDone(await putBlock(inesId, malik))

    expect(await storedBlocks()).toEqual([`${malikId}>${inesId}`])
  })

  // Règle 6 : « il m'a bloqué » se lit comme « inconnu » ; rien ne trahit le blocage.
  it('answers the same 404 for an unknown member, an unverified one, and one who blocked me', async () => {
    await ctx.signUp({ name: 'Nina', email: 'nina@example.com', password: 'nina-long-password' })
    const [nina] = await ctx.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, 'nina@example.com'))
    await act.block(malikId, ines) // Inès a bloqué Malik

    const unknown = () => putBlock(UNKNOWN_MEMBER, malik)
    await expectSameNotFound(await putBlock(nina?.id ?? '', malik), await unknown())
    await expectSameNotFound(await putBlock(inesId, malik), await unknown())
    // Malik n'a rien posé : la seule ligne est celle d'Inès.
    expect(await storedBlocks()).toEqual([`${inesId}>${malikId}`])
    // Témoin : Zoé, elle, se bloque.
    await expectDone(await putBlock(zoeId, malik))
  })

  it('refuses to block oneself', async () => {
    await expectError(await putBlock(malikId, malik), 422, 'cannot_block_own')
    expect(await storedBlocks()).toEqual([])
  })

  it('removes the follows both ways, members and projects, and keeps those of others', async () => {
    const meteo = await act.publish(ines, 'Météo')
    const velo = await act.publish(malik, 'Vélo')
    await act.followMember(inesId, malik)
    await act.send('POST', `/v1/projects/${meteo.id}/follow`, malik)
    await act.followMember(malikId, ines)
    await act.send('POST', `/v1/projects/${velo.id}/follow`, ines)
    await act.followMember(inesId, zoe)
    await act.send('POST', `/v1/projects/${meteo.id}/follow`, zoe)

    await act.block(inesId, malik)

    const members = await ctx.db.select().from(schema.memberFollow)
    expect(members.map((f) => `${f.followerId}>${f.memberId}`)).toEqual([`${zoeId}>${inesId}`])
    const projects = await ctx.db.select().from(schema.projectFollow)
    expect(projects.map((f) => `${f.followerId}>${f.projectId}`)).toEqual([`${zoeId}>${meteo.id}`])
  })

  it('does not bring the follows back when unblocking', async () => {
    await act.followMember(inesId, malik)
    await act.followMember(malikId, ines)
    await act.block(inesId, malik)
    later()
    await act.unblock(inesId, malik)

    expect(await ctx.db.select().from(schema.memberFollow)).toEqual([])
    const page = await readMember(inesId, malik)
    expect(page).toMatchObject({ isBlocked: false, isFollowed: false, followerCount: 0 })
  })

  it('blocks 100 members a day, counting refused requests, then asks to wait', async () => {
    // 98 blocages déjà faits aujourd'hui (le compteur, rangé directement).
    await alreadyUsed(memberCounterKeys(malikId).block, BLOCKS_PER_DAY - 2)
    // Le 99e, refusé (soi-même), compte aussi ; le 100e passe.
    await expectError(await putBlock(malikId, malik), 422, 'cannot_block_own')
    await expectDone(await putBlock(inesId, malik))

    await expectError(await putBlock(zoeId, malik), 429, 'rate_limited')
    // Au-delà du plafond, même un membre inconnu reçoit 429 : le compteur passe avant tout.
    await expectError(await putBlock(UNKNOWN_MEMBER, malik), 429, 'rate_limited')
    // Chaque membre a son compteur ; le lendemain, Malik bloque de nouveau.
    await expectDone(await putBlock(zoeId, ines))
    later(DAY)
    await expectDone(await putBlock(zoeId, malik))
  })
})

// ─── Débloquer ───────────────────────────────────────────────────────────────────────────────────

describe('unblocking a member', () => {
  it('asks to sign in without a session', async () => {
    await act.block(inesId, malik)
    await expectError(await deleteBlock(inesId, null), 401, 'unauthorized')
    expect(await storedBlocks()).toEqual([`${malikId}>${inesId}`])
    // Témoin : avec la session de Malik, le déblocage passe.
    await expectDone(await deleteBlock(inesId, malik))
    expect(await storedBlocks()).toEqual([])
  })

  it('unblocks, and unblocking again still answers 204', async () => {
    await act.block(inesId, malik)

    await expectDone(await deleteBlock(inesId, malik))
    await expectDone(await deleteBlock(inesId, malik))
    expect(await storedBlocks()).toEqual([])
  })

  // Règle 6 : DELETE répond 204 à tout id bien formé, sans lire la table des membres.
  it('answers 204 for an unknown member or one who blocked me, and removes only my own block', async () => {
    await act.block(malikId, ines) // Inès a bloqué Malik

    await expectDone(await deleteBlock(UNKNOWN_MEMBER, malik))
    await expectDone(await deleteBlock(inesId, malik))

    // Le blocage posé par Inès reste : on ne défait que les siens.
    expect(await storedBlocks()).toEqual([`${inesId}>${malikId}`])
  })

  it('shows her contents again on both sides', async () => {
    const meteo = await act.publish(ines, 'Météo')
    await act.block(inesId, malik)
    expect((await act.send('GET', `/v1/projects/${meteo.id}`, malik)).status).toBe(404)

    await act.unblock(inesId, malik)

    expect((await act.send('GET', `/v1/projects/${meteo.id}`, malik)).status).toBe(200)
    expect((await memberPage(malikId, ines)).status).toBe(200)
  })

  // Règle 10 : un quota de déblocage, clé `unblock`, compté avant tout.
  it('unblocks 100 members a day, then asks to wait, even for an unknown member', async () => {
    await act.block(inesId, malik)
    await alreadyUsed(memberCounterKeys(malikId).unblock, UNBLOCKS_PER_DAY)

    await expectError(await deleteBlock(UNKNOWN_MEMBER, malik), 429, 'rate_limited')
    await expectError(await deleteBlock(inesId, malik), 429, 'rate_limited')
    expect(await storedBlocks()).toEqual([`${malikId}>${inesId}`])
    // Bloquer a son propre compteur.
    await expectDone(await putBlock(zoeId, malik))
    later(DAY)
    await expectDone(await deleteBlock(inesId, malik))
  })
})

// ─── La liste « Membres bloqués » ────────────────────────────────────────────────────────────────

describe('the list of blocked members', () => {
  it('asks to sign in without a session', async () => {
    await expectError(await act.send('GET', '/v1/me/blocks', null), 401, 'unauthorized')
    // Témoin : avec une session, la liste se lit.
    expect((await act.send('GET', '/v1/me/blocks', malik)).status).toBe(200)
  })

  it('lists the members I blocked, newest first, and never who blocked me', async () => {
    await act.block(inesId, malik)
    const inesAt = new Date(Date.now()).toISOString()
    later(HOUR)
    await act.block(zoeId, malik)
    const zoeAt = new Date(Date.now()).toISOString()
    // Inès bloque Malik à son tour : cela ne change rien à la liste de Malik. Posé en base : par
    // l'API, Inès ne peut plus atteindre Malik (règle 6, 404) ; un double blocage n'arrive que par
    // une course.
    await ctx.db.insert(schema.memberBlock).values({ blockerId: inesId, blockedId: malikId })
    const { handle: inesHandle } = await act.me(ines)
    const { handle: zoeHandle } = await act.me(zoe)

    const page = await readBlocks(malik)

    expect(page).toEqual({
      items: [
        {
          member: { id: zoeId, name: 'Zoé', handle: zoeHandle, avatarUrl: null },
          blockedAt: zoeAt,
        },
        {
          member: { id: inesId, name: 'Inès', handle: inesHandle, avatarUrl: null },
          blockedAt: inesAt,
        },
      ],
      nextCursor: null,
    })
    // Zoé n'a bloqué personne : sa liste est vide, même si Malik l'a bloquée.
    expect((await readBlocks(zoe)).items).toEqual([])
    // La liste d'Inès ne contient que Malik, qu'elle a bloqué.
    expect((await readBlocks(ines)).items.map((item) => item.member.id)).toEqual([malikId])
  })

  it('shows 50 members at a time', async () => {
    // 51 membres rangés directement, bloqués par Malik de minute en minute.
    const ids = Array.from({ length: BLOCKS_PAGE_SIZE + 1 }, (_, i) => `id-member-${i}`)
    await ctx.db.insert(schema.user).values(
      ids.map((id, i) => ({
        id,
        name: `Membre ${i}`,
        email: `member-${i}@example.com`,
        emailVerified: true,
      })),
    )
    await ctx.db
      .insert(schema.memberHandle)
      .values(ids.map((id, i) => ({ handle: `membre_${i}`, userId: id, claimedAt: START })))
    await ctx.db.insert(schema.memberBlock).values(
      ids.map((id, i) => ({
        blockerId: malikId,
        blockedId: id,
        createdAt: new Date(START.getTime() + i * 60 * SECOND),
      })),
    )

    const first = await readBlocks(malik)
    expect(first.items).toHaveLength(BLOCKS_PAGE_SIZE)
    expect(first.items[0]?.member.id).toBe(`id-member-${BLOCKS_PAGE_SIZE}`)
    expect(first.nextCursor).not.toBeNull()
    const second = await readBlocks(malik, first.nextCursor ?? undefined)
    expect(second.items.map((item) => item.member.id)).toEqual(['id-member-0'])
    expect(second.nextCursor).toBeNull()
  })

  it('forgets a member once unblocked', async () => {
    await act.block(inesId, malik)
    await act.unblock(inesId, malik)

    expect((await readBlocks(malik)).items).toEqual([])
  })
})

// ─── La page d'un membre ─────────────────────────────────────────────────────────────────────────

// Règle 6 et précision 2 : qui a bloqué voit l'en-tête seul ; qui est bloqué reçoit le 404 d'un
// membre inconnu, mot pour mot.
describe('the page of a blocked member', () => {
  it('shows only the header to who blocked her', async () => {
    await act.updateProfile(ines, {
      bio: 'Je fabrique des agents météo.',
      favoriteTools: ['Mistral'],
    })
    await act.publish(ines, 'Météo')
    await act.followMember(inesId, zoe)
    await act.block(inesId, malik)
    const { handle } = await act.me(ines)

    expect(await readMember(inesId, malik)).toEqual({
      id: inesId,
      name: 'Inès',
      handle,
      avatarUrl: null,
      bio: '',
      favoriteTools: [],
      isMe: false,
      isBlocked: true,
      isFollowed: false,
      followerCount: 0,
      projects: [],
    })
  })

  it('answers the same 404 as an unknown member to who is blocked', async () => {
    await act.block(inesId, malik)

    await expectSameNotFound(
      await memberPage(malikId, ines),
      await memberPage(UNKNOWN_MEMBER, ines),
    )
  })

  it('reads as "I blocked her" when both blocked each other', async () => {
    await act.block(inesId, malik)
    // Le second blocage, posé en base : par l'API, il répond 404 (règle 6) ; il n'arrive que par une
    // course.
    await ctx.db.insert(schema.memberBlock).values({ blockerId: inesId, blockedId: malikId })

    expect((await readMember(inesId, malik)).isBlocked).toBe(true)
    expect((await readMember(malikId, ines)).isBlocked).toBe(true)
  })

  it('changes nothing for a third member', async () => {
    await act.publish(ines, 'Météo')
    await act.block(inesId, malik)

    const page = await readMember(inesId, zoe)
    expect(page.isBlocked).toBe(false)
    expect(page.projects.map((p) => p.title)).toEqual(['Météo'])
    expect((await readMember(malikId, zoe)).isBlocked).toBe(false)
  })

  it('is not blocked by default', async () => {
    expect((await readMember(inesId, malik)).isBlocked).toBe(false)
    expect((await readMember(malikId, malik)).isBlocked).toBe(false)
  })
})

// ─── Ce qu'on ne peut plus faire chez l'autre ────────────────────────────────────────────────────

describe('what blocked members can no longer do', () => {
  // Les deux sens : Malik a bloqué Inès, et l'un comme l'autre se heurte au même 404.
  it('refuses to comment, react or follow, in both directions', async () => {
    const meteo = await act.publish(ines, 'Météo')
    const velo = await act.publish(malik, 'Vélo')
    await act.block(inesId, malik)

    for (const [cookie, project, member] of [
      [malik, meteo.id, inesId],
      [ines, velo.id, malikId],
    ] as const) {
      const comment = await act.send('POST', `/v1/projects/${project}/comments`, cookie, {
        body: 'Coucou',
      })
      await expectError(comment, 404, 'not_found')
      await expectError(
        await act.send('PUT', `/v1/projects/${project}/reactions/bravo`, cookie),
        404,
        'not_found',
      )
      await expectError(
        await act.send('POST', `/v1/projects/${project}/follow`, cookie),
        404,
        'not_found',
      )
      await expectError(
        await act.send('POST', `/v1/members/${member}/follow`, cookie),
        404,
        'not_found',
      )
    }
    expect(await ctx.db.select().from(schema.projectComment)).toEqual([])
    expect(await ctx.db.select().from(schema.projectReaction)).toEqual([])
    expect(await ctx.db.select().from(schema.memberFollow)).toEqual([])
    // Témoin : Zoé commente et suit encore Inès.
    await act.comment(meteo.id, zoe, 'Bravo !')
    await act.followMember(inesId, zoe)
  })
})

// Règle 7 : un blocage n'empêche jamais de défaire ses propres gestes.
describe('undoing my own gestures at a blocked member', () => {
  it('deletes my comment, removes my reaction and unfollows, whoever blocked whom', async () => {
    const meteo = await act.publish(ines, 'Météo')
    const mine = await act.comment(meteo.id, malik, 'Mon commentaire chez Inès')
    await act.react(meteo.id, 'bravo', malik)
    await act.block(malikId, ines) // c'est Inès qui bloque

    await expectDone(
      await act.send('DELETE', `/v1/projects/${meteo.id}/comments/${mine.id}`, malik),
    )
    await expectDone(await act.send('DELETE', `/v1/projects/${meteo.id}/reactions/bravo`, malik))
    await expectDone(await act.send('DELETE', `/v1/members/${inesId}/follow`, malik))
    await expectDone(await act.send('DELETE', `/v1/projects/${meteo.id}/follow`, malik))

    const [comment] = await ctx.db
      .select({ deletedAt: schema.projectComment.deletedAt })
      .from(schema.projectComment)
      .where(eq(schema.projectComment.id, mine.id))
    expect(comment?.deletedAt).not.toBeNull()
    expect(
      await ctx.db
        .select()
        .from(schema.projectReaction)
        .where(
          and(
            eq(schema.projectReaction.projectId, meteo.id),
            eq(schema.projectReaction.memberId, malikId),
          ),
        ),
    ).toEqual([])
  })
})

// ─── Les photos de profil ────────────────────────────────────────────────────────────────────────

// Règle 11 : /media/avatars ne regarde pas les blocages (clé aléatoire) ; c'est donc qu'aucune
// réponse ne donne à l'un l'adresse de la photo de l'autre.
describe('the profile photo of a blocked member', () => {
  it('never appears in what the other one reads', async () => {
    const upload = await ctx.request('/v1/me/avatar', {
      method: 'POST',
      headers: { cookie: malik },
      body: avatarForm(await jpegImage(64, 64)),
    })
    expect(upload.status).toBe(200)
    const { avatarUrl } = await act.me(malik)
    expect(avatarUrl).not.toBeNull()
    const zoeProject = await act.publish(zoe, 'Recettes')
    await act.comment(zoeProject.id, malik, 'Un commentaire de Malik chez Zoé')
    await act.publish(malik, 'Vélo')
    await act.block(inesId, malik)

    for (const path of [
      `/v1/members/${malikId}`,
      `/v1/projects/${zoeProject.id}/comments`,
      `/v1/members/mentionable?${new URLSearchParams({ q: 'ma', projectId: zoeProject.id })}`,
      '/v1/feed/discover',
      '/v1/notifications',
    ]) {
      const text = await (await act.send('GET', path, ines)).text()
      expect(text, path).not.toContain(avatarUrl ?? 'no avatar')
    }
    // Témoin : Zoé lit la photo de Malik dans les commentaires de son projet.
    const seen = await (await act.send('GET', `/v1/projects/${zoeProject.id}/comments`, zoe)).text()
    expect(seen).toContain(avatarUrl ?? 'no avatar')
  })
})
