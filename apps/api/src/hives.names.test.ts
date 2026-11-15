// Tests d'intégration de R10 : le nom d'une ruche. 1 à 40 caractères sur une ligne, espaces du bord
// retirés, jamais fait de caractères invisibles ni de ceux qui retournent le texte (U+202E) : c'est
// le seul texte qu'un membre écrit à quelqu'un qui ne le connaît pas encore, sur une invitation. La
// base garde qui a écrit le nom (`name_set_by`) : le créateur, puis l'animateur qui le change. La
// modération peut le retirer : la ruche devient « Ruche sans nom » (null dans les réponses) partout,
// y compris dans les copies gardées pour l'Activité ; un nouveau nom efface la marque ; un
// rétablissement rend le nom, sauf si l'animateur en a choisi un autre entre-temps (comme les parties
// de R9). Scénario : docs/scenarios/refonte.md, « R10 », « Créer une ruche », « L'animateur », « La
// modération » ; relecture du plan, point 4 (ShortLabel, copies vidées, name_set_by, juridique C4).
//
// Membres : Léa (crée Famille), Max (membre, puis animateur), Tante Odile (membre, signale), Nora
// (invitée), Louis (l'administrateur).
import { ErrorResponse, HivePage, HiveSummary, MyHives, Project } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRow, seedHive, seedInvitation } from './testing/hive-seeds'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string // cookies de session
let max: string
let odile: string
let nora: string
let louis: string
let leaId: string
let maxId: string
let odileId: string
let noraId: string

// Les caractères invisibles s'écrivent par leur numéro : écrits tels quels, on ne les verrait pas
// dans ce fichier (et un outil pourrait les perdre).
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)
const WORD_JOINER = String.fromCodePoint(0x2060)
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e)
const LEFT_TO_RIGHT_ISOLATE = String.fromCodePoint(0x2066)
const POP_DIRECTIONAL_ISOLATE = String.fromCodePoint(0x2069)
const NO_BREAK_SPACE = String.fromCodePoint(0xa0)

/** Avance la fausse horloge d'une seconde. */
const later = () => vi.setSystemTime(Date.now() + 1000)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  const member = (name: string, email: string) =>
    ctx.verifiedMember({ name, email, password: `${email}-long-password` })
  lea = await member('Léa', 'lea@example.com')
  max = await member('Max', 'max@example.com')
  odile = await member('Tante Odile', 'odile@example.com')
  nora = await member('Nora Benali', 'nora@example.com')
  louis = await member('Louis', 'louis@example.com')
  leaId = (await act.me(lea)).id
  maxId = (await act.me(max)).id
  odileId = (await act.me(odile)).id
  noraId = (await act.me(nora)).id
  await act.makeAdmin((await act.me(louis)).id)
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const create = (cookie: string, name: string) =>
  act.send('POST', '/v1/hives', cookie, { name, icon: 'house-line' })

const rename = (cookie: string, hiveId: string, name: string) =>
  act.send('PATCH', `/v1/hives/${hiveId}`, cookie, { name })

const expectInvalid = async (res: Response, what: string) => {
  expect(res.status, what).toBe(400)
  expect(ErrorResponse.parse(await res.json()).error.code, what).toBe('validation')
}

const pageAs = async (cookie: string, hiveId: string) => {
  const res = await act.send('GET', `/v1/hives/${hiveId}`, cookie)
  expect(res.status).toBe(200)
  return HivePage.parse(await res.json())
}

/** Tante Odile signale le nom ; Louis le retire. Rend la décision. */
const removeName = async (hiveId: string) => {
  later()
  const reported = await act.send('POST', '/v1/reports', odile, {
    target: { kind: 'hive', id: hiveId },
    part: { field: 'name' },
    reason: 'harassment',
  })
  expect(reported.status).toBe(201)
  later()
  const decision = await act.decide(louis, {
    action: 'remove',
    target: { kind: 'hive', id: hiveId },
    part: { field: 'name' },
    ground: 'rules',
    explanation: 'Un nom qui se moque d’un membre.',
  })
  later()
  return decision
}

const restoreName = (hiveId: string) => {
  later()
  return act.send('POST', '/v1/moderation/decisions', louis, {
    action: 'restore',
    target: { kind: 'hive', id: hiveId },
    part: { field: 'name' },
  })
}

