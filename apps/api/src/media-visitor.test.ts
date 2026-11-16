// Tests d'intégration de R12 : les fichiers (/media/visuals/*, /media/avatars/*) ouverts par un
// visiteur sans compte (plan R12, choix 4 ; relecture de sécurité B3 et décision 3). Sans session, un
// fichier ne s'ouvre que s'il est montré par une page publique : une photo d'un projet `web` visible
// d'un visiteur (galerie, couverture verticale, photo d'une mise à jour publiée), l'avatar d'un
// membre à page publique ou de l'auteur d'un projet `web`. Jamais une photo en attente, retirée, ni
// d'une mise à jour retirée, ni une image du coin des testeurs ; tout le reste répond le même 404
// qu'un fichier inconnu. Un fichier ouvert par un visiteur ne va jamais dans un cache partagé, et ne
// reste au navigateur que 60 secondes au plus : l'accès cesse à l'instant où la page ne l'est plus.
//
// Scénario : docs/scenarios/refonte.md, « R12 », « Revenir en arrière » (« ses images ne s'ouvrent
// plus sans compte »). Trois membres : Inès (l'autrice), Max (un autre membre, qui signale), Louis
// (l'administrateur).
import { TesterMedia } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { jpegImage } from './testing/images'
import {
  expectNoSharedCache,
  later,
  unknownFileBeside,
  visitorGestures,
} from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let world: ReturnType<typeof visitorGestures>
let ines: string // cookies de session
let max: string
let louis: string
let inesId: string

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  world = visitorGestures(ctx, act)
  ines = await ctx.verifiedMember({
    name: 'Inès Morel',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Maxence',
    email: 'max@example.com',
    password: 'max-long-password',
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

/** Le fichier est caché au visiteur : le même 404, statut, corps et en-têtes, qu'un fichier inconnu. */
const expectHiddenFromVisitor = async (path: string) => {
  const unknown = await world.asVisitor(unknownFileBeside(path))
  expect(unknown.status).toBe(404)
  expect(await world.asVisitor(path), path).toEqual(unknown)
}

/** Le fichier s'ouvre pour le visiteur, sans cache partagé. */
const expectServedToVisitor = async (path: string) => {
  const answer = await world.asVisitor(path)
  expect(answer.status, path).toBe(200)
  expect(answer.contentType, path).toBe('image/webp')
  expectNoSharedCache(answer.cacheControl, path)
}

/** Une image du coin des testeurs envoyée par l'autrice (la photo d'un appel, en attente). */
const testerImage = async (projectId: string) => {
  later()
  const form = new FormData()
  form.append(
    'file',
    new File([new Uint8Array(await jpegImage(800, 600))], 'image.jpg', { type: 'image/jpeg' }),
  )
  form.append('kind', 'call')
  const res = await ctx.request(`/v1/projects/${projectId}/testers/media`, {
    method: 'POST',
    headers: { cookie: ines },
    body: form,
  })
  expect(res.status, 'tester image').toBe(201)
  const { id } = TesterMedia.parse(await res.json())
  const [row] = await ctx.db
    .select({ key: schema.testerMedia.storageKey })
    .from(schema.testerMedia)
    .where(eq(schema.testerMedia.id, id))
  if (!row) throw new Error(`no tester media ${id}`)
  return `/media/${row.key}`
}

describe('the files of a public project, for a visitor', () => {
  it('serves a visitor the photos of a public project and the avatar of its author, never for a shared cache', async () => {
    const avatar = await world.uploadAvatar(ines)
    later()
    const id = await ctx.webProject(ines)
    const photo = await world.uploadVisual(ines, id)
    const portrait = await world.uploadVisual(ines, id, 'portrait')
    const pending = await world.uploadVisual(ines, id, 'update')
    await world.publishUpdate(ines, id, [pending.id])

    for (const path of [photo.path, portrait.path, pending.path, avatar])
      await expectServedToVisitor(path)
  })

  it('serves a visitor the avatar of a member whose page is public, and stops when she closes it', async () => {
    const avatar = await world.uploadAvatar(ines)
    await expectHiddenFromVisitor(avatar)
    later()
    await ctx.openPublicPage(ines)
    await expectServedToVisitor(avatar)

    later()
    const res = await act.send('PATCH', '/v1/me/public-page', ines, { publicPage: false })
    expect(res.status).toBe(200)
    await expectHiddenFromVisitor(avatar)
  })

  it('serves a visitor no withheld, pending or removed-update photo of a public project, and no tester image', async () => {
    const avatar = await world.uploadAvatar(ines)
    later()
    const id = await ctx.webProject(ines, {
      status: 'testable',
      demoUrl: 'https://meteo.example.org/',
    })
    const removedPhoto = await world.uploadVisual(ines, id)
    const keptPhoto = await world.uploadVisual(ines, id)
    // Une photo envoyée pour une mise à jour, jamais publiée : en attente.
    const waiting = await world.uploadVisual(ines, id, 'update')
    // Une mise à jour publiée avec sa photo, puis retirée entière.
    const updatePhoto = await world.uploadVisual(ines, id, 'update')
    const update = await world.publishUpdate(ines, id, [updatePhoto.id])
    // Le coin des testeurs s'ouvre avec un premier testeur : Max.
    later()
    expect((await act.send('POST', `/v1/projects/${id}/testers`, max)).status).toBe(204)
    const tester = await testerImage(id)
    // Témoin : avant les retraits, les photos publiées et l'avatar s'ouvrent.
    for (const path of [removedPhoto.path, keptPhoto.path, updatePhoto.path, avatar])
      await expectServedToVisitor(path)

    await world.remove(
      max,
      louis,
      { kind: 'project', id },
      { field: 'photo', mediaId: removedPhoto.id },
    )
    await world.remove(max, louis, { kind: 'update', id: update.id })
    await world.remove(max, louis, { kind: 'member', id: inesId }, { field: 'avatar' })

    for (const path of [removedPhoto.path, waiting.path, updatePhoto.path, tester, avatar])
      await expectHiddenFromVisitor(path)
    // L'avatar retiré, à sa nouvelle adresse (/media/withheld/…), ne s'ouvre pas non plus.
    const withheld = (await act.me(ines)).avatarUrl
    if (withheld) await expectHiddenFromVisitor(new URL(withheld).pathname)
    // La photo gardée s'ouvre toujours.
    await expectServedToVisitor(keptPhoto.path)
  })

  it('serves no file of a project that is not public, nor the avatar of a member without a public page or project', async () => {
    const maxAvatar = await world.uploadAvatar(max)
    later()
    const forMembers = await act.publish(ines, 'Pour les membres')
    later()
    const secret = await act.publish(ines, 'Secret', { visibility: 'private' })
    const membersPhoto = await world.uploadVisual(ines, forMembers.id)
    const secretPhoto = await world.uploadVisual(ines, secret.id)

    for (const path of [membersPhoto.path, secretPhoto.path, maxAvatar])
      await expectHiddenFromVisitor(path)
    // Témoin : Max, connecté, ouvre la photo du projet « Membres » comme avant R12, gardée un an.
    const res = await ctx.request(membersPhoto.path, { headers: { cookie: max } })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
  })

  it('stops serving the photos and the author avatar to a visitor at once when the project stops being public', async () => {
    const avatar = await world.uploadAvatar(ines)
    later()
    const id = await ctx.webProject(ines)
    const photo = await world.uploadVisual(ines, id)
    await expectServedToVisitor(photo.path)
    await expectServedToVisitor(avatar)

    later()
    expect(
      (await act.send('PATCH', `/v1/projects/${id}`, ines, { visibility: 'public' })).status,
    ).toBe(200)
    await expectHiddenFromVisitor(photo.path)
    await expectHiddenFromVisitor(avatar)
  })
})
