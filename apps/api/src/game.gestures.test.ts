// Tests d'intégration de la tranche R19 : chaque geste rapporte son pollen, une fois par chose, au
// membre qui le fait, et à l'auteur du projet ce qu'il reçoit. Scénario : docs/scenarios/refonte.md,
// « R19 — La gamification », « Le pollen » (le tableau des gestes) ; plan, choix 1 à 5 : le grand
// livre `pollen_entry`, l'attribution unique (`game/award.ts`), les gestes branchés, l'en-tête
// `Waiggle-Pollen` sur la réponse du geste (absent quand il ne rapporte rien). Relecture de sécurité
// du plan, S2 : le gain de qui agit ne lit jamais la suspension de l'auteur.
// Les plafonds du jour sont dans game.caps.test.ts, la modération dans game.moderation.test.ts.
//
// Quatre membres : Léa (l'autrice du projet « Météo »), Max (qui agit sur ses projets), Zoé (une
// autre membre) et Louis (l'administrateur, qui suspend). Le grand livre est lu en base
// (testing/pollen-ledger.ts) : les montants y sont comparés à ceux du tableau du scénario, écrits en
// toutes lettres pour qu'un montant changé dans le contrat se voie ici.
import { POLLEN_HEADER, TesterMessage } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveGestures, signedUpMember, type TestMember } from './testing/hive-gestures'
import { avatarForm, jpegImage } from './testing/images'
import { gesturesOf, ledgerOf, markExample, pollenHeader, suspend } from './testing/pollen-ledger'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveGestures>
let lea: TestMember
let max: TestMember
let zoe: TestMember
let louis: TestMember
let meteo: string // le projet de Léa

// Un lundi, 9 h à Paris (8 h en temps universel) : toute la journée de Paris est devant nous.
const START = Date.parse('2026-11-23T08:00:00.000Z')
const MINUTE = 60 * 1000

/** Avance la fausse horloge (par défaut d'une minute : deux gestes n'ont jamais la même date). */
const later = (minutes = 1) => vi.setSystemTime(Date.now() + minutes * MINUTE)

const TESTABLE = { status: 'testable', demoUrl: 'https://meteo-demo.example.com/' }

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveGestures(ctx, act)
  lea = await signedUpMember(ctx, act, 'Léa', '203.0.113.11')
  max = await signedUpMember(ctx, act, 'Max', '203.0.113.12')
  zoe = await signedUpMember(ctx, act, 'Zoé', '203.0.113.13')
  louis = await signedUpMember(ctx, act, 'Louis', '203.0.113.14')
  await act.makeAdmin(louis.id)
  later()
  meteo = (
    await act.publish(lea.cookie, 'Météo', {
      pitch: 'La pluie de demain, quartier par quartier.',
      ...TESTABLE,
    })
  ).id
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Une requête qui doit réussir avec ce statut ; rend la réponse (pour lire son en-tête). */
const done = async (
  status: number,
  method: string,
  path: string,
  cookie: string,
  body?: unknown,
) => {
  later()
  const res = await act.send(method, path, cookie, body)
  expect(res.status, `${method} ${path}: ${await res.clone().text()}`).toBe(status)
  return res
}

const project = (id = meteo) => `/v1/projects/${encodeURIComponent(id)}`

/** Les entrées d'un membre pour un geste seulement : [geste, montant] dans l'ordre. */
const onlyGesture = async (memberId: string, gesture: string) =>
  (await gesturesOf(ctx, memberId)).filter(([name]) => name === gesture)

/** Un retour « En partie », sur téléphone, sans capture (le corps des fils de retours, R7b). */
const feedback = {
  kind: 'feedback',
  outcome: 'partly',
  device: 'phone',
  text: 'Le score repart à zéro au niveau 3.',
  captureId: null,
}

/** Max devient testeur de « Météo » puis envoie un retour dans son fil ; rend le message. */
const maxSendsFeedback = async () => {
  await done(204, 'POST', `${project()}/testers`, max.cookie)
  const res = await done(
    201,
    'POST',
    `${project()}/threads/${max.id}/messages`,
    max.cookie,
    feedback,
  )
  return { res, message: TesterMessage.parse(await res.json()) }
}

