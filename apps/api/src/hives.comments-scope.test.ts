// Les commentaires écrits dans une ruche restent dans la ruche (R10, relecture de sécurité,
// décision du 15/11/2026). Un commentaire, ou une réponse, écrit pendant que le projet est réservé
// à une ruche n'est lu, et compté, que par son auteur, l'auteur du projet et les membres actuels de
// cette ruche : même si l'auteur du projet l'ouvre ensuite à « Membres de Waiggle » ou à une autre
// ruche, même si la ruche est supprimée, même si un membre la quitte (il ne lit plus que les
// siens). Ce qui a été écrit pendant que le projet était public reste lisible par tous.
import { CommentPage, NotificationPage, Project } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRows } from './testing/hive-rows'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session : Inès, autrice du projet, anime Famille et Amis
let max: string // membre de Famille
let lea: string // membre de Famille
let nora: string // membre de Waiggle, d'aucune ruche
let odile: string // membre d'Amis seulement
let inesId: string
let maxId: string
let famille: string
let amis: string

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-15T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  const member = (name: string) =>
    ctx.verifiedMember({
      name,
      email: `${name.toLowerCase()}@example.com`,
      password: `${name.toLowerCase()}-long-password`,
    })
  ines = await member('Ines')
  max = await member('Max')
  lea = await member('Lea')
  nora = await member('Nora')
  odile = await member('Odile')
  inesId = (await act.me(ines)).id
  maxId = (await act.me(max)).id
  const leaId = (await act.me(lea)).id
  const odileId = (await act.me(odile)).id
  famille = await hiveRows(ctx).createHive('Famille', inesId, [maxId, leaId])
  amis = await hiveRows(ctx).createHive('Amis', inesId, [odileId])
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const later = () => vi.setSystemTime(Date.now() + 1000)

/** Les commentaires d'un projet tels que ce membre les lit : identifiants, et la réponse brute. */
const commentsOf = async (projectId: string, cookie: string) => {
  const res = await act.send('GET', `/v1/projects/${projectId}/comments`, cookie)
  expect(res.status).toBe(200)
  const raw = await res.text()
  const page = CommentPage.parse(JSON.parse(raw))
  const ids = page.items.flatMap((item) => [item.id, ...item.replies.map((reply) => reply.id)])
  return { ids, raw }
}

/** Le nombre de commentaires que ce membre lit sur la page du projet. */
const countFor = async (projectId: string, cookie: string) =>
  Project.parse(await (await act.send('GET', `/v1/projects/${projectId}`, cookie)).json())
    .commentCount

/** L'autrice change la visibilité par la route, comme l'appli. */
const widen = async (projectId: string, body: object) => {
  const res = await act.send('PATCH', `/v1/projects/${projectId}`, ines, body)
  expect(res.status).toBe(200)
}

/** Un projet d'Inès réservé à Famille, commenté par Max et Léa, membres. */
const albumInFamille = async () => {
  const album = await act.publish(ines, 'Album de famille')
  later()
  await hiveRows(ctx).reserve(album.id, famille)
  const fromMax = await act.comment(album.id, max, 'Le mot de Max')
  later()
  const fromLea = await act.comment(album.id, lea, 'Le mot de Léa')
  later()
  return { album, fromMax, fromLea }
}

