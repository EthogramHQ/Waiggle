// Tests d'intégration de R12 : un projet « Public » (`visibility: 'web'`) lu par un visiteur sans
// compte, par GET /v1/public/projects/{id} et ses mises à jour (la liste, et une seule par son id).
// Scénario : docs/scenarios/refonte.md, « R12 — Les projets publics », « Ce que voit un visiteur sans
// compte » ; plan R12, choix 2 (routes à part, liste blanche, le même 404), décisions 3 (jamais de
// cache partagé), 6 (la limite de lecture d'un réseau) et 7 (la démo, les catégories nommées).
//
// Trois membres : Léa (l'autrice), Max (un autre membre, qui commente, suit, teste et réagit),
// Louis (l'administrateur, pour les retraits). Le visiteur n'a pas de compte : `ctx.visitor`, sans
// cookie, depuis sa propre adresse IP.
import {
  CategoryList,
  ErrorResponse,
  Member,
  PublicProject,
  PublicUpdate,
  PublicUpdatesPage,
} from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { seedHive } from './testing/hive-seeds'
import { expectNoSharedCache, later, UNKNOWN_ID, visitorGestures } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let world: ReturnType<typeof visitorGestures>
let lea: string // cookies de session
let max: string
let louis: string
let leaId: string
let maxId: string