describe('the pollen of a reaction', () => {
  it('pays 2 pollen to who reacts, and 1 received by the author', async () => {
    const res = await done(204, 'PUT', `${project()}/reactions/bravo`, max.cookie)

    expect(pollenHeader(res)).toBe('2')
    expect(await ledgerOf(ctx, max.id)).toEqual([
      expect.objectContaining({
        gesture: 'reaction',
        family: 'forager',
        amount: 2,
        sourceKind: 'reaction',
        counterpartId: lea.id,
        day: '2026-11-23',
        revoked: false,
      }),
    ])
    expect(await onlyGesture(lea.id, 'receive_reaction')).toEqual([['receive_reaction', 1]])
    expect((await ledgerOf(ctx, lea.id)).find((row) => row.gesture === 'receive_reaction')).toEqual(
      expect.objectContaining({ family: 'builder', counterpartId: max.id }),
    )
  })

  it('pays each kind of reaction once per project, even taken back and given again', async () => {
    await done(204, 'PUT', `${project()}/reactions/bravo`, max.cookie)
    expect(pollenHeader(await done(204, 'PUT', `${project()}/reactions/useful`, max.cookie))).toBe(
      '2',
    )
    // Retirer ne reprend rien ; reposer la même réaction ne rapporte rien de plus.
    await done(204, 'DELETE', `${project()}/reactions/bravo`, max.cookie)
    const again = await done(204, 'PUT', `${project()}/reactions/bravo`, max.cookie)

    expect(pollenHeader(again)).toBeNull()
    expect(await gesturesOf(ctx, max.id)).toEqual([
      ['reaction', 2],
      ['reaction', 2],
    ])
    expect(await onlyGesture(lea.id, 'receive_reaction')).toEqual([
      ['receive_reaction', 1],
      ['receive_reaction', 1],
    ])
  })
})

describe('the pollen of a comment', () => {
  it('pays 10 pollen for a comment or a reply on the project of someone else, 3 to its author', async () => {
    const first = await done(201, 'POST', `${project()}/comments`, max.cookie, {
      body: 'Elle tombe juste pour mon quartier !',
    })
    const { id } = (await first.json()) as { id: string }
    // Zoé répond au commentaire de Max : une réponse sur le projet de Léa rapporte autant.
    const reply = await done(201, 'POST', `${project()}/comments`, zoe.cookie, {
      body: 'Pour le mien aussi.',
      replyTo: id,
    })

    expect(pollenHeader(first)).toBe('10')
    expect(pollenHeader(reply)).toBe('10')
    expect(await ledgerOf(ctx, max.id)).toEqual([
      expect.objectContaining({
        gesture: 'comment',
        family: 'forager',
        amount: 10,
        sourceKind: 'comment',
      }),
    ])
    expect(await gesturesOf(ctx, zoe.id)).toEqual([['comment', 10]])
    expect(await onlyGesture(lea.id, 'receive_comment')).toEqual([
      ['receive_comment', 3],
      ['receive_comment', 3],
    ])
  })

  it('pays nothing for a comment or a reply on her own project', async () => {
    const before = await gesturesOf(ctx, lea.id)
    const own = await done(201, 'POST', `${project()}/comments`, lea.cookie, {
      body: 'Merci à tous !',
    })
    const { id } = (await own.json()) as { id: string }
    const reply = await done(201, 'POST', `${project()}/comments`, lea.cookie, {
      body: 'Et une précision.',
      replyTo: id,
    })

    expect(pollenHeader(own)).toBeNull()
    expect(pollenHeader(reply)).toBeNull()
    expect(await gesturesOf(ctx, lea.id)).toEqual(before)
    // Témoin : le même commentaire, sur le projet de Léa, rapporte à Max.
    const max1 = await done(201, 'POST', `${project()}/comments`, max.cookie, { body: 'Bravo.' })
    expect(pollenHeader(max1)).toBe('10')
  })

  it('keeps the pollen of a comment its author deletes', async () => {
    const res = await done(201, 'POST', `${project()}/comments`, max.cookie, { body: 'Super.' })
    const { id } = (await res.json()) as { id: string }
    await done(204, 'DELETE', `${project()}/comments/${id}`, max.cookie)

    expect(await ledgerOf(ctx, max.id)).toEqual([
      expect.objectContaining({ gesture: 'comment', amount: 10, revoked: false }),
    ])
    expect(await onlyGesture(lea.id, 'receive_comment')).toEqual([['receive_comment', 3]])
  })
})

