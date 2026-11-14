// Tests d'intégration de R9 : les notifications de la modération que la tranche ajoute. Une partie
// retirée seule (« La 2e photo de Météo a été retirée »), une partie du profil retirée (avec le
// pseudo provisoire mis à la place), « rétabli » (renvoyé de R8 : signé par l'équipe, jamais le
// nom de l'administrateur, seulement si le retrait avait été notifié), et la fin d'une suspension
// avec sa cause (levée plus tôt, levée pour erreur, ou à la date prévue : jur-R6, décision L1 de
// Louis, 13/11/2026). Scénario : docs/scenarios/refonte.md, « R9 », « Retirer une partie »,
// « Un nom ou un pseudo retiré », « Rétabli », « Un compte suspendu ».
//
// Quatre membres : Inès (l'autrice), Karim (le profil visé, puis suspendu), Max (qui signale),
// Louis (l'administrateur, dont le nom ne doit paraître dans aucune notification).
import {
  type ModerationDecisionInput,
  type Notification,
  NotificationPage,
  type ReportPart,
  type ReportTarget,
} from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { jpegImage, visualForm } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let karim: string
let max: string
let louis: string
let karimId: string

const DAY = 24 * 60 * 60 * 1000
const EXPLANATION = 'Cette partie ne respecte pas les règles de la communauté.'

/** Avance la fausse horloge (une seconde par défaut). */
const later = (ms = 1000) => vi.setSystemTime(Date.now() + ms)

const karimAccount = {
  name: 'Karim Benali',
  email: 'karim@example.com',
  password: 'karim-long-password',
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  ines = await ctx.verifiedMember({
    name: 'Inès Morel',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  karim = await ctx.verifiedMember(karimAccount)
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis Administrateur',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  karimId = (await act.me(karim)).id
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

// ─── Les gestes ──────────────────────────────────────────────────────────────────────────────────

/** Max signale (une partie ou tout le contenu), puis Louis retire. */
const remove = async (target: ReportTarget, part?: ReportPart) => {
  later()
  const reported = await act.send('POST', '/v1/reports', max, {
    target,
    ...(part && { part }),
    reason: 'other',
  })
  expect(reported.status, `report of ${target.kind} ${part?.field ?? 'whole'}`).toBe(201)
  later()
  await act.decide(louis, {
    action: 'remove',
    target,
    ...(part && { part }),
    ground: 'rules',
    explanation: EXPLANATION,
  })
}

/** Louis rétablit (onglet « Retirés »). */
const restore = async (target: ReportTarget, part?: ReportPart) => {
  later()
  const decision: ModerationDecisionInput = { action: 'restore', target, ...(part && { part }) }
  await act.decide(louis, decision)
}

/** Les notifications d'un membre, et leur texte brut (pour y chercher le nom de l'administrateur). */
const notificationsOf = async (cookie: string) => {
  const res = await act.send('GET', '/v1/notifications', cookie)
  expect(res.status).toBe(200)
  const raw = await res.text()
  return { items: NotificationPage.parse(JSON.parse(raw)).items, raw }
}

const ofKind = <K extends Notification['kind']>(items: Notification[], kind: K) =>
  items.filter((item): item is Extract<Notification, { kind: K }> => item.kind === kind)

/** Un projet d'Inès avec deux photos ; rend le projet et les identifiants des photos. */
const meteoWithTwoPhotos = async () => {
  later()
  const meteo = await act.publish(ines, 'Météo')
  const ids: string[] = []
  for (const color of ['#7a9e3b', '#3b6ea8']) {
    later()
    const res = await ctx.request(`/v1/projects/${meteo.id}/visuals`, {
      method: 'POST',
      headers: { cookie: ines },
      body: visualForm(await jpegImage(800, 600, color)),
    })
    expect(res.status).toBe(201)
  }
  const page = await act.send('GET', `/v1/projects/${meteo.id}`, ines)
  const visuals = ((await page.json()) as { visuals: { id: string }[] }).visuals
  for (const visual of visuals) ids.push(visual.id)
  return { meteo, photos: ids }
}

// ─── Une partie retirée ──────────────────────────────────────────────────────────────────────────

describe('the notification of a removed part', () => {
  it('names the removed photo by its rank, with the ground and the explanation, never the admin', async () => {
    const { meteo, photos } = await meteoWithTwoPhotos()
    const second = photos[1] ?? ''

    await remove({ kind: 'project', id: meteo.id }, { field: 'photo', mediaId: second })

    const { items, raw } = await notificationsOf(ines)
    expect(ofKind(items, 'removed')).toEqual([
      expect.objectContaining({
        targetKind: 'project',
        project: expect.objectContaining({ id: meteo.id, title: 'Météo' }),
        part: { field: 'photo', position: 2 },
        excerpt: null,
        ground: 'rules',
        explanation: EXPLANATION,
        afterReport: true,
        projectHidden: false,
      }),
    ])
    expect(raw).not.toContain('Louis Administrateur')
  })

  it('tells the member which part of her profile was removed, with the provisional handle put instead', async () => {
    later()
    await act.updateProfile(karim, { bio: 'Jardinier du dimanche.', handle: 'karim_le_vrai' })

    await remove({ kind: 'member', id: karimId }, { field: 'bio' })
    await remove({ kind: 'member', id: karimId }, { field: 'handle' })

    const provisional = (await act.me(karim)).handle
    const { items, raw } = await notificationsOf(karim)
    const removed = ofKind(items, 'profile_removed')
    expect(removed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          part: { field: 'bio' },
          replacedBy: null,
          ground: 'rules',
          explanation: EXPLANATION,
          afterReport: true,
        }),
        expect.objectContaining({ part: { field: 'handle' }, replacedBy: provisional }),
      ]),
    )
    expect(removed).toHaveLength(2)
    expect(provisional).toMatch(/^membre_[a-z0-9]{4}$/)
    expect(raw).not.toContain('Louis Administrateur')
    // L'ancien pseudo n'est écrit dans aucune notification : il est retiré.
    expect(raw).not.toContain('karim_le_vrai')
  })
})

