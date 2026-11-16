// Tests d'intégration de R12 : la vitrine de l'accueil. La modération la règle d'un geste (PUT de la
// liste entière, quatre projets publics au plus, dans l'ordre), l'auteur est prévenu dans Activité
// (`showcase_added`) et peut quitter la vitrine (« Retirer de l'accueil ») ; son refus est gardé
// (`project.showcase_declined_at`) et une nouvelle mise en avant répond 409 `author_declined`
// (relecture juridique du plan, point 6, décision 18). Les membres lisent la vitrine dans « À la
// une » (GET /v1/showcase), avec les règles de blocage d'Explorer.
//
// Scénario : docs/scenarios/refonte.md, R12, « L'accueil : la vitrine, pour tout le monde ».
// Quatre membres : Inès et Zoé (autrices de projets publics), Max (un membre qui lit), Louis
// (l'administrateur).
import {
  ErrorResponse,
  ModerationShowcase,
  NotificationPage,
  ShowcaseItem,
  ShowcasePage,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nightlyPurge } from './jobs/nightly-purge'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { later, UNKNOWN_ID, visitorGestures } from './testing/visitor-world'

const DAY = 24 * 60 * 60 * 1000

let ctx: TestContext
let act: ReturnType<typeof activity>
let world: ReturnType<typeof visitorGestures>
let ines: string // cookies de session
let zoe: string
let max: string
let louis: string
let inesId: string
let zoeId: string
let maxId: string
let louisId: string

