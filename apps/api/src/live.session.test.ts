// Tests d'intégration de la fin d'un flux du temps réel (R21) : la session n'est lue qu'à
// l'ouverture du flux ; ensuite, toutes les `LIVE_RECHECK_MS`, le serveur relit la session, le
// compte et le rôle d'administrateur de chaque flux ouvert. Un flux dont la session a pris fin
// (déconnexion, mot de passe changé ailleurs, expiration, purge de nuit, compte supprimé) est
// fermé ; `moderation` et `scouts` partent (`gone`) quand le rôle est retiré. Un compte suspendu
// garde son flux : il lit, comme par les autres GET. Scénario : docs/scenarios/refonte.md, « R21 —
// Le temps réel » ; plan R21, choix 7 (tranché par la session) ; relecture de sécurité du plan, B2
// (le compte volé dont le mot de passe change : le flux du voleur ne doit pas rester ouvert).
//
// L'horloge est simulée (`useLiveClock`) : `vi.advanceTimersByTimeAsync(LIVE_RECHECK_MS)` fait
// passer une revérification sans attendre une vraie minute. Les gestes qui coupent une session
// passent par Better Auth, ou par la base quand seul un script ou une tâche le fait (la purge de
// nuit, `grant-admin.sh --revoke`) : aucun crochet de Better Auth ne les voit.
import { LIVE_RECHECK_MS } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
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

/** Le flux de Léa, ouvert sur le témoin. */
const leaStream = async () => {
  const stream = await openLive(ctx, cast.lea.cookie)
  await declareTopics(ctx, cast.lea.cookie, stream, [topic.project(cast.witness)])
  return stream
}

/** Une revérification passe ; le flux fermé l'est alors en moins de 2 s (vraies). */
const recheck = () => vi.advanceTimersByTimeAsync(LIVE_RECHECK_MS)

/** Témoin : avant la revérification, le flux est toujours ouvert et le témoin lui arrive. */
const expectStillOpen = async (stream: LiveStream) => {
  const witness = await poke(act, cast)
  expect(await stream.signalsUntil(witness)).toContainEqual(witness)
}

describe('a session that ends', () => {
  it('closes the stream within one recheck once the member signs out', async () => {
    const stream = await leaStream()

    const out = await act.send('POST', '/api/auth/sign-out', cast.lea.cookie, {})
    expect(out.status).toBe(200)

    await recheck()
    expect(await stream.closesWithin()).toBe(true)
  })

  it('closes the stream of another device once the password is changed', async () => {
    // Le voleur garde le flux de Léa ouvert ; Léa change son mot de passe depuis son ordinateur.
    const thief = await leaStream()
    const laptop = await act.signInAgain(cast.lea)
    const changed = await act.send('POST', '/api/auth/change-password', laptop, {
      currentPassword: cast.lea.password,
      newPassword: 'a-brand-new-long-password',
    })
    expect(changed.status).toBe(200)
    const own = await openLive(ctx, laptop)

    await recheck()
    expect(await thief.closesWithin()).toBe(true)
    // Témoin : le flux de l'ordinateur, sur la session gardée, reste ouvert.
    await declareTopics(ctx, laptop, own, [topic.project(cast.witness)])
    await expectStillOpen(own)
  })

  it('closes the stream once its session has expired', async () => {
    const stream = await leaStream()
    // La session de Léa expire dans 30 secondes (une session dure 7 jours : on la raccourcit).
    await ctx.db
      .update(schema.session)
      .set({ expiresAt: new Date(Date.now() + 30_000) })
      .where(eq(schema.session.userId, cast.lea.id))

    await recheck()
    expect(await stream.closesWithin()).toBe(true)
  })

  it('closes the stream once the night purge deleted its session', async () => {
    const stream = await leaStream()
    // La purge de nuit efface les sessions en SQL (jobs/nightly-purge.ts), sans Better Auth.
    await ctx.db.delete(schema.session).where(eq(schema.session.userId, cast.lea.id))

    await recheck()
    expect(await stream.closesWithin()).toBe(true)
  })

  it('closes the stream once the account is deleted', async () => {
    const stream = await leaStream()
    const other = await act.signInAgain(cast.lea)

    await act.deleteAccount(other, cast.lea.password)

    await recheck()
    expect(await stream.closesWithin()).toBe(true)
  })

  it('keeps the stream of a member whose session still holds', async () => {
    const stream = await leaStream()

    await recheck()
    await recheck()

    expect(await stream.closesWithin(200)).toBe(false)
    await expectStillOpen(stream)
  })
})

