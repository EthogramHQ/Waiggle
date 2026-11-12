// Tests d'intégration de la désinscription depuis un e-mail, sans connexion. Tranche 6c (scénario :
// docs/scenarios/phase-1.md, « Se désinscrire »), puis R8 (docs/scenarios/refonte.md, « Les e-mails
// tout de suite » ; relecture du plan, sec-A3, jur-2a et jur-2b ; décision de Louis du 12/11/2026).
//
// POST /v1/email/unsubscribe?token=…[&scope=all][&choice=digest|never] agit selon la sorte du jeton
// signé :
// - `recap` coupe le récap de la semaine ;
// - `instant` (R8, l'e-mail « tout de suite ») passe chaque type réglé sur « Tout de suite » au
//   choix donné : `digest` (« Dans le récap ») ou `never` ; sans `choice`, `digest` (le « Se
//   désabonner » d'une messagerie ne lit pas de page) ;
// - `mentions` (l'ancien e-mail de 6c, dont les liens restent valables) passe « Réponses et
//   mentions » de « Tout de suite » à « Dans le récap », et seulement de là ;
// - `scope=all`, quelle que soit la sorte : le récap coupé, et les types « Tout de suite » au choix
//   donné.
// Un lien ne rallume jamais rien : `choice=now` est refusé, un type sur « Jamais » y reste.
//
// Deux chemins mènent au POST :
// - le bouton « Confirmer » de la page de désinscription de l'appli (jamais l'ouverture de la
//   page : un antivirus qui ouvre les liens ne désinscrit personne) ;
// - le bouton « Se désabonner » de la messagerie (en-tête List-Unsubscribe, RFC 8058), qui envoie
//   un POST avec le corps « List-Unsubscribe=One-Click », sans cookie et sans en-tête Origin, ou
//   avec celui du webmail.
// La route n'utilise jamais la session et ne lit jamais le corps (relecture de sécurité S-A3).
// Un lien invalide reçoit toujours la même réponse, 400 unsubscribe_invalid : elle ne dit pas si
// le compte existe.