describe('the pollen of the testers', () => {
  it('pays 10 pollen for becoming a tester, 5 received by the author, once per project', async () => {
    const joined = await done(204, 'POST', `${project()}/testers`, max.cookie)
    await done(204, 'DELETE', `${project()}/testers`, max.cookie)
    const again = await done(204, 'POST', `${project()}/testers`, max.cookie)

    expect(pollenHeader(joined)).toBe('10')
    expect(pollenHeader(again)).toBeNull()
    expect(await ledgerOf(ctx, max.id)).toEqual([
      expect.objectContaining({ gesture: 'tester', family: 'keeper', amount: 10 }),
    ])
    expect(await onlyGesture(lea.id, 'receive_tester')).toEqual([['receive_tester', 5]])
  })

  it('pays 25 pollen for the first feedback of a thread, then one a day, 5 received by the author', async () => {
    const { res } = await maxSendsFeedback()
    const sameDay = await done(201, 'POST', `${project()}/threads/${max.id}/messages`, max.cookie, {
      ...feedback,
      text: 'Et le bouton Retour ne répond plus.',
    })
    // Le lendemain à Paris, un nouveau retour dans le même fil rapporte de nouveau.
    later(24 * 60)
    const nextDay = await done(201, 'POST', `${project()}/threads/${max.id}/messages`, max.cookie, {
      ...feedback,
      text: 'Corrigé chez moi, merci !',
    })

    expect(pollenHeader(res)).toBe('25')
    expect(pollenHeader(sameDay)).toBeNull()
    expect(pollenHeader(nextDay)).toBe('25')
    expect(await onlyGesture(max.id, 'feedback')).toEqual([
      ['feedback', 25],
      ['feedback', 25],
    ])
    expect((await ledgerOf(ctx, max.id)).find((row) => row.gesture === 'feedback')).toEqual(
      expect.objectContaining({ family: 'keeper', sourceKind: 'tester_message' }),
    )
    expect(await onlyGesture(lea.id, 'receive_feedback')).toEqual([
      ['receive_feedback', 5],
      ['receive_feedback', 5],
    ])
  })

  it('pays nothing to the author who answers in a thread of her project', async () => {
    await maxSendsFeedback()
    const before = await gesturesOf(ctx, lea.id)
    const answer = await done(201, 'POST', `${project()}/threads/${max.id}/messages`, lea.cookie, {
      kind: 'reply',
      text: 'Merci Max, je regarde ça ce soir.',
    })

    expect(pollenHeader(answer)).toBeNull()
    expect(await gesturesOf(ctx, lea.id)).toEqual(before)
    // Témoin : le retour de Max, dans le même fil, a bien rapporté.
    expect(await onlyGesture(max.id, 'feedback')).toEqual([['feedback', 25]])
  })

  it('pays the tester 25 pollen once when the author marks the feedback settled', async () => {
    const { message } = await maxSendsFeedback()
    const settled = await done(
      204,
      'POST',
      `${project()}/messages/${message.id}/settled`,
      lea.cookie,
    )
    // Défaire « réglé » ne retire rien ; régler de nouveau ne paie pas deux fois.
    await done(204, 'DELETE', `${project()}/messages/${message.id}/settled`, lea.cookie)
    await done(204, 'POST', `${project()}/messages/${message.id}/settled`, lea.cookie)

    // L'en-tête dit le gain de qui agit : Léa, qui règle, ne gagne rien.
    expect(pollenHeader(settled)).toBeNull()
    expect(await ledgerOf(ctx, max.id)).toContainEqual(
      expect.objectContaining({
        gesture: 'feedback_settled',
        family: 'keeper',
        amount: 25,
        revoked: false,
      }),
    )
    expect(await onlyGesture(max.id, 'feedback_settled')).toHaveLength(1)
  })
})

