// Tests d'intégration de « Ma récolte » (R19) : ce que rend GET /v1/me/harvest (le rayon, le pollen
// de la semaine par famille, le titre, les semaines butinées, le miel de la semaine), les réglages
// de PATCH /v1/me/game (titre épinglé, forme, niveau vu, classements, avis), les autorisations et
// les quotas des cinq routes du jeu, et l'en-tête `Waiggle-Pollen`. Scénario :
// docs/scenarios/refonte.md, « R19 — La gamification » ; plan R19, choix 4 à 6, 11, 12, 15, section
// API, et relecture de sécurité du plan (B2, S4).
//
// Les cinq routes : GET /v1/me/harvest, PATCH /v1/me/game, PUT /v1/me/game/decoration,
// POST /v1/projects/{id}/honey, GET /v1/rankings. Les défis, les sceaux, le miel offert et les
// classements ont leurs propres fichiers ; ici, seulement leurs autorisations et leurs quotas.
//
// Quatre membres : Inès (sa récolte), Malik et Zoé (dont elle commente et réagit aux projets),
// Louis (l'administrateur qui suspend). La fausse horloge part d'un lundi, 10 h à Paris.
import {
  DEFAULT_DECORATION,
  type Family,
  POLLEN_HEADER,
  REACTION_KINDS,
  weekOf,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import {
  DAY,
  expectError,
  HOUR,
  harvestGestures,
  offeredOn,
  SECOND,
  WEEK,
} from './testing/harvest-world'
import { signedUpMember, type TestMember } from './testing/hive-gestures'

let ctx: TestContext
let act: ReturnType<typeof activity>
let game: ReturnType<typeof harvestGestures>
let ines: TestMember
let malik: TestMember
let zoe: TestMember
let louis: TestMember

const START = new Date('2026-06-15T08:00:00.000Z') // un lundi, 10 h à Paris
const UNKNOWN_PROJECT = '00000000-0000-4000-8000-000000000000'

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  game = harvestGestures(act)
  ines = await signedUpMember(ctx, act, 'Inès', '203.0.113.11')
  malik = await signedUpMember(ctx, act, 'Malik', '203.0.113.12')
  zoe = await signedUpMember(ctx, act, 'Zoé', '203.0.113.13')
  louis = await signedUpMember(ctx, act, 'Louis', '203.0.113.14')
  await act.makeAdmin(louis.id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (d'une seconde par défaut : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Reconnecte ces membres : une session dure 7 jours, et certains tests avancent de semaines. */
const signInAgain = async (...members: TestMember[]) => {
  for (const member of members) member.cookie = await act.signInAgain(member)
}

/** Publie un projet public (50 pollen à son auteur : premier passage hors privé). */
const publish = async (member: TestMember, title: string) => {
  later()
  return (await act.publish(member.cookie, title, { visibility: 'public' })).id
}

/** Pose `count` sortes de réaction sur un projet (2 pollen chacune à qui réagit). */
const reactMany = async (projectId: string, member: TestMember, count: number) => {
  for (const kind of REACTION_KINDS.slice(0, count)) {
    later()
    await act.react(projectId, kind, member.cookie)
  }
}

/** Le pollen par famille, toutes les familles présentes (les absentes à 0). */
const families = (amounts: Partial<Record<Family, number>>) => ({
  forager: 0,
  builder: 0,
  keeper: 0,
  dancer: 0,
  ...amounts,
})

/** Louis suspend ce membre pour 7 jours (une décision de modération). */
const suspend = async (memberId: string) => {
  later()
  const res = await act.send('POST', '/v1/moderation/decisions', louis.cookie, {
    action: 'suspend',
    memberId,
    duration: '7d',
    ground: 'rules',
    explanation: 'Des messages insultants, plusieurs fois.',
  })
  expect(res.status).toBe(201)
  later()
}

/** Fait de ce compte un compte d'exemples, comme `infra/mark-example.sh` (examples.test.ts). */
const markExample = (userId: string) =>
  ctx.db.execute(
    sql`insert into example_account (user_id, marked_at)
        values (${userId}, ${new Date().toISOString()}::timestamptz at time zone 'UTC')`,
  )

/** Range un compteur de quota à `count`, dans une fenêtre qui commence maintenant. */
const setCounter = async (key: string, count: number) => {
  await ctx.db.delete(schema.apiRateLimit).where(eq(schema.apiRateLimit.key, key))
  await ctx.db.insert(schema.apiRateLimit).values({ key, count, windowStart: Date.now() })
}

/** La valeur d'un compteur de quota (0 s'il n'existe pas). */
const counterOf = async (key: string) => {
  const [row] = await ctx.db
    .select({ count: schema.apiRateLimit.count })
    .from(schema.apiRateLimit)
    .where(eq(schema.apiRateLimit.key, key))
  return row?.count ?? 0
}

describe('the harvest of a member', () => {
  it('shows a new member at level 1, with nothing earned yet and three challenges to choose', async () => {
    const harvest = await game.harvest(ines.cookie)

    expect(harvest).toEqual({
      level: 1,
      total: 0,
      cells: 0,
      toNext: 100,
      title: null,
      obtainedFamilies: [],
      week: { total: 0, byFamily: families({}) },
      weeks: expect.objectContaining({ count: 0, currentForaged: false }),
      honey: 0,
      // Les trois premiers du tirage de la semaine, pour ce membre (choix 7 du plan).
      personalChallenge: { state: 'choose', offered: offeredOn(ines.id, weekOf(START)) },
      hiveChallenges: [],
      seals: [],
      decoration: DEFAULT_DECORATION,
      // Miel et Lisse sont offerts : toujours « achetés ».
      ownedDecorations: { tints: ['honey'], patterns: ['smooth'] },
      settings: { titleForm: 'f', pinnedFamily: null, inRankings: true, harvestNotices: true },
      levelSeen: 1,
    })
  })

  it('counts the pollen of the week by family and fills the comb up to the next level', async () => {
    const recettes = await publish(malik, 'Recettes')
    await publish(ines, 'Météo')
    await publish(ines, 'Jardin')
    await reactMany(recettes, ines, 3)

    const harvest = await game.harvest(ines.cookie)

    // 2 publications (Bâtisseuse, 100) et 3 réactions (Butineuse, 6) : niveau 2 (à 100), 6 des 200
    // pollen du niveau, aucune alvéole pleine encore, 194 avant le niveau 3 (à 300).
    expect(harvest).toMatchObject({ level: 2, total: 106, cells: 0, toNext: 194 })
    expect(harvest.week).toEqual({ total: 106, byFamily: families({ builder: 100, forager: 6 }) })
    // 100 pollen gagnés dans une famille : elle est obtenue, et peut s'épingler.
    expect(harvest.obtainedFamilies).toEqual(['builder'])
    expect(harvest.title).toEqual({ family: 'builder', form: 'f', pinned: false })
  })

  it('counts only the current week in the pollen of the week, and everything in the total', async () => {
    await publish(ines, 'Météo')
    later(WEEK)
    await signInAgain(ines, malik)
    const recettes = await publish(malik, 'Recettes')
    await reactMany(recettes, ines, 2)

    const harvest = await game.harvest(ines.cookie)

    expect(harvest.total).toBe(54)
    expect(harvest.week).toEqual({ total: 4, byFamily: families({ forager: 4 }) })
  })

  it('answers 404 to an example account reading its harvest', async () => {
    await markExample(zoe.id)

    await expectError(await act.send('GET', '/v1/me/harvest', zoe.cookie), 404, 'not_found')
    // Témoin : un membre ordinaire lit la sienne.
    expect((await act.send('GET', '/v1/me/harvest', ines.cookie)).status).toBe(200)
  })
})

describe('the title', () => {
  it('takes the title from the family of the last 28 days, and pins a family obtained before', async () => {
    await publish(ines, 'Météo')
    await publish(ines, 'Jardin')
    expect((await game.harvest(ines.cookie)).title).toEqual({
      family: 'builder',
      form: 'f',
      pinned: false,
    })

    // 29 jours plus tard, quelques réactions : la Bâtisseuse est sortie des 28 derniers jours.
    later(29 * DAY)
    await signInAgain(ines, malik)
    const recettes = await publish(malik, 'Recettes')
    await reactMany(recettes, ines, 2)
    const now = await game.harvest(ines.cookie)
    expect(now.title).toEqual({ family: 'forager', form: 'f', pinned: false })
    // Obtenue une fois, une famille le reste.
    expect(now.obtainedFamilies).toEqual(['builder'])

    // Épinglée, elle redevient le titre ; « Selon mes gestes » (null) rend celui des 28 jours.
    await game.setGame(ines.cookie, { pinnedFamily: 'builder' })
    expect((await game.harvest(ines.cookie)).title).toEqual({
      family: 'builder',
      form: 'f',
      pinned: true,
    })
    await game.setGame(ines.cookie, { pinnedFamily: null })
    expect((await game.harvest(ines.cookie)).title).toEqual({
      family: 'forager',
      form: 'f',
      pinned: false,
    })
  })

  it('refuses to pin a family not obtained, with 422 family_not_obtained', async () => {
    await publish(ines, 'Météo')

    // 50 pollen de Bâtisseuse : pas encore 100.
    await expectError(
      await game.patchGame(ines.cookie, { pinnedFamily: 'builder' }),
      422,
      'family_not_obtained',
    )
    await expectError(
      await game.patchGame(ines.cookie, { pinnedFamily: 'keeper' }),
      422,
      'family_not_obtained',
    )
    expect((await game.harvest(ines.cookie)).settings.pinnedFamily).toBeNull()
  })

  it('writes the title in the masculine after PATCH, and back', async () => {
    await publish(ines, 'Météo')

    await game.setGame(ines.cookie, { titleForm: 'm' })
    const harvest = await game.harvest(ines.cookie)
    expect(harvest.title).toEqual({ family: 'builder', form: 'm', pinned: false })
    expect(harvest.settings.titleForm).toBe('m')

    await game.setGame(ines.cookie, { titleForm: 'f' })
    expect((await game.harvest(ines.cookie)).title?.form).toBe('f')
  })
})

describe('the settings of the game', () => {
  it('refuses a level seen above the level reached, and keeps the one reached', async () => {
    await expectError(
      await game.patchGame(ines.cookie, { levelSeen: 2 }),
      422,
      'invalid_level_seen',
    )

    await publish(ines, 'Météo')
    await publish(ines, 'Jardin')
    const reached = await game.harvest(ines.cookie)
    expect(reached).toMatchObject({ level: 2, levelSeen: 1 })

    await game.setGame(ines.cookie, { levelSeen: 2 })
    expect((await game.harvest(ines.cookie)).levelSeen).toBe(2)
  })

  it('saves the switches of the rankings and of the harvest notices', async () => {
    await game.setGame(ines.cookie, { inRankings: false, harvestNotices: false })

    expect((await game.harvest(ines.cookie)).settings).toEqual({
      titleForm: 'f',
      pinnedFamily: null,
      inRankings: false,
      harvestNotices: false,
    })
    // Les réglages d'un membre ne touchent pas ceux d'un autre.
    expect((await game.harvest(malik.cookie)).settings).toMatchObject({
      inRankings: true,
      harvestNotices: true,
    })
  })

  it('refuses an empty body and an unknown setting with 400', async () => {
    await expectError(await game.patchGame(ines.cookie, {}), 400, 'validation')
    await expectError(await game.patchGame(ines.cookie, { colour: 'red' }), 400, 'validation')
    await expectError(await game.patchGame(ines.cookie, { titleForm: 'x' }), 400, 'validation')
    // Témoin : un réglage connu passe.
    expect((await game.patchGame(ines.cookie, { titleForm: 'm' })).status).toBe(204)
  })
})

describe('the foraged weeks', () => {
  it('forages a week with a gesture that helps, gives 5 honey once, and not for reactions alone', async () => {
    const recettes = await publish(malik, 'Recettes')
    await reactMany(recettes, ines, 2)

    // Réagir seul ne suffit pas.
    const reacted = await game.harvest(ines.cookie)
    expect(reacted.weeks).toMatchObject({ count: 0, currentForaged: false })
    expect(reacted.honey).toBe(0)

    // Un commentaire sur le projet d'un autre : la semaine est butinée, 5 miel.
    later()
    await act.comment(recettes, ines.cookie, 'Super idée.')
    const foraged = await game.harvest(ines.cookie)
    expect(foraged.weeks).toEqual({ count: 1, hibernating: false, currentForaged: true })
    expect(foraged.honey).toBe(5)

    // Un second geste qui aide, la même semaine : toujours 5.
    later()
    await act.comment(recettes, ines.cookie, 'Et la suite ?')
    expect((await game.harvest(ines.cookie)).honey).toBe(5)
  })

  it('hibernates after two weeks without a gesture that helps, keeps the count, and starts again', async () => {
    const recettes = await publish(malik, 'Recettes')
    later()
    await act.comment(recettes, ines.cookie, 'Super idée.')

    // La semaine suivante, sans geste : la précédente est butinée, la série n'hiverne pas.
    later(WEEK)
    await signInAgain(ines, malik)
    expect((await game.harvest(ines.cookie)).weeks).toEqual({
      count: 1,
      hibernating: false,
      currentForaged: false,
    })

    // Une deuxième semaine sans geste qui aide (une réaction ne compte pas) : elle hiverne, et
    // garde sa semaine.
    later(WEEK)
    await signInAgain(ines, malik)
    await reactMany(recettes, ines, 1)
    const asleep = await game.harvest(ines.cookie)
    expect(asleep.weeks).toEqual({ count: 1, hibernating: true, currentForaged: false })

    // Elle butine de nouveau : la série reprend à 2, et la semaine rapporte ses 5 miel.
    later()
    await act.comment(recettes, ines.cookie, 'Me revoilà.')
    const awake = await game.harvest(ines.cookie)
    expect(awake.weeks).toEqual({ count: 2, hibernating: false, currentForaged: true })
    expect(awake.honey).toBe(10)
  })
})

describe('who may use the game routes', () => {
  it('answers 401 without a session on the five game routes', async () => {
    const recettes = await publish(malik, 'Recettes')
    const anonymous = [
      act.send('GET', '/v1/me/harvest', null),
      act.send('PATCH', '/v1/me/game', null, { titleForm: 'm' }),
      act.send('PUT', '/v1/me/game/decoration', null, DEFAULT_DECORATION),
      act.send('POST', `/v1/projects/${recettes}/honey`, null),
      act.send('GET', '/v1/rankings?scope=close', null),
    ]
    for (const res of await Promise.all(anonymous)) await expectError(res, 401, 'unauthorized')

    // Témoin : avec une session, aucune ne répond 401.
    const signedIn = [
      act.send('GET', '/v1/me/harvest', ines.cookie),
      act.send('PATCH', '/v1/me/game', ines.cookie, { titleForm: 'm' }),
      act.send('PUT', '/v1/me/game/decoration', ines.cookie, DEFAULT_DECORATION),
      act.send('GET', '/v1/rankings?scope=close', ines.cookie),
    ]
    expect((await Promise.all(signedIn)).map((res) => res.status)).toEqual([200, 204, 204, 200])
  })

  it('refuses a honey gift and a decoration to a suspended member', async () => {
    const recettes = await publish(malik, 'Recettes')
    await suspend(ines.id)

    await expectError(
      await act.send('POST', `/v1/projects/${recettes}/honey`, ines.cookie),
      403,
      'suspended',
    )
    await expectError(
      await act.send('PUT', '/v1/me/game/decoration', ines.cookie, DEFAULT_DECORATION),
      403,
      'suspended',
    )
    // Témoin : Zoé, qui n'est pas suspendue, passe la garde (et bute sur son solde vide).
    await expectError(
      await act.send('POST', `/v1/projects/${recettes}/honey`, zoe.cookie),
      409,
      'honey_short',
    )
    expect(
      (await act.send('PUT', '/v1/me/game/decoration', zoe.cookie, DEFAULT_DECORATION)).status,
    ).toBe(204)
  })

  it('lets a suspended member read the harvest and the rankings and change the settings', async () => {
    await suspend(ines.id)

    expect((await act.send('GET', '/v1/me/harvest', ines.cookie)).status).toBe(200)
    expect((await act.send('GET', '/v1/rankings?scope=close', ines.cookie)).status).toBe(200)
    // Se retirer des classements, couper ses avis : toujours permis (plan R19, sécurité B2).
    expect((await game.patchGame(ines.cookie, { inRankings: false })).status).toBe(204)
    expect((await game.harvest(ines.cookie)).settings.inRankings).toBe(false)
  })
})

describe('the quotas of the game routes', () => {
  it('counts even malformed requests on PATCH /v1/me/game', async () => {
    const key = memberCounterKeys(ines.id).gameSettings

    // Une demande mal formée compte.
    await expectError(await game.patchGame(ines.cookie, { colour: 'red' }), 400, 'validation')
    expect(await counterOf(key)).toBe(1)

    // Le compteur plein : même une demande mal formée attend, avant d'être lue (quota avant Zod).
    await setCounter(key, 10_000)
    await expectError(await game.patchGame(ines.cookie, { colour: 'red' }), 429, 'rate_limited')
    await expectError(await game.patchGame(ines.cookie, { titleForm: 'm' }), 429, 'rate_limited')
  })

  it('counts even malformed decorations, and every read of the harvest', async () => {
    const keys = memberCounterKeys(ines.id)

    await expectError(
      await act.send('PUT', '/v1/me/game/decoration', ines.cookie, { tint: 'gold' }),
      400,
      'validation',
    )
    expect(await counterOf(keys.decoration)).toBe(1)
    await setCounter(keys.decoration, 10_000)
    await expectError(
      await act.send('PUT', '/v1/me/game/decoration', ines.cookie, { tint: 'gold' }),
      429,
      'rate_limited',
    )

    await game.harvest(ines.cookie)
    expect(await counterOf(keys.harvest)).toBe(1)
    await setCounter(keys.harvest, 10_000)
    await expectError(await act.send('GET', '/v1/me/harvest', ines.cookie), 429, 'rate_limited')
  })

  it('counts honey gifts, malformed ones included, ten per hour', async () => {
    const key = memberCounterKeys(ines.id).honeyGift

    // La 10e demande de l'heure passe (un identifiant mal formé : 404 sans base), la 11e attend.
    await setCounter(key, 9)
    await expectError(
      await act.send('POST', '/v1/projects/not-a-uuid/honey', ines.cookie),
      404,
      'not_found',
    )
    await expectError(
      await act.send('POST', `/v1/projects/${UNKNOWN_PROJECT}/honey`, ines.cookie),
      429,
      'rate_limited',
    )

    // Une heure plus tard, la fenêtre est neuve.
    later(HOUR + SECOND)
    await expectError(
      await act.send('POST', `/v1/projects/${UNKNOWN_PROJECT}/honey`, ines.cookie),
      404,
      'not_found',
    )
  })

  it('counts the rankings, malformed queries included, 120 per hour', async () => {
    const key = memberCounterKeys(ines.id).rankings

    await setCounter(key, 119)
    await expectError(
      await act.send('GET', '/v1/rankings?scope=everyone', ines.cookie),
      400,
      'validation',
    )
    await expectError(
      await act.send('GET', '/v1/rankings?scope=close', ines.cookie),
      429,
      'rate_limited',
    )
  })
})

describe('the Waiggle-Pollen header', () => {
  it('reports the pollen of a reaction in the header, as the harvest counts it', async () => {
    const recettes = await publish(malik, 'Recettes')

    later()
    const first = await act.send('PUT', `/v1/projects/${recettes}/reactions/bravo`, ines.cookie)
    expect(first.status).toBe(204)
    expect(first.headers.get(POLLEN_HEADER)).toBe('2')
    expect((await game.harvest(ines.cookie)).total).toBe(2)

    // Retirée puis reposée : rien de plus, et pas d'en-tête.
    later()
    await act.send('DELETE', `/v1/projects/${recettes}/reactions/bravo`, ines.cookie)
    later()
    const again = await act.send('PUT', `/v1/projects/${recettes}/reactions/bravo`, ines.cookie)
    expect(again.status).toBe(204)
    expect(again.headers.get(POLLEN_HEADER)).toBeNull()
    expect((await game.harvest(ines.cookie)).total).toBe(2)
  })

  it('lets the web app read the Waiggle-Pollen header', async () => {
    const res = await ctx.request('/health')

    // CORS : sans cette permission, le navigateur cache l'en-tête à l'appli web.
    const exposed = (res.headers.get('access-control-expose-headers') ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
    expect(exposed).toContain('retry-after') // témoin : la liste existe déjà
    expect(exposed).toContain(POLLEN_HEADER.toLowerCase())
  })

  it('declares the Waiggle-Pollen header in the OpenAPI responses of the gesture routes', async () => {
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, { responses: Record<string, { headers?: object }> }>>
    }
    const gestures: [string, string, string][] = [
      ['/v1/projects/{id}/reactions/{kind}', 'put', '204'],
      ['/v1/projects/{id}/comments', 'post', '201'],
      ['/v1/projects/{id}/updates', 'post', '201'],
      ['/v1/projects', 'post', '201'],
      ['/v1/hives', 'post', '201'],
    ]
    for (const [path, method, status] of gestures) {
      const response = doc.paths[path]?.[method]?.responses[status]
      expect(response, `${method} ${path} ${status}`).toBeDefined()
      expect(Object.keys(response?.headers ?? {}), `${method} ${path}`).toContain(POLLEN_HEADER)
    }
  })
})