describe('the name a member writes', () => {
  it('refuses a hive name made of invisible or direction-changing characters', async () => {
    for (const name of [
      ZERO_WIDTH_SPACE.repeat(3),
      `${WORD_JOINER}${ZERO_WIDTH_SPACE}${NO_BREAK_SPACE}`,
      `Famille${RIGHT_TO_LEFT_OVERRIDE}elbaT`,
      `${LEFT_TO_RIGHT_ISOLATE}Famille${POP_DIRECTIONAL_ISOLATE}`,
    ]) {
      await expectInvalid(await create(lea, name), `create ${JSON.stringify(name)}`)
    }
    expect(await ctx.db.select().from(schema.hive)).toEqual([])
    // Témoin, et le même refus au renommage.
    const created = await create(lea, 'Famille')
    expect(created.status).toBe(201)
    const { id } = HiveSummary.parse(await created.json())
    await expectInvalid(
      await rename(lea, id, `Famille${RIGHT_TO_LEFT_OVERRIDE}elbaT`),
      'rename with U+202E',
    )
    await expectInvalid(await rename(lea, id, ZERO_WIDTH_SPACE.repeat(2)), 'rename invisible')
    expect((await hiveRow(ctx.db, id))?.name).toBe('Famille')
  })

  it('accepts a 40-character name and refuses a 41st, an emoji counting as one', async () => {
    // « é » et l'abeille : une lettre accentuée, et un emoji fait de deux unités UTF-16.
    const forty = `🐝${'é'.repeat(39)}`
    const created = await create(lea, forty)
    expect(created.status).toBe(201)
    const { id } = HiveSummary.parse(await created.json())
    expect((await hiveRow(ctx.db, id))?.name).toBe(forty)

    await expectInvalid(await create(lea, `${forty}a`), 'create 41')
    await expectInvalid(await rename(lea, id, 'é'.repeat(41)), 'rename 41')
    expect((await rename(lea, id, 'é'.repeat(40))).status).toBe(200)
  })

  it('trims the spaces around a hive name and refuses an empty name, or one on two lines', async () => {
    const created = await create(lea, '   Famille  ')
    expect(created.status).toBe(201)
    const summary = HiveSummary.parse(await created.json())
    expect(summary.name).toBe('Famille')
    expect((await hiveRow(ctx.db, summary.id))?.name).toBe('Famille')

    for (const name of ['', '     ', 'Ma\nfamille']) {
      await expectInvalid(await create(lea, name), `create ${JSON.stringify(name)}`)
      await expectInvalid(await rename(lea, summary.id, name), `rename ${JSON.stringify(name)}`)
    }
    expect((await hiveRow(ctx.db, summary.id))?.name).toBe('Famille')
    // 41 caractères dont des espaces au bord : 40 une fois retirés, donc permis.
    const res = await rename(lea, summary.id, ` ${'a'.repeat(40)} `)
    expect(res.status).toBe(200)
    expect(HivePage.parse(await res.json()).summary.name).toBe('a'.repeat(40))
  })
})

describe('who wrote the name', () => {
  it('records the creator as the writer of the name, then the animator who renames it', async () => {
    const created = await create(lea, 'Famille')
    expect(created.status).toBe(201)
    const { id } = HiveSummary.parse(await created.json())
    expect((await hiveRow(ctx.db, id))?.nameSetBy).toBe(leaId)
    // Max entre et reçoit l'animation (en base : l'état qu'auraient laissé l'invitation et
    // « Confier l'animation »).
    await ctx.db
      .insert(schema.hiveMember)
      .values({ hiveId: id, userId: maxId, joinedAt: new Date() })
    await ctx.db.update(schema.hive).set({ animatorId: maxId }).where(eq(schema.hive.id, id))
    later()

    // Changer l'icône ne touche pas au nom, ni à qui l'a écrit.
    expect((await act.send('PATCH', `/v1/hives/${id}`, max, { icon: 'heart' })).status).toBe(200)
    expect((await hiveRow(ctx.db, id))?.nameSetBy).toBe(leaId)
    expect((await rename(max, id, 'Les Haddad')).status).toBe(200)
    expect(await hiveRow(ctx.db, id)).toMatchObject({ name: 'Les Haddad', nameSetBy: maxId })
    // Léa, qui n'anime plus, ne renomme pas (refusé, la réponse exacte est testée par
    // hives.test.ts) : le nom reste celui de Max.
    const refused = (await rename(lea, id, 'Famille')).status
    expect(refused).toBeGreaterThanOrEqual(400)
    expect(refused).toBeLessThan(500)
    expect((await hiveRow(ctx.db, id))?.nameSetBy).toBe(maxId)
  })
})

