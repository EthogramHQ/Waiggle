// Tests d'intégration de R12 : la page publique d'un membre, lue par un visiteur sans compte
// (GET /v1/public/members/{id}). Scénario : docs/scenarios/refonte.md, « R12 », « Une page
// publique » et « Rendre sa page publique » ; plan R12, choix 2 (le même 404 pour une page fermée,
// un membre inconnu, non vérifié ou supprimé) et 11 (les cases de la page).
//
// Une case décochée donne un champ absent de la réponse (contrat `PublicMember`). La page s'ouvre
// par PATCH /v1/me/public-page (`ctx.openPublicPage`), comme dans « Mon profil public ».
//
// Quatre membres : Inès (la page), Max et Léa (qui la suivent), Louis (l'administrateur).
import { randomUUID } from 'node:crypto'
import { ErrorResponse, Member, PublicMember, PublicProjectCard } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { seedHive } from './testing/hive-seeds'
import { expectNoSharedCache, later, UNKNOWN_ID, visitorGestures } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let world: ReturnType<typeof visitorGestures>
let ines: string // cookies de session
let max: string
let lea: string
let louis: string
let inesId: string
let maxId: string

const INES = { name: 'Inès Morel', email: 'ines@example.com', password: 'ines-long-password' }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  world = visitorGestures(ctx, act)
  ines = await ctx.verifiedMember(INES)
  max = await ctx.verifiedMember({
    name: 'Maxence',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'lea-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  inesId = (await act.me(ines)).id
  maxId = (await act.me(max)).id
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const pagePath = (id: string) => `/v1/public/members/${encodeURIComponent(id)}`

const publicPage = async (id: string) => PublicMember.parse(await world.visitorJson(pagePath(id)))

/** Inès écrit sa bio et ses outils favoris ; Max et Léa la suivent. */
const inesProfile = async () => {
  later()
  await act.updateProfile(ines, {
    bio: 'J’aime les cartes et le vent.',
    favoriteTools: ['Claude'],
  })
  later()
  await act.followMember(inesId, max)
  later()
  await act.followMember(inesId, lea)
}

describe('the public page of a member, for a visitor', () => {
  it('shows a visitor the name, the photo and what the member checked', async () => {
    await inesProfile()
    const avatar = await world.uploadAvatar(ines)
    later()
    const web = await ctx.webProject(ines, { title: 'Carte des vents' })
    later()
    await ctx.openPublicPage(ines)

    const page = await publicPage(inesId)
    expect(page.id).toBe(inesId)
    expect(page.name).toBe('Inès Morel')
    expect(page.avatarUrl && new URL(page.avatarUrl).pathname).toBe(avatar)
    expect(page.bio).toBe('J’aime les cartes et le vent.')
    expect(page.favoriteTools?.map((tool) => tool.label)).toEqual(['Claude'])
    expect(page.projects?.map((project) => project.id)).toEqual([web])
    // « Mon nombre d'abonnés » est décochée par défaut : le champ est absent.
    expect(page).not.toHaveProperty('followerCount')
  })

  it('leaves out each unchecked part, as an absent field', async () => {
    await inesProfile()
    later()
    await ctx.webProject(ines, { title: 'Carte des vents' })
    later()
    await ctx.openPublicPage(ines, {
      showBio: false,
      showFavoriteTools: false,
      showProjects: false,
      showFollowerCount: true,
    })

    const body = (await world.visitorJson(pagePath(inesId))) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['avatarUrl', 'followerCount', 'id', 'name'])
    expect(body.followerCount).toBe(2)
  })

  it('lists only her public projects, never members, hive or private ones, newest first', async () => {
    later()
    const older = await ctx.webProject(ines, { title: 'Carte des vents' })
    later()
    const newer = await ctx.webProject(ines, { title: 'Herbier sonore' })
    later()
    await act.publish(ines, 'Pour les membres')
    later()
    await act.publish(ines, 'Secret', { visibility: 'private' })
    const hiveId = await seedHive(ctx.db, { name: 'Famille', animatorId: inesId })
    later()
    await act.publish(ines, 'En famille', { visibility: 'hive', hiveId })
    later()
    const removed = await ctx.webProject(ines, { title: 'Retiré' })
    await world.remove(max, louis, { kind: 'project', id: removed })
    later()
    await ctx.openPublicPage(ines)

    const answer = await world.asVisitor(pagePath(inesId))
    const page = PublicMember.parse(JSON.parse(answer.body))
    expect(page.projects?.map((project) => project.id)).toEqual([newer, older])
    for (const card of page.projects ?? []) {
      expect(Object.keys(card).sort()).toEqual(Object.keys(PublicProjectCard.shape).sort())
    }
    for (const hidden of ['Pour les membres', 'Secret', 'En famille', 'Retiré'])
      expect(answer.body).not.toContain(hidden)
  })

  it('never shows her handle, hives, follows, comments or reactions', async () => {
    await inesProfile()
    await seedHive(ctx.db, { name: 'Les Zygomatiques', animatorId: inesId, members: [maxId] })
    later()
    const potager = await act.publish(max, 'Potager de Maxence')
    later()
    await act.followMember(maxId, ines)
    later()
    await act.comment(potager.id, ines, 'Quelle belle idée, ce potager !')
    later()
    await act.react(potager.id, 'bravo', ines)
    const handle = Member.parse(
      await (await act.send('GET', `/v1/members/${encodeURIComponent(inesId)}`, max)).json(),
    ).handle
    later()
    await ctx.openPublicPage(ines, { showFollowerCount: true })

    const answer = await world.asVisitor(pagePath(inesId))
    expect(answer.status).toBe(200)
    for (const hidden of [
      'Les Zygomatiques',
      'Potager',
      'Maxence',
      maxId,
      'belle idée',
      `"${handle}"`,
      `@${handle}`,
    ])
      expect(answer.body).not.toContain(hidden)
    expect(answer.body).not.toMatch(
      /"(handle|hive|following|follows|comment|reaction|email|language|removedPart)\w*"\s*:/i,
    )
  })

  it('never shows a removed bio, removed favorite tools or a removed avatar to a visitor', async () => {
    await inesProfile()
    const avatar = await world.uploadAvatar(ines)
    later()
    await ctx.openPublicPage(ines)
    // Témoin : avant les retraits, le visiteur voit les trois.
    const before = await publicPage(inesId)
    expect(before.bio).not.toBe('')
    expect(before.avatarUrl).not.toBeNull()

    const target = { kind: 'member', id: inesId } as const
    await world.remove(max, louis, target, { field: 'bio' })
    await world.remove(max, louis, target, { field: 'favoriteTools' })
    await world.remove(max, louis, target, { field: 'avatar' })

    const answer = await world.asVisitor(pagePath(inesId))
    const page = PublicMember.parse(JSON.parse(answer.body))
    expect(page.bio ?? '').toBe('')
    expect(page.favoriteTools ?? []).toEqual([])
    expect(page.avatarUrl).toBeNull()
    expect(answer.body).not.toContain('cartes et le vent')
    expect(answer.body).not.toContain(avatar.split('/').pop() ?? avatar)
  })

  it('answers a closed page with the same 404 as an unknown, unverified or deleted member', async () => {
    const unknown = await world.asVisitor(pagePath(UNKNOWN_ID))
    expect(unknown.status).toBe(404)
    expect(ErrorResponse.parse(JSON.parse(unknown.body)).error.code).toBe('not_found')

    // Inès n'a jamais ouvert sa page, même avec un projet public (A14 : un choix à part).
    later()
    await ctx.webProject(ines, { title: 'Carte des vents' })
    expect(await world.asVisitor(pagePath(inesId))).toEqual(unknown)

    // Un membre qui n'a pas vérifié son adresse, page ouverte en base (aucune route ne le permet).
    later()
    await ctx.signUp({ name: 'Paul', email: 'paul@example.com', password: 'paul-long-password' })
    const [paul] = await ctx.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, 'paul@example.com'))
    if (!paul) throw new Error('no unverified member')
    await ctx.db
      .insert(schema.profile)
      .values({ userId: paul.id, publicPage: true })
      .onConflictDoUpdate({ target: schema.profile.userId, set: { publicPage: true } })
    expect(await world.asVisitor(pagePath(paul.id))).toEqual(unknown)

    // Léa ouvre sa page, puis supprime son compte.
    later()
    const leaId = (await act.me(lea)).id
    await ctx.openPublicPage(lea)
    expect((await world.asVisitor(pagePath(leaId))).status).toBe(200)
    later()
    await act.deleteAccount(lea, 'lea-long-password')
    expect(await world.asVisitor(pagePath(leaId))).toEqual(unknown)

    // Une adresse mal formée ou trop longue : le même 404.
    expect(await world.asVisitor(pagePath('x'.repeat(300)))).toEqual(unknown)
    expect(await world.asVisitor(pagePath(randomUUID()))).toEqual(unknown)
  })

  it('closes the page at once when the member turns it off', async () => {
    later()
    await ctx.openPublicPage(ines)
    expect((await world.asVisitor(pagePath(inesId))).status).toBe(200)

    later()
    const res = await act.send('PATCH', '/v1/me/public-page', ines, { publicPage: false })
    expect(res.status).toBe(200)
    expect(await world.asVisitor(pagePath(inesId))).toEqual(
      await world.asVisitor(pagePath(UNKNOWN_ID)),
    )
  })

  it('does not open the page when a project becomes public, nor make a project public when the page opens', async () => {
    later()
    const forMembers = await act.publish(ines, 'Pour les membres')
    later()
    await ctx.webProject(ines, { title: 'Carte des vents' })
    expect((await world.asVisitor(pagePath(inesId))).status).toBe(404)

    later()
    await ctx.openPublicPage(ines)
    const page = await publicPage(inesId)
    expect(page.projects?.map((project) => project.title)).toEqual(['Carte des vents'])
    expect((await world.asVisitor(`/v1/public/projects/${forMembers.id}`)).status).toBe(404)
  })

  it('gives a signed-in member the visitor view of a page, without reading the session', async () => {
    await inesProfile()
    later()
    await ctx.openPublicPage(ines)
    const visitorView = await world.asVisitor(pagePath(inesId))
    expect(visitorView.status).toBe(200)
    expectNoSharedCache(visitorView.cacheControl, pagePath(inesId))

    const asMax = await ctx.request(pagePath(inesId), { headers: { cookie: max } })
    expect(await asMax.text()).toBe(visitorView.body)
    // Max, page fermée, ne lit pas la sienne par cette route.
    const own = await ctx.request(pagePath(maxId), { headers: { cookie: max } })
    expect(own.status).toBe(404)
  })
})