describe('the pollen of her own projects', () => {
  it('pays 20 pollen for an update', async () => {
    const res = await done(201, 'POST', `${project()}/updates`, lea.cookie, {
      title: null,
      version: null,
      lines: [{ family: 'new', text: 'Un compte à rebours avant chaque averse' }],
      photos: [],
      beforeAfter: false,
    })

    expect(pollenHeader(res)).toBe('20')
    expect(await onlyGesture(lea.id, 'update')).toEqual([['update', 20]])
    expect((await ledgerOf(ctx, lea.id)).find((row) => row.gesture === 'update')).toEqual(
      expect.objectContaining({ family: 'builder', sourceKind: 'update' }),
    )
  })

  it('pays 50 pollen for publishing a project, at its first step out of private only', async () => {
    const published = await done(201, 'POST', '/v1/projects', max.cookie, {
      title: 'Jardin',
      pitch: 'Quand arroser les tomates.',
      primaryCategory: 'home-garden',
    })
    const draft = await done(201, 'POST', '/v1/projects', max.cookie, {
      title: 'Brouillon',
      pitch: 'Pas encore prêt.',
      primaryCategory: 'other',
      visibility: 'private',
    })
    const { id: draftId } = (await draft.json()) as { id: string }
    const opened = await done(200, 'PATCH', project(draftId), max.cookie, { visibility: 'public' })
    // Repasser en privé puis rouvrir ne compte pas comme une nouvelle publication.
    await done(200, 'PATCH', project(draftId), max.cookie, { visibility: 'private' })
    const reopened = await done(200, 'PATCH', project(draftId), max.cookie, {
      visibility: 'public',
    })

    expect(pollenHeader(published)).toBe('50')
    expect(pollenHeader(draft)).toBeNull()
    expect(pollenHeader(opened)).toBe('50')
    expect(pollenHeader(reopened)).toBeNull()
    expect(await gesturesOf(ctx, max.id)).toEqual([
      ['publish', 50],
      ['publish', 50],
    ])
    expect((await ledgerOf(ctx, max.id))[0]).toEqual(
      expect.objectContaining({ family: 'builder', sourceKind: 'project' }),
    )
  })
})

describe('the pollen of following', () => {
  it('pays 3 pollen for following a member or a project, once each', async () => {
    const member = await done(204, 'POST', `/v1/members/${lea.id}/follow`, max.cookie)
    const followed = await done(204, 'POST', `${project()}/follow`, zoe.cookie)
    // Ne plus suivre, puis suivre à nouveau, ne rapporte rien de plus.
    await done(204, 'DELETE', `/v1/members/${lea.id}/follow`, max.cookie)
    const again = await done(204, 'POST', `/v1/members/${lea.id}/follow`, max.cookie)

    expect(pollenHeader(member)).toBe('3')
    expect(pollenHeader(followed)).toBe('3')
    expect(pollenHeader(again)).toBeNull()
    expect(await ledgerOf(ctx, max.id)).toEqual([
      expect.objectContaining({
        gesture: 'follow',
        family: 'forager',
        amount: 3,
        sourceKind: 'member',
      }),
    ])
    expect(await ledgerOf(ctx, zoe.id)).toEqual([
      expect.objectContaining({ gesture: 'follow', amount: 3, sourceKind: 'project' }),
    ])
  })
})

describe('the pollen of the hives', () => {
  it('pays 15 pollen for creating a hive', async () => {
    later()
    const res = await act.send('POST', '/v1/hives', lea.cookie, {
      name: 'Famille',
      icon: 'house-line',
    })

    expect(res.status).toBe(201)
    expect(pollenHeader(res)).toBe('15')
    expect(await onlyGesture(lea.id, 'hive_created')).toEqual([['hive_created', 15]])
    expect((await ledgerOf(ctx, lea.id)).find((row) => row.gesture === 'hive_created')).toEqual(
      expect.objectContaining({ family: 'dancer', sourceKind: 'hive' }),
    )
  })

  it('pays 20 pollen to the inviter and 15 to the invitee when an invitation is accepted', async () => {
    const hive = await hives.create(lea.cookie)
    later()
    await hives.invite(hive.id, lea.cookie, max.id)
    const invitation = await hives.invitationTo(hive.id, max.cookie)
    later()
    const accepted = await act.send(
      'POST',
      `/v1/hive-invitations/${invitation.id}/accept`,
      max.cookie,
    )

    expect(accepted.status).toBe(200)
    // L'en-tête dit le gain de qui accepte.
    expect(pollenHeader(accepted)).toBe('15')
    expect(await ledgerOf(ctx, max.id)).toEqual([
      expect.objectContaining({
        gesture: 'invitation_joined',
        family: 'dancer',
        amount: 15,
        sourceKind: 'invitation',
      }),
    ])
    expect(await onlyGesture(lea.id, 'invitation_accepted')).toEqual([['invitation_accepted', 20]])
  })
})

