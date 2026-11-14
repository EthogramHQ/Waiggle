// Tests d'intégration de R9 (« la modération, avec 7d ») : les décisions de modération dans l'export
// des données du membre (GET /v1/me/export, `moderationDecisions`). Plan R9, « Ce qui change au
// plan » (Export, relecture juridique P3) ; tests demandés mot pour mot par la relecture juridique.
//
// Ce que l'export promet :
// - les décisions qui visent le membre, lues par `target_member_id` : retraits (entiers ou d'une
//   partie), rétablissements, suspensions et levées, des plus anciennes aux plus récentes ;
// - jamais un classement sans suite (il ne vise pas le membre), jamais une décision sur un autre ;
// - pour chacune : l'action, la date, la cible, la partie, le fondement, l'explication et l'ancien
//   nom ou pseudo remplacé d'office (`previousValue`) ;
// - jamais l'administrateur qui a décidé, jamais qui a signalé ;
// - une décision reste dans l'export après que l'auteur a remplacé la partie retirée (la ligne du
//   retrait en cours s'efface, la décision non), ou qu'une partie seule a été rétablie.
//
// Trois membres : Léa (l'autrice de « Météo », dont on lit l'export), Max (qui signale) et Louis,
// l'administrateur. Chaque décision passe par la vraie route (POST /v1/moderation/decisions).
import { AccountExport, type ReportPart, type ReportTarget } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { asc } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string // cookies de session
let max: string
let louis: string
let leaId: string
let maxId: string
let louisId: string
let louisHandle: string
let maxHandle: string
let meteoId: string

const SECOND = 1000
const START = new Date('2026-06-15T08:00:00.000Z')
const DESCRIPTION = 'Une appli qui prévoit la pluie, rue par rue.'
const EXPLANATION = 'Ce texte copie celui d’un autre site.'

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'correct-horse-battery',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'another-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  leaId = (await act.me(lea)).id
  const maxMe = await act.me(max)
  maxId = maxMe.id
  maxHandle = maxMe.handle
  const louisMe = await act.me(louis)
  louisId = louisMe.id
  louisHandle = louisMe.handle
  await act.makeAdmin(louisId)
  meteoId = (
    await act.publish(lea, 'Météo', {
      pitch: 'La pluie de demain, quartier par quartier.',
      description: DESCRIPTION,
      demoUrl: 'https://meteo.example.com/',
    })
  ).id
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge d'une seconde : deux gestes n'ont jamais la même date. */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)
const nowIso = () => new Date(Date.now()).toISOString()

const meteo = (): ReportTarget => ({ kind: 'project', id: meteoId })
const profileOf = (id: string): ReportTarget => ({ kind: 'member', id })

/** Max (ou un autre) signale une cible entière, ou une de ses parties (201 attendu). */
const report = async (target: ReportTarget, part?: ReportPart, reporter = max) => {
  later()
  const res = await act.send('POST', '/v1/reports', reporter, {
    target,
    ...(part && { part }),
    reason: part?.field === 'handle' ? 'impersonation' : 'other',
  })
  expect(res.status, `report ${target.kind} ${part?.field ?? 'whole'}`).toBe(201)
}

/** Signale puis retire (Louis) ; rend la date de la décision. */
const remove = async (target: ReportTarget, part?: ReportPart, reporter = max) => {
  await report(target, part, reporter)
  later()
  await act.decide(louis, {
    action: 'remove',
    target,
    ...(part && { part }),
    ground: 'rules',
    explanation: EXPLANATION,
  })
  return nowIso()
}

/** Louis rétablit une cible entière, ou une partie ; rend la date de la décision. */
const restore = async (target: ReportTarget, part?: ReportPart) => {
  later()
  await act.decide(louis, { action: 'restore', target, ...(part && { part }) })
  return nowIso()
}

/** L'export de Léa : le texte brut (on y cherche ce qui ne doit pas y être) et sa lecture. */
const exportOfLea = async () => {
  const res = await act.send('GET', '/v1/me/export', lea)
  expect(res.status).toBe(200)
  const text = await res.text()
  return { text, data: AccountExport.parse(JSON.parse(text)) }
}

/** Les décisions en base, de la plus ancienne à la plus récente : le témoin d'avant l'export. */
const decisionsInBase = () =>
  ctx.db
    .select({
      action: schema.moderationDecision.action,
      targetMemberId: schema.moderationDecision.targetMemberId,
      partField: schema.moderationDecision.partField,
      previousValue: schema.moderationDecision.previousValue,
    })
    .from(schema.moderationDecision)
    .orderBy(asc(schema.moderationDecision.createdAt))

/** Une décision de l'export, avec ce qui ne change pas d'un test à l'autre. */
const exported = (fields: object) => ({
  ground: null,
  explanation: null,
  previousValue: null,
  part: null,
  ...fields,
})
const removedPart = (at: string, target: ReportTarget, field: ReportPart['field']) =>
  exported({
    action: 'remove',
    at,
    targetKind: target.kind,
    targetId: target.id,
    part: { field, mediaId: null },
    ground: 'rules',
    explanation: EXPLANATION,
  })

