// Tests d'intégration de la tranche 6c : la désinscription depuis un e-mail, sans connexion.
// Scénario : docs/scenarios/phase-1.md, « Précisions (tranche 6c) », « Se désinscrire ».
//
// POST /v1/email/unsubscribe?token=…[&scope=all] coupe la sorte d'e-mail du jeton signé (ou les
// deux avec scope=all). Deux chemins y mènent :
// - le bouton « Confirmer » de la page de désinscription de l'appli (jamais l'ouverture de la
//   page : un antivirus qui ouvre les liens ne désinscrit personne) ;
// - le bouton « Se désabonner » de la messagerie (en-tête List-Unsubscribe, RFC 8058), qui envoie
//   un POST avec le corps « List-Unsubscribe=One-Click », sans cookie et sans en-tête Origin, ou
//   avec celui du webmail.
// La route n'utilise jamais la session et ne lit jamais le corps (relecture de sécurité S-A3).
// Un lien invalide reçoit toujours la même réponse, 400 unsubscribe_invalid : elle ne dit pas si
// le compte existe.

import { ErrorResponse } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { resources } from '@ruche/i18n'
import { eq } from 'drizzle-orm'
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
  // Les deux sortes d'e-mail sont actives chez Inès et chez Malik : on voit ce que coupe chaque lien.
  await act.setPreferences(ines, { mentionEmails: true })
  await act.setPreferences(malik, { mentionEmails: true })
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const later = (ms: number) => vi.setSystemTime(Date.now() + ms)

const tokenOf = (userId: string, kind: 'recap' | 'mentions') =>
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
    expect(await act.preferences(ines)).toEqual({ weeklyRecap: false, mentionEmails: true })
  })

  it('turns off the mention e-mails only, with a mentions link', async () => {
    const res = await unsubscribe({ token: tokenOf(inesId, 'mentions') })

    expect(res.status).toBe(204)
    expect(await act.preferences(ines)).toEqual({ weeklyRecap: true, mentionEmails: false })
  })

  it('turns everything off with scope=all, whatever the kind of the link', async () => {
    for (const kind of ['recap', 'mentions'] as const) {
      await act.setPreferences(ines, { weeklyRecap: true, mentionEmails: true })

      const res = await unsubscribe({ token: tokenOf(inesId, kind), scope: 'all' })

      expect(res.status).toBe(204)
      expect(await act.preferences(ines)).toEqual({ weeklyRecap: false, mentionEmails: false })
    }
  })

  it('never turns anything back on: the member does it in her profile', async () => {
    await unsubscribe({ token: tokenOf(inesId, 'recap'), scope: 'all' })
    await act.setPreferences(ines, { mentionEmails: true })

    // Le même lien du récap, ouvert de nouveau : le récap reste coupé, les mentions restent actives.
    expect((await unsubscribe({ token: tokenOf(inesId, 'recap') })).status).toBe(204)

    expect(await act.preferences(ines)).toEqual({ weeklyRecap: false, mentionEmails: true })
  })

  it('creates the settings of a member who never changed them, with the recap off', async () => {
    const zoe = await ctx.verifiedMember({
      name: 'Zoé',
      email: 'zoe@example.com',
      password: 'zoe-long-password',
    })
    const zoeId = (await act.me(zoe)).id

    expect((await unsubscribe({ token: tokenOf(zoeId, 'recap') })).status).toBe(204)

    expect(await act.preferences(zoe)).toEqual({ weeklyRecap: false, mentionEmails: false })
  })

  it('acts on the member of the link only, never on the member signed in', async () => {
    // Un cookie de Malik joint à la requête (son navigateur) : seul le lien compte.
    const res = await unsubscribe(
      { token: tokenOf(inesId, 'recap'), scope: 'all' },
      { headers: { cookie: malik } },
    )

    expect(res.status).toBe(204)
    expect(await act.preferences(ines)).toEqual({ weeklyRecap: false, mentionEmails: false })
    expect(await act.preferences(malik)).toEqual({ weeklyRecap: true, mentionEmails: true })
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
    expect(await act.preferences(ines)).toEqual({ weeklyRecap: false, mentionEmails: true })
  })

  it('accepts the same form in multipart, as the RFC prefers', async () => {
    const form = new FormData()
    form.set('List-Unsubscribe', 'One-Click')

    const res = await fromMailServer(tokenOf(inesId, 'mentions'), { body: form })

    expect(res.status).toBe(204)
    expect(await act.preferences(ines)).toEqual({ weeklyRecap: true, mentionEmails: false })
  })

  it('never reads the body: an empty, JSON or unexpected one changes nothing to the answer', async () => {
    for (const init of [
      {},
      { headers: { 'content-type': 'application/json' }, body: '{"scope":"none"}' },
      { headers: { 'content-type': 'text/plain' }, body: 'anything' },
    ]) {
      await act.setPreferences(ines, { weeklyRecap: true })

      const res = await fromMailServer(tokenOf(inesId, 'recap'), init)

      expect(res.status).toBe(204)
      expect((await act.preferences(ines)).weeklyRecap).toBe(false)
    }
  })

  it('accepts the POST of a webmail from its own site: the link alone gives the right', async () => {
    const res = await ctx.request(pathFor({ token: tokenOf(inesId, 'recap') }), {
      method: 'POST',
      headers: {
        origin: 'https://mail.example',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'List-Unsubscribe=One-Click',
    })

    expect(res.status).toBe(204)
    expect((await act.preferences(ines)).weeklyRecap).toBe(false)
  })

  it('changes nothing when the link is only opened (GET), and sends to the page of the app', async () => {
    const token = tokenOf(inesId, 'recap')

    const res = await ctx.app.request(pathFor({ token }), { method: 'GET' })

    expect(res.status).toBe(303)
    const location = new URL(res.headers.get('location') ?? '')
    expect(location.origin + location.pathname).toBe(`${TEST_APP_URL}/unsubscribe`)
    expect(location.searchParams.get('token')).toBe(token)
    expect(await act.preferences(ines)).toEqual({ weeklyRecap: true, mentionEmails: true })
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
      { token: `${version}.${id}.recap.${flipped}` },
      { token: createUnsubscribeToken('another-secret-that-is-long-enough', inesId, 'recap') },
      { token: `${version}.${id}.weekly.${signature}` },
      { token: `${version}.${id}.recap.${signature?.slice(0, 1)}` },
      { token: `${version}.${id}.recap.${signature}A` },
      { token: `${version}.${padded}.recap.${signature}` },
      { token: '' },
      { token: `${token}${token}` },
      { token, scope: 'everything' },
      {},
    ]) {
      const body = await expectInvalid(await unsubscribe(params))
      bodies.add(JSON.stringify(body))
    }
    // Le jeton répété deux fois dans l'adresse.
    const twice = await ctx.request(`${pathFor({ token })}&token=${token}`, { method: 'POST' })
    bodies.add(JSON.stringify(await expectInvalid(twice)))

    expect(bodies.size).toBe(1)
    expect(await act.preferences(ines)).toEqual({ weeklyRecap: true, mentionEmails: true })
    expect(await act.preferences(malik)).toEqual({ weeklyRecap: true, mentionEmails: true })
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

    expect(deleted).toEqual(unknownBody)
    expect(await ctx.db.select().from(schema.user).where(eq(schema.user.id, zoeId))).toHaveLength(0)
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
    const token = tokenOf(inesId, 'recap')

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
    expect((await unsubscribe({ token: tokenOf(inesId, 'mentions') })).status).toBe(204)
  })

  it('answers 10 valid links an hour per member, whatever the address', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await unsubscribe(
        { token: tokenOf(inesId, 'recap') },
        { headers: { 'x-real-ip': `198.51.100.${i + 1}` } },
      )
      expect(res.status).toBe(204)
    }

    const blocked = await unsubscribe(
      { token: tokenOf(inesId, 'recap') },
      { headers: { 'x-real-ip': '198.51.100.50' } },
    )
    expect(blocked.status).toBe(429)
    // Le compteur est celui d'Inès : le lien de Malik passe.
    expect((await unsubscribe({ token: tokenOf(malikId, 'recap') })).status).toBe(204)
  })
})