describe('the pollen of the profile', () => {
  it('pays 10 pollen once for a photo, once for a bio and once for a first tool', async () => {
    const photo = async () => {
      later()
      return ctx.request('/v1/me/avatar', {
        method: 'POST',
        headers: { cookie: max.cookie },
        body: avatarForm(await jpegImage(400, 400)),
      })
    }
    const firstPhoto = await photo()
    const secondPhoto = await photo()
    const bio = await done(200, 'PATCH', '/v1/me', max.cookie, { bio: 'Je bricole le week-end.' })
    const otherBio = await done(200, 'PATCH', '/v1/me', max.cookie, { bio: 'Autre chose.' })
    const tool = await done(200, 'PATCH', '/v1/me', max.cookie, { favoriteTools: ['Claude'] })
    const moreTools = await done(200, 'PATCH', '/v1/me', max.cookie, {
      favoriteTools: ['Claude', 'Cursor'],
    })
    // Vider sa bio puis la réécrire ne paie pas deux fois.
    await done(200, 'PATCH', '/v1/me', max.cookie, { bio: '' })
    const bioAgain = await done(200, 'PATCH', '/v1/me', max.cookie, { bio: 'De retour.' })

    expect(firstPhoto.status).toBe(200)
    expect(pollenHeader(firstPhoto)).toBe('10')
    expect(pollenHeader(secondPhoto)).toBeNull()
    expect(pollenHeader(bio)).toBe('10')
    expect(pollenHeader(otherBio)).toBeNull()
    expect(pollenHeader(tool)).toBe('10')
    expect(pollenHeader(moreTools)).toBeNull()
    expect(pollenHeader(bioAgain)).toBeNull()
    expect(await gesturesOf(ctx, max.id)).toEqual([
      ['profile_photo', 10],
      ['profile_bio', 10],
      ['profile_tool', 10],
    ])
    expect(
      (await ledgerOf(ctx, max.id)).every(
        (row) => row.family === 'builder' && row.sourceKind === 'profile',
      ),
    ).toBe(true)
  })
})