describe('a name removed by the moderation', () => {
  it('shows a hive whose name the moderation removed as unnamed to its members and invitees', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: leaId, members: [maxId, odileId] })
    await seedInvitation(ctx.db, { hiveId: familleId, inviteeId: noraId, inviterId: leaId })
    later()
    const project = await act.publish(max, 'Le plan de table')
    await ctx.db
      .update(schema.project)
      .set({ visibility: 'hive', hiveId: familleId })
      .where(eq(schema.project.id, project.id))

    const decision = await removeName(familleId)

    expect(await hiveRow(ctx.db, familleId)).toMatchObject({
      name: '',
      nameRemovalId: decision.id,
    })
    for (const [who, cookie] of [
      ['Léa', lea],
      ['Max', max],
    ] as const) {
      expect((await pageAs(cookie, familleId)).summary.name, who).toBeNull()
      const mine = MyHives.parse(await (await act.send('GET', '/v1/hives', cookie)).json())
      expect(mine.hives.find((hive) => hive.id === familleId)?.name, who).toBeNull()
    }
    const forNora = MyHives.parse(await (await act.send('GET', '/v1/hives', nora)).json())
    expect(forNora.invitations.map((one) => one.hive.name)).toEqual([null])
    // La pastille « Réservé à » d'un projet de la ruche dit aussi « sans nom ».
    const res = await act.send('GET', `/v1/projects/${project.id}`, odile)
    expect(res.status).toBe(200)
    expect(Project.parse(await res.json()).hive).toEqual({ id: familleId, name: null })
  })

  it('blanks the copies of the removed name kept for the activity, of that hive only', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: leaId, members: [maxId, odileId] })
    const atelierId = await seedHive(ctx.db, { name: 'Atelier IA', animatorId: maxId })
    // Deux lignes d'Activité déjà écrites : Nora a été retirée de Famille, Max anime l'Atelier IA.
    const notice = (recipientId: string, hiveId: string, hiveName: string, kind: string) => ({
      id: crypto.randomUUID(),
      recipientId,
      kind,
      hiveId,
      hiveName,
      createdAt: new Date(),
    })
    await ctx.db
      .insert(schema.hiveNotice)
      .values([
        notice(noraId, familleId, 'Famille', 'removed'),
        notice(maxId, atelierId, 'Atelier IA', 'animator'),
      ])
    later()

    await removeName(familleId)

    const copies = await ctx.db
      .select({ hiveId: schema.hiveNotice.hiveId, hiveName: schema.hiveNotice.hiveName })
      .from(schema.hiveNotice)
    expect(copies).toEqual(
      expect.arrayContaining([
        { hiveId: familleId, hiveName: '' },
        { hiveId: atelierId, hiveName: 'Atelier IA' },
      ]),
    )
    expect(JSON.stringify(copies)).not.toContain('"Famille"')
  })

  it('clears the removal mark when the animator chooses a new name', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: leaId, members: [maxId, odileId] })
    await removeName(familleId)

    const res = await rename(lea, familleId, 'Les Haddad')

    expect(res.status).toBe(200)
    expect(HivePage.parse(await res.json()).summary.name).toBe('Les Haddad')
    expect(await hiveRow(ctx.db, familleId)).toMatchObject({
      name: 'Les Haddad',
      nameRemovalId: null,
      nameSetBy: leaId,
    })
    expect((await pageAs(max, familleId)).summary.name).toBe('Les Haddad')
  })

  it('puts the removed name back when the moderation restores it', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: leaId, members: [maxId, odileId] })
    await removeName(familleId)

    const res = await restoreName(familleId)

    expect(res.status).toBe(201)
    expect(await hiveRow(ctx.db, familleId)).toMatchObject({
      name: 'Famille',
      nameRemovalId: null,
      nameSetBy: leaId,
    })
    expect((await pageAs(max, familleId)).summary.name).toBe('Famille')
  })

  it('keeps the name the animator chose since, when the moderation restores the old one', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: leaId, members: [maxId, odileId] })
    await removeName(familleId)
    expect((await rename(lea, familleId, 'Les Haddad')).status).toBe(200)

    const res = await restoreName(familleId)

    // Rétablir n'efface jamais un nom choisi depuis (comme une partie de R9) ; la décision peut
    // répondre « déjà décidé » (409), jamais une erreur du serveur.
    expect([201, 409]).toContain(res.status)
    expect(await hiveRow(ctx.db, familleId)).toMatchObject({
      name: 'Les Haddad',
      nameRemovalId: null,
    })
  })
})
