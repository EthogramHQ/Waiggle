// Tests d'intégration de R19 (« La gamification », docs/scenarios/refonte.md, « Le classement de la
// semaine ») : GET /v1/rankings?scope=close (soi et ceux que l'on suit) et ?scope=hive&hive=<id>
// (les membres d'une ruche). Contrat : packages/contracts/src/game.ts (`Ranking`, `RankingQuery`).
//
// Les règles vérifiées : le pollen de la semaine en cours seulement, du plus au moins ; seuls ceux qui
// en ont gagné ; les ex aequo au même rang ; les proches sont ceux que l'on suit (un suivi non rendu
// y figure : choix 14, décision du 23/11) ; « Apparaître dans les classements » coupé, on n'y figure
// plus et on ne les lit plus (403 `rankings_off`) ; jamais un compte d'exemples ; jamais un membre
// bloqué dans un sens ou dans l'autre (relectures du plan, juridique B1 et sécurité B2) ; une ruche
// dont on n'est pas membre répond le même 404 qu'une ruche inconnue.
//
// Le pollen : chacun commente le projet de Rose (10 pollen par commentaire). Les suivis et les
// ruches, qui rapportent aussi, se font la semaine d'avant (le mercredi `START`) ; le test saute
// ensuite au lundi (`nextMonday`) : la semaine du classement ne compte que les commentaires.
// Les autorisations communes (401 sans session, quota) sont dans game.harvest.test.ts.
import { appName } from '@ruche/brand'
import { POLLEN_GESTURES, type Ranking, weekOf } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { expectError, gameWorld, nextMonday, START } from './testing/game-world'
import { hiveGestures, signedUpMember, type TestMember } from './testing/hive-gestures'
import { later, UNKNOWN_ID } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let game: ReturnType<typeof gameWorld>
let hives: ReturnType<typeof hiveGestures>
let lea: TestMember
let max: TestMember
let ines: TestMember
let noe: TestMember
let rose: TestMember
let roseProject: string

const COMMENT = POLLEN_GESTURES.comment.amount

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  game = gameWorld(ctx, act)
  hives = hiveGestures(ctx, act)
  lea = await signedUpMember(ctx, act, 'Léa', '203.0.113.21')
  max = await signedUpMember(ctx, act, 'Max', '203.0.113.22')
  ines = await signedUpMember(ctx, act, 'Inès', '203.0.113.23')
  noe = await signedUpMember(ctx, act, 'Noé', '203.0.113.24')
  rose = await signedUpMember(ctx, act, 'Rose', '203.0.113.25')
  roseProject = await game.testable(rose.cookie, 'Le carnet de graines')
  // Léa suit Max et Inès ; personne ne suit Léa, et Léa ne suit pas Noé.
  later()
  await act.followMember(max.id, lea.cookie)
  later()
  await act.followMember(ines.id, lea.cookie)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Ce membre commente `times` fois le projet de Rose : 10 pollen par commentaire. */
const earn = async (member: TestMember, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await game.comment(roseProject, member.cookie, `Commentaire ${i + 1} de ${member.id}`)
  }
}

/** Les lignes d'un classement, lisibles : le nom, le pollen, le rang, et si c'est soi. */
const rowsOf = (ranking: Ranking) =>
  ranking.rows.map((row) => ({
    name: row.member.name,
    pollen: row.pollen,
    rank: row.rank,
    self: row.self,
  }))

const namesOf = (ranking: Ranking) => ranking.rows.map((row) => row.member.name)

/** Une ruche de Léa, avec Max, Inès et Noé, créée la semaine d'avant. */
const leaHive = async () => {
  const hive = await hives.create(lea.cookie, 'Famille')
  for (const member of [max, ines, noe]) {
    later()
    await hives.join(hive.id, lea.cookie, member)
  }
  return hive.id
}

