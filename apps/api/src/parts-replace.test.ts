// Tests d'intégration de R9 : « Remplacer » une partie retirée (relecture de sécurité du plan, P5).
// Seule une écriture de la MÊME partie, avec une valeur non vide, efface la marque du retrait en
// cours (sa ligne `content_part_removal`) ; toute autre écriture la garde. Ces tests lisent l'état
// en base (la marque, la photo marquée, le fichier gardé), indépendamment des lectures qui cachent
// une partie aux autres membres (parts-visibility.test.ts les vérifie route par route). Et l'export
// donne la partie d'un signalement fait sur une partie seule.
//
// Trois membres : Inès (l'autrice), Max (qui signale), Louis (l'administrateur). Chaque retrait
// passe par l'API : Max signale la partie, Louis la retire.
import { AccountExport, type ReportPart, type ReportTarget } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { avatarForm, jpegImage, visualForm } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let max: string
let louis: string
let inesId: string

const later = () => vi.setSystemTime(Date.now() + 1000)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  ines = await ctx.verifiedMember({
    name: 'Ines',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'max-long-pw-1',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  inesId = (await act.me(ines)).id
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const removePart = async (target: ReportTarget, part: ReportPart) => {
  later()
  const reported = await act.send('POST', '/v1/reports', max, { target, part, reason: 'other' })
  expect(reported.status, `report ${part.field}`).toBe(201)
  later()
  await act.decide(louis, {
    action: 'remove',
    target,
    part,
    ground: 'rules',
    explanation: 'Ce contenu copie celui d’un autre site.',
  })
}

/** Les marques en cours d'Inès : la partie et sa photo. */
const marks = async () =>
  (
    await ctx.db
      .select({
        field: schema.contentPartRemoval.field,
        mediaId: schema.contentPartRemoval.projectMediaId,
      })
      .from(schema.contentPartRemoval)
      .where(eq(schema.contentPartRemoval.authorId, inesId))
  ).map((row) => `${row.field}${row.mediaId ? `:${row.mediaId}` : ''}`)

const uploadVisual = async (projectId: string) => {
  later()
  const before = new Set(
    (
      await ctx.db
        .select({ id: schema.projectMedia.id })
        .from(schema.projectMedia)
        .where(eq(schema.projectMedia.projectId, projectId))
    ).map((row) => row.id),
  )
  const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
    method: 'POST',
    headers: { cookie: ines },
    body: visualForm(await jpegImage(800, 600)),
  })
  expect(res.status).toBe(201)
  const rows = await ctx.db
    .select({ id: schema.projectMedia.id, removalId: schema.projectMedia.removalId })
    .from(schema.projectMedia)
    .where(eq(schema.projectMedia.projectId, projectId))
  const added = rows.find((row) => !before.has(row.id))
  if (!added) throw new Error('no new photo')
  return added.id
}

const removalIdOf = async (mediaId: string) =>
  (
    await ctx.db
      .select({ removalId: schema.projectMedia.removalId })
      .from(schema.projectMedia)
      .where(eq(schema.projectMedia.id, mediaId))
  )[0]?.removalId

