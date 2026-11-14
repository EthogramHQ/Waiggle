// Le récap de la semaine et les photos retirées seules par la modération (R9, 7d) : la vignette d'un
// projet ne montre jamais une photo retirée, même la sienne (le récap part chez l'envoyeur d'e-mails,
// où personne ne peut plus la reprendre). Le projet prend alors la tuile de sa catégorie, comme un
// projet sans photo.

import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { categoryTile } from '../email/recap-images'
import { activity } from '../testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from '../testing/context'
import { photoWithGps, visualForm } from '../testing/images'
import { weeklyRecap } from './weekly-recap'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string
let zoe: string
let sam: string
let louis: string

const START = new Date('2026-06-14T08:00:00.000Z') // un dimanche, 10 h à Paris
const later = (ms = 1000) => vi.setSystemTime(Date.now() + ms)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  const member = (name: string) =>
    ctx.verifiedMember({
      name,
      email: `${name.toLowerCase()}@example.com`,
      password: `${name.toLowerCase()}-long-password`,
    })
  ines = await member('Ines')
  zoe = await member('Zoe')
  sam = await member('Sam')
  louis = await member('Louis')
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const sameBytes = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b))

/** Publie « Météo » avec une photo et un commentaire (pour qu'il figure dans « Tes projets »). */
const meteoWithPhoto = async () => {
  later()
  const project = await act.publish(ines, 'Météo', { primaryCategory: 'animals' })
  later()
  const res = await ctx.request(`/v1/projects/${project.id}/visuals`, {
    method: 'POST',
    headers: { cookie: ines },
    body: visualForm(await photoWithGps()),
  })
  expect(res.status).toBe(201)
  later()
  await act.comment(project.id, zoe, 'Bravo.')
  const [media] = await ctx.db
    .select({ id: schema.projectMedia.id })
    .from(schema.projectMedia)
    .where(eq(schema.projectMedia.projectId, project.id))
  if (!media) throw new Error('no photo')
  return { project, mediaId: media.id }
}

const recapOfInes = async () => {
  later(60 * 60 * 1000)
  await weeklyRecap(
    {
      db: ctx.db,
      mailer: ctx.mailer,
      storage: ctx.storage,
      appUrl: TEST_APP_URL,
      apiUrl: TEST_API_URL,
      secret: TEST_AUTH_SECRET,
    },
    new Date(),
  )
  const recaps = ctx.mailer.sent.filter(
    (email) => email.to === 'ines@example.com' && (email.attachments ?? []).length > 0,
  )
  expect(recaps).toHaveLength(1)
  return recaps[0]?.attachments ?? []
}

describe('weekly recap, photos removed alone', () => {
  it('never shows the thumbnail of a removed photo, only the tile of the category', async () => {
    const { project, mediaId } = await meteoWithPhoto()
    const target = { kind: 'project', id: project.id } as const
    const part = { field: 'photo', mediaId } as const
    later()
    const reported = await act.send('POST', '/v1/reports', sam, { target, part, reason: 'other' })
    expect(reported.status).toBe(201)
    later()
    await act.decide(louis, {
      action: 'remove',
      target,
      part,
      ground: 'rules',
      explanation: 'Cette partie ne respecte pas les règles de la communauté.',
    })

    const attachments = await recapOfInes()

    expect(attachments.filter((a) => a.contentType === 'image/jpeg')).toEqual([])
    expect(attachments.some((a) => sameBytes(a.content, categoryTile('animals').content))).toBe(
      true,
    )
  })

  it('still shows the thumbnail of a photo that was not removed (witness)', async () => {
    await meteoWithPhoto()

    const attachments = await recapOfInes()

    expect(attachments.filter((a) => a.contentType === 'image/jpeg')).toHaveLength(1)
  })
})
