// Tests d'intégration des destinataires du temps réel (R21) : un signal ne part qu'à qui verrait un
// changement en rechargeant. Scénario : docs/scenarios/refonte.md, « R21 — Le temps réel », « Ce
// que l'on voit, et ce que l'on ne voit jamais » (« pas même le signe qu'il s'est passé quelque
// chose ») ; plan R21, choix 4 et 5, remplacés par la relecture de sécurité du plan, B1 : le droit
// se vérifie aussi **à l'émission**. Les destinataires sont les connexions qui écoutent le sujet et
// pour qui la relecture peut changer :
// - aucun blocage avec l'auteur du geste, dans un sens ni dans l'autre ;
// - l'audience de l'objet (projet de ruche : ses membres ; privé : son auteur ; sinon tous) ;
// - un message d'un fil de testeur ne part qu'au `me` des deux personnes du fil, jamais sur `corner:` ;
// - `member:<id>` n'émet que pour un objet visible de tous les membres ;
// - `feed` et `me` (`notifications`) ne partent pas vers qui a bloqué l'auteur ou en est bloqué.
//
// Chaque « rien » se prouve par le geste témoin (`poke`, testing/live.ts), et chaque refus a son
// témoin positif : un autre membre, sans blocage ni ruche à part, reçoit le signal.
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
  signal,
  topic,
  useLiveClock,
} from './testing/live'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveGestures>
let cast: LiveCast

const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }
const NOTIFICATIONS = signal('me', 'notifications')
const FEED = signal('feed', 'feed')

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

/** Ouvre le flux d'un membre et déclare ses pages ouvertes (le témoin en plus). */
const listen = async (cookie: string, topics: string[] = []) => {
  const stream = await openLive(ctx, cookie)
  await declareTopics(ctx, cookie, stream, [...topics, topic.project(cast.witness)])
  return stream
}

/**
 * Fait le geste témoin, puis rend les signaux lus jusqu'à lui, sans lui : ce que les gestes d'avant
 * ont envoyé à ce flux (le témoin d'un appel précédent, resté en file, l'arrête aussi : les
 * gestes d'avant sont alors déjà lus).
 */
const upToWitness = async (stream: LiveStream) => {
  const witness = await poke(act, cast)
  return (await stream.signalsUntil(witness)).filter(
    (one) => !(one.topic === witness.topic && one.kind === witness.kind),
  )
}

const has = (signals: LiveEvent[], expected: LiveEvent) =>
  signals.some((one) => one.topic === expected.topic && one.kind === expected.kind)

/** Publie un projet ouvert à tous les membres. */
const publish = async (cookie: string, title: string, fields: object = {}) => {
  later()
  return (await act.publish(cookie, title, fields)).id
}

const comment = async (projectId: string, cookie: string, body: string, replyTo?: string) => {
  later()
  return act.comment(projectId, cookie, body, replyTo)
}

/** La ruche « Famille » de Zoé, avec les membres donnés. */
const famille = async (...members: LiveCast['lea'][]) => {
  const hive = await hives.create(cast.zoe.cookie, 'Famille')
  for (const member of members) await hives.join(hive.id, cast.zoe.cookie, member)
  later()
  return hive.id
}

