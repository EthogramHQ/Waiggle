// Tests d'intégration de R12 : « Mon profil public » (GET et PATCH /v1/me/public-page). La page
// publique est un choix à part de la visibilité des projets (A14) : fermée par défaut, puis cinq
// cases, « Rendre ma page publique » et ce qu'un visiteur voit (bio, outils favoris, projets
// publics cochés ; nombre d'abonnés décoché). Un membre suspendu peut seulement la fermer (Q6,
// plan R12 choix 11). Ce que la page montre ensuite à un visiteur se teste dans
// public-members.test.ts.
//
// Scénario : docs/scenarios/refonte.md, R12, « Rendre sa page publique ». Trois membres : Inès
// (sa page), Max (un autre membre), Louis (l'administrateur).
import { ErrorResponse, MyPublicPage, type PublicPageSettings } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { later, visitorGestures } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let world: ReturnType<typeof visitorGestures>
let ines: string // cookies de session
let max: string
let louis: string
let inesId: string
let maxId: string

/** Les cases d'une page jamais réglée (migration 0025). */
const DEFAULTS: PublicPageSettings = {
  publicPage: false,
  showBio: true,
  showFavoriteTools: true,
  showProjects: true,
  showFollowerCount: false,
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  world = visitorGestures(ctx, act)
  ines = await ctx.verifiedMember({
    name: 'Inès Morel',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Maxence',
    email: 'max@example.com',
    password: 'max-long-password',
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

const read = async (cookie: string) => {
  const res = await act.send('GET', '/v1/me/public-page', cookie)
  expect(res.status).toBe(200)
  return MyPublicPage.parse(await res.json())
}

const patch = (cookie: string | null, body: unknown) => {
  later()
  return act.send('PATCH', '/v1/me/public-page', cookie, body)
}

/** Les cinq colonnes de `profile`, lues en base : ce qui est vraiment gardé. */
const stored = async (userId: string) =>
  (
    await ctx.db
      .select({
        publicPage: schema.profile.publicPage,
        showBio: schema.profile.publicBio,
        showFavoriteTools: schema.profile.publicTools,
        showProjects: schema.profile.publicProjects,
        showFollowerCount: schema.profile.publicFollowerCount,
      })
      .from(schema.profile)
      .where(eq(schema.profile.userId, userId))
  )[0] ?? DEFAULTS

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Ce qu'un visiteur reçoit de la page d'Inès : 200 si elle est ouverte. */
const visitorStatus = async () =>
  (await world.asVisitor(`/v1/public/members/${encodeURIComponent(inesId)}`)).status

describe('« Mon profil public »', () => {
  it('asks to sign in without a session', async () => {
    expect((await act.send('GET', '/v1/me/public-page', null)).status).toBe(401)
    expect((await patch(null, { publicPage: true })).status).toBe(401)
    // Témoin : avec une session, la route répond.
    expect((await act.send('GET', '/v1/me/public-page', ines)).status).toBe(200)
  })

  it('keeps the page closed by default, with the four boxes at their defaults', async () => {
    const page = await read(ines)
    expect(page.settings).toEqual(DEFAULTS)
    expect(page.webProjectCount).toBe(0)
    expect(page.projectCount).toBe(0)
    expect(await visitorStatus()).toBe(404)
  })

  it('opens the page and saves each of the five boxes', async () => {
    const opened = await patch(ines, { publicPage: true })
    expect(opened.status).toBe(200)
    expect(MyPublicPage.parse(await opened.json()).settings).toEqual({
      ...DEFAULTS,
      publicPage: true,
    })
    expect(await visitorStatus()).toBe(200)

    const all: PublicPageSettings = {
      publicPage: true,
      showBio: false,
      showFavoriteTools: false,
      showProjects: false,
      showFollowerCount: true,
    }
    const res = await patch(ines, all)
    expect(res.status).toBe(200)
    expect(MyPublicPage.parse(await res.json()).settings).toEqual(all)
    expect((await read(ines)).settings).toEqual(all)
    expect(await stored(inesId)).toEqual(all)
  })

  it('changes only the boxes sent', async () => {
    await ctx.openPublicPage(ines)
    expect((await patch(ines, { showBio: false })).status).toBe(200)
    expect((await patch(ines, { showFollowerCount: true })).status).toBe(200)

    expect(await stored(inesId)).toEqual({
      ...DEFAULTS,
      publicPage: true,
      showBio: false,
      showFollowerCount: true,
    })
  })

  it('keeps the boxes when the page is closed, for the next opening', async () => {
    await ctx.openPublicPage(ines, { showBio: false })
    expect((await patch(ines, { publicPage: false })).status).toBe(200)
    expect(await visitorStatus()).toBe(404)
    expect(await stored(inesId)).toEqual({ ...DEFAULTS, showBio: false })
  })

  it('refuses an empty body, an unknown box or a box that is not a boolean, and changes nothing', async () => {
    for (const body of [
      {},
      { showHandle: true },
      { publicPage: 'yes' },
      { publicPage: true, showHives: true },
      { showFollowerCount: null },
    ]) {
      await expectError(await patch(ines, body), 400, 'validation')
    }
    const garbage = await ctx.request('/v1/me/public-page', {
      method: 'PATCH',
      headers: { cookie: ines, 'content-type': 'application/json' },
      body: '{ pas du JSON',
    })
    expect(garbage.status).toBe(400)
    expect(await stored(inesId)).toEqual(DEFAULTS)
  })

  it('counts her public projects among her projects, private ones included, removed ones not', async () => {
    later()
    const meteo = await ctx.webProject(ines, { title: 'Météo du potager' })
    later()
    await ctx.webProject(ines, { title: 'Décollage !' })
    later()
    await act.publish(ines, 'Entre membres', { visibility: 'public' })
    later()
    await act.publish(ines, 'Mon carnet', { visibility: 'private' })
    later()
    const removed = await ctx.webProject(ines, { title: 'Retiré' })
    await world.remove(max, louis, { kind: 'project', id: removed })
    // Témoin : le projet de Max ne compte pas pour Inès.
    later()
    await ctx.webProject(max, { title: 'Le projet de Max' })

    const page = await read(ines)
    expect(page.webProjectCount).toBe(2)
    expect(page.projectCount).toBe(4)

    // « Membres » de nouveau : un projet public de moins.
    await world.setVisibility(ines, meteo, { visibility: 'public' })
    expect((await read(ines)).webProjectCount).toBe(1)
  })

  it('only ever changes the page of the member who asks', async () => {
    await ctx.openPublicPage(ines)
    // Max ferme « sa » page : celle d'Inès reste ouverte. La route ne prend aucun identifiant.
    expect((await patch(max, { publicPage: false, showBio: false })).status).toBe(200)
    expect(await stored(inesId)).toEqual({ ...DEFAULTS, publicPage: true })
    expect(await stored(maxId)).toEqual({ ...DEFAULTS, showBio: false })
    expect((await read(max)).settings.publicPage).toBe(false)
    expect(await visitorStatus()).toBe(200)
  })
})

describe('a suspended member', () => {
  it('lets a suspended member close her public page, and refuses with 403 suspended anything else', async () => {
    await ctx.openPublicPage(ines)
    await world.suspend(louis, inesId)

    // Elle lit toujours ses réglages.
    expect((await read(ines)).settings.publicPage).toBe(true)
    // Tout ce qui n'est pas « fermer » est refusé, même cocher ou décocher une case.
    for (const body of [{ publicPage: true }, { showFollowerCount: true }, { showBio: false }]) {
      await expectError(await patch(ines, body), 403, 'suspended')
    }
    expect(await stored(inesId)).toEqual({ ...DEFAULTS, publicPage: true })

    // Fermer, oui : la page se ferme pour les visiteurs, à l'instant.
    const closed = await patch(ines, { publicPage: false })
    expect(closed.status).toBe(200)
    expect(MyPublicPage.parse(await closed.json()).settings.publicPage).toBe(false)
    expect(await visitorStatus()).toBe(404)

    // Et elle ne peut pas la rouvrir tant que dure la suspension.
    await expectError(await patch(ines, { publicPage: true }), 403, 'suspended')
    expect((await stored(inesId)).publicPage).toBe(false)
  })
})
