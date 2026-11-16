// Tests d'intégration de R12 : ce que l'export (« Télécharger mes données », GET /v1/me/export)
// ajoute pour les projets publics : la visibilité « Public » de chaque projet, le choix « page
// publique » et ses cases, la présence dans la vitrine et le refus de l'autrice (« Retirer de
// l'accueil », relecture juridique du plan, point 6 : un refus se garde et s'exporte comme un
// accord). Jamais l'administrateur qui a choisi la vitrine, jamais l'adresse d'un visiteur qui a
// signalé (elle n'appartient à aucun membre).
//
// Scénario : docs/scenarios/refonte.md, R12, « Mes données ». Trois membres : Inès (l'autrice),
// Zoé (une autre autrice), Louis (l'administrateur).
import { AccountExport } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { later, visitorGestures } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let world: ReturnType<typeof visitorGestures>
let ines: string // cookies de session
let zoe: string
let louis: string
let louisId: string

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
  zoe = await ctx.verifiedMember({
    name: 'Zoé Garnier',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  louisId = (await act.me(louis)).id
  await act.makeAdmin(louisId)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const exportOf = async (cookie: string) => {
  later()
  const res = await act.send('GET', '/v1/me/export', cookie)
  expect(res.status).toBe(200)
  const raw = await res.text()
  return { raw, data: AccountExport.parse(JSON.parse(raw)) }
}

describe('the public page in the export', () => {
  it('exports the public page choice and its five boxes', async () => {
    expect((await exportOf(ines)).data.publicPage).toEqual({
      publicPage: false,
      showBio: true,
      showFavoriteTools: true,
      showProjects: true,
      showFollowerCount: false,
    })

    later()
    await ctx.openPublicPage(ines, { showBio: false, showFollowerCount: true })

    expect((await exportOf(ines)).data.publicPage).toEqual({
      publicPage: true,
      showBio: false,
      showFavoriteTools: true,
      showProjects: true,
      showFollowerCount: true,
    })
  })

  it('exports the « Public » visibility of each project', async () => {
    later()
    const web = await ctx.webProject(ines, { title: 'Météo du potager' })
    later()
    const members = (await act.publish(ines, 'Entre membres', { visibility: 'public' })).id

    const { projects } = (await exportOf(ines)).data
    expect(new Map(projects.map((project) => [project.id, project.visibility]))).toEqual(
      new Map([
        [web, 'web'],
        [members, 'public'],
      ]),
    )
  })
})

describe('the showcase in the export', () => {
  it('exports the showcase presence of her projects and her refusal, never who chose them', async () => {
    later()
    const meteo = await ctx.webProject(ines, { title: 'Météo du potager' })
    later()
    const fusee = await ctx.webProject(ines, { title: 'Décollage !' })
    later()
    const chorale = await ctx.webProject(zoe, { title: 'La chorale des moineaux' })
    later()
    await ctx.webProject(ines, { title: 'Jamais en vitrine' })
    await world.setShowcase(louis, [meteo, fusee, chorale])
    const addedAt = new Date(Date.now()).toISOString()

    // Inès retire « Décollage ! » de l'accueil.
    later()
    expect((await act.send('DELETE', `/v1/projects/${fusee}/showcase`, ines)).status).toBe(204)
    const declinedAt = new Date(Date.now()).toISOString()

    const { raw, data } = await exportOf(ines)
    expect(new Map(data.showcase.map((entry) => [entry.projectId, entry]))).toEqual(
      new Map([
        [meteo, { projectId: meteo, addedAt, declinedAt: null }],
        [fusee, { projectId: fusee, addedAt: null, declinedAt }],
      ]),
    )
    // Le projet de Zoé n'est que dans l'export de Zoé.
    expect(data.showcase.map((entry) => entry.projectId)).not.toContain(chorale)
    expect((await exportOf(zoe)).data.showcase.map((entry) => entry.projectId)).toEqual([chorale])
    // Jamais l'administrateur qui l'a choisi.
    expect(raw).not.toContain(louisId)
    expect(raw).not.toMatch(/addedBy|added_by/)
  })

  it('keeps her refusal in the export after the project stops being public', async () => {
    later()
    const meteo = await ctx.webProject(ines, { title: 'Météo du potager' })
    await world.setShowcase(louis, [meteo])
    later()
    expect((await act.send('DELETE', `/v1/projects/${meteo}/showcase`, ines)).status).toBe(204)
    const declinedAt = new Date(Date.now()).toISOString()
    await world.setVisibility(ines, meteo, { visibility: 'public' })

    expect((await exportOf(ines)).data.showcase).toEqual([
      { projectId: meteo, addedAt: null, declinedAt },
    ])
  })
})

describe('a visitor report in the export', () => {
  it('never exports the address of a visitor who reported, to anyone', async () => {
    later()
    const meteo = await ctx.webProject(ines, { title: 'Météo du potager' })
    // Un visiteur signale le projet d'Inès avec l'adresse de Zoé : ce n'est pas un signalement de
    // Zoé, et rien ne le rattache à elle.
    later()
    const res = await ctx.visitorPostJson('/v1/public/reports', {
      target: { kind: 'project', id: meteo },
      reason: 'other',
      email: 'zoe@example.com',
    })
    expect(res.status).toBe(204)

    const ofZoe = await exportOf(zoe)
    expect(ofZoe.data.reports).toEqual([])
    const ofInes = await exportOf(ines)
    expect(ofInes.raw).not.toContain('zoe@example.com')
    expect(ofInes.raw).not.toMatch(/reporterEmail|reporter_email/)
  })
})