describe('the role of administrator', () => {
  /** Un second administrateur, Zoé : son flux est le témoin des signaux de la modération. */
  const secondAdmin = async () => {
    await act.makeAdmin(cast.zoe.id)
    return openLive(ctx, cast.zoe.cookie)
  }

  const report = async () => {
    later()
    await act.report(cast.marc.cookie, { kind: 'project', id: cast.witness })
  }

  it('takes moderation and scouts away from a revoked administrator, then sends them nothing', async () => {
    const louis = await openLive(ctx, cast.louis.cookie)
    await declareTopics(ctx, cast.louis.cookie, louis, [topic.project(cast.witness)])
    const zoe = await secondAdmin()

    // grant-admin.sh --revoke : en SQL, aucune route ne le voit.
    await act.revokeAdmin(cast.louis.id)
    await recheck()
    await report()

    const witness = await poke(act, cast)
    const signals = await louis.signalsUntil(witness)
    expect(signals).toContainEqual(signal('moderation', 'gone'))
    expect(signals).toContainEqual(signal('scouts', 'gone'))
    expect(signals).not.toContainEqual(signal('moderation', 'moderation'))
    // Le flux lui-même reste ouvert : Louis reste un membre.
    expect(louis.isClosed()).toBe(false)
    // Témoin : Zoé, administratrice en fonction, reçoit le signalement.
    expect(await zoe.signalsDuring(500)).toContainEqual(signal('moderation', 'moderation'))
  })

  it('gives no moderation to a suspended member named administrator, who keeps the stream', async () => {
    // Un administrateur ne se suspend pas par l'API (`cannot_suspend_admin`) ; un membre suspendu
    // peut être nommé par grant-admin.sh : il n'est pas « en fonction » (S19, 7c).
    later()
    await act.decide(cast.louis.cookie, {
      action: 'suspend',
      memberId: cast.zoe.id,
      duration: '7d',
      ground: 'rules',
      explanation: 'Des messages insultants, plusieurs fois.',
    })
    await act.makeAdmin(cast.zoe.id)
    const zoe = await openLive(ctx, cast.zoe.cookie)
    await declareTopics(ctx, cast.zoe.cookie, zoe, [topic.project(cast.witness)])
    const louis = await openLive(ctx, cast.louis.cookie)

    await recheck()
    await report()

    // Zoé, suspendue, garde son flux (le commentaire de Marc sur son projet lui arrive), sans la
    // file de modération. Le témoin habituel (`poke`) est un geste de Zoé, refusé pendant sa
    // suspension : Marc le fait à sa place.
    later()
    await act.comment(cast.witness, cast.marc.cookie, 'Témoin.')
    const signals = await zoe.signalsUntil(signal(topic.project(cast.witness), 'comments'))
    expect(signals).not.toContainEqual(signal('moderation', 'moderation'))
    // Témoin : Louis, administrateur en fonction, reçoit le signalement.
    expect(await louis.signalsDuring(500)).toContainEqual(signal('moderation', 'moderation'))
  })
})

describe('a suspended account', () => {
  it('keeps its stream and still receives what it may read', async () => {
    const stream = await leaStream()

    later()
    await act.decide(cast.louis.cookie, {
      action: 'suspend',
      memberId: cast.lea.id,
      duration: '7d',
      ground: 'rules',
      explanation: 'Des messages insultants, plusieurs fois.',
    })
    await recheck()

    expect(await stream.closesWithin(200)).toBe(false)
    await expectStillOpen(stream)
  })

  it('may still open a stream and declare its pages', async () => {
    later()
    await act.decide(cast.louis.cookie, {
      action: 'suspend',
      memberId: cast.lea.id,
      duration: '7d',
      ground: 'rules',
      explanation: 'Des messages insultants, plusieurs fois.',
    })

    const stream = await leaStream()
    await expectStillOpen(stream)
  })
})