describe('who earns nothing', () => {
  // Relecture de sécurité du plan, S2 : l'en-tête trahirait la suspension de l'autrice si le gain
  // de Max en dépendait.
  it('pays the actor when the project author is suspended', async () => {
    await suspend(act, louis.cookie, lea.id)
    const reacted = await done(204, 'PUT', `${project()}/reactions/bravo`, max.cookie)
    const commented = await done(201, 'POST', `${project()}/comments`, max.cookie, {
      body: 'Toujours utile.',
    })

    expect(pollenHeader(reacted)).toBe('2')
    expect(pollenHeader(commented)).toBe('10')
    expect(await gesturesOf(ctx, max.id)).toEqual([
      ['reaction', 2],
      ['comment', 10],
    ])
    // Un compte suspendu ne gagne rien, pas même ce qu'il reçoit.
    expect(await onlyGesture(lea.id, 'receive_reaction')).toEqual([])
    expect(await onlyGesture(lea.id, 'receive_comment')).toEqual([])
  })

  it('pays nothing to a suspended member, even for a gesture still allowed to him', async () => {
    // Accepter une invitation reste permis pendant une suspension (tranche R10).
    const hive = await hives.create(lea.cookie)
    later()
    await hives.invite(hive.id, lea.cookie, max.id)
    const invitation = await hives.invitationTo(hive.id, max.cookie)
    await suspend(act, louis.cookie, max.id)
    later()
    const accepted = await act.send(
      'POST',
      `/v1/hive-invitations/${invitation.id}/accept`,
      max.cookie,
    )

    expect(accepted.status).toBe(200)
    expect(pollenHeader(accepted)).toBeNull()
    expect(await ledgerOf(ctx, max.id)).toEqual([])
    // Léa, qui n'est pas suspendue, gagne son invitation acceptée.
    expect(await onlyGesture(lea.id, 'invitation_accepted')).toEqual([['invitation_accepted', 20]])
  })

  it('pays nothing for a gesture on the project of an example account, to either side', async () => {
    later()
    const bot = await signedUpMember(ctx, act, 'WaiggleBot', '203.0.113.15')
    const sample = await act.publish(bot.cookie, 'Exemple', { ...TESTABLE })
    await markExample(ctx, bot.id)

    const reacted = await done(204, 'PUT', `${project(sample.id)}/reactions/bravo`, max.cookie)
    const commented = await done(201, 'POST', `${project(sample.id)}/comments`, max.cookie, {
      body: 'Joli exemple.',
    })
    const tested = await done(204, 'POST', `${project(sample.id)}/testers`, max.cookie)
    const followed = await done(204, 'POST', `/v1/members/${bot.id}/follow`, max.cookie)

    for (const res of [reacted, commented, tested, followed]) expect(pollenHeader(res)).toBeNull()
    expect(await ledgerOf(ctx, max.id)).toEqual([])
    expect(
      (await ledgerOf(ctx, bot.id)).filter((row) => row.gesture.startsWith('receive_')),
    ).toEqual([])
    // Témoin : le même geste sur le projet de Léa rapporte.
    expect(pollenHeader(await done(204, 'PUT', `${project()}/reactions/bravo`, max.cookie))).toBe(
      '2',
    )
  })

  it('makes nobody earn from the gestures of an example account', async () => {
    later()
    const bot = await signedUpMember(ctx, act, 'WaiggleBot', '203.0.113.15')
    await markExample(ctx, bot.id)

    const reacted = await done(204, 'PUT', `${project()}/reactions/bravo`, bot.cookie)
    await done(201, 'POST', `${project()}/comments`, bot.cookie, { body: 'Bel exemple.' })
    const published = await done(201, 'POST', '/v1/projects', bot.cookie, {
      title: 'Un exemple',
      pitch: 'Pour montrer.',
      primaryCategory: 'other',
    })

    expect(pollenHeader(reacted)).toBeNull()
    expect(pollenHeader(published)).toBeNull()
    expect(await ledgerOf(ctx, bot.id)).toEqual([])
    expect(
      (await ledgerOf(ctx, lea.id)).filter((row) => row.gesture.startsWith('receive_')),
    ).toEqual([])
    // Témoin : la même réaction, posée par Max, fait recevoir 1 pollen à Léa.
    await done(204, 'PUT', `${project()}/reactions/bravo`, max.cookie)
    expect(await onlyGesture(lea.id, 'receive_reaction')).toEqual([['receive_reaction', 1]])
  })
})

describe('the pollen header', () => {
  it('lets the web app read the pollen header (CORS)', async () => {
    const res = await done(204, 'PUT', `${project()}/reactions/bravo`, max.cookie)

    expect(pollenHeader(res)).toBe('2')
    const exposed = (res.headers.get('access-control-expose-headers') ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
    expect(exposed).toContain(POLLEN_HEADER.toLowerCase())
  })

  it('declares the pollen header in the OpenAPI responses of every gesture route', async () => {
    type Operation = { responses?: Record<string, { headers?: Record<string, unknown> }> }
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, Operation>>
    }
    const gestures: [string, string][] = [
      ['/v1/projects/{id}/reactions/{kind}', 'put'],
      ['/v1/projects/{id}/comments', 'post'],
      ['/v1/projects/{id}/testers', 'post'],
      ['/v1/projects/{id}/threads/{testerId}/messages', 'post'],
      ['/v1/projects/{id}/updates', 'post'],
      ['/v1/projects', 'post'],
      ['/v1/projects/{id}', 'patch'],
      ['/v1/members/{id}/follow', 'post'],
      ['/v1/projects/{id}/follow', 'post'],
      ['/v1/hives', 'post'],
      ['/v1/hive-invitations/{id}/accept', 'post'],
      ['/v1/me/avatar', 'post'],
      ['/v1/me', 'patch'],
    ]
    const undeclared = gestures
      .filter(([path, method]) => {
        const responses = doc.paths[path]?.[method]?.responses ?? {}
        return !Object.values(responses).some((one) => one.headers?.[POLLEN_HEADER] !== undefined)
      })
      .map(([path, method]) => `${method.toUpperCase()} ${path}`)

    expect(undeclared.join('\n')).toBe('')
    // Témoin : chaque route est bien documentée (une faute dans la liste ne passerait pas).
    for (const [path, method] of gestures) expect(doc.paths[path]).toHaveProperty(method)
  })
})
