// Tests d'intégration de la tranche 2 : le profil, la langue et l'avatar.
// Scénarios : docs/scenarios/phase-1.md, tranche 2.
import { appName } from '@ruche/brand'
import { ErrorResponse, Me } from '@ruche/contracts'
import { schema } from '@ruche/db'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './testing/context'
import { avatarForm, photoWithGps, pngImage } from './testing/images'

let ctx: TestContext
let cookie: string

const lea = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }

beforeEach(async () => {
  ctx = await createTestContext()
  cookie = await ctx.verifiedMember(lea)
})

afterEach(async () => {
  await ctx.close()
})

const patchMe = (body: unknown, headers: Record<string, string> = {}) =>
  ctx.request('/v1/me', {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const uploadAvatar = (form: FormData, withCookie = cookie) =>
  ctx.request('/v1/me/avatar', { method: 'POST', headers: { cookie: withCookie }, body: form })

const getMe = async () =>
  Me.parse(await (await ctx.request('/v1/me', { headers: { cookie } })).json())

/** Ouvre une image, connecté : depuis la tranche 3b-1, les avatars sont réservés aux membres. */
const openImage = (url: string) => ctx.request(new URL(url).pathname, { headers: { cookie } })

describe('completing my profile', () => {
  it('saves the name, the bio and the favorite tools', async () => {
    const res = await patchMe({
      name: 'Léa M.',
      bio: 'Je bricole des agents IA le week-end.',
      favoriteTools: ['Claude', 'Cursor'],
    })

    expect(res.status).toBe(200)
    expect(await getMe()).toMatchObject({
      name: 'Léa M.',
      bio: 'Je bricole des agents IA le week-end.',
      favoriteTools: ['Claude', 'Cursor'],
    })
  })

  it('starts with an empty profile', async () => {
    expect(await getMe()).toMatchObject({ bio: '', favoriteTools: [], avatarUrl: null })
  })

  it('refuses a bio that is too long, with a translated message', async () => {
    const res = await patchMe({ bio: 'a'.repeat(281) }, { 'Accept-Language': 'en' })
    const body = ErrorResponse.parse(await res.json())

    expect(res.status).toBe(400)
    expect(body.error).toEqual({ code: 'validation', message: 'Some information is invalid.' })
  })

  it('cannot be used to change the email address or its verification', async () => {
    const res = await patchMe({ email: 'pirate@example.com', emailVerified: false })

    expect(res.status).toBe(400)
    expect(await getMe()).toMatchObject({ email: 'lea@example.com', emailVerified: true })
  })

  it('is only available to a signed-in member', async () => {
    const res = await ctx.request('/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bio: 'Coucou' }),
    })

    expect(res.status).toBe(401)
  })

  it('blocks a 31st change within an hour', async () => {
    for (let i = 0; i < 30; i++) expect((await patchMe({ bio: `Version ${i}` })).status).toBe(200)

    const res = await patchMe({ bio: 'Une de trop' })

    expect(res.status).toBe(429)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
  })

  it('counts even malformed requests in the hourly limit', async () => {
    // Le quota passe avant tout examen de la demande (audit du 25/10/2026, C7).
    for (let i = 0; i < 30; i++) expect((await patchMe({ name: '' })).status).toBe(400)

    // La 31e demande de l'heure, même valide, est refusée.
    expect((await patchMe({ bio: 'Valide' })).status).toBe(429)
  })

  it('refuses invisible characters instead of crashing on them', async () => {
    // Le caractère nul (U+0000) faisait échouer la base de données : erreur 500.
    const nul = await patchMe({ bio: 'x\u0000' })
    // U+202E inverse le sens du texte : « Léa » + U+202E + « nimda » s'afficherait « Léaadmin ».
    const reversed = await patchMe({ name: 'Léa\u202Enimda' })

    expect(nul.status).toBe(400)
    expect(reversed.status).toBe(400)
    expect(await getMe()).toMatchObject({ name: 'Léa', bio: '' })
  })

  it('is never kept in a cache along the way', async () => {
    const res = await ctx.request('/v1/me', { headers: { cookie } })

    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('refuses a change that is not sent as JSON, without crashing', async () => {
    // Bug trouvé en testant l'image de production : ce cas renvoyait une erreur 500.
    const res = await ctx.request('/v1/me', {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'text/plain' },
      body: JSON.stringify({ bio: 'Coucou' }),
    })

    // 415 : « format non pris en charge ».
    expect(res.status).toBe(415)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('unsupported_media_type')
  })

  it('cannot be bypassed through the generic Better Auth route', async () => {
    // Cette route permettrait de mettre une image hébergée n'importe où comme avatar :
    // elle est désactivée, tout passe par nos routes contrôlées.
    const res = await ctx.request('/api/auth/update-user', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ image: 'https://tracker.example/pixel.png' }),
    })

    expect(res.status).toBe(404)
  })

  it('never appears in the data export of another member', async () => {
    await patchMe({ bio: 'Ma bio secrète' })
    const max = await ctx.verifiedMember({
      name: 'Max',
      email: 'max@example.com',
      password: 'another-long-password',
    })

    const res = await ctx.request('/v1/me/export', { headers: { cookie: max } })
    const text = await res.text()

    expect(text).toContain('max@example.com')
    expect(text).not.toContain('lea@example.com')
    expect(text).not.toContain('Ma bio secrète')
  })

  it('is part of my data export', async () => {
    await patchMe({ bio: 'Ma bio', favoriteTools: ['Claude'] })

    const res = await ctx.request('/v1/me/export', { headers: { cookie } })
    const data = (await res.json()) as { user: Me }

    expect(data.user).toMatchObject({ bio: 'Ma bio', favoriteTools: ['Claude'] })
  })
})

