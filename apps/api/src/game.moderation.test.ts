// Tests d'intégration de la tranche R19 : la modération et le pollen. Scénario :
// docs/scenarios/refonte.md, « R19 — La gamification », « Le pollen » : défaire un geste ne retire
// pas son pollen ; seule exception, un contenu retiré par la modération retire le pollen qu'il a
// rapporté ; une suspension n'efface rien du passé. Plan, choix 9 : `mark()` révoque (`revoked_at`)
// les entrées dont la source est le contenu retiré, et celles que son auteur a reçues à cause de
// lui ; rétablir les rend ; un projet retiré ne retire rien aux autres (leurs réactions et retours
// restent les leurs). Relecture de sécurité du plan, S5 : la photo, la bio et les outils d'un profil
// sont retirés par `moderation/parts.ts`, qui révoque aussi (par `revokeFor` de `game/award.ts`).
// Et la preuve citée par route-inventory.test.ts : un classement ne montre jamais une photo retirée.
//
// Quatre membres : Léa (l'autrice du projet « Météo »), Max (qui agit sur ses projets), Zoé (qui
// signale) et Louis (l'administrateur, qui décide). Le grand livre est lu en base
// (testing/pollen-ledger.ts).
import { Ranking, type ReportPart, type ReportTarget } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { signedUpMember, type TestMember } from './testing/hive-gestures'
import { avatarForm, jpegImage } from './testing/images'
import { type LedgerRow, ledgerOf, pollenOf, suspend } from './testing/pollen-ledger'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: TestMember
let max: TestMember
let zoe: TestMember
let louis: TestMember
let meteo: string

// Un lundi, 9 h à Paris.
const START = Date.parse('2026-11-23T08:00:00.000Z')
const MINUTE = 60 * 1000
const EXPLANATION = 'Contraire aux règles de la communauté.'

const later = (minutes = 1) => vi.setSystemTime(Date.now() + minutes * MINUTE)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await signedUpMember(ctx, act, 'Léa', '203.0.113.31')
  max = await signedUpMember(ctx, act, 'Max', '203.0.113.32')
  zoe = await signedUpMember(ctx, act, 'Zoé', '203.0.113.33')
  louis = await signedUpMember(ctx, act, 'Louis', '203.0.113.34')
  await act.makeAdmin(louis.id)
  later()
  meteo = (
    await act.publish(lea.cookie, 'Météo', {
      status: 'testable',
      demoUrl: 'https://meteo-demo.example.com/',
    })
  ).id
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

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

/** Zoé signale, puis Louis retire (un retrait exige un signalement ouvert, reports/decide.ts). */
const removeByModeration = async (target: ReportTarget, part?: ReportPart) => {
  later()
  const reported = await act.send('POST', '/v1/reports', zoe.cookie, {
    target,
    ...(part && { part }),
    reason: 'other',
  })
  expect(reported.status).toBe(201)
  later()
  await act.decide(louis.cookie, {
    action: 'remove',
    target,
    ...(part && { part }),
    ground: 'rules',
    explanation: EXPLANATION,
  })
}

/** Les entrées d'un membre, en [geste, montant, révoquée]. */
const states = async (memberId: string) =>
  (await ledgerOf(ctx, memberId)).map((row: LedgerRow) => [row.gesture, row.amount, row.revoked])

/** Max commente « Météo » ; rend l'identifiant du commentaire. */
const maxComments = async () => {
  const res = await done(201, 'POST', `${project()}/comments`, max.cookie, {
    body: 'Achetez mes parapluies sur ce lien !',
  })
  return ((await res.json()) as { id: string }).id
}

/** Max met une photo de profil. */
const maxUploadsPhoto = async () => {
  later()
  const res = await ctx.request('/v1/me/avatar', {
    method: 'POST',
    headers: { cookie: max.cookie },
    body: avatarForm(await jpegImage(400, 400)),
  })
  expect(res.status).toBe(200)
}

describe('a comment removed by moderation', () => {
  it('revokes the pollen of a removed comment and what the author of the project received', async () => {
    const commentId = await maxComments()
    // Témoin : avant le retrait, tout compte.
    expect(await states(max.id)).toEqual([['comment', 10, false]])

    await removeByModeration({ kind: 'comment', id: commentId })

    expect(await states(max.id)).toEqual([['comment', 10, true]])
    expect((await states(lea.id)).filter(([gesture]) => gesture === 'receive_comment')).toEqual([
      ['receive_comment', 3, true],
    ])
    expect(await pollenOf(ctx, max.id)).toBe(0)
  })

  it('gives the pollen back when the comment is restored', async () => {
    const commentId = await maxComments()
    await removeByModeration({ kind: 'comment', id: commentId })
    later()
    await act.decide(louis.cookie, {
      action: 'restore',
      target: { kind: 'comment', id: commentId },
    })

    expect(await states(max.id)).toEqual([['comment', 10, false]])
    expect((await states(lea.id)).filter(([gesture]) => gesture === 'receive_comment')).toEqual([
      ['receive_comment', 3, false],
    ])
    expect(await pollenOf(ctx, max.id)).toBe(10)
  })

  it('revokes nothing else of its author', async () => {
    await done(204, 'PUT', `${project()}/reactions/bravo`, max.cookie)
    const commentId = await maxComments()
    await done(201, 'POST', `${project()}/comments`, max.cookie, { body: 'Un avis honnête.' })
    await removeByModeration({ kind: 'comment', id: commentId })

    expect(await states(max.id)).toEqual([
      ['reaction', 2, false],
      ['comment', 10, true],
      ['comment', 10, false],
    ])
  })
})

