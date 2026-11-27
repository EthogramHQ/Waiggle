// Tests d'intégration de la revérification du temps réel (R21) : quand un sujet déjà déclaré n'est
// plus permis (projet passé en privé ou retiré, blocage, départ d'une ruche, testeur retiré…), le
// serveur le retire de la connexion et lui envoie `{ topic, kind: 'gone' }` ; l'appli relit, reçoit
// le 404 et retire la ressource de l'écran. Ensuite, plus rien n'arrive sur ce sujet. Scénario :
// docs/scenarios/refonte.md, « R21 — Le temps réel », « Ce qui change aussi en place » ; plan R21,
// choix 3 (« Revérification ») ; relecture de sécurité du plan, B4 : un test par déclencheur, et
// la décision du 27/11/2026 : un ancien testeur n'écoute plus `corner:` (son fil passe par `me`).
//
// Les fins de session, le compte supprimé et l'administrateur révoqué, relus toutes les
// `LIVE_RECHECK_MS`, sont dans live.session.test.ts.
import type { LiveEvent } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveGestures } from './testing/hive-gestures'
import {
  closeAllLive,
  declareTopics,
  type LiveCast,
  type LiveStream,
  later,
  liveCast,
  openLive,
  poke,
  topic,
  useLiveClock,
} from './testing/live'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveGestures>
let cast: LiveCast

const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }

