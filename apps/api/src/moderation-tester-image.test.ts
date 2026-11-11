// L'adresse d'une image du coin des testeurs dans la file de modération (R7b, décision 4 de Louis) :
// donnée seulement pour la photo d'un appel ou la capture d'un message visés par un signalement
// ouvert, et seulement tant que l'image est encore là. Le service du fichier lui-même est testé par
// tester-media.test.ts ; la file (texte, retrait, historique) par moderation.test.ts.
import { ModerationQueuePage, TesterCall, TesterMedia, TesterMessage } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { jpegImage } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string
let max: string
let louis: string
let maxId: string
let projectId: string

const projectPath = () => `/v1/projects/${projectId}`
const later = () => vi.setSystemTime(Date.now() + 1000)

/** Envoie une image du coin, « en attente » ; rend son id et sa clé de stockage. */
const upload = async (cookie: string, kind: 'call' | 'capture') => {
  later()
  const form = new FormData()
  form.append(
    'file',
    new File([new Uint8Array(await jpegImage(800, 600))], 'image.jpg', { type: 'image/jpeg' }),
  )
  form.append('kind', kind)
  const res = await ctx.request(`${projectPath()}/testers/media`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  })
  expect(res.status).toBe(201)
  const { id } = TesterMedia.parse(await res.json())
  const [row] = await ctx.db
    .select({ key: schema.testerMedia.storageKey })
    .from(schema.testerMedia)
    .where(eq(schema.testerMedia.id, id))
  if (!row) throw new Error(`no tester media ${id}`)
  return { id, key: row.key }
}

const readQueue = async () => {
  const res = await act.send('GET', '/v1/moderation/reports', louis)
  expect(res.status).toBe(200)
  return ModerationQueuePage.parse(await res.json()).items
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'lea-long-pw-1',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'max-long-pw-1',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-pw-1',
  })
  maxId = (await act.me(max)).id
  await act.makeAdmin((await act.me(louis)).id)
  projectId = (
    await act.publish(lea, 'Décollage', {
      pitch: 'Un quiz de l’espace pour les petits.',
      status: 'testable',
      demoUrl: 'https://demo.example.com/',
    })
  ).id
  later()
  expect((await act.send('POST', `${projectPath()}/testers`, max)).status).toBe(204)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

describe('the address of a tester image in the moderation queue', () => {
  it('gives the address of the photo of a reported call, and of the capture of a reported message', async () => {
    const photo = await upload(lea, 'call')
    later()
    const call = TesterCall.parse(
      await (
        await act.send('POST', `${projectPath()}/calls`, lea, {
          text: 'Testez la fusée.',
          photoId: photo.id,
          photoDescription: 'La fusée sur la rampe',
        })
      ).json(),
    )
    const capture = await upload(max, 'capture')
    later()
    const sent = TesterMessage.parse(
      await (
        await act.send('POST', `${projectPath()}/threads/${maxId}/messages`, max, {
          kind: 'feedback',
          outcome: 'no',
          device: 'phone',
          text: 'Le score repart à zéro.',
          captureId: capture.id,
        })
      ).json(),
    )
    later()
    await act.report(max, { kind: 'call', id: call.id }, 'other')
    later()
    await act.report(lea, { kind: 'message', id: sent.id }, 'other')

    const items = await readQueue()

    const urls = items.map((item) => item.images.map((image) => image.url))
    expect(urls.map((list) => list.map((url) => new URL(url ?? '').pathname))).toEqual([
      [`/media/${photo.key}`],
      [`/media/${capture.key}`],
    ])
  })

  it('gives no address once the image is gone from the call', async () => {
    const photo = await upload(lea, 'call')
    later()
    const call = TesterCall.parse(
      await (
        await act.send('POST', `${projectPath()}/calls`, lea, {
          text: 'Testez la fusée.',
          photoId: photo.id,
          photoDescription: null,
        })
      ).json(),
    )
    await act.report(max, { kind: 'call', id: call.id }, 'other')
    // La photo disparaît du stockage de l'appel (effacée en base : aucune route ne la retire seule).
    await ctx.db.delete(schema.testerMedia).where(eq(schema.testerMedia.id, photo.id))

    const [item] = await readQueue()

    expect(item?.images).toEqual([{ field: 'photo', state: 'gone' }])
  })
})
