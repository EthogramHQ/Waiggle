// Tests d'intégration de R9 : ce qu'un compte suspendu peut encore écrire, en plus de ce que 7c
// permettait (supprimer ses contenus, exporter, régler, bloquer, signaler). Il peut **retirer** sa
// bio, ses outils favoris et sa photo, sans en mettre d'autres (jur-R5) ; passer un projet public en
// privé, jamais l'inverse (J14, décision L6 de Louis, 13/11/2026) ; et choisir un nom ou un pseudo
// tant que ceux qu'il a sont provisoires (mis d'office par la modération). Scénario :
// docs/scenarios/refonte.md, « R9 », « Un compte suspendu » ; relecture de sécurité du plan, P7 : le
// corps est lu une fois avant le validateur, et jugé sur la valeur qui serait écrite.
//
// Trois membres : Karim (suspendu), Léa (une autre membre), Louis (l'administrateur).
import { ErrorResponse, Project } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { avatarForm, jpegImage } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let karim: string // cookies de session
let lea: string
let louis: string
let karimId: string
let potagerId: string

/** Avance la fausse horloge d'une seconde. */
const later = () => vi.setSystemTime(Date.now() + 1000)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  karim = await ctx.verifiedMember({
    name: 'Karim Benali',
    email: 'karim@example.com',
    password: 'karim-long-password',
  })
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'lea-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  karimId = (await act.me(karim)).id
  await act.makeAdmin((await act.me(louis)).id)
  later()
  await act.updateProfile(karim, {
    bio: 'Jardinier du dimanche.',
    favoriteTools: ['Claude', 'Lovable'],
  })
  later()
  potagerId = (await act.publish(karim, 'Potager', { visibility: 'public' })).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Louis suspend Karim pour 7 jours. */
const suspendKarim = async () => {
  later()
  const res = await act.send('POST', '/v1/moderation/decisions', louis, {
    action: 'suspend',
    memberId: karimId,
    duration: '7d',
    ground: 'rules',
    explanation: 'Des messages insultants, plusieurs fois.',
  })
  expect(res.status).toBe(201)
}

/** Une requête avec un corps JSON écrit à la main (une clé deux fois, par exemple). */
const sendRaw = (method: string, path: string, cookie: string, body: string) =>
  ctx.request(path, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body,
  })

/** 403 `suspended`, la réponse de la garde des comptes suspendus. */
const expectSuspended = async (res: Response, what: string) => {
  expect(res.status, what).toBe(403)
  expect(ErrorResponse.parse(await res.json()).error.code, what).toBe('suspended')
}

const projectOf = async (id: string, cookie: string) => {
  const res = await act.send('GET', `/v1/projects/${id}`, cookie)
  expect(res.status).toBe(200)
  return Project.parse(await res.json())
}

describe('a suspended member and her projects', () => {
  it('lets a suspended member send only { visibility: private } on her own project', async () => {
    later()
    const leaProject = await act.publish(lea, 'Jardin partagé')
    await suspendKarim()

    const res = await act.send('PATCH', `/v1/projects/${potagerId}`, karim, {
      visibility: 'private',
    })

    expect(res.status).toBe(200)
    expect((await projectOf(potagerId, karim)).visibility).toBe('private')
    // Le projet d'une autre reste à elle : la même réponse qu'à tout membre (403), rien ne change.
    const other = await act.send('PATCH', `/v1/projects/${leaProject.id}`, karim, {
      visibility: 'private',
    })
    expect(other.status).toBe(403)
    expect((await projectOf(leaProject.id, lea)).visibility).toBe('public')
  })

  it('refuses with 403 suspended visibility public, another field, or both with private', async () => {
    await suspendKarim()

    await expectSuspended(
      await act.send('PATCH', `/v1/projects/${potagerId}`, karim, { visibility: 'public' }),
      'public',
    )
    await expectSuspended(
      await act.send('PATCH', `/v1/projects/${potagerId}`, karim, { title: 'Grand potager' }),
      'title',
    )
    await expectSuspended(
      await act.send('PATCH', `/v1/projects/${potagerId}`, karim, {
        visibility: 'private',
        title: 'Grand potager',
      }),
      'private and title',
    )
    const unchanged = await projectOf(potagerId, karim)
    expect(unchanged.title).toBe('Potager')
    expect(unchanged.visibility).toBe('public')
    // Témoin : « private » seul passe (sans lui, ce test passerait avant R9, où tout est refusé).
    const alone = await act.send('PATCH', `/v1/projects/${potagerId}`, karim, {
      visibility: 'private',
    })
    expect(alone.status).toBe(200)
  })
})

