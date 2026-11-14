// Tests d'intégration de R9 (7d) : le nom ou le pseudo d'un membre retirés par la modération. Le
// pseudo devient provisoire (« membre_4f2a » : quatre signes au hasard, sans tiret), l'ancien reste
// réservé 30 jours à tout le monde, son ancien propriétaire compris, et n'est pas son « ancien
// pseudo » ; le nom devient « Membre ». Un rétablissement ne rend l'ancien que si le provisoire est
// encore là et l'ancien encore libre (décision L3 de Louis, 13/11/2026). Scénario :
// docs/scenarios/refonte.md, « R9 », « Un nom ou un pseudo retiré » et « Rétabli » ; relecture de
// sécurité du plan, P3.
//
// Chaque retrait passe par l'API : Max signale la partie, Louis la retire. Quatre membres : Karim
// (le membre visé), Max (qui signale, et qui essaie de prendre le pseudo), Léa (une seconde
// personne qui signale), Louis (l'administrateur).
import {
  AccountExport,
  ErrorResponse,
  Member,
  type ModerationDecisionInput,
  type ReportPart,
} from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let karim: string // cookies de session
let max: string
let lea: string
let louis: string
let karimId: string

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

const karimAccount = {
  name: 'Karim Benali',
  email: 'karim@example.com',
  password: 'karim-long-password',
}
const maxAccount = { name: 'Max', email: 'max@example.com', password: 'max-long-password' }
const louisAccount = {
  name: 'Louis',
  email: 'louis@example.com',
  password: 'louis-long-password',
}

/** Le pseudo provisoire : « membre_ » et quatre lettres ou chiffres, sans tiret. */
const PROVISIONAL = /^membre_[a-z0-9]{4}$/

/** Avance la fausse horloge (une seconde par défaut). */
const later = (ms = 1000) => vi.setSystemTime(Date.now() + ms)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  karim = await ctx.verifiedMember(karimAccount)
  max = await ctx.verifiedMember(maxAccount)
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'lea-long-password',
  })
  louis = await ctx.verifiedMember(louisAccount)
  karimId = (await act.me(karim)).id
  await act.makeAdmin((await act.me(louis)).id)
  later()
  await act.updateProfile(karim, { handle: 'karim_le_vrai' })
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const profileOf = () => ({ kind: 'member' as const, id: karimId })

/** Signale une partie du profil de Karim, puis Louis la retire. */
const removeProfilePart = async (field: ReportPart['field'], reporter = max) => {
  later()
  const reported = await act.send('POST', '/v1/reports', reporter, {
    target: profileOf(),
    part: { field },
    reason: 'impersonation',
  })
  expect(reported.status, `report of the ${field}`).toBe(201)
  later()
  await act.decide(louis, {
    action: 'remove',
    target: profileOf(),
    part: { field },
    ground: 'rules',
    explanation: 'Ce pseudo imite celui d’un autre membre.',
  })
}

/** Louis rétablit une partie du profil de Karim (onglet « Retirés »). */
const restoreProfilePart = async (field: ReportPart['field'], cookie = louis) => {
  later()
  const decision: ModerationDecisionInput = {
    action: 'restore',
    target: profileOf(),
    part: { field },
  }
  await act.decide(cookie, decision)
}

const patchMe = (cookie: string, body: object) => act.send('PATCH', '/v1/me', cookie, body)

/** La réponse « déjà pris », celle que reçoit n'importe qui. */
const expectTaken = async (res: Response) => {
  expect(res.status).toBe(409)
  const text = await res.text()
  expect(ErrorResponse.parse(JSON.parse(text)).error.code).toBe('handle_taken')
  return text
}

const changeHandle = async (cookie: string, handle: string) => {
  later()
  const res = await patchMe(cookie, { handle })
  expect(res.status, `change to ${handle}`).toBe(200)
}

const exportOf = async (cookie: string) => {
  const res = await act.send('GET', '/v1/me/export', cookie)
  expect(res.status).toBe(200)
  return AccountExport.parse(await res.json())
}