describe('a block, checked when the signal leaves (B1)', () => {
  it('sends nothing, on any topic, to a member of a common hive blocked by the author, and nothing back', async () => {
    const hiveId = await famille(cast.lea, cast.nora)
    const zoeReserved = (await hives.publishReserved(cast.zoe.cookie, 'Le gâteau', hiveId)).id
    await act.block(cast.nora.id, cast.lea.cookie)
    const nora = await listen(cast.nora.cookie, [topic.hive(hiveId), topic.project(zoeReserved)])
    const zoe = await listen(cast.zoe.cookie, [topic.hive(hiveId), topic.project(zoeReserved)])

    // Léa publie un projet réservé à la ruche et écrit sous le projet de Zoé.
    later()
    await hives.publishReserved(cast.lea.cookie, 'La cabane', hiveId)
    await comment(zoeReserved, cast.lea.cookie, 'Il était délicieux.')

    expect(await upToWitness(nora)).toEqual([])
    // Témoin : Zoé, de la même ruche, sans blocage, voit les deux gestes.
    const seenByZoe = await zoe.signalsDuring(300)
    expect(seenByZoe).toContainEqual(signal(topic.project(zoeReserved), 'comments'))
    expect(seenByZoe.some((one) => one.topic === topic.hive(hiveId) || one.topic === 'me')).toBe(
      true,
    )

    // Et l'inverse : Nora publie et écrit, Léa ne reçoit rien non plus.
    const lea = await listen(cast.lea.cookie, [topic.hive(hiveId), topic.project(zoeReserved)])
    later()
    await hives.publishReserved(cast.nora.cookie, 'Le potager', hiveId)
    await comment(zoeReserved, cast.nora.cookie, 'La recette ?')
    expect(await upToWitness(lea)).toEqual([])
  })

  it('never signals, on the page of a member, a project that not every member can see', async () => {
    const hiveId = await famille(cast.nora)
    const secret = await publish(cast.nora.cookie, 'Carnet', { visibility: 'private' })
    // Marc, hors de Famille, regarde la page de Nora.
    const marc = await listen(cast.marc.cookie, [topic.member(cast.nora.id)])

    later()
    await hives.publishReserved(cast.nora.cookie, 'Le potager', hiveId)
    later()
    const changed = await act.send('PATCH', `/v1/projects/${secret}`, cast.nora.cookie, {
      title: 'Carnet secret',
    })
    expect(changed.status).toBe(200)

    expect(await upToWitness(marc)).toEqual([])
    // Témoin : un projet ouvert à tous les membres change la page de Nora.
    await publish(cast.nora.cookie, 'Décollage !')
    expect(
      (await marc.signalsDuring(300)).some((one) => one.topic === topic.member(cast.nora.id)),
    ).toBe(true)
  })

  it("sends a tester's thread message to the two people of the thread only, never on the corner", async () => {
    const projectId = await publish(cast.nora.cookie, 'Décollage !', TESTABLE)
    for (const tester of [cast.lea, cast.marc]) {
      later()
      expect(
        (await act.send('POST', `/v1/projects/${projectId}/testers`, tester.cookie)).status,
      ).toBe(204)
    }
    // Marc (T2) et Nora (l'autrice) regardent le coin ; Léa (T1) a un autre appareil ouvert.
    const marc = await listen(cast.marc.cookie, [topic.corner(projectId)])
    const nora = await listen(cast.nora.cookie, [topic.corner(projectId)])
    const leaLaptop = await listen(cast.lea.cookie)

    later()
    const sent = await act.send(
      'POST',
      `/v1/projects/${projectId}/threads/${encodeURIComponent(cast.lea.id)}/messages`,
      cast.lea.cookie,
      {
        kind: 'feedback',
        outcome: 'partly',
        device: 'phone',
        text: 'Le score repart à zéro au niveau 3.',
        captureId: null,
      },
    )
    expect(sent.status).toBe(201)

    // Marc ne sait pas que Léa a écrit à Nora.
    expect(await upToWitness(marc)).toEqual([])
    // Nora et l'autre appareil de Léa le savent, par leur `me`, jamais par le coin.
    const toNora = await nora.signalsDuring(300)
    expect(toNora.some((one) => one.topic === 'me')).toBe(true)
    expect(toNora.filter((one) => one.topic === topic.corner(projectId))).toEqual([])
    const toLea = await leaLaptop.signalsDuring(300)
    expect(toLea.some((one) => one.topic === 'me')).toBe(true)
    expect(toLea.filter((one) => one.topic === topic.corner(projectId))).toEqual([])

    // Et la réponse de Nora : au `me` de Léa, pas chez Marc.
    later()
    const reply = await act.send(
      'POST',
      `/v1/projects/${projectId}/threads/${encodeURIComponent(cast.lea.id)}/messages`,
      cast.nora.cookie,
      { kind: 'reply', text: 'Merci, je regarde.' },
    )
    expect(reply.status).toBe(201)
    expect((await leaLaptop.signalsDuring(300)).some((one) => one.topic === 'me')).toBe(true)
    expect(await upToWitness(marc)).toEqual([])
  })

  it.each([
    ['the reader blocked the author', 'lea'],
    ['the author blocked the reader', 'nora'],
  ] as const)('does not send feed for a public project when %s', async (_, who) => {
    if (who === 'lea') await act.block(cast.nora.id, cast.lea.cookie)
    else await act.block(cast.lea.id, cast.nora.cookie)
    const lea = await listen(cast.lea.cookie)
    const marc = await listen(cast.marc.cookie)

    await publish(cast.nora.cookie, 'Décollage !')

    expect(await upToWitness(lea)).toEqual([])
    // Témoin : Marc, sans blocage, voit le bouton des nouveautés paraître.
    expect(await upToWitness(marc)).toContainEqual(FEED)
  })

  it('does not send notifications for a mention written by a blocked member', async () => {
    await act.updateProfile(cast.lea.cookie, { handle: 'lea_live' })
    await act.block(cast.nora.id, cast.lea.cookie)
    const marcProject = await publish(cast.marc.cookie, 'Météo')
    const lea = await listen(cast.lea.cookie)

    await comment(marcProject, cast.nora.cookie, 'Tu as vu, @lea_live ?')

    expect(await upToWitness(lea)).toEqual([])
    // Témoin : la même mention par Zoé arrive.
    await comment(marcProject, cast.zoe.cookie, 'Et toi, @lea_live ?')
    expect(await upToWitness(lea)).toContainEqual(NOTIFICATIONS)
  })
})

