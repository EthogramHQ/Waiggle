// Tests d'intégration de la déclaration des sujets du temps réel (R21) : PUT
// /v1/live/{connectionId}/topics, la liste des pages ouvertes d'un appareil (`project:`, `member:`,
// `hive:`, `corner:`), qui remplace la précédente. Scénario : docs/scenarios/refonte.md, « R21 — Le
// temps réel », « Ce que l'on voit, et ce que l'on ne voit jamais » ; plan R21, choix 3 ;
// relecture de sécurité du plan, B3 (l'identifiant de connexion lié au membre).
//
// Un sujet que le membre n'a pas le droit de lire est ignoré **sans le dire** : la réponse est le
// même 204 (pas d'oracle), et rien n'arrive ensuite sur ce sujet. Chaque refus se prouve par un
// geste sur le sujet refusé, puis par le geste témoin (`poke`) : le témoin arrive, seul.
//
// Les quotas de la route (60 déclarations par minute, requêtes mal formées comprises) sont dans
// live.limits.test.ts.
import { ErrorResponse, LIVE_MAX_TOPICS } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveGestures } from './testing/hive-gestures'
import {
  closeAllLive,
  declareTopics,
  type LiveCast,
  later,
  liveCast,
  openLive,
  poke,
  putTopics,
  signal,
  topic,
  useLiveClock,
} from './testing/live'

let ctx: TestContext
let act: ReturnType<typeof activity>
let cast: LiveCast

/** Le contrat : un projet testable a une démo en ligne. */
const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }
/** Un identifiant de connexion bien formé, qui ne désigne aucune connexion. */
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