describe('replacing a removed part', () => {
  it('keeps a removed photo marked when the author adds, reorders or describes the photos', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo')
    const kept = await uploadVisual(meteo.id)
    const removed = await uploadVisual(meteo.id)
    await removePart({ kind: 'project', id: meteo.id }, { field: 'photo', mediaId: removed })
    const added = await uploadVisual(meteo.id)
    later()
    const reordered = await act.send('PATCH', `/v1/projects/${meteo.id}`, ines, {
      visualOrder: [added, removed, kept],
    })
    expect(reordered.status).toBe(200)
    for (const visual of [kept, removed]) {
      later()
      const res = await act.send('PATCH', `/v1/projects/${meteo.id}/visuals/${visual}`, ines, {
        description: 'Une nouvelle description',
      })
      expect(res.status).toBe(200)
    }

    expect(await removalIdOf(removed)).not.toBeNull()
    expect(await marks()).toEqual([`photo:${removed}`])
  })

  it('drops the mark of a removed description when the author writes a new one, never on an empty one or another field', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo', {
      description: 'Une carte des vents.',
      demoUrl: 'https://meteo.example.com/',
    })
    await removePart({ kind: 'project', id: meteo.id }, { field: 'description' })
    await removePart({ kind: 'project', id: meteo.id }, { field: 'demoUrl' })
    for (const body of [
      { title: 'Météo du matin' },
      { description: '' },
      { visibility: 'private' },
    ]) {
      later()
      expect((await act.send('PATCH', `/v1/projects/${meteo.id}`, ines, body)).status).toBe(200)
    }
    expect((await marks()).sort()).toEqual(['demoUrl', 'description'])

    later()
    const replaced = await act.send('PATCH', `/v1/projects/${meteo.id}`, ines, {
      description: 'Une autre carte, écrite par moi.',
    })

    expect(replaced.status).toBe(200)
    expect(await marks()).toEqual(['demoUrl'])
  })

  it('drops the mark of a photo description only when that photo gets a new description', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo')
    const photo = await uploadVisual(meteo.id)
    const other = await uploadVisual(meteo.id)
    for (const id of [photo, other]) {
      later()
      await act.send('PATCH', `/v1/projects/${meteo.id}/visuals/${id}`, ines, {
        description: 'Une description à retirer',
      })
    }
    await removePart(
      { kind: 'project', id: meteo.id },
      { field: 'photoDescription', mediaId: photo },
    )
    later()
    await act.send('PATCH', `/v1/projects/${meteo.id}/visuals/${other}`, ines, {
      description: 'Une autre photo',
    })
    expect(await marks()).toEqual([`photoDescription:${photo}`])

    later()
    await act.send('PATCH', `/v1/projects/${meteo.id}/visuals/${photo}`, ines, {
      description: 'La carte au lever du jour',
    })

    expect(await marks()).toEqual([])
  })

  it('drops the mark of a removed bio on a new bio only, and of a removed avatar when replaced or deleted, with its file', async () => {
    later()
    await act.updateProfile(ines, { bio: 'Une bio à retirer.' })
    const uploadAvatar = async () => {
      later()
      const res = await ctx.request('/v1/me/avatar', {
        method: 'POST',
        headers: { cookie: ines },
        body: avatarForm(await jpegImage(600, 600)),
      })
      expect(res.status).toBe(200)
    }
    await uploadAvatar()
    const firstFile = [...ctx.storage.files.keys()].find((key) => key.startsWith('avatars/'))
    const profile = { kind: 'member' as const, id: inesId }
    await removePart(profile, { field: 'bio' })
    await removePart(profile, { field: 'avatar' })
    later()
    await act.send('PATCH', '/v1/me', ines, { bio: '', name: 'Inès' })
    expect((await marks()).sort()).toEqual(['avatar', 'bio'])

    later()
    await act.send('PATCH', '/v1/me', ines, { bio: 'Une bio toute neuve.' })
    expect(await marks()).toEqual(['avatar'])
    // Une nouvelle photo remplace la photo retirée : la marque part, et le fichier gardé aussi.
    await uploadAvatar()
    expect(await marks()).toEqual([])
    expect(ctx.storage.files.has(firstFile ?? '')).toBe(false)

    // Retirée à nouveau, puis supprimée : la marque et le fichier partent.
    const secondFile = [...ctx.storage.files.keys()].find((key) => key.startsWith('avatars/'))
    await removePart(profile, { field: 'avatar' })
    later()
    expect((await act.send('DELETE', '/v1/me/avatar', ines)).status).toBe(204)
    expect(await marks()).toEqual([])
    expect(ctx.storage.files.has(secondFile ?? '')).toBe(false)
    expect((await act.me(ines)).avatarUrl).toBeNull()
  })
})

describe('the part of a report in the export', () => {
  it('exports the part I reported, and null for a whole content', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo', { description: 'Une carte des vents.' })
    later()
    await act.send('POST', '/v1/reports', max, {
      target: { kind: 'project', id: meteo.id },
      part: { field: 'description' },
      reason: 'other',
    })
    later()
    await act.send('POST', '/v1/reports', max, {
      target: { kind: 'member', id: inesId },
      reason: 'other',
    })

    const res = await act.send('GET', '/v1/me/export', max)
    const data = AccountExport.parse(await res.json())

    expect(data.reports.map((report) => report.part)).toEqual([
      { field: 'description', mediaId: null },
      null,
    ])
  })
})