import { ErrorResponse, type UnsubscribeKind } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { resources } from '@ruche/i18n'
import { eq, like } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUnsubscribeToken } from './email/unsubscribe-token'
import { activity } from './testing/activity'
import {
  createTestContext,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let malik: string
let inesId: string
let malikId: string

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const START = new Date('2026-06-15T08:00:00.000Z')
const IP = '203.0.113.7' // l'adresse que createTestContext donne à chaque requête

const inesAccount = {
  name: 'Inès Morel',
  email: 'ines@example.com',
  password: 'ines-long-password',
}

/** Les réglages d'un membre qui n'a jamais rien changé. */
const DEFAULTS = {
  weeklyRecap: true,
  reactions: 'digest',
  comments: 'digest',
  replies: 'digest',
  follows: 'digest',
  updates: 'digest',
  testers: 'digest',
} as const

/**
 * Les réglages d'Inès au départ : deux types sur « Tout de suite », le coin des testeurs sur
 * « Jamais » (aucun lien ne doit le remonter), le reste par défaut.
 */
const INES = { ...DEFAULTS, comments: 'now', replies: 'now', testers: 'never' } as const
/** Ceux de Malik : « Réponses et mentions » sur « Tout de suite ». */
const MALIK = { ...DEFAULTS, replies: 'now' } as const

/** Pose les réglages voulus, un PATCH par réglage (le contrat n'en prend qu'un à la fois). */
const setAll = async (cookie: string, wanted: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(wanted)) {
    await act.setPreferences(cookie, { [key]: value })
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  ines = await ctx.verifiedMember(inesAccount)
  malik = await ctx.verifiedMember({
    name: 'Malik',
    email: 'malik@example.com',
    password: 'malik-long-password',
  })
  inesId = (await act.me(ines)).id
  malikId = (await act.me(malik)).id
  // Des types sur « Tout de suite » chez Inès et chez Malik : on voit ce que change chaque lien.
  await setAll(ines, { comments: 'now', replies: 'now', testers: 'never' })
  await setAll(malik, { replies: 'now' })
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const later = (ms: number) => vi.setSystemTime(Date.now() + ms)

const tokenOf = (userId: string, kind: UnsubscribeKind) =>
  createUnsubscribeToken(TEST_AUTH_SECRET, userId, kind)

const pathFor = (params: Record<string, string>) =>
  `/v1/email/unsubscribe?${new URLSearchParams(params)}`

/**
 * Le POST du bouton « Confirmer » de l'appli : sans cookie (la page s'ouvre sans connexion), sans
 * corps, depuis l'appli web (ctx.request ajoute son Origin).
 */
const unsubscribe = (params: Record<string, string>, init: RequestInit = {}) =>
  ctx.request(pathFor(params), { method: 'POST', ...init })

const expectInvalid = async (res: Response) => {
  expect(res.status).toBe(400)
  const body = ErrorResponse.parse(await res.json())
  expect(body.error.code).toBe('unsubscribe_invalid')
  return body
}

describe('unsubscribing from a link', () => {
  it('turns off the weekly recap only, with a recap link', async () => {
    const res = await unsubscribe({ token: tokenOf(inesId, 'recap') })

    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(await act.preferences(ines)).toEqual({ ...INES, weeklyRecap: false })
  })

  it('moves every « now » type to the recap with an instant link and no choice', async () => {
    const res = await unsubscribe({ token: tokenOf(inesId, 'instant') })

    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    // Les deux types « Tout de suite » passent « Dans le récap » ; le récap reste, « Jamais » reste.
    expect(await act.preferences(ines)).toEqual({
      ...INES,
      comments: 'digest',
      replies: 'digest',
    })
  })

  it('moves every « now » type to the choice of the page with an instant link', async () => {
    expect((await unsubscribe({ token: tokenOf(inesId, 'instant'), choice: 'never' })).status).toBe(
      204,
    )
    expect(await act.preferences(ines)).toEqual({ ...INES, comments: 'never', replies: 'never' })

    await setAll(ines, { comments: 'now', replies: 'now' })
    expect(
      (await unsubscribe({ token: tokenOf(inesId, 'instant'), choice: 'digest' })).status,
    ).toBe(204)
    expect(await act.preferences(ines)).toEqual({ ...INES, comments: 'digest', replies: 'digest' })
  })

  it('never raises a "never" type on an instant unsubscribe', async () => {
    // Le coin des testeurs est sur « Jamais » ; les réactions sont « Dans le récap ».
    for (const choice of [undefined, 'digest', 'never'] as const) {
      await setAll(ines, { comments: 'now', replies: 'now' })
      const params: Record<string, string> = { token: tokenOf(inesId, 'instant') }
      if (choice) params.choice = choice

      expect((await unsubscribe(params)).status).toBe(204)

      const after = await act.preferences(ines)
      expect(after.testers, String(choice)).toBe('never')
      // « Jamais » choisi ne descend que les types « Tout de suite » : les autres ne bougent pas.
      expect(after.reactions, String(choice)).toBe('digest')
      expect(after.updates, String(choice)).toBe('digest')
    }
  })

  it('refuses choice=now and changes nothing', async () => {
    await setAll(ines, { comments: 'digest' })

    for (const params of [
      { token: tokenOf(inesId, 'instant'), choice: 'now' },
      { token: tokenOf(inesId, 'instant'), choice: 'now', scope: 'all' },
      { token: tokenOf(inesId, 'mentions'), choice: 'now' },
      { token: tokenOf(inesId, 'recap'), choice: 'now' },
      { token: tokenOf(inesId, 'instant'), choice: 'soon' },
      { token: tokenOf(inesId, 'instant'), choice: '' },
    ]) {
      await expectInvalid(await unsubscribe(params))
    }

    expect(await act.preferences(ines)).toEqual({ ...INES, comments: 'digest' })
  })

  it('moves replies from now to digest only, with an old mentions link', async () => {
    const res = await unsubscribe({ token: tokenOf(inesId, 'mentions') })

    expect(res.status).toBe(204)
    // Les commentaires restent « Tout de suite » : l'ancien lien ne visait que les réponses.
    expect(await act.preferences(ines)).toEqual({ ...INES, replies: 'digest' })
  })

  it('an old mentions link leaves replies at never', async () => {
    await setAll(ines, { replies: 'never' })

    expect((await unsubscribe({ token: tokenOf(inesId, 'mentions') })).status).toBe(204)
    expect(await act.preferences(ines)).toEqual({ ...INES, replies: 'never' })

    // « Dans le récap » reste aussi « Dans le récap ».
    await setAll(ines, { replies: 'digest' })
    expect((await unsubscribe({ token: tokenOf(inesId, 'mentions') })).status).toBe(204)
    expect(await act.preferences(ines)).toEqual({ ...INES, replies: 'digest' })
  })

  it('turns the recap off and the « now » types to the given choice with scope=all, whatever the kind of the link', async () => {
    for (const kind of ['recap', 'mentions', 'instant'] as const) {
      await setAll(ines, { weeklyRecap: true, comments: 'now', replies: 'now' })

      const res = await unsubscribe({ token: tokenOf(inesId, kind), scope: 'all' })

      expect(res.status, kind).toBe(204)
      expect(await act.preferences(ines), kind).toEqual({
        ...INES,
        weeklyRecap: false,
        comments: 'digest',
        replies: 'digest',
      })
    }

    // Avec « Jamais » choisi sur la page d'un lien « tout de suite ».
    await setAll(ines, { weeklyRecap: true, comments: 'now', replies: 'now' })
    const res = await unsubscribe({
      token: tokenOf(inesId, 'instant'),
      scope: 'all',
      choice: 'never',
    })
    expect(res.status).toBe(204)
    expect(await act.preferences(ines)).toEqual({
      ...INES,
      weeklyRecap: false,
      comments: 'never',
      replies: 'never',
    })
  })

  it('never turns anything back on: the member does it in her settings', async () => {
    await unsubscribe({ token: tokenOf(inesId, 'recap'), scope: 'all' })
    await setAll(ines, { comments: 'now' })

    // Le même lien du récap, ouvert de nouveau : le récap reste coupé, les commentaires restent
    // « Tout de suite », les réponses « Dans le récap ».
    expect((await unsubscribe({ token: tokenOf(inesId, 'recap') })).status).toBe(204)
    expect(await act.preferences(ines)).toEqual({
      ...INES,
      weeklyRecap: false,
      comments: 'now',
      replies: 'digest',
    })

    // Un lien « tout de suite » sur des types déjà « Jamais » : ils y restent.
    await setAll(ines, { comments: 'never' })
    expect((await unsubscribe({ token: tokenOf(inesId, 'instant') })).status).toBe(204)
    expect(await act.preferences(ines)).toEqual({
      ...INES,
      weeklyRecap: false,
      comments: 'never',
      replies: 'digest',
    })
  })

  it('creates the settings of a member who never changed them, and changes only what the link names', async () => {
    const zoe = await ctx.verifiedMember({
      name: 'Zoé',
      email: 'zoe@example.com',
      password: 'zoe-long-password',
    })
    const zoeId = (await act.me(zoe)).id

    // Rien sur « Tout de suite » chez Zoé : le lien « tout de suite » ne change rien.
    expect((await unsubscribe({ token: tokenOf(zoeId, 'instant'), choice: 'never' })).status).toBe(
      204,
    )
    expect(await act.preferences(zoe)).toEqual(DEFAULTS)

    expect((await unsubscribe({ token: tokenOf(zoeId, 'recap') })).status).toBe(204)
    expect(await act.preferences(zoe)).toEqual({ ...DEFAULTS, weeklyRecap: false })
  })

  it('acts on the member of the link only, never on the member signed in', async () => {
    // Un cookie de Malik joint à la requête (son navigateur) : seul le lien compte.
    const res = await unsubscribe(
      { token: tokenOf(inesId, 'instant'), scope: 'all' },
      { headers: { cookie: malik } },
    )

    expect(res.status).toBe(204)
    expect(await act.preferences(ines)).toEqual({
      ...INES,
      weeklyRecap: false,
      comments: 'digest',
      replies: 'digest',
    })
    expect(await act.preferences(malik)).toEqual(MALIK)
  })
})

describe('the one-click unsubscribe of a mail app (RFC 8058)', () => {
  // L'appel d'une messagerie : ni cookie ni Origin (un serveur, pas un navigateur). app.request
  // directement, car ctx.request ajouterait l'Origin de l'appli.
  const fromMailServer = (token: string, init: RequestInit) =>
    ctx.app.request(pathFor({ token }), {
      method: 'POST',
      ...init,
      headers: { 'x-real-ip': '198.51.100.20', ...(init.headers as Record<string, string>) },
    })

  it('accepts the form « List-Unsubscribe=One-Click », without cookie or Origin', async () => {
    const res = await fromMailServer(tokenOf(inesId, 'recap'), {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    })

    expect(res.status).toBe(204)
    expect(await act.preferences(ines)).toEqual({ ...INES, weeklyRecap: false })
  })

  it('one-click POST of an instant link moves now types to digest', async () => {
    const res = await fromMailServer(tokenOf(inesId, 'instant'), {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    })

    expect(res.status).toBe(204)
    expect(await act.preferences(ines)).toEqual({ ...INES, comments: 'digest', replies: 'digest' })
  })

  it('accepts the same form in multipart, as the RFC prefers', async () => {
    const form = new FormData()
    form.set('List-Unsubscribe', 'One-Click')

    const res = await fromMailServer(tokenOf(inesId, 'mentions'), { body: form })

    expect(res.status).toBe(204)
    expect(await act.preferences(ines)).toEqual({ ...INES, replies: 'digest' })
  })

  it('never reads the body: an empty, JSON or unexpected one changes nothing to the answer', async () => {
    for (const init of [
      {},
      { headers: { 'content-type': 'application/json' }, body: '{"scope":"none"}' },
      // Un « choice » glissé dans le corps n'est jamais lu : seul celui de l'adresse compte.
      { headers: { 'content-type': 'application/json' }, body: '{"choice":"now"}' },
      {
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click&choice=never',
      },
      { headers: { 'content-type': 'text/plain' }, body: 'anything' },
    ]) {
      await setAll(ines, { weeklyRecap: true, comments: 'now' })

      const recap = await fromMailServer(tokenOf(inesId, 'recap'), init)
      const instant = await fromMailServer(tokenOf(inesId, 'instant'), init)

      expect(recap.status).toBe(204)
      expect(instant.status).toBe(204)
      const after = await act.preferences(ines)
      expect(after.weeklyRecap).toBe(false)
      expect(after.comments).toBe('digest')
    }
  })

  it('accepts the POST of a webmail from its own site: the link alone gives the right', async () => {
    const res = await ctx.request(pathFor({ token: tokenOf(inesId, 'instant') }), {
      method: 'POST',
      headers: {
        origin: 'https://mail.example',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'List-Unsubscribe=One-Click',
    })

    expect(res.status).toBe(204)
    expect((await act.preferences(ines)).comments).toBe('digest')
  })

  it('changes nothing when the link is only opened (GET), and sends to the page of the app', async () => {
    for (const kind of ['recap', 'instant'] as const) {
      const token = tokenOf(inesId, kind)

      const res = await ctx.app.request(pathFor({ token }), { method: 'GET' })

      expect(res.status).toBe(303)
      const location = new URL(res.headers.get('location') ?? '')
      expect(location.origin + location.pathname).toBe(`${TEST_APP_URL}/unsubscribe`)
      expect(location.searchParams.get('token')).toBe(token)
    }
    expect(await act.preferences(ines)).toEqual(INES)
  })
})

describe('an invalid link', () => {
  it('gives the same 400 to a changed, foreign or malformed link, and changes nothing', async () => {
    const token = tokenOf(inesId, 'recap')
    const [version, id, , signature] = token.split('.')
    const malikB64 = Buffer.from(malikId, 'utf8').toString('base64url')
    const flipped = `${signature?.[0] === 'A' ? 'B' : 'A'}${signature?.slice(1)}`
    const padded = `${Buffer.from(inesId, 'utf8').toString('base64')}=`
    const bodies = new Set<string>()

    for (const params of [
      // La signature d'Inès sur l'identifiant de Malik : un membre ne peut pas désinscrire un autre.
      { token: `${version}.${malikB64}.recap.${signature}` },
      { token: `${version}.${id}.mentions.${signature}` },
      // La signature d'un lien du récap sur la sorte `instant` : une sorte ne s'invente pas.
      { token: `${version}.${id}.instant.${signature}` },
      { token: `${version}.${id}.recap.${flipped}` },
      { token: createUnsubscribeToken('another-secret-that-is-long-enough', inesId, 'recap') },
      { token: createUnsubscribeToken('another-secret-that-is-long-enough', inesId, 'instant') },
      { token: `${version}.${id}.weekly.${signature}` },
      { token: `${version}.${id}.recap.${signature?.slice(0, 1)}` },
      { token: `${version}.${id}.recap.${signature}A` },
      { token: `${version}.${padded}.recap.${signature}` },
      { token: '' },
      { token: `${token}${token}` },
      { token, scope: 'everything' },
      { token: tokenOf(inesId, 'instant'), choice: 'now' },
      {},
    ]) {
      const body = await expectInvalid(await unsubscribe(params))
      bodies.add(JSON.stringify(body))
    }
    // Le jeton répété deux fois dans l'adresse.
    const twice = await ctx.request(`${pathFor({ token })}&token=${token}`, { method: 'POST' })
    bodies.add(JSON.stringify(await expectInvalid(twice)))

    expect(bodies.size).toBe(1)
    expect(await act.preferences(ines)).toEqual(INES)
    expect(await act.preferences(malik)).toEqual(MALIK)
  })

  it('gives the same 400 to the link of a deleted account, without creating anything', async () => {
    const zoe = await ctx.verifiedMember({
      name: 'Zoé',
      email: 'zoe@example.com',
      password: 'zoe-long-password',
    })
    const zoeId = (await act.me(zoe)).id
    await act.deleteAccount(zoe, 'zoe-long-password')
    const unknown = await unsubscribe({ token: tokenOf('a-member-that-never-existed', 'recap') })
    const unknownBody = await expectInvalid(unknown)

    const deleted = await expectInvalid(await unsubscribe({ token: tokenOf(zoeId, 'recap') }))
    const deletedInstant = await expectInvalid(
      await unsubscribe({ token: tokenOf(zoeId, 'instant') }),
    )

    expect(deleted).toEqual(unknownBody)
    expect(deletedInstant).toEqual(unknownBody)
    expect(await ctx.db.select().from(schema.user).where(eq(schema.user.id, zoeId))).toHaveLength(0)
    expect(
      await ctx.db
        .select()
        .from(schema.emailPreference)
        .where(eq(schema.emailPreference.userId, zoeId)),
    ).toHaveLength(0)
  })

  it('says it in the language of the visitor', async () => {
    const res = await unsubscribe(
      { token: 'not-a-token' },
      { headers: { 'accept-language': 'en' } },
    )

    const body = await expectInvalid(res)
    expect(body.error.message).toBe(resources.en.translation.errors.unsubscribeInvalid)
    const french = await expectInvalid(await unsubscribe({ token: 'not-a-token' }))
    expect(french.error.message).toBe(resources.fr.translation.errors.unsubscribeInvalid)
  })

  it('never writes the link in the logs', async () => {
    const logs = (['log', 'info', 'warn', 'error'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    const token = tokenOf(inesId, 'instant')

    await unsubscribe({ token })
    await unsubscribe({ token: `${token}x` })

    const written = JSON.stringify(logs.map((spy) => spy.mock.calls))
    expect(written).not.toContain(token.split('.')[3])
  })
})

describe('the limits', () => {
  /** Range un compteur comme s'il avait déjà servi `count` fois dans la fenêtre en cours. */
  const alreadyUsed = (key: string, count: number) =>
    ctx.db.insert(schema.apiRateLimit).values({ key, count, windowStart: Date.now() })

  it('answers 300 links an hour per IP address, counting invalid ones, then asks to wait', async () => {
    await alreadyUsed(`unsubscribe-ip:${IP}`, 298)
    // La 299e, invalide, compte aussi (le compteur passe avant l'examen du lien) ; la 300e passe.
    await expectInvalid(await unsubscribe({ token: 'not-a-token' }))
    expect((await unsubscribe({ token: tokenOf(malikId, 'recap') })).status).toBe(204)

    const blocked = await unsubscribe({ token: tokenOf(inesId, 'recap') })
    expect(blocked.status).toBe(429)
    expect(ErrorResponse.parse(await blocked.json()).error.code).toBe('rate_limited')
    expect((await act.preferences(ines)).weeklyRecap).toBe(true)

    // Une autre adresse passe ; une heure plus tard, celle-ci aussi.
    const elsewhere = await unsubscribe(
      { token: tokenOf(inesId, 'recap') },
      { headers: { 'x-real-ip': '198.51.100.99' } },
    )
    expect(elsewhere.status).toBe(204)
    later(HOUR)
    expect((await unsubscribe({ token: tokenOf(inesId, 'instant') })).status).toBe(204)
  })

  // Audit de sécurité du 7/11/2026, N3 : tout un réseau IPv6 « /64 » compte comme une seule
  // adresse, sinon changer d'adresse dans son réseau suffisait à ne jamais rencontrer le quota.
  it('counts every address of one IPv6 /64 network as the same address', async () => {
    const network = (n: number) => ({ headers: { 'x-real-ip': `2001:db8:1:2::${n}` } })
    await expectInvalid(await unsubscribe({ token: 'not-a-token' }, network(1)))
    // Le compteur de ce réseau, comme s'il avait déjà servi 299 fois en tout.
    await ctx.db
      .update(schema.apiRateLimit)
      .set({ count: 299 })
      .where(like(schema.apiRateLimit.key, 'unsubscribe-ip:%'))
    expect((await unsubscribe({ token: tokenOf(malikId, 'recap') }, network(2))).status).toBe(204)

    const blocked = await unsubscribe({ token: tokenOf(inesId, 'recap') }, network(3))

    expect(blocked.status).toBe(429)
    expect((await act.preferences(ines)).weeklyRecap).toBe(true)
  })

  it('answers 10 valid links an hour per member, whatever the address and the kind', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await unsubscribe(
        { token: tokenOf(inesId, i % 2 === 0 ? 'recap' : 'instant') },
        { headers: { 'x-real-ip': `198.51.100.${i + 1}` } },
      )
      expect(res.status).toBe(204)
    }

    const blocked = await unsubscribe(
      { token: tokenOf(inesId, 'instant') },
      { headers: { 'x-real-ip': '198.51.100.50' } },
    )
    expect(blocked.status).toBe(429)
    // Le compteur est celui d'Inès : le lien de Malik passe.
    expect((await unsubscribe({ token: tokenOf(malikId, 'recap') })).status).toBe(204)
  })
})

// Décision de Louis (restauration, option a) : chaque refus laisse une ligne de journal, pour
// pouvoir le réappliquer après la restauration d'une sauvegarde (docs/ops/serveur.md). Ni adresse,
// ni nom, ni jeton. R8 (relecture du plan, jur-2b) : une ligne par baisse de choix,
// « Unsubscribe <identifiant> <type|instant> <digest|never> » ; le récap coupé garde
// « Unsubscribe <identifiant> recap ».
describe('the trace of an unsubscribe, for a restored backup', () => {
  /** Ce que l'API écrit dans ses journaux pendant `action`, ligne par ligne. */
  const logsDuring = async (action: () => unknown) => {
    const logs = (['log', 'info', 'warn', 'error'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    await action()
    return logs.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' ')))
  }

  const unsubscribeLines = (lines: string[]) =>
    lines.filter((line) => line.startsWith('Unsubscribe '))

  it('writes one line with the member and what was lowered, and nothing else about them', async () => {
    const lines = await logsDuring(async () => {
      await unsubscribe({ token: tokenOf(inesId, 'recap') })
      await unsubscribe({ token: tokenOf(inesId, 'instant') })
      await unsubscribe({ token: tokenOf(malikId, 'instant'), choice: 'never' })
    })

    expect(unsubscribeLines(lines)).toEqual([
      `Unsubscribe ${inesId} recap`,
      `Unsubscribe ${inesId} instant digest`,
      `Unsubscribe ${malikId} instant never`,
    ])
    const written = lines.join('\n')
    for (const secret of ['ines@example.com', 'malik@example.com', 'Inès', 'Malik']) {
      expect(written).not.toContain(secret)
    }
    // La procédure de restauration ne garde que les lignes dont l'identifiant est fait de lettres
    // et de chiffres (grep de docs/ops/serveur.md) : si les identifiants changeaient de forme,
    // elle laisserait passer des refus sans le dire.
    expect(`${inesId} ${malikId}`).toMatch(/^[A-Za-z0-9]+ [A-Za-z0-9]+$/)
  })

  it('writes a line the restore can read for an old mentions link and for scope=all', async () => {
    // Chaque ligne dit ce qui a baissé, sous une forme que la procédure de restauration relit.
    const restorable = new RegExp(
      `^Unsubscribe ${inesId} (recap|all|mentions|instant (digest|never)|(reactions|comments|replies|follows|updates|testers) (digest|never))$`,
    )
    const mentions = unsubscribeLines(
      await logsDuring(() => unsubscribe({ token: tokenOf(inesId, 'mentions') })),
    )
    expect(mentions).toHaveLength(1)
    expect(mentions[0]).toMatch(restorable)

    await setAll(ines, { replies: 'now' })
    const all = unsubscribeLines(
      await logsDuring(() =>
        unsubscribe({ token: tokenOf(inesId, 'instant'), scope: 'all', choice: 'never' }),
      ),
    )
    expect(all.length).toBeGreaterThan(0)
    for (const line of all) expect(line).toMatch(restorable)
    // Le récap coupé et les types passés à « Jamais » s'y lisent tous les deux.
    expect(all.join('\n')).toMatch(/ (recap|all)$/m)
    expect(all.join('\n')).toMatch(/ never$/m)
  })

  it('writes nothing for an invalid link, a refused choice or a deleted account', async () => {
    const lines = await logsDuring(async () => {
      await expectInvalid(await unsubscribe({ token: `${tokenOf(inesId, 'recap')}x` }))
      await expectInvalid(await unsubscribe({ token: tokenOf(inesId, 'instant'), choice: 'now' }))
      await act.deleteAccount(malik, 'malik-long-password')
      await expectInvalid(await unsubscribe({ token: tokenOf(malikId, 'instant') }))
    })

    expect(unsubscribeLines(lines)).toEqual([])
    // Témoin : un lien valide écrit bien sa ligne.
    const after = await logsDuring(() => unsubscribe({ token: tokenOf(inesId, 'instant') }))
    expect(after).toContain(`Unsubscribe ${inesId} instant digest`)
  })
})