describe('the ranking of my close ones', () => {
  it('ranks me and the members I follow by their pollen of the week, the most first', async () => {
    nextMonday(vi)
    await earn(ines, 3)
    await earn(lea, 2)
    await earn(max, 1)
    await earn(noe, 5) // Léa ne suit pas Noé

    const ranking = await game.ranking(lea.cookie, 'scope=close')

    expect(ranking.scope).toBe('close')
    expect(ranking.hiveId).toBeUndefined()
    expect(ranking.week).toBe(weekOf(new Date()))
    expect(rowsOf(ranking)).toEqual([
      { name: 'Inès', pollen: 3 * COMMENT, rank: 1, self: false },
      { name: 'Léa', pollen: 2 * COMMENT, rank: 2, self: true },
      { name: 'Max', pollen: COMMENT, rank: 3, self: false },
    ])
    expect(ranking.rows.find((row) => row.self)?.member.id).toBe(lea.id)
  })

  it('lists in the close ranking a followed member who does not follow back', async () => {
    nextMonday(vi)
    await earn(lea)
    await earn(max)

    // Léa suit Max : il est dans son classement.
    expect(namesOf(await game.ranking(lea.cookie, 'scope=close'))).toContain('Max')
    // Max ne suit pas Léa : le classement de Max ne dit pas qu'elle le suit.
    expect(namesOf(await game.ranking(max.cookie, 'scope=close'))).toEqual(['Max'])
  })

  it('shows only the members who earned pollen this week, never anyone at zero', async () => {
    nextMonday(vi)
    await earn(max)

    // Léa et Inès n'ont rien gagné cette semaine : ni l'une ni l'autre n'apparaît, Léa comprise.
    expect(rowsOf(await game.ranking(lea.cookie, 'scope=close'))).toEqual([
      { name: 'Max', pollen: COMMENT, rank: 1, self: false },
    ])
  })

  it('gives the same rank to members tied', async () => {
    nextMonday(vi)
    await earn(ines, 2)
    await earn(max, 2)
    await earn(lea, 1)

    const rows = rowsOf(await game.ranking(lea.cookie, 'scope=close'))

    expect(rows.slice(0, 2).map((row) => row.rank)).toEqual([1, 1])
    expect(
      rows
        .slice(0, 2)
        .map((row) => row.name)
        .sort(),
    ).toEqual(['Inès', 'Max'])
    expect(rows[2]).toMatchObject({ name: 'Léa', pollen: COMMENT, self: true })
    expect(rows[2]?.rank).toBeGreaterThan(1)
  })

  it('starts again from zero every Monday', async () => {
    nextMonday(vi)
    await earn(max)
    await earn(lea)
    expect(namesOf(await game.ranking(lea.cookie, 'scope=close'))).toHaveLength(2)

    nextMonday(vi)
    // Douze jours depuis l'inscription : une session dure 7 jours, Léa se reconnecte.
    const cookie = await act.signInAgain(lea)
    const ranking = await game.ranking(cookie, 'scope=close')

    expect(ranking.week).toBe(weekOf(new Date()))
    expect(ranking.rows).toEqual([])
  })

  it('leaves out a member who opted out of the rankings, and refuses her the rankings', async () => {
    nextMonday(vi)
    await earn(ines, 2)
    await earn(lea)
    expect(namesOf(await game.ranking(lea.cookie, 'scope=close'))).toContain('Inès')

    expect((await game.patchGame(ines.cookie, { inRankings: false })).status).toBe(204)

    expect(namesOf(await game.ranking(lea.cookie, 'scope=close'))).toEqual(['Léa'])
    await expectError(await game.rankingRaw(ines.cookie, 'scope=close'), 403, 'rankings_off')
    // Son pollen et son niveau restent : seul le classement la perd.
    expect((await game.harvest(ines.cookie)).week.total).toBe(2 * COMMENT)
  })

  it('shows her again once she appears in the rankings again', async () => {
    nextMonday(vi)
    await earn(ines)
    expect((await game.patchGame(ines.cookie, { inRankings: false })).status).toBe(204)
    expect((await game.patchGame(ines.cookie, { inRankings: true })).status).toBe(204)

    expect(namesOf(await game.ranking(lea.cookie, 'scope=close'))).toEqual(['Inès'])
  })

  it('leaves an example account out of every ranking', async () => {
    const bot = await signedUpMember(ctx, act, `${appName}Bot`, '203.0.113.26')
    later()
    await act.followMember(bot.id, lea.cookie)
    const hiveId = await leaHive()
    later()
    await hives.join(hiveId, lea.cookie, bot)
    nextMonday(vi)
    await earn(lea)
    // Le compte commente avant d'être marqué (après, il ne gagnerait rien) : son pollen existe.
    await earn(bot, 3)
    expect(namesOf(await game.ranking(lea.cookie, 'scope=close'))).toContain(`${appName}Bot`)

    await game.markExample(bot.id)

    expect(namesOf(await game.ranking(lea.cookie, 'scope=close'))).toEqual(['Léa'])
    expect(namesOf(await game.ranking(lea.cookie, `scope=hive&hive=${hiveId}`))).toEqual(['Léa'])
  })

  it('leaves a blocked member out of the close ranking', async () => {
    nextMonday(vi)
    await earn(max, 2)
    await earn(lea)
    // Témoin : avant le blocage, Max est dans le classement de Léa.
    expect(namesOf(await game.ranking(lea.cookie, 'scope=close'))).toContain('Max')

    later()
    await act.block(lea.id, max.cookie) // Max bloque Léa

    expect(namesOf(await game.ranking(lea.cookie, 'scope=close'))).toEqual(['Léa'])
  })
})

