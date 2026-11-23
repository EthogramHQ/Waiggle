// Tests d'intégration de R11 : ce que l'export (« Télécharger mes données », GET /v1/me/export)
// ajoute, hors des accords des règles (rules.test.ts) : la dernière visite connue
// (`lastActiveAt`, celle qui compte pour la suppression d'un compte inactif) et le réglage
// « Découvertes ». Jamais la date de l'avertissement d'inactivité : une date de service, qu'une
// visite efface (relecture juridique, « écartés »).
// Scénario : docs/scenarios/refonte.md, R11, « Mes données ».
import { AccountExport } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

const DAY = 24 * 60 * 60 * 1000
const START = new Date('2028-03-01T09:00:00.000Z')

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string
let leaId: string

beforeEach(async () => {
  // Une fausse horloge, posée avant l'API (charte) : seule Date est remplacée.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'correct-horse-battery',
  })
  leaId = (await act.me(lea)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const exportOf = async (cookie: string) => {
  const res = await act.send('GET', '/v1/me/export', cookie)
  expect(res.status).toBe(200)
  const raw = await res.text()
  return { raw, data: AccountExport.parse(JSON.parse(raw)) }
}

describe('the last visit in the export', () => {
  it('exports the last visit noted for the account', async () => {
    await ctx.db
      .update(schema.user)
      .set({ lastActiveAt: new Date(START.getTime() - 10 * DAY) })
      .where(eq(schema.user.id, leaId))
    // Trois jours plus tard, Léa ouvre l'appli : sa visite est notée (une fois par jour).
    const visit = new Date(START.getTime() + 3 * DAY)
    vi.setSystemTime(visit)
    const cookie = await act.signInAgain({
      email: 'lea@example.com',
      password: 'correct-horse-battery',
    })
    await act.send('GET', '/v1/me', cookie)
    vi.setSystemTime(new Date(visit.getTime() + 60 * 60 * 1000))

    const { data } = await exportOf(cookie)

    expect(data.lastActiveAt).toBe(visit.toISOString())
  })

  it('never exports the date of the inactivity warning', async () => {
    const warnedAt = new Date('2027-01-02T03:04:05.000Z')
    // Posée en base : que la visite de l'export l'efface d'abord ou non, elle n'y paraît jamais.
    await ctx.db
      .update(schema.user)
      .set({ inactiveNoticeAt: warnedAt })
      .where(eq(schema.user.id, leaId))

    const { raw } = await exportOf(lea)

    expect(raw).not.toContain('inactiveNotice')
    expect(raw).not.toContain('inactive_notice')
    expect(raw).not.toContain(warnedAt.toISOString())
  })
})

describe('the Discoveries setting in the export', () => {
  it('exports « In the recap » for a member who never changed it', async () => {
    const { data } = await exportOf(lea)

    expect(data.emailPreferences.discoveries).toBe('digest')
  })

  it('exports « Never » once the member turned the discoveries off', async () => {
    await act.setPreferences(lea, { discoveries: 'never' })

    const { data } = await exportOf(lea)

    expect(data.emailPreferences.discoveries).toBe('never')
  })
})

// R19 : les réglages du jeu sont dans l'export (`game.settings`), comme ceux des e-mails : la forme
// du titre, la famille épinglée, « Apparaître dans les classements », « Ma récolte », la décoration
// choisie et le dernier niveau vu.
describe('the game settings in the export (R19)', () => {
  it('exports the game settings as the member changed them', async () => {
    // Témoin : sans réglage, les valeurs par défaut (titre au féminin, tout allumé, jamais décoré).
    expect((await exportOf(lea)).data.game.settings).toEqual({
      titleForm: 'f',
      pinnedFamily: null,
      inRankings: true,
      harvestNotices: true,
      decoration: null,
      levelSeen: 1,
    })

    const res = await act.send('PATCH', '/v1/me/game', lea, {
      titleForm: 'm',
      inRankings: false,
      harvestNotices: false,
    })
    expect(res.status).toBe(204)

    expect((await exportOf(lea)).data.game.settings).toEqual({
      titleForm: 'm',
      pinnedFamily: null,
      inRankings: false,
      harvestNotices: false,
      decoration: null,
      levelSeen: 1,
    })
  })
})