// ─── Rétabli ─────────────────────────────────────────────────────────────────────────────────────

describe('the notification « restored »', () => {
  it('says a removed photo is back, signed by the team, and drops the removal notice', async () => {
    const { meteo, photos } = await meteoWithTwoPhotos()
    const second = photos[1] ?? ''
    await remove({ kind: 'project', id: meteo.id }, { field: 'photo', mediaId: second })

    await restore({ kind: 'project', id: meteo.id }, { field: 'photo', mediaId: second })

    const { items, raw } = await notificationsOf(ines)
    expect(ofKind(items, 'removed')).toEqual([])
    expect(ofKind(items, 'restored')).toEqual([
      expect.objectContaining({
        targetKind: 'project',
        project: expect.objectContaining({ id: meteo.id, title: 'Météo' }),
        part: { field: 'photo', position: 2 },
        valueBack: true,
        handle: null,
      }),
    ])
    expect(raw).not.toContain('Louis Administrateur')
  })

  it('says a whole project is visible again, with no part', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo')
    await remove({ kind: 'project', id: meteo.id })

    await restore({ kind: 'project', id: meteo.id })

    const { items } = await notificationsOf(ines)
    expect(ofKind(items, 'restored')).toEqual([
      expect.objectContaining({
        targetKind: 'project',
        project: expect.objectContaining({ id: meteo.id }),
        part: null,
        valueBack: true,
      }),
    ])
  })

  it('says the former handle is back, or that the member keeps the one he chose', async () => {
    later()
    await act.updateProfile(karim, { handle: 'karim_le_vrai' })
    await remove({ kind: 'member', id: karimId }, { field: 'handle' })
    await restore({ kind: 'member', id: karimId }, { field: 'handle' })

    let restored = ofKind((await notificationsOf(karim)).items, 'restored')
    expect(restored).toEqual([
      expect.objectContaining({
        targetKind: 'member',
        project: null,
        part: { field: 'handle', position: null },
        valueBack: true,
        handle: 'karim_le_vrai',
      }),
    ])
    expect(ofKind((await notificationsOf(karim)).items, 'profile_removed')).toEqual([])

    // Retiré encore ; Karim en choisit un autre avant le rétablissement : l'ancien ne revient pas.
    await remove({ kind: 'member', id: karimId }, { field: 'handle' })
    later()
    await act.updateProfile(karim, { handle: 'karim_2' })
    await restore({ kind: 'member', id: karimId }, { field: 'handle' })

    restored = ofKind((await notificationsOf(karim)).items, 'restored')
    expect(restored[0]).toEqual(
      expect.objectContaining({
        part: { field: 'handle', position: null },
        valueBack: false,
        handle: 'karim_2',
      }),
    )
  })
})

// ─── La fin d'une suspension ─────────────────────────────────────────────────────────────────────

describe('the notification of the end of a suspension', () => {
  const suspend = async (memberId: string) => {
    later()
    const res = await act.send('POST', '/v1/moderation/decisions', louis, {
      action: 'suspend',
      memberId,
      duration: '7d',
      ground: 'rules',
      explanation: 'Des messages insultants, plusieurs fois.',
    })
    expect(res.status).toBe(201)
  }
  const lift = async (memberId: string, cause: 'early' | 'error') => {
    later()
    const res = await act.send('POST', '/v1/moderation/decisions', louis, {
      action: 'lift',
      memberId,
      cause,
      explanation: 'Les messages venaient d’un autre compte.',
    })
    expect(res.status).toBe(201)
  }
  const endedFor = async (cookie: string) =>
    ofKind((await notificationsOf(cookie)).items, 'suspension_ended')

  it('says a suspension lifted for an error was an error of the moderation', async () => {
    await suspend(karimId)
    await lift(karimId, 'error')

    expect(await endedFor(karim)).toEqual([
      expect.objectContaining({
        lifted: true,
        cause: 'error',
        explanation: 'Les messages venaient d’un autre compte.',
      }),
    ])
  })

  it('tells apart a suspension lifted early and one that reached its end', async () => {
    const inesId = (await act.me(ines)).id
    await suspend(karimId)
    await lift(karimId, 'early')
    await suspend(inesId)
    later(8 * DAY)
    const inesThen = await act.signInAgain({
      email: 'ines@example.com',
      password: 'ines-long-password',
    })
    const karimThen = await act.signInAgain(karimAccount)

    expect(await endedFor(karimThen)).toEqual([
      expect.objectContaining({ lifted: true, cause: 'early' }),
    ])
    expect(await endedFor(inesThen)).toEqual([
      expect.objectContaining({ lifted: false, cause: 'end', explanation: null }),
    ])
  })
})