describe('a project removed by moderation', () => {
  it('takes nothing from the others when a project is removed', async () => {
    await done(204, 'PUT', `${project()}/reactions/bravo`, max.cookie)
    await maxComments()
    await done(204, 'POST', `${project()}/testers`, max.cookie)
    await done(204, 'POST', `${project()}/follow`, zoe.cookie)
    const before = await states(max.id)

    await removeByModeration({ kind: 'project', id: meteo })

    // Léa perd sa publication et ce que le projet lui a fait recevoir.
    expect(await states(lea.id)).toEqual([
      ['publish', 50, true],
      ['receive_reaction', 1, true],
      ['receive_comment', 3, true],
      ['receive_tester', 5, true],
    ])
    // Les gestes de Max et de Zoé restent les leurs.
    expect(before).toEqual([
      ['reaction', 2, false],
      ['comment', 10, false],
      ['tester', 10, false],
    ])
    expect(await states(max.id)).toEqual(before)
    expect(await states(zoe.id)).toEqual([['follow', 3, false]])
  })

  it('revokes the pollen of a removed update', async () => {
    const res = await done(201, 'POST', `${project()}/updates`, lea.cookie, {
      title: null,
      version: null,
      lines: [{ family: 'new', text: 'Un lien vers une arnaque' }],
      photos: [],
      beforeAfter: false,
    })
    const { id } = (await res.json()) as { id: string }

    await removeByModeration({ kind: 'update', id })

    expect(await states(lea.id)).toEqual([
      ['publish', 50, false],
      ['update', 20, true],
    ])
  })
})

describe('a part of a profile removed by moderation', () => {
  it('revokes the profile pollen when moderation removes the photo', async () => {
    await maxUploadsPhoto()
    expect(await states(max.id)).toEqual([['profile_photo', 10, false]])

    await removeByModeration({ kind: 'member', id: max.id }, { field: 'avatar' })

    expect(await states(max.id)).toEqual([['profile_photo', 10, true]])
  })

  it('revokes the profile pollen when moderation removes the bio or the tools', async () => {
    await done(200, 'PATCH', '/v1/me', max.cookie, {
      bio: 'Achetez mes parapluies.',
      favoriteTools: ['Claude'],
    })
    expect(await states(max.id)).toEqual(
      expect.arrayContaining([
        ['profile_bio', 10, false],
        ['profile_tool', 10, false],
      ]),
    )

    await removeByModeration({ kind: 'member', id: max.id }, { field: 'bio' })
    const afterBio = await ledgerOf(ctx, max.id)
    expect(afterBio.find((row) => row.gesture === 'profile_bio')?.revoked).toBe(true)
    expect(afterBio.find((row) => row.gesture === 'profile_tool')?.revoked).toBe(false)

    await removeByModeration({ kind: 'member', id: max.id }, { field: 'favoriteTools' })
    expect(
      (await ledgerOf(ctx, max.id)).find((row) => row.gesture === 'profile_tool')?.revoked,
    ).toBe(true)
  })
})

describe('a suspension', () => {
  it('keeps the pollen earned before a suspension', async () => {
    await done(204, 'PUT', `${project()}/reactions/bravo`, max.cookie)
    await maxComments()
    const before = await states(max.id)

    await suspend(act, louis.cookie, max.id)

    expect(before).toEqual([
      ['reaction', 2, false],
      ['comment', 10, false],
    ])
    expect(await states(max.id)).toEqual(before)
  })
})

describe('the rankings and a removed photo', () => {
  it('never shows a removed avatar in a ranking', async () => {
    await maxUploadsPhoto()
    await maxComments() // Max gagne du pollen cette semaine.
    await done(204, 'POST', `/v1/members/${max.id}/follow`, lea.cookie)
    const rowOfMax = async () => {
      const res = await act.send('GET', '/v1/rankings?scope=close', lea.cookie)
      expect(res.status).toBe(200)
      const text = await res.clone().text()
      return {
        text,
        row: Ranking.parse(await res.json()).rows.find((one) => one.member.id === max.id),
      }
    }
    // Témoin : avant le retrait, la photo de Max est dans le classement de Léa.
    const before = await rowOfMax()
    expect(before.row?.member.avatarUrl).toEqual(expect.any(String))
    const removedUrl = before.row?.member.avatarUrl ?? ''

    await removeByModeration({ kind: 'member', id: max.id }, { field: 'avatar' })

    const after = await rowOfMax()
    expect(after.row?.member.avatarUrl).toBeNull()
    expect(after.text).not.toContain(new URL(removedUrl).pathname)
  })
})