describe('the ranking of a hive', () => {
  it('ranks the members of the hive by their pollen of the week, followed or not', async () => {
    const hiveId = await leaHive()
    nextMonday(vi)
    await earn(noe, 3) // dans la ruche, et Léa ne le suit pas
    await earn(lea, 1)
    // Rose, hors de la ruche, ne fait que recevoir (3 pollen par commentaire) : absente.
    const outsider = await signedUpMember(ctx, act, 'Jean', '203.0.113.27')
    await earn(outsider, 4) // hors de la ruche

    const ranking = await game.ranking(lea.cookie, `scope=hive&hive=${hiveId}`)

    expect(ranking.scope).toBe('hive')
    expect(ranking.hiveId).toBe(hiveId)
    expect(rowsOf(ranking)).toEqual([
      { name: 'Noé', pollen: 3 * COMMENT, rank: 1, self: false },
      { name: 'Léa', pollen: COMMENT, rank: 2, self: true },
    ])
  })

  it('answers the same 404 to a member who is not in the hive as to an unknown hive', async () => {
    const hiveId = await leaHive()

    const unknown = await game.rankingRaw(rose.cookie, `scope=hive&hive=${UNKNOWN_ID}`)
    expect(unknown.status).toBe(404)
    const notMember = await game.rankingRaw(rose.cookie, `scope=hive&hive=${hiveId}`)
    expect(notMember.status).toBe(404)
    expect(await notMember.json()).toEqual(await unknown.json())
    // Témoin : un membre de la ruche la lit.
    expect((await game.rankingRaw(max.cookie, `scope=hive&hive=${hiveId}`)).status).toBe(200)
  })

  it('refuses a hive without the scope « hive », and the scope « hive » without a hive', async () => {
    const hiveId = await leaHive()

    await expectError(await game.rankingRaw(lea.cookie, 'scope=hive'), 400, 'validation')
    await expectError(
      await game.rankingRaw(lea.cookie, `scope=close&hive=${hiveId}`),
      400,
      'validation',
    )
    await expectError(await game.rankingRaw(lea.cookie, 'scope=everyone'), 400, 'validation')
  })

  it('leaves a member blocked either way out of the hive ranking', async () => {
    const hiveId = await leaHive()
    nextMonday(vi)
    await earn(lea, 2)
    await earn(max, 1)
    await earn(ines, 3)
    const query = `scope=hive&hive=${hiveId}`
    // Témoin : avant le blocage, chacun voit l'autre.
    expect(namesOf(await game.ranking(lea.cookie, query))).toEqual(['Inès', 'Léa', 'Max'])

    later()
    await act.block(lea.id, max.cookie) // Max bloque Léa

    // Ni Léa ne voit Max, ni Max ne voit Léa ; Inès, qui n'a bloqué personne, voit les deux.
    expect(namesOf(await game.ranking(lea.cookie, query))).toEqual(['Inès', 'Léa'])
    expect(namesOf(await game.ranking(max.cookie, query))).toEqual(['Inès', 'Max'])
    expect(namesOf(await game.ranking(ines.cookie, query))).toEqual(['Inès', 'Léa', 'Max'])
  })

  it('refuses the rankings of a hive to a member who opted out', async () => {
    const hiveId = await leaHive()
    expect((await game.patchGame(max.cookie, { inRankings: false })).status).toBe(204)

    await expectError(
      await game.rankingRaw(max.cookie, `scope=hive&hive=${hiveId}`),
      403,
      'rankings_off',
    )
  })
})
