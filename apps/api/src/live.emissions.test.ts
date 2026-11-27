// Tests d'intégration des signaux du temps réel (R21) : chaque geste d'un membre sur un projet
// arrive, en moins de 2 secondes, à qui écoute la page de ce projet (`project:<id>`), sous la forme
// d'un signal sans contenu (`{ topic, kind }`). Scénario : docs/scenarios/refonte.md, « R21 — Le
// temps réel », « Ce qui arrive tout de suite » ; plan R21, choix 2 et « Points d'émission ».
//
// Léa regarde la page du projet « Décollage ! » de Nora ; Marc fait les gestes. Chaque signal passe
// par `LiveEvent.parse` (un objet strict, testing/live.ts) : un texte, un nom ou un nombre de trop
// dans un signal fait échouer le test qui le lit. Les destinataires (blocages, ruches, Activité, Fil)
// sont dans live.recipients.test.ts ; la revérification (`gone`), dans live.recheck.test.ts.
import { schema } from '@ruche/db'
import { and, eq } from 'drizzle-orm'
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
let cast: LiveCast
let projectId: string
/** Le flux de Léa, qui regarde la page du projet. */
let lea: LiveStream

const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }

beforeEach(async () => {
  useLiveClock(new Date('2026-11-24T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  cast = await liveCast(ctx, act)
  projectId = (await act.publish(cast.nora.cookie, 'Décollage !', TESTABLE)).id
  later()
  lea = await openLive(ctx, cast.lea.cookie)
  await declareTopics(ctx, cast.lea.cookie, lea, [topic.project(projectId)])
})

afterEach(async () => {
  await closeAllLive()
  await ctx.close()
  vi.useRealTimers()
})

const page = () => topic.project(projectId)

/** Les signaux de la page du projet lus jusqu'au témoin (les autres sujets laissés de côté). */
const pageSignalsUntil = async (stream: LiveStream, witness: ReturnType<typeof signal>) =>
  (await stream.signalsUntil(witness)).filter((one) => one.topic === page())

describe('the comments', () => {
  it('signals a new comment to who looks at the project, in less than 2 seconds', async () => {
    const started = performance.now()
    later()
    await act.comment(projectId, cast.marc.cookie, 'Bravo pour le compte à rebours !')

    expect(await lea.nextSignal()).toEqual(signal(page(), 'comments'))
    expect(performance.now() - started).toBeLessThan(2_000)
  })

  it('signals a comment edited, deleted and hidden by the author', async () => {
    later()
    const comment = await act.comment(projectId, cast.marc.cookie, 'Bravo !')
    expect(await lea.nextSignal()).toEqual(signal(page(), 'comments'))

    later()
    const edited = await act.send(
      'PATCH',
      `/v1/projects/${projectId}/comments/${comment.id}`,
      cast.marc.cookie,
      { body: 'Bravo, vraiment !' },
    )
    expect(edited.status).toBe(200)
    expect(await lea.nextSignal()).toEqual(signal(page(), 'comments'))

    later()
    const other = await act.comment(projectId, cast.zoe.cookie, 'Hors sujet.')
    expect(await lea.nextSignal()).toEqual(signal(page(), 'comments'))
    later()
    await act.hide(projectId, other.id, cast.nora.cookie)
    expect(await lea.nextSignal()).toEqual(signal(page(), 'comments'))

    later()
    await act.deleteComment(projectId, comment.id, cast.marc.cookie)
    expect(await lea.nextSignal()).toEqual(signal(page(), 'comments'))
  })

  it("sends one's own comment to one's other open devices", async () => {
    // Le commentaire de Léa paraît tout de suite chez elle ; son ordinateur ouvert le reçoit aussi.
    const laptop = await openLive(ctx, cast.lea.cookie)
    await declareTopics(ctx, cast.lea.cookie, laptop, [page()])

    later()
    await act.comment(projectId, cast.lea.cookie, 'Je teste ce soir.')

    expect(await laptop.nextSignal()).toEqual(signal(page(), 'comments'))
  })

  it('carries no content: neither the text, nor a name, nor a number', async () => {
    later()
    await act.comment(projectId, cast.marc.cookie, 'Un texte « très reconnaissable » 42')

    await lea.nextSignal()
    const seen = lea.describeSeen()
    expect(seen).not.toContain('reconnaissable')
    expect(seen).not.toContain('Marc')
    expect(seen).not.toContain(cast.marc.id)
  })
})

describe('the other gestures on a project', () => {
  it('signals a reaction set and taken back', async () => {
    later()
    await act.react(projectId, 'bravo', cast.marc.cookie)
    expect(await lea.nextSignal()).toEqual(signal(page(), 'reactions'))

    later()
    const taken = await act.send(
      'DELETE',
      `/v1/projects/${projectId}/reactions/bravo`,
      cast.marc.cookie,
    )
    expect(taken.status).toBe(204)
    expect(await lea.nextSignal()).toEqual(signal(page(), 'reactions'))
  })

  it('signals a new follower of the project, and one who leaves', async () => {
    later()
    expect(
      (await act.send('POST', `/v1/projects/${projectId}/follow`, cast.marc.cookie)).status,
    ).toBe(204)
    expect(await lea.nextSignal()).toEqual(signal(page(), 'followers'))

    later()
    expect(
      (await act.send('DELETE', `/v1/projects/${projectId}/follow`, cast.marc.cookie)).status,
    ).toBe(204)
    expect(await lea.nextSignal()).toEqual(signal(page(), 'followers'))
  })

  it('signals a new follower on the page of the member', async () => {
    const memberPage = await openLive(ctx, cast.lea.cookie)
    await declareTopics(ctx, cast.lea.cookie, memberPage, [topic.member(cast.nora.id)])

    later()
    await act.followMember(cast.nora.id, cast.marc.cookie)

    expect(await memberPage.nextSignal()).toEqual(signal(topic.member(cast.nora.id), 'followers'))
  })

  it('signals a new tester, and one who leaves', async () => {
    later()
    expect(
      (await act.send('POST', `/v1/projects/${projectId}/testers`, cast.marc.cookie)).status,
    ).toBe(204)
    expect(await lea.nextSignal()).toEqual(signal(page(), 'testers'))

    later()
    expect(
      (await act.send('DELETE', `/v1/projects/${projectId}/testers`, cast.marc.cookie)).status,
    ).toBe(204)
    expect(await lea.nextSignal()).toEqual(signal(page(), 'testers'))
  })

  it('signals a new update of the project to its Journal', async () => {
    // Léa écoute aussi le projet témoin : sans lui, le signal témoin qui borne la lecture ne lui
    // arriverait jamais.
    await declareTopics(ctx, cast.lea.cookie, lea, [page(), topic.project(cast.witness)])
    later()
    const res = await act.send('POST', `/v1/projects/${projectId}/updates`, cast.nora.cookie, {
      title: null,
      version: null,
      lines: [{ family: 'new', text: 'Un compte à rebours avant chaque question' }],
      photos: [],
      beforeAfter: false,
    })
    expect(res.status).toBe(201)

    const witness = await poke(act, cast)
    expect(await pageSignalsUntil(lea, witness)).toEqual([signal(page(), 'updates')])
  })

  it('signals a change of the project page', async () => {
    later()
    const res = await act.send('PATCH', `/v1/projects/${projectId}`, cast.nora.cookie, {
      title: 'Décollage ! (v2)',
    })
    expect(res.status).toBe(200)

    expect(await lea.nextSignal()).toEqual(signal(page(), 'project'))
  })

  it('signals a call for testers to the testers who look at the corner', async () => {
    later()
    expect(
      (await act.send('POST', `/v1/projects/${projectId}/testers`, cast.marc.cookie)).status,
    ).toBe(204)
    const corner = await openLive(ctx, cast.marc.cookie)
    await declareTopics(ctx, cast.marc.cookie, corner, [topic.corner(projectId)])

    later()
    const call = await act.send('POST', `/v1/projects/${projectId}/calls`, cast.nora.cookie, {
      text: 'Essayez le niveau 3 ce week-end.',
      photoId: null,
      photoDescription: null,
    })
    expect(call.status).toBe(201)

    expect(await corner.nextSignal()).toEqual(signal(topic.corner(projectId), 'corner'))
  })

  // Relecture de sécurité de la branche R21, point 2 : un testeur retiré pendant que sa déclaration
  // attend sa lecture garde le sujet du coin (la revérification est passée avant lui). Le filtre de
  // l'émission relit donc l'inscription : l'inscription effacée sans passer par la route reproduit
  // cet état, un abonnement au coin que plus rien ne justifie.
  it('signals no call for testers to a member still listening to the corner but no longer a tester', async () => {
    later()
    expect(
      (await act.send('POST', `/v1/projects/${projectId}/testers`, cast.marc.cookie)).status,
    ).toBe(204)
    const corner = await openLive(ctx, cast.marc.cookie)
    await declareTopics(ctx, cast.marc.cookie, corner, [
      topic.corner(projectId),
      topic.project(cast.witness),
    ])
    await ctx.db
      .delete(schema.projectTester)
      .where(
        and(
          eq(schema.projectTester.projectId, projectId),
          eq(schema.projectTester.memberId, cast.marc.id),
        ),
      )

    later()
    const call = await act.send('POST', `/v1/projects/${projectId}/calls`, cast.nora.cookie, {
      text: 'Essayez le niveau 3 ce week-end.',
      photoId: null,
      photoDescription: null,
    })
    expect(call.status).toBe(201)
    const witness = await poke(act, cast)

    expect(await corner.signalsUntil(witness)).toEqual([witness])
  })

  it('signals nothing to who looks at another project', async () => {
    const elsewhere = await openLive(ctx, cast.zoe.cookie)
    await declareTopics(ctx, cast.zoe.cookie, elsewhere, [topic.project(cast.witness)])

    later()
    await act.comment(projectId, cast.marc.cookie, 'Bravo !')
    later()
    await act.react(projectId, 'bravo', cast.marc.cookie)
    const witness = await poke(act, cast)

    expect(await elsewhere.signalsUntil(witness)).toEqual([witness])
  })
})

describe('the hives', () => {
  it('signals a new project reserved to the hive to a member who looks at it', async () => {
    const hives = hiveGestures(ctx, act)
    const famille = await hives.create(cast.nora.cookie, 'Famille')
    await hives.join(famille.id, cast.nora.cookie, cast.lea)
    await declareTopics(ctx, cast.lea.cookie, lea, [topic.hive(famille.id)])

    later()
    await hives.publishReserved(cast.nora.cookie, 'Le gâteau du dimanche', famille.id)

    const signals = await lea.signalsDuring(500)
    expect(signals).toContainEqual(signal(topic.hive(famille.id), 'hive'))
  })

  it('signals an invitation received to the invited member only', async () => {
    const hives = hiveGestures(ctx, act)
    const famille = await hives.create(cast.nora.cookie, 'Famille')
    const marc = await openLive(ctx, cast.marc.cookie)
    await declareTopics(ctx, cast.marc.cookie, marc, [topic.project(cast.witness)])

    later()
    await hives.invite(famille.id, cast.nora.cookie, cast.lea.id)
    const witness = await poke(act, cast)

    expect(await lea.signalsDuring(500)).toContainEqual(signal('me', 'hive'))
    // Marc, qui n'est pas invité, ne reçoit que le témoin.
    expect(await marc.signalsUntil(witness)).toEqual([witness])
  })
})

describe('the moderation', () => {
  it('signals a new report to an administrator only', async () => {
    const admin = await openLive(ctx, cast.louis.cookie)
    const member = await openLive(ctx, cast.zoe.cookie)
    await declareTopics(ctx, cast.zoe.cookie, member, [topic.project(cast.witness)])

    later()
    await act.report(cast.marc.cookie, { kind: 'project', id: projectId })

    // `moderation` vient d'office avec le flux d'un administrateur, et seulement le sien.
    expect(await admin.signalsDuring(500)).toContainEqual(signal('moderation', 'moderation'))
    const witness = await poke(act, cast)
    expect(
      (await member.signalsUntil(witness)).filter((one) => one.topic === 'moderation'),
    ).toEqual([])
  })
})