describe('a suspended member and her profile', () => {
  it('lets a suspended member empty her bio and her tools, and refuses any other value', async () => {
    await suspendKarim()

    await expectSuspended(
      await act.send('PATCH', '/v1/me', karim, { bio: 'Une autre bio.' }),
      'bio',
    )
    await expectSuspended(
      await act.send('PATCH', '/v1/me', karim, { favoriteTools: ['Claude'] }),
      'fewer tools',
    )
    await expectSuspended(
      await act.send('PATCH', '/v1/me', karim, { bio: '', name: 'Karim B.' }),
      'empty bio and a name',
    )
    expect((await act.me(karim)).bio).toBe('Jardinier du dimanche.')

    const bio = await act.send('PATCH', '/v1/me', karim, { bio: '' })
    expect(bio.status).toBe(200)
    const tools = await act.send('PATCH', '/v1/me', karim, { favoriteTools: [] })
    expect(tools.status).toBe(200)

    const me = await act.me(karim)
    expect(me.bio).toBe('')
    expect(me.favoriteTools).toEqual([])
    expect(me.name).toBe('Karim Benali')
  })

  it('lets a suspended member delete her avatar, and refuses a new one', async () => {
    later()
    const upload = () =>
      ctx.request('/v1/me/avatar', {
        method: 'POST',
        headers: { cookie: karim },
        body: avatarForm(new Uint8Array([0])),
      })
    const first = await ctx.request('/v1/me/avatar', {
      method: 'POST',
      headers: { cookie: karim },
      body: avatarForm(await jpegImage(600, 600)),
    })
    expect(first.ok).toBe(true)
    await suspendKarim()

    const deleted = await act.send('DELETE', '/v1/me/avatar', karim)

    expect(deleted.status).toBe(204)
    expect((await act.me(karim)).avatarUrl).toBeNull()
    await expectSuspended(await upload(), 'new avatar')
  })

  it('judges a key sent twice on the value that would be written', async () => {
    await suspendKarim()

    // JSON garde la dernière valeur d'une clé répétée : c'est elle qui serait écrite.
    await expectSuspended(
      await sendRaw('PATCH', '/v1/me', karim, '{"bio":"","bio":"Une autre bio."}'),
      'bio, empty then filled',
    )
    await expectSuspended(
      await sendRaw(
        'PATCH',
        `/v1/projects/${potagerId}`,
        karim,
        '{"visibility":"private","visibility":"public"}',
      ),
      'visibility, private then public',
    )
    expect((await act.me(karim)).bio).toBe('Jardinier du dimanche.')
    expect((await projectOf(potagerId, karim)).visibility).toBe('public')

    const bio = await sendRaw('PATCH', '/v1/me', karim, '{"bio":"Une autre bio.","bio":""}')
    expect(bio.status).toBe(200)
    const visibility = await sendRaw(
      'PATCH',
      `/v1/projects/${potagerId}`,
      karim,
      '{"visibility":"public","visibility":"private"}',
    )
    expect(visibility.status).toBe(200)
    expect((await act.me(karim)).bio).toBe('')
    expect((await projectOf(potagerId, karim)).visibility).toBe('private')
  })

  it('lets a suspended member choose a new name or handle only while it is provisional', async () => {
    // Le nom et le pseudo de Karim sont retirés par la modération (Léa les a signalés).
    for (const field of ['name', 'handle'] as const) {
      later()
      const reported = await act.send('POST', '/v1/reports', lea, {
        target: { kind: 'member', id: karimId },
        part: { field },
        reason: 'impersonation',
      })
      expect(reported.status).toBe(201)
      later()
      await act.decide(louis, {
        action: 'remove',
        target: { kind: 'member', id: karimId },
        part: { field },
        ground: 'rules',
        explanation: 'Ce nom imite celui d’un autre membre.',
      })
    }
    await suspendKarim()

    later()
    const chosen = await act.send('PATCH', '/v1/me', karim, {
      name: 'Karim B.',
      handle: 'karim_jardin',
    })
    expect(chosen.status).toBe(200)
    const me = await act.me(karim)
    expect([me.name, me.handle]).toEqual(['Karim B.', 'karim_jardin'])
    expect(me.provisional).toEqual({ name: false, handle: false })

    // Ils ne sont plus provisoires : les changer encore est refusé pendant la suspension.
    later()
    await expectSuspended(await act.send('PATCH', '/v1/me', karim, { name: 'Karim' }), 'name')
    await expectSuspended(
      await act.send('PATCH', '/v1/me', karim, { handle: 'karim_potager' }),
      'handle',
    )
  })
})