beforeEach(async () => {
  useLiveClock(new Date('2026-11-24T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  cast = await liveCast(ctx, act)
})

afterEach(async () => {
  await closeAllLive()
  await ctx.close()
  vi.useRealTimers()
})

/**
 * Les deux sens d'un blocage : qui l'a posé. Une constante nommée, pour que l'inventaire des routes
 * retrouve le titre du test (`it.each(BLOCK_SIDES)('…')`).
 */
const BLOCK_SIDES = [
  ['the reader blocked the member', 'lea'],
  ['the member blocked the reader', 'nora'],
] as const

/** Le projet public de Nora, ouvert à tous les membres. */
const noraProject = async (fields: object = {}) => {
  later()
  return (await act.publish(cast.nora.cookie, 'Décollage !', fields)).id
}

describe('declaring the topics of the open pages', () => {
  it('answers 204 without a body, and the declared page signals from then on', async () => {
    const projectId = await noraProject()
    const stream = await openLive(ctx, cast.lea.cookie)

    const res = await putTopics(ctx, cast.lea.cookie, stream.connectionId, {
      topics: [topic.project(projectId)],
    })
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')

    later()
    await act.comment(projectId, cast.nora.cookie, 'La v2 est en ligne.')
    expect(await stream.nextSignal()).toEqual(signal(topic.project(projectId), 'comments'))
  })

  it('replaces the previous list: a page closed since signals nothing more', async () => {
    const projectId = await noraProject()
    const stream = await openLive(ctx, cast.lea.cookie)
    await declareTopics(ctx, cast.lea.cookie, stream, [topic.project(projectId)])
    await declareTopics(ctx, cast.lea.cookie, stream, [topic.project(cast.witness)])

    later()
    await act.comment(projectId, cast.nora.cookie, 'La v2 est en ligne.')
    const witness = await poke(act, cast)

    expect(await stream.signalsUntil(witness)).toEqual([witness])
  })

  it('keeps the topics of each device apart', async () => {
    // Léa a deux appareils : la page ouverte sur l'un ne s'ajoute pas à l'autre.
    const projectId = await noraProject()
    const phone = await openLive(ctx, cast.lea.cookie)
    const laptop = await openLive(ctx, cast.lea.cookie)
    await declareTopics(ctx, cast.lea.cookie, phone, [topic.project(projectId)])
    await declareTopics(ctx, cast.lea.cookie, laptop, [topic.project(cast.witness)])

    later()
    await act.comment(projectId, cast.nora.cookie, 'La v2 est en ligne.')
    const witness = await poke(act, cast)

    expect(await phone.nextSignal()).toEqual(signal(topic.project(projectId), 'comments'))
    expect(await laptop.signalsUntil(witness)).toEqual([witness])
  })
})

describe('the topics a member may not read', () => {
  it('ignores without a word the private project of another member', async () => {
    const secret = await noraProject({ visibility: 'private' })
    const stream = await openLive(ctx, cast.lea.cookie)

    // Le même 204 qu'un sujet permis : la réponse ne dit pas que le projet existe.
    const res = await putTopics(ctx, cast.lea.cookie, stream.connectionId, {
      topics: [topic.project(secret), topic.project(cast.witness)],
    })
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')

    // Nora commente et réagit sur son projet privé : rien n'arrive chez Léa.
    later()
    await act.comment(secret, cast.nora.cookie, 'Note pour moi.')
    const witness = await poke(act, cast)
    expect(await stream.signalsUntil(witness)).toEqual([witness])

    // Témoin : Nora, l'autrice, le déclare et reçoit le signal de son propre geste.
    const own = await openLive(ctx, cast.nora.cookie)
    await declareTopics(ctx, cast.nora.cookie, own, [topic.project(secret)])
    later()
    await act.comment(secret, cast.nora.cookie, 'Une autre note.')
    expect(await own.nextSignal()).toEqual(signal(topic.project(secret), 'comments'))
  })

  it('ignores without a word a hive the reader is not a member of', async () => {
    const hives = hiveGestures(ctx, act)
    const famille = await hives.create(cast.zoe.cookie, 'Famille')
    await hives.join(famille.id, cast.zoe.cookie, cast.nora)
    const stream = await openLive(ctx, cast.lea.cookie)
    await declareTopics(ctx, cast.lea.cookie, stream, [
      topic.hive(famille.id),
      topic.project(cast.witness),
    ])
    // Témoin : Nora, membre de la ruche, écoute la même ruche.
    const member = await openLive(ctx, cast.nora.cookie)
    await declareTopics(ctx, cast.nora.cookie, member, [topic.hive(famille.id)])

    later()
    await hives.publishReserved(cast.zoe.cookie, 'Le gâteau du dimanche', famille.id)
    const witness = await poke(act, cast)

    expect(await stream.signalsUntil(witness)).toEqual([witness])
    expect(await member.nextSignal()).toEqual(signal(topic.hive(famille.id), 'hive'))
  })

  it('ignores without a word the corner of a project the reader does not test', async () => {
    const projectId = await noraProject(TESTABLE)
    later()
    expect(
      (await act.send('POST', `/v1/projects/${projectId}/testers`, cast.marc.cookie)).status,
    ).toBe(204)
    const stream = await openLive(ctx, cast.lea.cookie)
    await declareTopics(ctx, cast.lea.cookie, stream, [
      topic.corner(projectId),
      topic.project(cast.witness),
    ])
    // Témoin : Marc, testeur, écoute le même coin.
    const tester = await openLive(ctx, cast.marc.cookie)
    await declareTopics(ctx, cast.marc.cookie, tester, [topic.corner(projectId)])

    // Nora lance un appel aux testeurs : le coin change.
    later()
    const call = await act.send('POST', `/v1/projects/${projectId}/calls`, cast.nora.cookie, {
      text: 'Essayez le niveau 3 ce week-end.',
      photoId: null,
      photoDescription: null,
    })
    expect(call.status).toBe(201)
    const witness = await poke(act, cast)

    expect(await stream.signalsUntil(witness)).toEqual([witness])
    expect(await tester.nextSignal()).toEqual(signal(topic.corner(projectId), 'corner'))
  })

  it.each(BLOCK_SIDES)('ignores without a word the page of a member when %s', async (_, who) => {
    if (who === 'lea') await act.block(cast.nora.id, cast.lea.cookie)
    else await act.block(cast.lea.id, cast.nora.cookie)
    const stream = await openLive(ctx, cast.lea.cookie)
    const res = await putTopics(ctx, cast.lea.cookie, stream.connectionId, {
      topics: [topic.member(cast.nora.id), topic.project(cast.witness)],
    })
    expect(res.status).toBe(204)

    // Marc suit Nora : sa page change (« 13 abonnés ») ; rien n'arrive chez Léa.
    later()
    await act.followMember(cast.nora.id, cast.marc.cookie)
    const witness = await poke(act, cast)

    expect(await stream.signalsUntil(witness)).toEqual([witness])
  })

  it('signals the page of a member to a reader who blocks nobody (witness of the blocks)', async () => {
    const stream = await openLive(ctx, cast.lea.cookie)
    await declareTopics(ctx, cast.lea.cookie, stream, [topic.member(cast.nora.id)])

    later()
    await act.followMember(cast.nora.id, cast.marc.cookie)

    expect(await stream.nextSignal()).toEqual(signal(topic.member(cast.nora.id), 'followers'))
  })
})

describe('the shape of a declaration', () => {
  it(`refuses more than ${LIVE_MAX_TOPICS} topics with 400`, async () => {
    const projectId = await noraProject()
    const stream = await openLive(ctx, cast.lea.cookie)
    const many = Array.from({ length: LIVE_MAX_TOPICS + 1 }, () => topic.project(projectId))

    const res = await putTopics(ctx, cast.lea.cookie, stream.connectionId, { topics: many })
    expect(res.status).toBe(400)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('validation')
    // Témoin : vingt sujets passent.
    const twenty = await putTopics(ctx, cast.lea.cookie, stream.connectionId, {
      topics: many.slice(1),
    })
    expect(twenty.status).toBe(204)
  })

  it('refuses with 400 a topic that comes with the stream, or a malformed one', async () => {
    const stream = await openLive(ctx, cast.lea.cookie)

    for (const bad of ['me', 'feed', 'moderation', 'scouts', 'project:42', 'admin']) {
      const res = await putTopics(ctx, cast.lea.cookie, stream.connectionId, { topics: [bad] })
      expect(res.status, bad).toBe(400)
    }
    for (const bad of ['x', { topics: 'project' }, { topics: [], extra: true }]) {
      const res = await putTopics(ctx, cast.lea.cookie, stream.connectionId, bad)
      expect(res.status, JSON.stringify(bad)).toBe(400)
    }
  })
})

describe('whose connection it is', () => {
  it('answers the connection of another member exactly as an unknown one, and changes nothing', async () => {
    const projectId = await noraProject()
    const stream = await openLive(ctx, cast.lea.cookie)
    await declareTopics(ctx, cast.lea.cookie, stream, [topic.project(projectId)])

    // Nora a relevé l'identifiant de connexion de Léa et tente de vider ses sujets.
    const stolen = await putTopics(ctx, cast.nora.cookie, stream.connectionId, { topics: [] })
    const unknown = await putTopics(ctx, cast.nora.cookie, UNKNOWN, { topics: [] })
    expect(stolen.status).toBe(404)
    expect(unknown.status).toBe(404)
    expect(await stolen.text()).toBe(await unknown.text())

    // Les sujets de Léa n'ont pas changé : le commentaire de Marc arrive.
    later()
    await act.comment(projectId, cast.marc.cookie, 'Bravo !')
    expect(await stream.nextSignal()).toEqual(signal(topic.project(projectId), 'comments'))
  })

  it('answers a malformed connection id with the same 404 as an unknown one', async () => {
    const unknown = await putTopics(ctx, cast.lea.cookie, UNKNOWN, { topics: [] })
    const malformed = await putTopics(ctx, cast.lea.cookie, 'abc', { topics: [] })

    expect(unknown.status).toBe(404)
    expect(malformed.status).toBe(404)
    expect(await malformed.text()).toBe(await unknown.text())
    // Témoin : sa propre connexion répond 204.
    const stream = await openLive(ctx, cast.lea.cookie)
    expect(
      (await putTopics(ctx, cast.lea.cookie, stream.connectionId, { topics: [] })).status,
    ).toBe(204)
  })

  it('answers 404 once the stream of this connection is closed', async () => {
    const stream = await openLive(ctx, cast.lea.cookie)
    expect(
      (await putTopics(ctx, cast.lea.cookie, stream.connectionId, { topics: [] })).status,
    ).toBe(204)

    await stream.close()

    // Le serveur oublie la connexion fermée : la déclarer n'a plus de sens.
    await vi.waitFor(
      async () => {
        const res = await putTopics(ctx, cast.lea.cookie, stream.connectionId, { topics: [] })
        expect(res.status).toBe(404)
      },
      { timeout: 2_000, interval: 50 },
    )
  })

  it('refuses a visitor without a session with 401', async () => {
    const stream = await openLive(ctx, cast.lea.cookie)

    const res = await putTopics(ctx, null, stream.connectionId, { topics: [] })
    expect(res.status).toBe(401)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('unauthorized')
  })
})