describe('the activity of each member (me, notifications)', () => {
  it('signals a mention to the mentioned member, and not to a bystander', async () => {
    await act.updateProfile(cast.lea.cookie, { handle: 'lea_live' })
    const marcProject = await publish(cast.marc.cookie, 'Météo')
    const lea = await listen(cast.lea.cookie)
    const louis = await listen(cast.louis.cookie)

    await comment(marcProject, cast.nora.cookie, 'Regarde ça, @lea_live.')

    expect(await upToWitness(lea)).toContainEqual(NOTIFICATIONS)
    expect(has(await upToWitness(louis), NOTIFICATIONS)).toBe(false)
  })

  it('signals a reply to the author of the comment, and not to a bystander', async () => {
    const marcProject = await publish(cast.marc.cookie, 'Météo')
    const first = await comment(marcProject, cast.lea.cookie, 'Il pleuvra demain ?')
    const lea = await listen(cast.lea.cookie)
    const louis = await listen(cast.louis.cookie)

    await comment(marcProject, cast.nora.cookie, 'Oui, sortez couverts.', first.id)

    expect(await upToWitness(lea)).toContainEqual(NOTIFICATIONS)
    expect(has(await upToWitness(louis), NOTIFICATIONS)).toBe(false)
  })

  it('signals a new update to the followers of the project, and not to a bystander', async () => {
    const projectId = await publish(cast.nora.cookie, 'Décollage !')
    later()
    expect(
      (await act.send('POST', `/v1/projects/${projectId}/follow`, cast.lea.cookie)).status,
    ).toBe(204)
    const lea = await listen(cast.lea.cookie)
    const louis = await listen(cast.louis.cookie)

    later()
    const res = await act.send('POST', `/v1/projects/${projectId}/updates`, cast.nora.cookie, {
      title: null,
      version: null,
      lines: [{ family: 'new', text: 'Un compte à rebours avant chaque question' }],
      photos: [],
      beforeAfter: false,
    })
    expect(res.status).toBe(201)

    expect(await upToWitness(lea)).toContainEqual(NOTIFICATIONS)
    expect(has(await upToWitness(louis), NOTIFICATIONS)).toBe(false)
  })

  it('signals a notice of the game (honey offered) to the author of the project only', async () => {
    const projectId = await publish(cast.lea.cookie, 'Météo')
    // Marc butine (un commentaire) : il gagne le miel de sa semaine.
    await comment(projectId, cast.marc.cookie, 'Super idée.')
    const lea = await listen(cast.lea.cookie)
    const louis = await listen(cast.louis.cookie)

    later()
    const offered = await act.send('POST', `/v1/projects/${projectId}/honey`, cast.marc.cookie)
    expect(offered.status).toBe(204)

    expect(await upToWitness(lea)).toContainEqual(NOTIFICATIONS)
    expect(has(await upToWitness(louis), NOTIFICATIONS)).toBe(false)
  })
})

describe('the feed (the news button)', () => {
  it('sends feed to every member for a project open to all members', async () => {
    const lea = await listen(cast.lea.cookie)
    const marc = await listen(cast.marc.cookie)

    await publish(cast.nora.cookie, 'Décollage !')

    expect(await upToWitness(lea)).toContainEqual(FEED)
    expect(await upToWitness(marc)).toContainEqual(FEED)
  })

  it('sends a project reserved to a hive to the members of that hive only, by their me', async () => {
    const hiveId = await famille(cast.lea, cast.nora)
    const lea = await listen(cast.lea.cookie)
    const marc = await listen(cast.marc.cookie)

    later()
    await hives.publishReserved(cast.nora.cookie, 'Le potager', hiveId)

    // Léa, de la ruche : `me` / `feed`, jamais le `feed` de tous.
    const toLea = await upToWitness(lea)
    expect(toLea).toContainEqual(signal('me', 'feed'))
    expect(toLea).not.toContainEqual(FEED)
    // Marc, hors de la ruche : rien.
    expect(await upToWitness(marc)).toEqual([])
  })

  it('sends nothing for a private project, not even to the feed', async () => {
    const lea = await listen(cast.lea.cookie)

    await publish(cast.nora.cookie, 'Carnet', { visibility: 'private' })

    expect(await upToWitness(lea)).toEqual([])
  })
})