describe('a removed handle', () => {
  it('refuses the removed handle to its former owner during the 30 days, with the 409 handle_taken of anyone', async () => {
    await removeProfilePart('handle')

    const me = await act.me(karim)
    expect(me.handle).toMatch(PROVISIONAL)
    expect(me.provisional).toEqual({ name: false, handle: true })
    // Partout, pour les autres aussi : sa page montre le pseudo provisoire.
    const page = Member.parse(await (await act.send('GET', `/v1/members/${karimId}`, max)).json())
    expect(page.handle).toBe(me.handle)

    // Karim et Max reçoivent exactement la même réponse.
    const toKarim = await expectTaken(await patchMe(karim, { handle: 'karim_le_vrai' }))
    const toMax = await expectTaken(await patchMe(max, { handle: 'karim_le_vrai' }))
    expect(toKarim).toBe(toMax)

    // Juste avant la fin des 30 jours, toujours refusé…
    later(30 * DAY - MINUTE)
    const karimThen = await act.signInAgain(karimAccount)
    await expectTaken(await patchMe(karimThen, { handle: 'karim_le_vrai' }))
    // … puis libre : son ancien propriétaire peut le reprendre, comme n'importe qui.
    later(2 * MINUTE)
    await changeHandle(karimThen, 'karim_le_vrai')
    expect((await act.me(karimThen)).handle).toBe('karim_le_vrai')
  })

  it('keeps the removed handle reserved when the member chooses a new handle, then another', async () => {
    await removeProfilePart('handle')

    await changeHandle(karim, 'karim_2')
    expect((await act.me(karim)).provisional.handle).toBe(false)
    await changeHandle(karim, 'karim_3')

    // Deux changements ne libèrent pas un pseudo retiré (un ancien pseudo ordinaire, si).
    await expectTaken(await patchMe(max, { handle: 'karim_le_vrai' }))
    await expectTaken(await patchMe(karim, { handle: 'karim_le_vrai' }))
    // Le pseudo retiré n'est pas son « ancien pseudo » : c'est le dernier qu'il a choisi.
    expect((await exportOf(karim)).formerHandle?.handle).toBe('karim_2')
  })

  it('restores the former handle only while the provisional one is still current and the former is free', async () => {
    // 1. Le provisoire est encore là, l'ancien libre : il revient.
    await removeProfilePart('handle')
    expect((await act.me(karim)).handle).toMatch(PROVISIONAL)
    await restoreProfilePart('handle')
    let me = await act.me(karim)
    expect(me.handle).toBe('karim_le_vrai')
    expect(me.provisional.handle).toBe(false)

    // 2. Karim en a choisi un autre entre-temps : il garde celui qu'il a choisi.
    await removeProfilePart('handle', lea)
    await changeHandle(karim, 'karim_2')
    await restoreProfilePart('handle')
    expect((await act.me(karim)).handle).toBe('karim_2')

    // 3. Le provisoire est encore là, mais l'ancien a été pris après ses 30 jours : Karim garde
    //    le provisoire.
    await removeProfilePart('handle')
    const provisional = (await act.me(karim)).handle
    expect(provisional).toMatch(PROVISIONAL)
    later(30 * DAY + MINUTE)
    const maxThen = await act.signInAgain(maxAccount)
    await changeHandle(maxThen, 'karim_2')
    const louisThen = await act.signInAgain(louisAccount)
    await restoreProfilePart('handle', louisThen)
    const karimThen = await act.signInAgain(karimAccount)
    me = await act.me(karimThen)
    expect(me.handle).toBe(provisional)
    expect(me.provisional.handle).toBe(true)
    expect((await act.me(maxThen)).handle).toBe('karim_2')
  })
})

describe('a removed name', () => {
  it('replaces a removed name with « Membre » for everyone until the member chooses another one', async () => {
    await removeProfilePart('name')

    const me = await act.me(karim)
    expect(me.name).toBe('Membre')
    expect(me.provisional).toEqual({ name: true, handle: false })
    const page = Member.parse(await (await act.send('GET', `/v1/members/${karimId}`, max)).json())
    expect(page.name).toBe('Membre')
    expect(JSON.stringify(page)).not.toContain('Karim Benali')

    later()
    await act.updateProfile(karim, { name: 'Karim B.' })
    const after = await act.me(karim)
    expect(after.name).toBe('Karim B.')
    expect(after.provisional.name).toBe(false)
  })

  it('gives the removed name back on restore, unless the member chose another one', async () => {
    await removeProfilePart('name')
    await restoreProfilePart('name')
    expect((await act.me(karim)).name).toBe('Karim Benali')

    await removeProfilePart('name', lea)
    later()
    await act.updateProfile(karim, { name: 'Karim B.' })
    await restoreProfilePart('name')
    expect((await act.me(karim)).name).toBe('Karim B.')
  })
})