beforeEach(async () => {
  useLiveClock(new Date('2026-11-24T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveGestures(ctx, act)
  cast = await liveCast(ctx, act)
})

afterEach(async () => {
  await closeAllLive()
  await ctx.close()
  vi.useRealTimers()
})

/** Ouvre le flux d'un membre, qui regarde ces pages et le témoin. */
const listen = async (cookie: string, topics: string[]) => {
  const stream = await openLive(ctx, cookie)
  await declareTopics(ctx, cookie, stream, [...topics, topic.project(cast.witness)])
  return stream
}

/**
 * Après le déclencheur et les gestes qui suivent : lit le flux jusqu'au témoin, et vérifie que
 * chaque sujet de `topics` a reçu `gone`, puis plus rien. Rend les signaux lus.
 */
const expectGoneThenSilence = async (stream: LiveStream, topics: string[]) => {
  const witness = await poke(act, cast)
  const signals = await stream.signalsUntil(witness)
  for (const name of topics) {
    const gone = signals.findIndex((one) => one.topic === name && one.kind === 'gone')
    expect(gone, `gone for ${name} in ${JSON.stringify(signals)}`).toBeGreaterThanOrEqual(0)
    const after: LiveEvent[] = signals.slice(gone + 1).filter((one) => one.topic === name)
    expect(after, `after gone for ${name}`).toEqual([])
  }
  return signals
}

/** Le projet ouvert à tous de Nora. */
const noraProject = async (fields: object = {}) => {
  later()
  return (await act.publish(cast.nora.cookie, 'Décollage !', fields)).id
}

const comment = async (projectId: string, cookie: string, body = 'Encore un mot.') => {
  later()
  return act.comment(projectId, cookie, body)
}

/** Devenir testeur d'un projet testable. */
const joinTesters = async (projectId: string, cookie: string) => {
  later()
  expect((await act.send('POST', `/v1/projects/${projectId}/testers`, cookie)).status).toBe(204)
}

/** L'autrice lance un appel aux testeurs : le coin change. */
const callTesters = async (projectId: string) => {
  later()
  const res = await act.send('POST', `/v1/projects/${projectId}/calls`, cast.nora.cookie, {
    text: 'Essayez le niveau 3 ce week-end.',
    photoId: null,
    photoDescription: null,
  })
  expect(res.status).toBe(201)
}

describe('a project that is no longer visible', () => {
  it('sends gone when the project becomes private, then nothing on it', async () => {
    const projectId = await noraProject()
    const lea = await listen(cast.lea.cookie, [topic.project(projectId)])

    later()
    await act.setVisibility(projectId, cast.nora.cookie, 'private')
    await comment(projectId, cast.nora.cookie, 'Note pour moi.')

    await expectGoneThenSilence(lea, [topic.project(projectId)])
  })

  it('sends gone when the moderation removes the project', async () => {
    const projectId = await noraProject()
    const lea = await listen(cast.lea.cookie, [topic.project(projectId)])

    later()
    const target = { kind: 'project', id: projectId } as const
    await act.report(cast.marc.cookie, target)
    later()
    await act.decide(cast.louis.cookie, {
      action: 'remove',
      target,
      ground: 'rules',
      explanation: 'Publicité déguisée.',
    })

    await expectGoneThenSilence(lea, [topic.project(projectId)])
  })
})

describe('a block', () => {
  it.each([
    ['the reader blocks the author', 'lea'],
    ['the author blocks the reader', 'nora'],
  ] as const)('sends gone on the project and the page of the member when %s', async (_, who) => {
    const projectId = await noraProject()
    const lea = await listen(cast.lea.cookie, [
      topic.project(projectId),
      topic.member(cast.nora.id),
    ])

    later()
    if (who === 'lea') await act.block(cast.nora.id, cast.lea.cookie)
    else await act.block(cast.lea.id, cast.nora.cookie)
    // Nora commente son projet, Marc la suit : rien n'arrive plus chez Léa.
    await comment(projectId, cast.nora.cookie)
    later()
    await act.followMember(cast.nora.id, cast.marc.cookie)

    await expectGoneThenSilence(lea, [topic.project(projectId), topic.member(cast.nora.id)])
  })

  it('sends gone to the blocked one on the projects of the other, in both directions', async () => {
    // Léa regarde le projet de Nora, Nora celui de Léa ; Léa bloque Nora.
    const noraOwn = await noraProject()
    later()
    const leaOwn = (await act.publish(cast.lea.cookie, 'Météo')).id
    const lea = await listen(cast.lea.cookie, [topic.project(noraOwn)])
    const nora = await listen(cast.nora.cookie, [topic.project(leaOwn)])

    later()
    await act.block(cast.nora.id, cast.lea.cookie)
    await comment(noraOwn, cast.nora.cookie)
    await comment(leaOwn, cast.lea.cookie)

    await expectGoneThenSilence(lea, [topic.project(noraOwn)])
    await expectGoneThenSilence(nora, [topic.project(leaOwn)])
  })
})

describe('a hive', () => {
  /** Famille, la ruche de Zoé, avec Léa et Nora ; un projet de Zoé y est réservé. */
  const famille = async () => {
    const hive = await hives.create(cast.zoe.cookie, 'Famille')
    await hives.join(hive.id, cast.zoe.cookie, cast.lea)
    await hives.join(hive.id, cast.zoe.cookie, cast.nora)
    later()
    const reserved = (await hives.publishReserved(cast.zoe.cookie, 'Le gâteau', hive.id)).id
    later()
    return { hiveId: hive.id, reserved }
  }

  it('sends gone on the hive and its reserved projects to a member who leaves', async () => {
    const { hiveId, reserved } = await famille()
    const lea = await listen(cast.lea.cookie, [topic.hive(hiveId), topic.project(reserved)])

    await hives.removeMember(hiveId, cast.lea.cookie, cast.lea.id)
    await comment(reserved, cast.zoe.cookie)
    later()
    await hives.publishReserved(cast.zoe.cookie, 'La cabane', hiveId)

    await expectGoneThenSilence(lea, [topic.hive(hiveId), topic.project(reserved)])
  })

  it('sends gone to a member removed by the animator', async () => {
    const { hiveId, reserved } = await famille()
    const lea = await listen(cast.lea.cookie, [topic.hive(hiveId), topic.project(reserved)])

    await hives.removeMember(hiveId, cast.zoe.cookie, cast.lea.id)
    await comment(reserved, cast.zoe.cookie)

    await expectGoneThenSilence(lea, [topic.hive(hiveId), topic.project(reserved)])
  })

  it('sends gone on the hive and its projects when the hive is deleted', async () => {
    const { hiveId, reserved } = await famille()
    const lea = await listen(cast.lea.cookie, [topic.hive(hiveId), topic.project(reserved)])

    later()
    expect((await act.send('DELETE', `/v1/hives/${hiveId}`, cast.zoe.cookie)).status).toBe(204)

    await expectGoneThenSilence(lea, [topic.hive(hiveId), topic.project(reserved)])
  })

  it('sends gone on a project moved to another hive to the members of the first one only', async () => {
    const { hiveId } = await famille()
    // Nora réserve son projet à Famille, puis le passe à « Amis », où Léa n'est pas.
    const amis = await hives.create(cast.nora.cookie, 'Amis')
    await hives.join(amis.id, cast.nora.cookie, cast.marc)
    later()
    const moved = (await hives.publishReserved(cast.nora.cookie, 'Le potager', hiveId)).id
    const lea = await listen(cast.lea.cookie, [topic.project(moved)])
    const marc = await listen(cast.marc.cookie, [topic.project(moved)])

    later()
    const res = await act.send('PATCH', `/v1/projects/${moved}`, cast.nora.cookie, {
      visibility: 'hive',
      hiveId: amis.id,
    })
    expect(res.status).toBe(200)
    // Marc n'est pas dans Famille : avant le déplacement, sa déclaration du projet était refusée
    // en silence. Il la refait maintenant que le projet est réservé à Amis, dont il est membre.
    await declareTopics(ctx, cast.marc.cookie, marc, [
      topic.project(moved),
      topic.project(cast.witness),
    ])
    await comment(moved, cast.nora.cookie)

    await expectGoneThenSilence(lea, [topic.project(moved)])
    // Témoin : Marc, d'Amis, n'a pas reçu `gone`, et le commentaire lui arrive.
    const witness = await poke(act, cast)
    const toMarc = (await marc.signalsUntil(witness)).filter(
      (one) => one.topic === topic.project(moved),
    )
    expect(toMarc.map((one) => one.kind)).not.toContain('gone')
    expect(toMarc.map((one) => one.kind)).toContain('comments')
  })
})

describe('the testers corner', () => {
  it('sends gone on the corner to a tester removed by the author, then nothing', async () => {
    const projectId = await noraProject(TESTABLE)
    await joinTesters(projectId, cast.lea.cookie)
    const lea = await listen(cast.lea.cookie, [topic.corner(projectId)])

    later()
    expect(
      (
        await act.send(
          'DELETE',
          `/v1/projects/${projectId}/testers/${encodeURIComponent(cast.lea.id)}`,
          cast.nora.cookie,
        )
      ).status,
    ).toBe(204)
    await callTesters(projectId)

    await expectGoneThenSilence(lea, [topic.corner(projectId)])
  })

  it('sends gone on the corner to a tester who leaves: a former tester no longer listens to it', async () => {
    const projectId = await noraProject(TESTABLE)
    await joinTesters(projectId, cast.lea.cookie)
    const lea = await listen(cast.lea.cookie, [topic.corner(projectId)])

    later()
    expect(
      (await act.send('DELETE', `/v1/projects/${projectId}/testers`, cast.lea.cookie)).status,
    ).toBe(204)
    await callTesters(projectId)

    await expectGoneThenSilence(lea, [topic.corner(projectId)])
  })

  it('sends gone on the corner of every project of an author who is suspended', async () => {
    const first = await noraProject(TESTABLE)
    later()
    const second = (await act.publish(cast.nora.cookie, 'Météo', TESTABLE)).id
    await joinTesters(first, cast.lea.cookie)
    await joinTesters(second, cast.lea.cookie)
    const lea = await listen(cast.lea.cookie, [topic.corner(first), topic.corner(second)])

    later()
    await act.decide(cast.louis.cookie, {
      action: 'suspend',
      memberId: cast.nora.id,
      duration: '7d',
      ground: 'rules',
      explanation: 'Des messages insultants, plusieurs fois.',
    })

    await expectGoneThenSilence(lea, [topic.corner(first), topic.corner(second)])
  })

  it('sends gone on the corner when the author and the tester are blocked', async () => {
    const projectId = await noraProject(TESTABLE)
    await joinTesters(projectId, cast.lea.cookie)
    const lea = await listen(cast.lea.cookie, [topic.corner(projectId)])

    later()
    await act.block(cast.lea.id, cast.nora.cookie)

    await expectGoneThenSilence(lea, [topic.corner(projectId)])
  })
})
