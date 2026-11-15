// Les commentaires d'un projet réservé à une ruche, après le départ d'un membre (R10). Scénario :
// docs/scenarios/refonte.md, R10, « Quitter une ruche » : « Tes commentaires sur ses projets restent
// lisibles par ses membres », et l'ancien membre efface encore les siens, sans plus les voir
// (décision Q2 de la relecture du plan). Ce fichier garde les deux bords de cette règle : les membres
// lisent et comptent le commentaire de l'ancien membre ; l'ancien membre ne trouve que les siens.
import { CommentPage, Project } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRows } from './testing/hive-rows'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let max: string
let lea: string
let maxId: string
let famille: string

const UNKNOWN = '00000000-0000-4000-8000-000000000000'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  ines = await ctx.verifiedMember({
    name: 'Inès',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'lea-long-password',
  })
  const inesId = (await act.me(ines)).id
  maxId = (await act.me(max)).id
  const leaId = (await act.me(lea)).id
  famille = await hiveRows(ctx).createHive('Famille', inesId, [maxId, leaId])
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const later = () => vi.setSystemTime(Date.now() + 1000)

/** Un projet d'Inès réservé à Famille, commenté par Max puis par Léa, membres. */
const commentedAlbum = async () => {
  const album = await act.publish(ines, 'Album de famille')
  later()
  await hiveRows(ctx).reserve(album.id, famille)
  const fromMax = await act.comment(album.id, max, 'Le mot de Max')
  later()
  const fromLea = await act.comment(album.id, lea, 'Le mot de Léa')
  later()
  return { album, fromMax, fromLea }
}

describe('the comments of a hive-reserved project after a member left', () => {
  it('still shows and counts the comment of a member who left the hive to its members', async () => {
    const { album, fromMax } = await commentedAlbum()

    await hiveRows(ctx).removeMember(famille, maxId)

    for (const cookie of [ines, lea]) {
      const res = await act.send('GET', `/v1/projects/${album.id}/comments`, cookie)
      expect(res.status).toBe(200)
      const ids = CommentPage.parse(await res.json()).items.map((item) => item.id)
      expect(ids).toContain(fromMax.id)
      const project = Project.parse(
        await (await act.send('GET', `/v1/projects/${album.id}`, cookie)).json(),
      )
      expect(project.commentCount).toBe(2)
    }
  })

  it('answers a member who left the hive as for an unknown project when he deletes a comment of another', async () => {
    const { album, fromLea, fromMax } = await commentedAlbum()

    await hiveRows(ctx).removeMember(famille, maxId)

    // Le commentaire de Léa : le même 404 qu'un projet inconnu, jamais un 403 qui dirait qu'il existe.
    const other = await act.send('DELETE', `/v1/projects/${album.id}/comments/${fromLea.id}`, max)
    const unknown = await act.send('DELETE', `/v1/projects/${UNKNOWN}/comments/${fromLea.id}`, max)
    expect(other.status).toBe(404)
    expect(await other.json()).toEqual(await unknown.json())
    // Témoin : le sien s'efface.
    expect(
      (await act.send('DELETE', `/v1/projects/${album.id}/comments/${fromMax.id}`, max)).status,
    ).toBe(204)
  })
})