describe('the moderation decisions in the export', () => {
  it('exports a part removal after the author replaced the part', async () => {
    const removedAt = await remove(meteo(), { field: 'description' })
    // Léa écrit une nouvelle description : la ligne du retrait en cours s'efface.
    later()
    const patched = await act.send('PATCH', `/v1/projects/${meteoId}`, lea, {
      description: 'Une appli qui prévoit la pluie, quartier par quartier.',
    })
    expect(patched.status).toBe(200)
    // Témoin : la décision qui vise Léa est bien en base.
    expect(await decisionsInBase()).toEqual([
      { action: 'remove', targetMemberId: leaId, partField: 'description', previousValue: null },
    ])

    const { data } = await exportOfLea()

    expect(data.moderationDecisions).toEqual([removedPart(removedAt, meteo(), 'description')])
  })

  it('exports a handle removal with the previous handle, never the admin', async () => {
    later()
    await act.updateProfile(lea, { handle: 'lea_meteo' })
    const removedAt = await remove(profileOf(leaId), { field: 'handle' })
    // Témoin : la décision garde l'ancien pseudo.
    expect(await decisionsInBase()).toEqual([
      { action: 'remove', targetMemberId: leaId, partField: 'handle', previousValue: 'lea_meteo' },
    ])

    const { text, data } = await exportOfLea()

    expect(data.moderationDecisions).toEqual([
      { ...removedPart(removedAt, profileOf(leaId), 'handle'), previousValue: 'lea_meteo' },
    ])
    // Ni l'administrateur ni celui qui a signalé, nulle part dans l'export, ni un champ de plus
    // que le contrat dans la réponse brute.
    for (const absent of [louisId, louisHandle, '"name":"Louis"', maxId, maxHandle]) {
      expect(text).not.toContain(absent)
    }
    const raw = JSON.parse(text) as { moderationDecisions: object[] }
    expect(raw.moderationDecisions.map((decision) => Object.keys(decision).sort())).toEqual([
      ['action', 'at', 'explanation', 'ground', 'part', 'previousValue', 'targetId', 'targetKind'],
    ])
  })

  it('does not drop a whole removal from the record when only a part was restored', async () => {
    // La description retirée, puis tout le projet ; enfin la description seule rétablie.
    const partAt = await remove(meteo(), { field: 'description' })
    const wholeAt = await remove(meteo())
    const restoredAt = await restore(meteo(), { field: 'description' })
    // Témoin : trois décisions qui visent Léa.
    expect((await decisionsInBase()).map((decision) => decision.targetMemberId)).toEqual([
      leaId,
      leaId,
      leaId,
    ])

    const { data } = await exportOfLea()

    expect(data.moderationDecisions).toEqual([
      removedPart(partAt, meteo(), 'description'),
      exported({
        action: 'remove',
        at: wholeAt,
        targetKind: 'project',
        targetId: meteoId,
        ground: 'rules',
        explanation: EXPLANATION,
      }),
      exported({
        action: 'restore',
        at: restoredAt,
        targetKind: 'project',
        targetId: meteoId,
        part: { field: 'description', mediaId: null },
      }),
    ])
    // Le projet reste retiré en entier, et son retrait reste dans la fiche du projet exporté.
    expect(data.projects.find((project) => project.id === meteoId)?.removal).not.toBeNull()
  })

  it('exports the suspensions and lifts of her account, never a dismissal nor a decision about another member', async () => {
    // Un signalement de la démo de Léa classé sans suite.
    await report(meteo(), { field: 'demoUrl' })
    later()
    await act.decide(louis, { action: 'dismiss', target: meteo(), part: { field: 'demoUrl' } })
    // Un projet de Max retiré, après un signalement de Léa : la décision vise Max.
    later()
    const maxProject = await act.publish(max, 'Potager', { pitch: 'Arroser au bon moment.' })
    await remove({ kind: 'project', id: maxProject.id }, undefined, lea)
    // Léa suspendue 7 jours, puis la suspension levée.
    later()
    await act.decide(louis, {
      action: 'suspend',
      memberId: leaId,
      duration: '7d',
      ground: 'rules',
      explanation: EXPLANATION,
    })
    const suspendedAt = nowIso()
    later()
    await act.decide(louis, {
      action: 'lift',
      memberId: leaId,
      cause: 'early',
      explanation: 'Des excuses reçues.',
    })
    const liftedAt = nowIso()
    // Témoin : quatre décisions en base, dont deux qui visent Léa sans être des sanctions.
    expect((await decisionsInBase()).map((decision) => decision.action)).toEqual([
      'dismiss',
      'remove',
      'suspend',
      'lift',
    ])

    const { data } = await exportOfLea()

    expect(data.moderationDecisions).toEqual([
      exported({
        action: 'suspend',
        at: suspendedAt,
        targetKind: 'member',
        targetId: leaId,
        ground: 'rules',
        explanation: EXPLANATION,
      }),
      exported({
        action: 'lift',
        at: liftedAt,
        targetKind: 'member',
        targetId: leaId,
        explanation: 'Des excuses reçues.',
      }),
    ])
  })
})