beforeEach(async () => {
  // Une fausse horloge, posée avant l'API (charte) : seule Date est remplacée.
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
  zoe = await ctx.verifiedMember({
    name: 'Zoé Garnier',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Maxence',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis Admin',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  inesId = (await act.me(ines)).id
  zoeId = (await act.me(zoe)).id
  maxId = (await act.me(max)).id
  louisId = (await act.me(louis)).id
  await act.makeAdmin(louisId)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** L'administrateur (ou un autre) envoie la vitrine entière, dans l'ordre (`ShowcaseOrder`). */
const putShowcase = (cookie: string | null, projectIds: string[]) => {
  later()
  return act.send('PUT', '/v1/moderation/showcase', cookie, { projectIds })
}

/** L'onglet « Vitrine de l'accueil », lu par l'administrateur. */
const moderationShowcase = async () => {
  const res = await act.send('GET', '/v1/moderation/showcase', louis)
  expect(res.status).toBe(200)
  return ModerationShowcase.parse(await res.json())
}

/** « À la une », lu par un membre (GET /v1/showcase). */
const memberShowcase = async (cookie: string) => {
  const res = await act.send('GET', '/v1/showcase', cookie)
  expect(res.status).toBe(200)
  return ShowcasePage.parse(await res.json())
}

/** La vitrine de l'accueil, lue par un visiteur sans compte. */
const visitorShowcase = async () =>
  ShowcasePage.parse(await world.visitorJson('/v1/public/showcase'))

/** La table `showcase`, dans l'ordre des places : ce que la base garde vraiment. */
const showcaseRows = () =>
  ctx.db
    .select({ projectId: schema.showcase.projectId, position: schema.showcase.position })
    .from(schema.showcase)
    .orderBy(asc(schema.showcase.position))

/** Le refus de l'auteur, lu en base. */
const declinedAt = async (projectId: string) =>
  (
    await ctx.db
      .select({ at: schema.project.showcaseDeclinedAt })
      .from(schema.project)
      .where(eq(schema.project.id, projectId))
  )[0]?.at ?? null

/** L'auteur quitte la vitrine (« Retirer de l'accueil »). */
const leave = (cookie: string | null, projectId: string) => {
  later()
  return act.send('DELETE', `/v1/projects/${projectId}/showcase`, cookie)
}

/** Les notifications « sur l'accueil » d'un membre. */
const showcaseNotices = async (cookie: string) => {
  const res = await act.send('GET', '/v1/notifications', cookie)
  expect(res.status).toBe(200)
  return NotificationPage.parse(await res.json()).items.filter(
    (item) => item.kind === 'showcase_added',
  )
}

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Trois projets publics : deux d'Inès, un de Zoé. */
const threeProjects = async () => {
  later()
  const meteo = await ctx.webProject(ines, { title: 'Météo du potager' })
  later()
  const fusee = await ctx.webProject(ines, { title: 'Décollage !' })
  later()
  const chorale = await ctx.webProject(zoe, { title: 'La chorale des moineaux' })
  return { meteo, fusee, chorale }
}

describe('the showcase, for the moderation', () => {
  it('puts public projects on the showcase in the chosen order, four at most', async () => {
    const { meteo, fusee, chorale } = await threeProjects()

    expect([200, 204]).toContain((await putShowcase(louis, [chorale, meteo, fusee])).status)

    expect(await showcaseRows()).toEqual([
      { projectId: chorale, position: 1 },
      { projectId: meteo, position: 2 },
      { projectId: fusee, position: 3 },
    ])
    const tab = await moderationShowcase()
    expect(tab.items.map((item) => [item.project.id, item.position])).toEqual([
      [chorale, 1],
      [meteo, 2],
      [fusee, 3],
    ])
    // Les candidats sont les projets publics qui n'y sont pas encore.
    expect(tab.candidates.map((candidate) => candidate.project.id)).not.toContain(meteo)
    expect((await visitorShowcase()).items.map((item) => item.id)).toEqual([chorale, meteo, fusee])
    expect((await memberShowcase(max)).items.map((item) => item.id)).toEqual([
      chorale,
      meteo,
      fusee,
    ])

    // Cinq projets, ou deux fois le même : refusé par la forme, rien ne change.
    later()
    const fourth = await ctx.webProject(zoe, { title: 'Quatrième' })
    later()
    const fifth = await ctx.webProject(zoe, { title: 'Cinquième' })
    await expectError(
      await putShowcase(louis, [chorale, meteo, fusee, fourth, fifth]),
      400,
      'validation',
    )
    await expectError(await putShowcase(louis, [meteo, meteo]), 400, 'validation')
    expect((await showcaseRows()).map((row) => row.projectId)).toEqual([chorale, meteo, fusee])
  })

  it('reorders and empties the showcase with the whole list', async () => {
    const { meteo, fusee, chorale } = await threeProjects()
    await world.setShowcase(louis, [meteo, fusee, chorale])

    await world.setShowcase(louis, [chorale, meteo])
    expect(await showcaseRows()).toEqual([
      { projectId: chorale, position: 1 },
      { projectId: meteo, position: 2 },
    ])
    expect((await visitorShowcase()).items.map((item) => item.id)).toEqual([chorale, meteo])

    await world.setShowcase(louis, [])
    expect(await showcaseRows()).toEqual([])
    expect((await visitorShowcase()).items).toEqual([])
    expect((await memberShowcase(max)).items).toEqual([])
  })

  it('refuses a project that is not public, removed or unknown like an unknown one, and changes nothing', async () => {
    const { meteo } = await threeProjects()
    await world.setShowcase(louis, [meteo])
    later()
    const members = (await act.publish(ines, 'Entre membres', { visibility: 'public' })).id
    later()
    const secret = (await act.publish(ines, 'Mon carnet', { visibility: 'private' })).id
    later()
    const removed = await ctx.webProject(zoe, { title: 'Retiré' })
    await world.remove(max, louis, { kind: 'project', id: removed })

    const unknown = await putShowcase(louis, [meteo, UNKNOWN_ID])
    expect(unknown.status).toBe(404)
    const unknownBody = await unknown.text()
    for (const id of [members, secret, removed]) {
      const res = await putShowcase(louis, [meteo, id])
      expect(res.status, id).toBe(404)
      expect(await res.text(), id).toBe(unknownBody)
    }
    expect(await showcaseRows()).toEqual([{ projectId: meteo, position: 1 }])
  })

  it('answers like a route that does not exist to anyone but an administrator', async () => {
    const { meteo } = await threeProjects()
    const nowhere = await act.send('GET', '/v1/moderation/nowhere', max)
    expect(nowhere.status).toBe(404)
    const nowhereBody = await nowhere.text()

    for (const [who, cookie] of [
      ['anonymous', null],
      ['member', max],
      ['author', ines],
    ] as const) {
      const read = await act.send('GET', '/v1/moderation/showcase', cookie)
      expect(read.status, `${who} GET`).toBe(404)
      expect(await read.text(), `${who} GET`).toBe(nowhereBody)
      const write = await putShowcase(cookie, [meteo])
      expect(write.status, `${who} PUT`).toBe(404)
    }
    expect(await showcaseRows()).toEqual([])
    // Témoin : l'administrateur, lui, y arrive.
    expect([200, 204]).toContain((await putShowcase(louis, [meteo])).status)
  })

  it('lists the public projects that are not on the showcase as candidates, with the refusal of their author', async () => {
    const { meteo, fusee, chorale } = await threeProjects()
    later()
    const members = (await act.publish(zoe, 'Entre membres', { visibility: 'public' })).id
    await world.setShowcase(louis, [meteo, fusee])
    expect((await leave(ines, fusee)).status).toBe(204)

    const { items, candidates } = await moderationShowcase()
    expect(items.map((item) => item.project.id)).toEqual([meteo])
    const byId = new Map(candidates.map((candidate) => [candidate.project.id, candidate]))
    expect(byId.has(meteo)).toBe(false)
    expect(byId.has(members)).toBe(false)
    expect(byId.get(chorale)?.showcaseDeclinedAt).toBeNull()
    expect(byId.get(fusee)?.showcaseDeclinedAt).toBe(new Date(Date.now()).toISOString())
    // L'auteur d'un candidat est nommé pour la modération, sans pseudo.
    expect(byId.get(chorale)?.project.author).toEqual({ id: zoeId, name: 'Zoé Garnier' })
  })

  it('says when a showcase project was edited since it was added', async () => {
    const { meteo, fusee } = await threeProjects()
    await world.setShowcase(louis, [meteo, fusee])
    expect((await moderationShowcase()).items.map((item) => item.editedSinceAdded)).toEqual([
      false,
      false,
    ])

    later()
    const edit = await act.send('PATCH', `/v1/projects/${fusee}`, ines, {
      title: 'Décollage, version 2',
    })
    expect(edit.status).toBe(200)

    const items = (await moderationShowcase()).items
    expect(items.map((item) => [item.project.id, item.editedSinceAdded])).toEqual([
      [meteo, false],
      [fusee, true],
    ])
    expect(items[1]?.project.title).toBe('Décollage, version 2')
  })
})

describe("the author leaves the showcase (« Retirer de l'accueil »)", () => {
  it('lets the author take her project off the showcase, and keeps her refusal', async () => {
    const { meteo, chorale } = await threeProjects()
    await world.setShowcase(louis, [meteo, chorale])

    const res = await leave(ines, meteo)
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')

    expect(await showcaseRows()).toEqual([{ projectId: chorale, position: expect.any(Number) }])
    expect(await declinedAt(meteo)).not.toBeNull()
    expect((await visitorShowcase()).items.map((item) => item.id)).toEqual([chorale])
    expect((await memberShowcase(max)).items.map((item) => item.id)).toEqual([chorale])
    // Le projet, lui, reste public.
    expect((await world.asVisitor(`/v1/public/projects/${meteo}`)).status).toBe(200)
  })

  it('refuses with 409 author_declined to put back a project its author took off, and changes nothing', async () => {
    const { meteo, chorale } = await threeProjects()
    await world.setShowcase(louis, [meteo, chorale])
    expect((await leave(ines, meteo)).status).toBe(204)

    await expectError(await putShowcase(louis, [chorale, meteo]), 409, 'author_declined')
    expect(await showcaseRows()).toEqual([{ projectId: chorale, position: expect.any(Number) }])
    // Le refus tient même après une vitrine vidée puis refaite.
    await world.setShowcase(louis, [])
    await expectError(await putShowcase(louis, [meteo]), 409, 'author_declined')
    expect(await showcaseRows()).toEqual([])
    // Aucune nouvelle notice pour Inès.
    expect(await showcaseNotices(ines)).toHaveLength(1)
  })

  it('refuses another member taking a project off the showcase, and answers 404 for an unknown one', async () => {
    const { meteo } = await threeProjects()
    await world.setShowcase(louis, [meteo])

    expect((await leave(null, meteo)).status).toBe(401)
    await expectError(await leave(max, meteo), 403, 'forbidden')
    // L'administrateur passe par l'onglet, jamais par la route de l'auteur.
    await expectError(await leave(louis, meteo), 403, 'forbidden')
    await expectError(await leave(ines, UNKNOWN_ID), 404, 'not_found')
    await expectError(await leave(ines, 'pas-un-identifiant'), 404, 'not_found')

    expect(await showcaseRows()).toEqual([{ projectId: meteo, position: 1 }])
    expect(await declinedAt(meteo)).toBeNull()
  })

  it('lets a suspended author take her project off the showcase', async () => {
    const { meteo } = await threeProjects()
    await world.setShowcase(louis, [meteo])
    await world.suspend(louis, inesId)

    expect((await leave(ines, meteo)).status).toBe(204)
    expect(await showcaseRows()).toEqual([])
    expect(await declinedAt(meteo)).not.toBeNull()
  })
})

describe('the notice in Activity', () => {
  it('tells the author in Activity when her project is put on the showcase, signed by the team', async () => {
    const { meteo, chorale } = await threeProjects()
    const before = ctx.mailer.sent.length

    await world.setShowcase(louis, [meteo, chorale])

    const notices = await showcaseNotices(ines)
    expect(notices).toHaveLength(1)
    const [notice] = notices
    expect(notice).toMatchObject({
      kind: 'showcase_added',
      project: { id: meteo, title: 'Météo du potager' },
      onShowcase: true,
    })
    // Jamais le nom ni l'identifiant de l'administrateur qui l'a choisi.
    const raw = JSON.stringify(notice)
    expect(raw).not.toContain(louisId)
    expect(raw).not.toContain('Louis Admin')
    // Zoé a la sienne ; Max, qui n'a rien publié, n'en a aucune.
    expect((await showcaseNotices(zoe)).map((one) => one.project.id)).toEqual([chorale])
    expect(await showcaseNotices(max)).toEqual([])
    // Jamais par e-mail.
    expect(ctx.mailer.sent.slice(before)).toEqual([])

    // Changer l'ordre n'est pas une nouvelle mise en avant.
    await world.setShowcase(louis, [chorale, meteo])
    expect(await showcaseNotices(ines)).toHaveLength(1)
  })

  it("turns off « Retirer de l'accueil » once the project left the showcase", async () => {
    const { meteo, fusee } = await threeProjects()
    await world.setShowcase(louis, [meteo, fusee])

    expect((await leave(ines, meteo)).status).toBe(204)
    await world.setShowcase(louis, [])

    const notices = await showcaseNotices(ines)
    // L'une quittée par l'autrice, l'autre par la modération : plus de « Retirer de l'accueil ».
    expect(new Map(notices.map((one) => [one.project.id, one.onShowcase]))).toEqual(
      new Map([
        [meteo, false],
        [fusee, false],
      ]),
    )
  })

  it('hides the notice when the project stops being public, is removed or deleted', async () => {
    const { meteo, fusee, chorale } = await threeProjects()
    await world.setShowcase(louis, [meteo, fusee, chorale])
    expect(await showcaseNotices(ines)).toHaveLength(2)
    expect(await showcaseNotices(zoe)).toHaveLength(1)

    await world.setVisibility(ines, meteo, { visibility: 'public' })
    later()
    expect((await act.send('DELETE', `/v1/projects/${fusee}`, ines)).status).toBe(204)
    await world.remove(max, louis, { kind: 'project', id: chorale })

    expect(await showcaseNotices(ines)).toEqual([])
    expect(await showcaseNotices(zoe)).toEqual([])
  })

  it('purges a showcase notice after 90 days, with the other notifications', async () => {
    const { meteo } = await threeProjects()
    await world.setShowcase(louis, [meteo])
    const notices = () =>
      ctx.db
        .select({ id: schema.showcaseNotice.id })
        .from(schema.showcaseNotice)
        .where(eq(schema.showcaseNotice.memberId, inesId))
    expect(await notices()).toHaveLength(1)

    await nightlyPurge(ctx.db, new Date(Date.now() + 89 * DAY), ctx.storage)
    expect(await notices()).toHaveLength(1)
    await nightlyPurge(ctx.db, new Date(Date.now() + 91 * DAY), ctx.storage)
    expect(await notices()).toEqual([])
  })

  it('deletes the showcase notices and rows of a deleted account', async () => {
    const { meteo, chorale } = await threeProjects()
    await world.setShowcase(louis, [meteo, chorale])

    await act.deleteAccount(ines, 'ines-long-password')

    expect((await showcaseRows()).map((row) => row.projectId)).toEqual([chorale])
    const left = await ctx.db
      .select({ memberId: schema.showcaseNotice.memberId })
      .from(schema.showcaseNotice)
    expect(left).toEqual([{ memberId: zoeId }])
  })
})

describe('leaving the showcase', () => {
  it('takes a project off the showcase at once when it is removed by the moderation or deleted', async () => {
    const { meteo, fusee, chorale } = await threeProjects()
    await world.setShowcase(louis, [meteo, fusee, chorale])

    await world.remove(max, louis, { kind: 'project', id: meteo })
    later()
    expect((await act.send('DELETE', `/v1/projects/${fusee}`, ines)).status).toBe(204)

    expect((await visitorShowcase()).items.map((item) => item.id)).toEqual([chorale])
    expect((await memberShowcase(max)).items.map((item) => item.id)).toEqual([chorale])
    expect((await moderationShowcase()).items.map((item) => item.project.id)).toEqual([chorale])
  })
})

describe('« À la une », for members', () => {
  it('gives members the showcase in its order, with the cards of a visitor', async () => {
    const { meteo, chorale } = await threeProjects()
    await world.setShowcase(louis, [chorale, meteo])

    expect((await act.send('GET', '/v1/showcase', null)).status).toBe(401)
    const page = await memberShowcase(max)
    expect(page.items.map((item) => item.id)).toEqual([chorale, meteo])
    // La même carte que pour un visiteur : les clés de `ShowcaseItem`, l'auteur réduit à son nom
    // et à sa photo, ni identifiant ni pseudo.
    for (const item of page.items) {
      expect(Object.keys(item).sort()).toEqual(Object.keys(ShowcaseItem.shape).sort())
      expect(Object.keys(item.author).sort()).toEqual(['avatarUrl', 'name'])
    }
    expect(page.items[0]?.author.name).toBe('Zoé Garnier')
    expect(page).toEqual(await visitorShowcase())
    const raw = JSON.stringify(page)
    expect(raw).not.toContain(inesId)
    expect(raw).not.toContain(zoeId)
    expect(raw).not.toContain('handle')
  })

  it('leaves out of « À la une » a showcase project of a member blocked either way', async () => {
    const { meteo, chorale } = await threeProjects()
    await world.setShowcase(louis, [meteo, chorale])
    // Témoin : Max voit les deux.
    expect((await memberShowcase(max)).items.map((item) => item.id)).toEqual([meteo, chorale])

    // Inès bloque Max : il ne voit plus le projet d'Inès.
    later()
    await act.block(maxId, ines)
    expect((await memberShowcase(max)).items.map((item) => item.id)).toEqual([chorale])
    // Max bloque Zoé : il ne voit plus le sien non plus.
    later()
    await act.block(zoeId, max)
    expect((await memberShowcase(max)).items).toEqual([])
    // Inès et Zoé voient encore les deux projets : aucun blocage ne les sépare l'une de l'autre.
    expect((await memberShowcase(ines)).items.map((item) => item.id)).toEqual([meteo, chorale])
    expect((await memberShowcase(zoe)).items.map((item) => item.id)).toEqual([meteo, chorale])
    // Un visiteur n'a pas de blocage : la vitrine de l'accueil ne change pas.
    expect((await visitorShowcase()).items.map((item) => item.id)).toEqual([meteo, chorale])

    // Débloquer rend le projet.
    later()
    await act.unblock(maxId, ines)
    expect((await memberShowcase(max)).items.map((item) => item.id)).toEqual([meteo])
  })

  it('shows the next photo as the cover of a showcase card when the first one is removed', async () => {
    later()
    const meteo = await ctx.webProject(ines, { title: 'Météo du potager' })
    const first = await world.uploadVisual(ines, meteo)
    const second = await world.uploadVisual(ines, meteo)
    await world.setShowcase(louis, [meteo])
    // Témoin : la première photo est la couverture.
    expect((await memberShowcase(max)).items[0]?.cover?.id).toBe(first.id)

    await world.remove(
      max,
      louis,
      { kind: 'project', id: meteo },
      { field: 'photo', mediaId: first.id },
    )

    const page = await memberShowcase(max)
    expect(page.items[0]?.cover?.id).toBe(second.id)
    expect(JSON.stringify(page)).not.toContain(first.id)
    expect((await visitorShowcase()).items[0]?.cover?.id).toBe(second.id)
  })

  it('shows no cover when the project has no photo', async () => {
    const { meteo } = await threeProjects()
    await world.setShowcase(louis, [meteo])
    expect((await memberShowcase(max)).items[0]?.cover).toBeNull()
  })
})