beforeEach(async () => {
  // La fausse horloge est posée avant de créer l'API (la limite de débit garde la fonction Date.now
  // qu'elle trouve à ce moment-là).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  world = visitorGestures(ctx, act)
  lea = await ctx.verifiedMember({
    name: 'Léa Fournier',
    email: 'lea@example.com',
    password: 'lea-long-password',
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
  leaId = (await act.me(lea)).id
  maxId = (await act.me(max)).id
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** « Décollage ! », public, avec tout ce que l'auteur peut écrire (Q5). */
const fullWebProject = async () => {
  later()
  return ctx.webProject(lea, {
    description: 'Un compte à rebours, une fusée en carton, et beaucoup de cris de joie.',
    prompts: ['Écris un compte à rebours qui finit par une fusée en ASCII.'],
    tools: ['Claude'],
    status: 'testable',
    secondaryCategory: 'family',
    difficulty: 'easy',
    startedOn: '2026-09',
    demoUrl: 'https://decollage.example.org/jouer',
  })
}

const publicProject = async (id: string, query = '') =>
  PublicProject.parse(await world.visitorJson(`/v1/public/projects/${id}${query}`))

describe('a public project, for a visitor without an account', () => {
  it('shows a public project to a visitor without an account, with everything its author wrote', async () => {
    const id = await fullWebProject()

    const project = await publicProject(id)
    expect(project).toMatchObject({
      id,
      title: 'Décollage !',
      pitch: 'Un compte à rebours pour la fusée du jardin.',
      description: 'Un compte à rebours, une fusée en carton, et beaucoup de cris de joie.',
      status: 'testable',
      prompts: ['Écris un compte à rebours qui finit par une fusée en ASCII.'],
      difficulty: 'easy',
      startedOn: '2026-09',
      reactionCount: 0,
      latestUpdate: null,
      updateCount: 0,
      latestUpdateAt: null,
      author: { id: leaId, name: 'Léa Fournier', avatarUrl: null, publicPage: false },
    })
    expect(project.categories.map((category) => category.code)).toEqual(['home-garden', 'family'])
    expect(project.tools.map((tool) => tool.label)).toEqual(['Claude'])
    // Un projet public a toujours une date de première publication (le contrat l'exige).
    expect(project.publishedAt).toBe('2026-11-17T08:00:01.000Z')
  })

  it('gives a visitor only the fields of the white list, never comments, followers, hive, testers or handle', async () => {
    const id = await fullWebProject()
    // Léa anime une ruche ; Max commente, suit le projet et Léa, rejoint les testeurs et réagit.
    await seedHive(ctx.db, { name: 'Les Zygomatiques', animatorId: leaId, members: [maxId] })
    later()
    await act.comment(id, max, 'Superbe fusée, on a crié avec les enfants !')
    later()
    expect((await act.send('POST', `/v1/projects/${id}/follow`, max)).status).toBe(204)
    later()
    await act.followMember(leaId, max)
    later()
    expect((await act.send('POST', `/v1/projects/${id}/testers`, max)).status).toBe(204)
    later()
    await act.react(id, 'bravo', max)
    const handle = Member.parse(
      await (await act.send('GET', `/v1/members/${encodeURIComponent(leaId)}`, max)).json(),
    ).handle

    const answer = await world.asVisitor(`/v1/public/projects/${id}`)
    expect(answer.status).toBe(200)
    const body = JSON.parse(answer.body) as Record<string, unknown>
    // Exactement les champs du contrat, et l'auteur réduit à son nom, sa photo et sa page.
    expect(Object.keys(body).sort()).toEqual(Object.keys(PublicProject.shape).sort())
    expect(Object.keys(body.author as object).sort()).toEqual([
      'avatarUrl',
      'id',
      'name',
      'publicPage',
    ])
    // Ni les gestes des membres, ni la ruche, ni le pseudo (Q8, A14).
    expect(answer.body).not.toContain('Superbe fusée')
    expect(answer.body).not.toContain('Maxence')
    expect(answer.body).not.toContain(maxId)
    expect(answer.body).not.toContain('Les Zygomatiques')
    expect(answer.body).not.toContain(`"${handle}"`)
    expect(answer.body).not.toContain(`@${handle}`)
    expect(answer.body).not.toMatch(
      /"(comment|follow|hive|tester|handle|reacted|myReaction|removal|removedPart)\w*"\s*:/i,
    )
    // Les réactions : un nombre, jamais qui ni le détail par type.
    expect(body.reactionCount).toBe(1)
  })

  it('names the categories in the language of the address', async () => {
    const id = await fullWebProject()
    // Les noms attendus : ceux que l'API donne aux membres dans chaque langue.
    const namesIn = async (language: string) => {
      const res = await ctx.request('/v1/categories', {
        headers: { cookie: max, 'accept-language': language },
      })
      const { categories } = CategoryList.parse(await res.json())
      return ['home-garden', 'family'].map(
        (code) => categories.find((category) => category.code === code)?.name,
      )
    }
    const french = await namesIn('fr')
    const english = await namesIn('en')
    expect(french).not.toEqual(english)

    const names = async (query: string, headers: Record<string, string> = {}) => {
      const res = await ctx.visitor(`/v1/public/projects/${id}${query}`, { headers })
      expect(res.status).toBe(200)
      return PublicProject.parse(await res.json()).categories.map((category) => category.name)
    }
    expect(await names('?lang=fr', { 'accept-language': 'en' })).toEqual(french)
    expect(await names('?lang=en', { 'accept-language': 'fr' })).toEqual(english)
    // Sans `lang` : la langue de `Accept-Language`, sinon le français.
    expect(await names('', { 'accept-language': 'en' })).toEqual(english)
    expect(await names('')).toEqual(french)
  })

  it('gives the demo address and its domain, so « Tester la démo » can open the exit page', async () => {
    const id = await fullWebProject()
    expect((await publicProject(id)).demo).toEqual({
      url: 'https://decollage.example.org/jouer',
      domain: 'decollage.example.org',
    })
    // Sans démo : null.
    later()
    const without = await ctx.webProject(lea, { title: 'Sans démo' })
    expect((await publicProject(without)).demo).toBeNull()
  })

  it('says whether the page of the author is public', async () => {
    const id = await fullWebProject()
    expect((await publicProject(id)).author.publicPage).toBe(false)
    later()
    await ctx.openPublicPage(lea)
    expect((await publicProject(id)).author.publicPage).toBe(true)
  })

  it('hides a removed description, prompt, tools, demo link, photo and portrait cover from a visitor', async () => {
    const id = await fullWebProject()
    const photo = await world.uploadVisual(lea, id)
    const kept = await world.uploadVisual(lea, id)
    const portrait = await world.uploadVisual(lea, id, 'portrait')
    // Témoin : avant les retraits, le visiteur voit tout.
    const before = await publicProject(id)
    expect(before.visuals.map((visual) => visual.id)).toEqual([photo.id, kept.id])
    expect(before.portraitCover?.id).toBe(portrait.id)
    expect(before.demo).not.toBeNull()

    const target = { kind: 'project', id } as const
    await world.remove(max, louis, target, { field: 'description' })
    await world.remove(max, louis, target, { field: 'prompt' })
    await world.remove(max, louis, target, { field: 'tools' })
    await world.remove(max, louis, target, { field: 'demoUrl' })
    await world.remove(max, louis, target, { field: 'photo', mediaId: photo.id })
    await world.remove(max, louis, target, { field: 'cover', mediaId: portrait.id })

    const answer = await world.asVisitor(`/v1/public/projects/${id}`)
    const after = PublicProject.parse(JSON.parse(answer.body))
    expect(after.description).toBe('')
    expect(after.prompts).toEqual([])
    expect(after.tools).toEqual([])
    expect(after.demo).toBeNull()
    expect(after.visuals.map((visual) => visual.id)).toEqual([kept.id])
    expect(after.portraitCover).toBeNull()
    for (const gone of ['cris de joie', 'ASCII', 'decollage.example.org', photo.id, portrait.id])
      expect(answer.body).not.toContain(gone)
  })

  it('answers a project that is not public with the same 404 as an unknown one', async () => {
    later()
    const forMembers = (await act.publish(lea, 'Pour les membres')).id
    later()
    const secret = (await act.publish(lea, 'Secret', { visibility: 'private' })).id
    const webId = await fullWebProject()
    const unknown = await world.asVisitor(`/v1/public/projects/${UNKNOWN_ID}`)
    expect(unknown.status).toBe(404)
    expect(ErrorResponse.parse(JSON.parse(unknown.body)).error.code).toBe('not_found')

    for (const id of [forMembers, secret, 'not-an-id'])
      expect(await world.asVisitor(`/v1/public/projects/${id}`), id).toEqual(unknown)
    for (const id of [forMembers, secret])
      expect(await world.asVisitor(`/v1/public/projects/${id}/updates`), id).toEqual(
        await world.asVisitor(`/v1/public/projects/${UNKNOWN_ID}/updates`),
      )
    // Témoin : le projet public, lui, répond.
    expect((await world.asVisitor(`/v1/public/projects/${webId}`)).status).toBe(200)
  })

  it('gives a signed-in member the same visitor view, without reading the session', async () => {
    const id = await fullWebProject()
    later()
    const secret = (await act.publish(lea, 'Secret', { visibility: 'private' })).id
    const visitorView = await world.asVisitor(`/v1/public/projects/${id}`)
    expect(visitorView.status).toBe(200)

    // Max, connecté, lit la même chose qu'un visiteur ; Léa n'y lit pas son projet privé.
    const asMax = await ctx.request(`/v1/public/projects/${id}`, { headers: { cookie: max } })
    expect(await asMax.text()).toBe(visitorView.body)
    const own = await ctx.request(`/v1/public/projects/${secret}`, { headers: { cookie: lea } })
    expect(own.status).toBe(404)
    expect(await own.text()).toBe((await world.asVisitor(`/v1/public/projects/${UNKNOWN_ID}`)).body)
  })

  it('never lets a shared cache keep a visitor read', async () => {
    const id = await fullWebProject()
    const update = await world.publishUpdate(lea, id)
    for (const path of [
      `/v1/public/projects/${id}`,
      `/v1/public/projects/${id}/updates`,
      `/v1/public/projects/${id}/updates/${update.id}`,
    ]) {
      const answer = await world.asVisitor(path)
      expect(answer.status, path).toBe(200)
      expectNoSharedCache(answer.cacheControl, path)
    }
  })
})

describe('the updates of a public project, for a visitor', () => {
  it('lists the updates of a public project to a visitor, newest first, without removed ones', async () => {
    const id = await fullWebProject()
    const first = await world.publishUpdate(lea, id, [], 'La fusée décolle enfin.')
    const second = await world.publishUpdate(lea, id, [], 'Un deuxième étage, en bouchons.')
    const third = await world.publishUpdate(lea, id, [], 'Un mot grossier, à retirer.')
    await world.remove(max, louis, { kind: 'update', id: third.id })

    const answer = await world.asVisitor(`/v1/public/projects/${id}/updates`)
    expect(answer.status).toBe(200)
    const page = PublicUpdatesPage.parse(JSON.parse(answer.body))
    expect(page.items.map((item) => item.id)).toEqual([second.id, first.id])
    expect(page.nextCursor).toBeNull()
    expect(answer.body).not.toContain('grossier')

    const project = await publicProject(id)
    expect(project.updateCount).toBe(2)
    expect(project.latestUpdate?.id).toBe(second.id)
    expect(project.latestUpdateAt).toBe(project.latestUpdate?.createdAt)
  })

  it('hides a removed update photo from a visitor, in the list, by its id and on the project', async () => {
    const id = await fullWebProject()
    const before = await world.uploadVisual(lea, id, 'update')
    const after = await world.uploadVisual(lea, id, 'update')
    const update = await world.publishUpdate(lea, id, [before.id, after.id])
    // Témoin : avant le retrait, le visiteur voit les deux photos.
    const shown = PublicUpdate.parse(
      await world.visitorJson(`/v1/public/projects/${id}/updates/${update.id}`),
    )
    expect(shown.photos.map((photo) => photo.id)).toEqual([before.id, after.id])

    await world.remove(
      max,
      louis,
      { kind: 'update', id: update.id },
      {
        field: 'photo',
        mediaId: before.id,
      },
    )

    const list = PublicUpdatesPage.parse(
      await world.visitorJson(`/v1/public/projects/${id}/updates`),
    )
    expect(list.items[0]?.photos.map((photo) => photo.id)).toEqual([after.id])
    const one = await world.asVisitor(`/v1/public/projects/${id}/updates/${update.id}`)
    expect(PublicUpdate.parse(JSON.parse(one.body)).photos.map((photo) => photo.id)).toEqual([
      after.id,
    ])
    expect(one.body).not.toContain(before.id)
    expect((await publicProject(id)).latestUpdate?.photos.map((photo) => photo.id)).toEqual([
      after.id,
    ])
  })

  it('shows one update by its id, and the 404 of an unknown one for a removed update or one of another project', async () => {
    const id = await fullWebProject()
    later()
    const other = await ctx.webProject(lea, { title: 'Autre fusée' })
    const shown = await world.publishUpdate(lea, id, [], 'La fusée décolle enfin.')
    const elsewhere = await world.publishUpdate(lea, other, [], 'Une autre fusée.')
    const removed = await world.publishUpdate(lea, id, [], 'À retirer.')
    await world.remove(max, louis, { kind: 'update', id: removed.id })

    const update = PublicUpdate.parse(
      await world.visitorJson(`/v1/public/projects/${id}/updates/${shown.id}`),
    )
    expect(update.lines.map((line) => line.text)).toEqual(['La fusée décolle enfin.'])

    const unknown = await world.asVisitor(`/v1/public/projects/${id}/updates/${UNKNOWN_ID}`)
    expect(unknown.status).toBe(404)
    for (const updateId of [elsewhere.id, removed.id, 'not-an-id'])
      expect(
        await world.asVisitor(`/v1/public/projects/${id}/updates/${updateId}`),
        updateId,
      ).toEqual(unknown)
  })
})

describe('the read limit of a visitor network (decision 6)', () => {
  // Un réseau IPv6 /64 (celui d'une box, d'un téléphone) ; le voisin est un autre /64.
  const network = (host: number) => `2001:db8:12:34::${host.toString(16)}`
  const neighbour = '2001:db8:12:35::1'
  const LIMIT = 300

  it('answers 429 past the visitor read limit of one network, without counting members', async () => {
    const id = await fullWebProject()
    // Max lit des pages de membres depuis le même réseau : la limite des visiteurs ne les compte pas.
    for (let i = 0; i < 20; i += 1) {
      const res = await ctx.request(`/v1/projects/${id}`, {
        headers: { cookie: max, 'x-real-ip': network(200) },
      })
      expect(res.status).toBe(200)
    }
    // Chaque demande compte, même une adresse fausse (mal formée : 404 sans lire la base), et
    // d'où qu'elle vienne dans le réseau.
    for (let i = 0; i < LIMIT - 1; i += 1) {
      const res = await ctx.visitor('/v1/public/projects/not-an-id', {}, network(1 + (i % 100)))
      expect(res.status, `read ${i + 1}`).toBe(404)
    }
    // La 300e passe encore : les lectures de Max n'ont pas compté.
    expect((await ctx.visitor(`/v1/public/projects/${id}`, {}, network(7))).status).toBe(200)

    const refused = await ctx.visitor(`/v1/public/projects/${id}`, {}, network(9))
    expect(refused.status).toBe(429)
    expect(ErrorResponse.parse(await refused.json()).error.code).toBe('rate_limited')
    expect((await ctx.visitor(`/v1/public/projects/${id}/updates`, {}, network(10))).status).toBe(
      429,
    )
    // Un autre réseau n'est pas touché ; ni la tête des pages ni le plan du site, exemptés.
    expect((await ctx.visitor(`/v1/public/projects/${id}`, {}, neighbour)).status).toBe(200)
    expect(
      (await ctx.visitor(`/v1/public/head?path=/fr/projects/${id}&lang=fr`, {}, network(11)))
        .status,
    ).toBe(200)
    expect((await ctx.visitor('/v1/public/sitemap', {}, network(12))).status).toBe(200)
    // Ni les membres sur leurs routes.
    const member = await ctx.request(`/v1/projects/${id}`, {
      headers: { cookie: max, 'x-real-ip': network(13) },
    })
    expect(member.status).toBe(200)

    // Dix minutes plus tard, la fenêtre est passée.
    vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1000)
    expect((await ctx.visitor(`/v1/public/projects/${id}`, {}, network(14))).status).toBe(200)
  }, 120_000)
})