describe('choosing my language', () => {
  it('saves the language on the account', async () => {
    await patchMe({ language: 'en' })

    expect((await getMe()).language).toBe('en')
  })

  it('sends my next emails in that language', async () => {
    await patchMe({ language: 'en' })

    // Une tentative d'inscription avec mon adresse déclenche un e-mail d'avertissement.
    await ctx.signUp({ ...lea, password: 'another-password-1' })

    expect(ctx.mailer.sent.at(-1)?.subject).toBe(`Sign-up attempt on ${appName}`)
  })
})

describe('my avatar', () => {
  it('is cleaned: a 512 px WebP square without any metadata', async () => {
    const res = await uploadAvatar(avatarForm(await photoWithGps()))
    const me = Me.parse(await res.json())

    expect(res.status).toBe(200)
    expect(me.avatarUrl).toMatch(/^http:\/\/localhost:3000\/media\/avatars\/[0-9a-f-]+\.webp$/)

    const image = await openImage(me.avatarUrl ?? '')
    const info = await sharp(new Uint8Array(await image.arrayBuffer())).metadata()
    expect(info).toMatchObject({ format: 'webp', width: 512, height: 512 })
    expect(info.exif).toBeUndefined()
  })

  it('is served as an image that the browser may cache for a long time, but no shared cache', async () => {
    const me = Me.parse(await (await uploadAvatar(avatarForm(await photoWithGps()))).json())

    const image = await openImage(me.avatarUrl ?? '')

    expect(image.headers.get('content-type')).toBe('image/webp')
    expect(image.headers.get('x-content-type-options')).toBe('nosniff')
    expect(image.headers.get('cache-control')).toContain('immutable')
    expect(image.headers.get('cache-control')).toContain('private')
  })

  it('is not shown to a visitor without an account, even with its address', async () => {
    const me = Me.parse(await (await uploadAvatar(avatarForm(await photoWithGps()))).json())

    const image = await ctx.request(new URL(me.avatarUrl ?? '').pathname)

    expect(image.status).toBe(404)
  })

  it('replaces the previous one, which is deleted', async () => {
    await uploadAvatar(avatarForm(await photoWithGps()))
    const first = [...ctx.storage.files.keys()]

    await uploadAvatar(avatarForm(await photoWithGps()))

    expect(ctx.storage.files.size).toBe(1)
    expect([...ctx.storage.files.keys()]).not.toEqual(first)
  })

  it('refuses a file that is not an image, even if it claims to be one', async () => {
    const fake = new TextEncoder().encode('<script>alert(1)</script>')

    const res = await uploadAvatar(avatarForm(fake, 'image/png', 'avatar.png'))

    expect(res.status).toBe(415)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('unsupported_media_type')
    expect(ctx.storage.files.size).toBe(0)
  })

  it('refuses a file larger than 5 MB', async () => {
    const huge = new Uint8Array(5 * 1024 * 1024 + 1)

    const res = await uploadAvatar(avatarForm(huge))

    expect(res.status).toBe(413)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('payload_too_large')
  })

  it('is only available to a signed-in member', async () => {
    const res = await uploadAvatar(avatarForm(await photoWithGps()), '')

    expect(res.status).toBe(401)
  })

  it('blocks an 11th upload within an hour', async () => {
    const photo = await photoWithGps()
    for (let i = 0; i < 10; i++) expect((await uploadAvatar(avatarForm(photo))).status).toBe(200)

    expect((await uploadAvatar(avatarForm(photo))).status).toBe(429)
  })

  it('leaves no orphan file when two uploads arrive at the same time', async () => {
    // Une « barrière » : chaque envoi s'arrête juste après l'enregistrement de son fichier, et
    // les deux repartent ensemble. On force ainsi le pire moment pour une collision.
    const put = ctx.storage.put.bind(ctx.storage)
    let arrived = 0
    let release = () => {}
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    ctx.storage.put = async (key, data) => {
      await put(key, data)
      if (++arrived === 2) release()
      await barrier
    }

    const [first, second] = await Promise.all([
      uploadAvatar(avatarForm(await photoWithGps())),
      uploadAvatar(avatarForm(await pngImage())),
    ])

    expect([first.status, second.status]).toEqual([200, 200])
    // Un seul fichier reste : celui de l'avatar actuel.
    expect(ctx.storage.files.size).toBe(1)
    const current = (await getMe()).avatarUrl
    expect(current && ctx.storage.files.has(new URL(current).pathname.replace('/media/', ''))).toBe(
      true,
    )
  })

  it('is deleted together with my account', async () => {
    await uploadAvatar(avatarForm(await photoWithGps()))

    await ctx.request('/api/auth/delete-user', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ password: lea.password }),
    })

    expect(ctx.storage.files.size).toBe(0)
    expect(await ctx.db.select().from(schema.profile)).toHaveLength(0)
    // Les compteurs anti-abus portaient l'identifiant du membre : ils disparaissent aussi.
    expect(await ctx.db.select().from(schema.apiRateLimit)).toHaveLength(0)
  })
})