// Décision de Louis (restauration, option a) : chaque refus laisse une ligne de journal,
// « Unsubscribe <identifiant> <recap|mentions|all> », pour pouvoir le réappliquer après la
// restauration d'une sauvegarde (docs/ops/serveur.md). Ni adresse, ni nom, ni jeton.
describe('the trace of an unsubscribe, for a restored backup', () => {
  /** Ce que l'API écrit dans ses journaux pendant `action`, ligne par ligne. */
  const logsDuring = async (action: () => unknown) => {
    const logs = (['log', 'info', 'warn', 'error'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    await action()
    return logs.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' ')))
  }

  it('writes one line with the member and what was turned off, and nothing else about them', async () => {
    const lines = await logsDuring(async () => {
      await unsubscribe({ token: tokenOf(inesId, 'recap') })
      await unsubscribe({ token: tokenOf(malikId, 'mentions') })
      await unsubscribe({ token: tokenOf(malikId, 'recap'), scope: 'all' })
    })

    expect(lines.filter((line) => line.startsWith('Unsubscribe '))).toEqual([
      `Unsubscribe ${inesId} recap`,
      `Unsubscribe ${malikId} mentions`,
      `Unsubscribe ${malikId} all`,
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

  it('writes nothing for an invalid link or a deleted account', async () => {
    const lines = await logsDuring(async () => {
      await expectInvalid(await unsubscribe({ token: `${tokenOf(inesId, 'recap')}x` }))
      await act.deleteAccount(malik, 'malik-long-password')
      await expectInvalid(await unsubscribe({ token: tokenOf(malikId, 'recap') }))
    })

    expect(lines.filter((line) => line.startsWith('Unsubscribe '))).toEqual([])
    // Témoin : un lien valide écrit bien sa ligne.
    const after = await logsDuring(() => unsubscribe({ token: tokenOf(inesId, 'mentions') }))
    expect(after).toContain(`Unsubscribe ${inesId} mentions`)
  })
})