describe('the comments written in a hive', () => {
  it('keeps the comments of hive members hidden from other members after the project leaves the hive', async () => {
    const { album, fromMax, fromLea } = await albumInFamille()

    // Ouvert à « Membres de Waiggle » : Nora voit le projet, pas ce que Famille y a écrit.
    await widen(album.id, { visibility: 'public' })
    const seenByNora = await commentsOf(album.id, nora)
    expect(seenByNora.ids).not.toContain(fromMax.id)
    expect(seenByNora.ids).not.toContain(fromLea.id)
    expect(seenByNora.raw).not.toContain('Le mot de Max')
    expect(seenByNora.raw).not.toContain('"name":"Max"')

    // Passé à une autre ruche : Odile, membre d'Amis, ne les lit pas non plus.
    later()
    await widen(album.id, { visibility: 'hive', hiveId: amis })
    const seenByOdile = await commentsOf(album.id, odile)
    expect(seenByOdile.ids).not.toContain(fromMax.id)
    expect(seenByOdile.raw).not.toContain('Le mot de Léa')
  })

  it('keeps them hidden after the hive is deleted and the project made public', async () => {
    const { album, fromMax, fromLea } = await albumInFamille()

    // La ruche supprimée rend le projet privé ; Inès le rouvre ensuite à tous.
    expect((await act.send('DELETE', `/v1/hives/${famille}`, ines)).status).toBe(204)
    later()
    await widen(album.id, { visibility: 'public' })

    for (const cookie of [nora, lea]) {
      const { ids, raw } = await commentsOf(album.id, cookie)
      expect(ids).not.toContain(fromMax.id)
      expect(raw).not.toContain('Le mot de Max')
    }
    // Léa lit encore le sien, Max le sien, et l'autrice du projet, qui le voit encore, les deux.
    expect((await commentsOf(album.id, lea)).ids).toEqual([fromLea.id])
    expect((await commentsOf(album.id, max)).ids).toEqual([fromMax.id])
    expect((await commentsOf(album.id, ines)).ids).toEqual([fromLea.id, fromMax.id])
  })

  it('still shows them to the members of the hive and to the project author', async () => {
    const { album, fromMax, fromLea } = await albumInFamille()

    await widen(album.id, { visibility: 'public' })
    // Une membre de Famille les lit tous les deux.
    expect((await commentsOf(album.id, lea)).ids).toEqual([fromLea.id, fromMax.id])
    // L'autrice du projet aussi, même une fois partie de la ruche.
    await hiveRows(ctx).removeMember(famille, inesId)
    expect((await commentsOf(album.id, ines)).ids).toEqual([fromLea.id, fromMax.id])
    expect(await countFor(album.id, ines)).toBe(2)
  })

  it('does not count them for other members', async () => {
    const { album } = await albumInFamille()

    await widen(album.id, { visibility: 'public' })
    later()
    await act.comment(album.id, nora, 'Le mot de Nora')

    // Nora ne compte que le commentaire écrit en public ; Léa, membre de Famille, les trois.
    expect(await countFor(album.id, nora)).toBe(1)
    expect(await countFor(album.id, lea)).toBe(3)
    expect(await countFor(album.id, ines)).toBe(3)
  })

  it('hides them from a member who left the hive, except their own', async () => {
    const { album, fromMax, fromLea } = await albumInFamille()

    await widen(album.id, { visibility: 'public' })
    await hiveRows(ctx).removeMember(famille, maxId)

    const seenByMax = await commentsOf(album.id, max)
    expect(seenByMax.ids).toEqual([fromMax.id])
    expect(seenByMax.raw).not.toContain('Le mot de Léa')
    expect(await countFor(album.id, max)).toBe(1)
    // Léa, restée, lit encore le commentaire de Max (décision « les commentaires d'un ancien
    // membre restent lisibles par ses membres »).
    expect((await commentsOf(album.id, lea)).ids).toEqual([fromLea.id, fromMax.id])
  })

  it('leaves comments written while the project was public visible to everyone', async () => {
    const album = await act.publish(ines, 'Album de famille')
    later()
    const before = await act.comment(album.id, max, 'Écrit en public')
    later()
    await hiveRows(ctx).reserve(album.id, famille)
    const inHive = await act.comment(album.id, lea, 'Écrit dans Famille')
    later()
    await widen(album.id, { visibility: 'public' })
    later()
    const after = await act.comment(album.id, lea, 'Écrit en public, encore')

    const { ids } = await commentsOf(album.id, nora)
    expect(ids).toEqual([after.id, before.id])
    expect(ids).not.toContain(inHive.id)
    expect(await countFor(album.id, nora)).toBe(2)
  })

  it('keeps a reply to a hive comment in the hive, even written once the project is public', async () => {
    const { album, fromMax } = await albumInFamille()

    await widen(album.id, { visibility: 'public' })
    later()
    const reply = await act.comment(album.id, lea, 'Réponse de Léa', fromMax.id)

    // Nora ne lit ni la racine ni la réponse : le fil reste celui de Famille.
    const seenByNora = await commentsOf(album.id, nora)
    expect(seenByNora.ids).not.toContain(reply.id)
    expect(seenByNora.raw).not.toContain('Réponse de Léa')
    expect(await countFor(album.id, nora)).toBe(0)
    // Max, membre, la lit sous son commentaire.
    expect((await commentsOf(album.id, max)).ids).toContain(reply.id)
  })

  it('does not notify a member outside the hive of a reply written in the hive', async () => {
    // Nora commente en public ; le projet passe dans Famille, Max lui répond, puis il est rouvert.
    const album = await act.publish(ines, 'Album de famille')
    later()
    const root = await act.comment(album.id, nora, 'Le mot de Nora')
    later()
    await hiveRows(ctx).reserve(album.id, famille)
    const reply = await act.comment(album.id, max, 'Réponse dans Famille', root.id)
    later()
    await widen(album.id, { visibility: 'public' })

    // Ni dans son Activité (la source des e-mails et du récap), ni sous son commentaire.
    const res = await act.send('GET', '/v1/notifications', nora)
    expect(res.status).toBe(200)
    const raw = await res.text()
    const page = NotificationPage.parse(JSON.parse(raw))
    expect(raw).not.toContain(reply.id)
    expect(page.items.filter((item) => item.kind === 'comment')).toEqual([])
    expect((await commentsOf(album.id, nora)).ids).toEqual([root.id])
    // Témoin : Inès, autrice du projet, est prévenue des deux commentaires.
    const forInes = await (await act.send('GET', '/v1/notifications', ines)).text()
    expect(forInes).toContain(reply.id)
  })
})