describe('serving images', () => {
  it('forbids the browser from running anything found in an image', async () => {
    await uploadAvatar(avatarForm(await photoWithGps()))
    const res = await openImage((await getMe()).avatarUrl ?? '')

    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
  })

  it('only serves files that exist, under a strict name', async () => {
    const traversal = await ctx.request('/media/avatars/..%2F..%2Fetc%2Fpasswd', {
      headers: { cookie },
    })
    const unknown = await ctx.request('/media/avatars/00000000-0000-4000-8000-000000000000.webp', {
      headers: { cookie },
    })

    expect(traversal.status).toBe(404)
    expect(unknown.status).toBe(404)
  })
})

describe('requests coming from another website', () => {
  // Attaque « CSRF » : une page piégée pousse le navigateur de Léa, connecté à Ruche, à envoyer
  // une requête à notre API. Le navigateur y joint le cookie de Léa… et l'en-tête Origin, qui
  // trahit la page d'où vient la requête.
  const evil = { origin: 'https://evil.example' }

  it('cannot change my avatar, even with my session cookie', async () => {
    const res = await ctx.request('/v1/me/avatar', {
      method: 'POST',
      headers: { cookie, ...evil },
      body: avatarForm(await photoWithGps()),
    })

    expect(res.status).toBe(403)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('forbidden')
    expect((await getMe()).avatarUrl).toBeNull()
  })

  it('cannot change my profile', async () => {
    const res = await patchMe({ bio: 'Piraté' }, evil)

    expect(res.status).toBe(403)
    expect((await getMe()).bio).toBe('')
  })

  it('refuses the « null » origin of sandboxed pages and local files', async () => {
    const res = await patchMe({ bio: 'Piraté' }, { origin: 'null' })

    expect(res.status).toBe(403)
  })

  it('still accepts the mobile app, which sends no Origin header', async () => {
    // ctx.app.request : sans les en-têtes ajoutés par ctx.request (dont Origin).
    const res = await ctx.app.request('/v1/me', {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ bio: 'Depuis mon téléphone' }),
    })

    expect(res.status).toBe(200)
    expect((await getMe()).bio).toBe('Depuis mon téléphone')
  })
})
