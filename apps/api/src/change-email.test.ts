// Tests d'intégration de la tranche « adresse » : changer l'adresse e-mail de son compte
// (docs/scenarios/phase-1.md, dernière section). Le parcours a deux liens :
// 1. la demande (POST /api/auth/change-email, mot de passe exigé) envoie un premier lien à
//    l'adresse ACTUELLE, pour qu'elle donne son accord ;
// 2. ce lien (GET /api/auth/verify-email) envoie un second lien à la NOUVELLE adresse ;
// 3. ce second lien change l'adresse, puis un dernier e-mail prévient l'ancienne.
// Les e-mails ne partent pas vraiment : la fausse boîte `ctx.mailer.sent` les garde, et les tests
// y lisent les liens, comme le ferait Inès dans sa messagerie.

import { AccountExport, Me } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { fill, type Language, resources } from '@ruche/i18n'
import { createEmailVerificationToken } from 'better-auth/api'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestContext,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from './testing/context'

let ctx: TestContext

beforeEach(async () => {
  ctx = await createTestContext()
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await ctx.close()
})

// ─── Les personnes et les outils du fichier ────────────────────────────────────────────────────

const ines = { name: 'Inès', email: 'ines@exemple.fr', password: 'correct-horse-battery' }
const malik = { name: 'Malik', email: 'malik@exemple.fr', password: 'another-horse-battery' }
const NEW_EMAIL = 'ines.b@exemple.fr'

// Les deux pages de l'appli où mènent les liens, quoi qu'en dise l'adresse du lien (plan, S2).
const CONFIRMED_PAGE = `${TEST_APP_URL}/email-change/confirmed`
const DONE_PAGE = `${TEST_APP_URL}/email-change/done`

/**
 * Remplace l'horloge de JavaScript par une fausse, arrêtée sur une date fixe, puis recrée l'API :
 * les quotas, les sessions et les jetons des liens lisent cette horloge dès leur création, il
 * faut donc la poser avant `createTestContext` (pôle code, « Dates »). `later` l'avance.
 */
const START = new Date('2026-10-26T08:00:00.000Z')
const useFakeClock = async () => {
  await ctx.close()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
}
const MINUTE = 60 * 1000
const later = (ms: number) => vi.setSystemTime(Date.now() + ms)

/** Le sujet d'un des trois e-mails de la tranche, dans une langue. */
type MailKind = 'changeEmail' | 'newEmail' | 'emailChanged'
const subjectOf = (kind: MailKind, language: Language = 'fr') =>
  fill(resources[language].translation.email[kind].subject)

/** Les e-mails d'un genre partis vers une adresse, dans l'une ou l'autre langue. */
const mailsOf = (kind: MailKind, to: string) =>
  ctx.mailer.sent.filter(
    (mail) =>
      mail.to === to &&
      (mail.subject === subjectOf(kind, 'fr') || mail.subject === subjectOf(kind, 'en')),
  )

/** Le lien du dernier e-mail d'un genre parti vers une adresse (le bouton, écrit dans le texte). */
const linkOf = (kind: MailKind, to: string) => {
  const mail = mailsOf(kind, to).at(-1)
  if (!mail) throw new Error(`no ${kind} e-mail to ${to}`)
  const match = mail.text.match(/https?:\/\/\S+/)
  if (!match) throw new Error(`no link in the ${kind} e-mail`)
  return new URL(match[0])
}

/** La demande de changement, telle que l'appli l'envoie (contrat ChangeEmailRequest). */
const ask = (
  cookie: string | null,
  body: unknown = { newEmail: NEW_EMAIL, password: ines.password },
  headers: Record<string, string> = {},
) =>
  ctx.request('/api/auth/change-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }), ...headers },
    body: JSON.stringify(body),
  })

/** Ouvre un lien reçu par e-mail, sur un appareil connecté (cookie) ou non. */
const open = (link: URL, cookie?: string) =>
  ctx.request(link.pathname + link.search, cookie ? { headers: { cookie } } : {})

/** Où mène une redirection : la page (sans paramètres) et le code d'erreur éventuel. */
const landing = (res: Response) => {
  const location = res.headers.get('location')
  if (!location) throw new Error(`no redirection (status ${res.status})`)
  const url = new URL(location)
  return { page: `${url.origin}${url.pathname}`, error: url.searchParams.get('error') }
}

/** L'adresse et l'état de vérification d'un membre, lus en base. */
const accountOf = async (name: string) => {
  const [row] = await ctx.db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      emailVerified: schema.user.emailVerified,
    })
    .from(schema.user)
    .where(eq(schema.user.name, name))
  if (!row) throw new Error(`no account named ${name}`)
  return row
}

const sessionCount = async () => (await ctx.db.select().from(schema.session)).length

const me = async (cookie: string) => {
  const res = await ctx.request('/v1/me', { headers: { cookie } })
  return { status: res.status, body: res.status === 200 ? Me.parse(await res.json()) : null }
}

/** Inès demande le changement, puis suit le premier lien : le second est dans sa nouvelle boîte. */
const askAndConfirm = async (cookie: string, newEmail = NEW_EMAIL) => {
  expect((await ask(cookie, { newEmail, password: ines.password })).status).toBe(200)
  const confirm = await open(linkOf('changeEmail', ines.email))
  expect(landing(confirm)).toEqual({ page: CONFIRMED_PAGE, error: null })
  return linkOf('newEmail', newEmail)
}

// ─── Le parcours entier ───────────────────────────────────────────────────────────────────────

describe('changing my address, from the request to the second link', () => {
  it('asks the current address first, then verifies the new one, then changes it', async () => {
    const cookie = await ctx.verifiedMember(ines)

    // La demande : un e-mail part vers l'adresse ACTUELLE, qui cite la nouvelle seule sur sa ligne.
    const res = await ask(cookie)
    expect(res.status).toBe(200)
    const [first] = mailsOf('changeEmail', ines.email)
    expect(first?.text.split('\n')).toContain(NEW_EMAIL)
    expect(mailsOf('newEmail', NEW_EMAIL)).toHaveLength(0)
    expect((await accountOf('Inès')).email).toBe(ines.email) // rien ne change encore

    // Le premier lien : page « Plus qu'une étape », et un e-mail vers la NOUVELLE adresse.
    const confirm = await open(linkOf('changeEmail', ines.email))
    expect(confirm.status).toBe(302)
    expect(landing(confirm)).toEqual({ page: CONFIRMED_PAGE, error: null })
    expect(mailsOf('newEmail', NEW_EMAIL)).toHaveLength(1)
    expect((await accountOf('Inès')).email).toBe(ines.email)

    // Le second lien : l'adresse change, vérifiée ; la page le confirme.
    const done = await open(linkOf('newEmail', NEW_EMAIL), cookie)
    expect(done.status).toBe(302)
    expect(landing(done)).toEqual({ page: DONE_PAGE, error: null })
    expect(await accountOf('Inès')).toMatchObject({ email: NEW_EMAIL, emailVerified: true })

    // Un dernier e-mail prévient l'ancienne adresse.
    const [changed] = mailsOf('emailChanged', ines.email)
    expect(changed?.text.split('\n')).toContain(NEW_EMAIL)
  })

  it('lets me sign in with the new address and the same password, and no longer with the old one', async () => {
    const cookie = await ctx.verifiedMember(ines)
    await open(await askAndConfirm(cookie), cookie)

    expect((await ctx.signIn({ email: NEW_EMAIL, password: ines.password })).status).toBe(200)
    expect((await ctx.signIn({ email: ines.email, password: ines.password })).status).toBe(401)
  })

  it('keeps every session already open, on every device, with the new address', async () => {
    const phone = await ctx.verifiedMember(ines)
    const laptop = ctx.cookiesFrom(await ctx.signIn(ines))

    await open(await askAndConfirm(phone), phone)

    for (const cookie of [phone, laptop]) {
      const { status, body } = await me(cookie)
      expect(status).toBe(200)
      expect(body?.email).toBe(NEW_EMAIL)
    }
  })

  it('changes nothing else: name, handle, profile stay, and the export gives the new address', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const before = (await me(cookie)).body

    await open(await askAndConfirm(cookie), cookie)

    const after = (await me(cookie)).body
    expect({ ...after, email: null }).toEqual({ ...before, email: null })
    const exported = AccountExport.parse(
      await (await ctx.request('/v1/me/export', { headers: { cookie } })).json(),
    )
    expect(exported.user.email).toBe(NEW_EMAIL)
  })

  it('writes the three e-mails in the language of the member', async () => {
    const cookie = await ctx.verifiedMember({ ...ines, language: 'en' })

    await open(await askAndConfirm(cookie), cookie)

    expect(ctx.mailer.sent.map((mail) => mail.subject)).toEqual(
      expect.arrayContaining([
        subjectOf('changeEmail', 'en'),
        subjectOf('newEmail', 'en'),
        subjectOf('emailChanged', 'en'),
      ]),
    )
    for (const kind of ['changeEmail', 'newEmail', 'emailChanged'] as const) {
      expect(ctx.mailer.sent.map((mail) => mail.subject)).not.toContain(subjectOf(kind, 'fr'))
    }
  })

  // Envois sans attente (plan, S4) : sinon le temps de réponse dirait si l'adresse a un compte
  // (une adresse prise n'envoie rien au premier lien). Une boîte qui ne répond jamais ne retarde
  // aucune des trois étapes.
  it('answers each step without waiting for the e-mail to leave', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const send = vi.spyOn(ctx.mailer, 'send').mockImplementation(() => new Promise(() => {}))
    const sentLink = (to: string) => {
      const call = send.mock.calls.findLast(([mail]) => mail.to === to)
      const match = call?.[0].text.match(/https?:\/\/\S+/)
      if (!match) throw new Error(`no e-mail handed to the mailer for ${to}`)
      return new URL(match[0])
    }
    const withinASecond = <T>(step: T | Promise<T>) =>
      Promise.race([
        Promise.resolve(step),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('the answer waited for the e-mail')), 1000),
        ),
      ])

    expect((await withinASecond(ask(cookie))).status).toBe(200)
    expect((await withinASecond(open(sentLink(ines.email)))).status).toBe(302)
    expect((await withinASecond(open(sentLink(NEW_EMAIL), cookie))).status).toBe(302)
    expect((await accountOf('Inès')).email).toBe(NEW_EMAIL)
  })
})

// ─── Les pages où mènent les liens (plan, S2) ─────────────────────────────────────────────────

// Le lien de retour (callbackURL) est écrit dans l'adresse du lien : quelqu'un pourrait le changer.
// Vers un autre site, c'est un hameçonnage signé par notre domaine ; vers ruche://, l'appli mobile
// recevrait la session dans l'adresse ; sans lui, Better Auth répondrait le compte en JSON. L'API
// impose donc ses deux pages, et le second lien ne pose aucun cookie.
describe('the pages the links lead to', () => {
  const replaced = (link: URL, callbackURL: string | null) => {
    const changed = new URL(link)
    if (callbackURL === null) changed.searchParams.delete('callbackURL')
    else changed.searchParams.set('callbackURL', callbackURL)
    return changed
  }

  it.each([
    ['without a return address', null],
    ['with another website', 'https://evil.example/phishing'],
    ['with the mobile app scheme', 'ruche://x'],
  ])('are always ours, %s', async (_, callbackURL) => {
    const cookie = await ctx.verifiedMember(ines)
    expect((await ask(cookie)).status).toBe(200)

    const confirm = await open(replaced(linkOf('changeEmail', ines.email), callbackURL))
    expect(confirm.status).toBe(302)
    expect(landing(confirm)).toEqual({ page: CONFIRMED_PAGE, error: null })

    // D1 (R2) : le second lien s'ouvre dans la session d'Inès. Better Auth y repose le cookie de
    // cette session, rafraîchi (même jeton) : ce n'est pas un cookie nouveau. Aucun autre cookie
    // n'est posé, sauf pour en expirer un, et aucune session ne s'ouvre.
    const presented = cookie.split('; ')
    const sessions = await sessionCount()
    const done = await open(replaced(linkOf('newEmail', NEW_EMAIL), callbackURL), cookie)
    expect(done.status).toBe(302)
    expect(landing(done)).toEqual({ page: DONE_PAGE, error: null })
    expect(done.headers.getSetCookie()).toEqual(
      done.headers
        .getSetCookie()
        .filter(
          (set) =>
            /max-age=0|expires=thu, 01 jan 1970/i.test(set) ||
            presented.includes(set.split(';')[0] ?? ''),
        ),
    )
    expect(await sessionCount()).toBe(sessions)
    expect(await done.text()).not.toContain('"user"')
    expect((await accountOf('Inès')).email).toBe(NEW_EMAIL)
  })

  // Relecture de design des-E6 (décision de Louis du 26/10/2026) : le second lien, déjà long avec
  // son jeton chiffré, ne porte pas de page de retour ; l'API l'impose quand on l'ouvre.
  it('send the second link without a return address, and it still leads to our page', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const second = await askAndConfirm(cookie)

    expect(second.searchParams.has('callbackURL')).toBe(false)
    const done = await open(second, cookie)
    expect(done.status).toBe(302)
    expect(landing(done)).toEqual({ page: DONE_PAGE, error: null })
    expect((await accountOf('Inès')).email).toBe(NEW_EMAIL)
  })
})

// ─── Chaque lien ne sert qu'une fois (plan, S1) ───────────────────────────────────────────────

describe('a link used twice', () => {
  it('sends only one second link when the first one is opened twice', async () => {
    const cookie = await ctx.verifiedMember(ines)
    expect((await ask(cookie)).status).toBe(200)
    const link = linkOf('changeEmail', ines.email)

    expect(landing(await open(link)).error).toBeNull()
    const again = await open(link)

    expect(again.status).toBe(302)
    expect(landing(again).error).not.toBeNull()
    expect(mailsOf('newEmail', NEW_EMAIL)).toHaveLength(1)
  })

  it('leads to an error page when the second link is opened again', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const link = await askAndConfirm(cookie)

    expect(landing(await open(link, cookie))).toEqual({ page: DONE_PAGE, error: null })
    const again = await open(link, cookie)

    expect(again.status).toBe(302)
    expect(landing(again).error).not.toBeNull()
    expect(mailsOf('emailChanged', ines.email)).toHaveLength(1)
  })
})

// ─── Les demandes refusées ────────────────────────────────────────────────────────────────────

describe('a refused request', () => {
  /** Rien n'est parti, l'adresse n'a pas changé. */
  const expectNothingChanged = async (mailsBefore: number) => {
    expect(ctx.mailer.sent.slice(mailsBefore)).toEqual([])
    expect((await accountOf('Inès')).email).toBe(ines.email)
  }

  it('asks to sign in when there is no session', async () => {
    await ctx.verifiedMember(ines)
    const before = ctx.mailer.sent.length

    const res = await ask(null)

    expect(res.status).toBe(401)
    await expectNothingChanged(before)
  })

  it.each([
    ['without a password', { newEmail: NEW_EMAIL }],
    ['with an empty password', { newEmail: NEW_EMAIL, password: '' }],
    ['with a password of 129 characters', { newEmail: NEW_EMAIL, password: 'a'.repeat(129) }],
    ['with an invalid new address', { newEmail: 'not-an-address', password: ines.password }],
  ])('refuses a request %s', async (_, body) => {
    const cookie = await ctx.verifiedMember(ines)
    const before = ctx.mailer.sent.length

    const res = await ask(cookie, body)

    expect(res.status).toBe(400)
    await expectNothingChanged(before)
  })

  it('refuses a wrong password, with its code', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const before = ctx.mailer.sent.length

    const res = await ask(cookie, { newEmail: NEW_EMAIL, password: 'not-my-password-1' })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_PASSWORD' })
    await expectNothingChanged(before)
  })

  // Un compte sans mot de passe (connexion par un autre moyen, un jour) n'a rien à vérifier :
  // la demande est refusée comme un mauvais mot de passe (plan, point 5). L'état est posé en base.
  it('refuses an account that has no password login, as a wrong password', async () => {
    const cookie = await ctx.verifiedMember(ines)
    await ctx.db.delete(schema.account).where(eq(schema.account.providerId, 'credential'))
    const before = ctx.mailer.sent.length

    const res = await ask(cookie)

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_PASSWORD' })
    await expectNothingChanged(before)
  })

  it('says, in the language of the visitor, that this is already my address', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const before = ctx.mailer.sent.length

    const res = await ask(
      cookie,
      { newEmail: ines.email, password: ines.password },
      { 'accept-language': 'en' },
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      code: 'SAME_EMAIL',
      message: resources.en.translation.auth.errors.sameEmail,
    })
    await expectNothingChanged(before)
  })

  it('recognises my address written in capitals', async () => {
    const cookie = await ctx.verifiedMember(ines)

    const res = await ask(cookie, { newEmail: 'INES@Exemple.fr', password: ines.password })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'SAME_EMAIL' })
  })

  // Plan, S7 : un compte dont l'adresse n'est pas vérifiée (état posé en base) ne change pas
  // d'adresse : Better Auth sauterait alors l'accord de l'ancienne adresse.
  it('refuses a member whose current address is not verified', async () => {
    const cookie = await ctx.verifiedMember(ines)
    await ctx.db
      .update(schema.user)
      .set({ emailVerified: false })
      .where(eq(schema.user.name, 'Inès'))
    const before = ctx.mailer.sent.length

    const res = await ask(cookie)

    expect(res.status).toBe(403)
    await expectNothingChanged(before)
  })

  it('refuses a request sent from another website (CSRF)', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const before = ctx.mailer.sent.length

    const res = await ask(cookie, undefined, { origin: 'https://evil.example' })

    expect(res.status).toBe(403)
    await expectNothingChanged(before)
    // Témoin : la même demande, venue de l'appli, est acceptée.
    expect((await ask(cookie)).status).toBe(200)
  })
})

// ─── Une adresse qui a déjà un compte ─────────────────────────────────────────────────────────

describe('an address that belongs to another account', () => {
  it('gets the same answer and the same first e-mail, but no second link and no change', async () => {
    const cookie = await ctx.verifiedMember(ines)
    await ctx.verifiedMember(malik)

    const free = await ask(cookie, { newEmail: 'ines.free@exemple.fr', password: ines.password })
    const taken = await ask(cookie, { newEmail: malik.email, password: ines.password })

    // Même réponse, et le même premier e-mail vers l'adresse d'Inès, qui cite l'adresse demandée.
    expect(taken.status).toBe(free.status)
    expect(await taken.json()).toEqual(await free.json())
    expect(mailsOf('changeEmail', ines.email)).toHaveLength(2)
    expect(mailsOf('changeEmail', ines.email)[1]?.text.split('\n')).toContain(malik.email)

    // Le premier lien mène à la page habituelle, mais rien ne part, ni vers l'adresse de Malik
    // ni ailleurs.
    const before = ctx.mailer.sent.length
    const confirm = await open(linkOf('changeEmail', ines.email))
    expect(confirm.status).toBe(302)
    expect(landing(confirm)).toEqual({ page: CONFIRMED_PAGE, error: null })
    expect(ctx.mailer.sent.slice(before)).toEqual([])

    expect((await accountOf('Inès')).email).toBe(ines.email)
    expect((await accountOf('Malik')).email).toBe(malik.email)
  })

  // Plan, S5 : quelqu'un s'inscrit avec la nouvelle adresse entre les deux liens.
  it('refuses the second link when the address got an account in between, without a 500', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const link = await askAndConfirm(cookie)
    await ctx.signUp({ name: 'Inconnu', email: NEW_EMAIL, password: 'someone-else-pass' })
    const sessions = await sessionCount()

    const res = await open(link)

    expect(res.status).toBe(302)
    expect(landing(res).error).not.toBeNull()
    expect(await sessionCount()).toBe(sessions)
    expect((await accountOf('Inès')).email).toBe(ines.email)
    expect(await accountOf('Inconnu')).toMatchObject({ email: NEW_EMAIL, emailVerified: false })
  })
})

// ─── Le lien d'un membre ouvert par un autre ──────────────────────────────────────────────────

describe('a link opened by another member', () => {
  it('refuses the first link of Inès opened by Malik, signed in', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const malikCookie = await ctx.verifiedMember(malik)
    expect((await ask(cookie)).status).toBe(200)

    const res = await open(linkOf('changeEmail', ines.email), malikCookie)

    expect(landing(res).error).not.toBeNull()
    expect(mailsOf('newEmail', NEW_EMAIL)).toHaveLength(0)
  })

  it('refuses the second link of Inès opened by Malik, signed in, and changes no address', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const malikCookie = await ctx.verifiedMember(malik)
    const link = await askAndConfirm(cookie)

    const res = await open(link, malikCookie)

    expect(landing(res).error).not.toBeNull()
    expect((await accountOf('Inès')).email).toBe(ines.email)
    expect((await accountOf('Malik')).email).toBe(malik.email)
  })

  // Un lien que Better Auth refuse (ici, ouvert par un autre membre connecté) n'est pas compté
  // comme servi : l'API vérifie d'abord ce que Better Auth vérifierait, puis seulement le compteur
  // « usage unique » (décision du 26/10/2026). Sans cet ordre, Malik, en ouvrant le lien d'Inès,
  // le grillerait, et Inès devrait tout recommencer.
  it('still lets Inès use her first link after Malik, signed in, opened it', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const malikCookie = await ctx.verifiedMember(malik)
    expect((await ask(cookie)).status).toBe(200)
    const link = linkOf('changeEmail', ines.email)

    expect(landing(await open(link, malikCookie)).error).not.toBeNull()
    const res = await open(link)

    expect(landing(res)).toEqual({ page: CONFIRMED_PAGE, error: null })
    expect(mailsOf('newEmail', NEW_EMAIL)).toHaveLength(1)
  })

  it('still lets Inès use her second link after Malik, signed in, opened it', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const malikCookie = await ctx.verifiedMember(malik)
    const link = await askAndConfirm(cookie)

    expect(landing(await open(link, malikCookie)).error).not.toBeNull()
    const res = await open(link, cookie)

    expect(landing(res)).toEqual({ page: DONE_PAGE, error: null })
    expect((await accountOf('Inès')).email).toBe(NEW_EMAIL)
    expect((await accountOf('Malik')).email).toBe(malik.email)
  })
})

// ─── Le second lien ne connecte personne (plan, S3) ───────────────────────────────────────────

// Une faute de frappe dans la nouvelle adresse enverrait le second lien chez un inconnu : s'il
// connectait, l'inconnu aurait le compte. Better Auth crée une session quand l'appareil n'en a
// pas ; l'API l'efface aussitôt. Le cache de session dans un cookie (`cookieCache`) reste coupé,
// comme en production : avec lui, un cookie « session_data » laisserait entrer quelques minutes
// même après l'effacement de la session.
// R2 (D1, décision de Louis du 29/10/2026) : le test « changes the address without signing in a
// device that has no session » est retiré. Sans session, le second lien ne change plus rien et ne
// connecte personne (bloc « D1 » plus bas, qui vérifie aussi qu'aucune session n'est créée).
describe('the second link', () => {
  // Une session lue plus d'un jour après sa dernière lecture est rafraîchie : Better Auth la repose
  // alors dans un cookie, comme une nouvelle. Ce n'en est pas une : elle reste ouverte. Le
  // téléphone d'Inès ne sert pas pendant 25 heures ; elle fait la demande depuis son ordinateur,
  // et ouvre le second lien sur son téléphone, dont la session est rafraîchie à ce moment-là.
  it('keeps the session of a device signed in to the same account, even one unused for a day', async () => {
    await useFakeClock()
    const phone = await ctx.verifiedMember(ines)
    later(25 * 60 * MINUTE)
    const laptop = ctx.cookiesFrom(await ctx.signIn(ines))
    const link = await askAndConfirm(laptop)

    const res = await open(link, phone)

    expect(landing(res)).toEqual({ page: DONE_PAGE, error: null })
    const { status, body } = await me(phone)
    expect(status).toBe(200)
    expect(body?.email).toBe(NEW_EMAIL)
  })

  // Témoin : la vérification d'une inscription connecte toujours (tranche 1).
  // verifiedMember ouvre le lien « Active ton compte » et garde le cookie reçu.
  it('leaves the sign-up verification signing the member in', async () => {
    const cookie = await ctx.verifiedMember(malik)

    expect(cookie).toContain('session_token')
    expect((await me(cookie)).status).toBe(200)
  })
})

// ─── D1 (R2, décision de Louis du 29/10/2026) : le second lien n'aboutit que dans la session du
// membre. Avec une faute de frappe dans la nouvelle adresse, le second lien part chez un inconnu ;
// combiné au mot de passe oublié (R2), il lui donnait le compte. Sans session, l'appli demande de se
// connecter, puis le lien aboutit ; dans la session d'un autre membre, refus.

describe('the second link, which only works in the session of the member (D1)', () => {
  it('changes nothing when opened without a session, and still works afterwards for the member', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const link = await askAndConfirm(cookie)
    const sessions = await sessionCount()

    const anonymous = await open(link)

    // Rien n'a changé : ni l'adresse, ni les sessions ; aucun cookie de session posé.
    expect((await accountOf('Inès')).email).toBe(ines.email)
    expect(await sessionCount()).toBe(sessions)
    expect(anonymous.headers.getSetCookie().join(';')).not.toContain('session_token=')
    // Repris du test retiré : pas de cookie « session_data » non plus (`cookieCache` coupé).
    expect(anonymous.headers.getSetCookie().join(';')).not.toContain('session_data')
    if (anonymous.status === 302) {
      // Une redirection : vers une page de l'appli, jamais la page « Adresse changée ».
      expect(landing(anonymous).page.startsWith(TEST_APP_URL)).toBe(true)
      expect(landing(anonymous).page).not.toBe(DONE_PAGE)
    } else {
      expect(anonymous.status).toBeGreaterThanOrEqual(400)
    }
    // Le lien n'est pas consommé : Inès, connectée, l'ouvre et le changement aboutit.
    const mine = await open(link, cookie)
    expect(landing(mine)).toEqual({ page: DONE_PAGE, error: null })
    expect((await accountOf('Inès')).email).toBe(NEW_EMAIL)
    expect((await me(cookie)).body?.email).toBe(NEW_EMAIL)
  })

  it('changes the address when opened in the session of the member, on any of her devices', async () => {
    const laptop = await ctx.verifiedMember(ines)
    const phone = ctx.cookiesFrom(await ctx.signIn(ines))
    const link = await askAndConfirm(laptop)

    const res = await open(link, phone)

    expect(landing(res)).toEqual({ page: DONE_PAGE, error: null })
    expect((await accountOf('Inès')).email).toBe(NEW_EMAIL)
    expect((await accountOf('Inès')).emailVerified).toBe(true)
    // Les deux appareils restent connectés, avec la nouvelle adresse.
    expect((await me(phone)).body?.email).toBe(NEW_EMAIL)
    expect((await me(laptop)).body?.email).toBe(NEW_EMAIL)
    // L'ancienne adresse est prévenue.
    expect(mailsOf('emailChanged', ines.email)).toHaveLength(1)
  })

  it('is refused in the session of another member, and changes neither account', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const other = await ctx.verifiedMember(malik)
    const link = await askAndConfirm(cookie)

    const res = await open(link, other)

    // Better Auth refuse déjà ce lien (test « a link opened by another member ») : la page d'arrivée
    // porte un code d'erreur, et rien ne change.
    expect(landing(res).error).not.toBeNull()
    expect((await accountOf('Inès')).email).toBe(ines.email)
    expect((await accountOf('Malik')).email).toBe(malik.email)
    expect((await me(other)).body?.email).toBe(malik.email)
    expect(mailsOf('emailChanged', ines.email)).toEqual([])
  })
})

// ─── Les liens périmés ou remplacés (plan, S9) ────────────────────────────────────────────────

describe('a link that is no longer valid', () => {
  it('refuses a first link older than one hour', async () => {
    await useFakeClock()
    const cookie = await ctx.verifiedMember(ines)
    later(MINUTE)
    expect((await ask(cookie)).status).toBe(200)
    later(61 * MINUTE)

    const res = await open(linkOf('changeEmail', ines.email))

    expect(res.status).toBe(302)
    expect(landing(res).error).not.toBeNull()
    expect(mailsOf('newEmail', NEW_EMAIL)).toHaveLength(0)
  })

  it('refuses a second link older than one hour', async () => {
    await useFakeClock()
    const cookie = await ctx.verifiedMember(ines)
    later(MINUTE)
    const link = await askAndConfirm(cookie)
    later(61 * MINUTE)

    const res = await open(link)

    expect(landing(res).error).not.toBeNull()
    expect((await accountOf('Inès')).email).toBe(ines.email)
  })

  it('refuses the links of an earlier request once the address has changed', async () => {
    const cookie = await ctx.verifiedMember(ines)
    // Une première demande, dont Inès ne suit pas le lien ; une deuxième, dont elle suit le
    // premier lien seulement.
    expect(
      (await ask(cookie, { newEmail: 'ines.a@exemple.fr', password: ines.password })).status,
    ).toBe(200)
    const earlierFirst = linkOf('changeEmail', ines.email)
    const earlierSecond = await askAndConfirm(cookie, 'ines.c@exemple.fr')
    // La troisième va jusqu'au bout : l'adresse devient ines.b@exemple.fr.
    expect(landing(await open(await askAndConfirm(cookie), cookie))).toEqual({
      page: DONE_PAGE,
      error: null,
    })
    const before = ctx.mailer.sent.length

    expect(landing(await open(earlierFirst)).error).not.toBeNull()
    expect(landing(await open(earlierSecond)).error).not.toBeNull()

    expect((await accountOf('Inès')).email).toBe(NEW_EMAIL)
    expect(ctx.mailer.sent.slice(before)).toEqual([])
  })

  // Un jeton désigne le compte par son adresse : celui d'un compte supprimé depuis, dont
  // l'adresse a été reprise par une nouvelle inscription, ne doit rien pouvoir sur elle. Le jeton
  // est fabriqué comme Better Auth le fait, avant la création du compte.
  it.each([
    ['first', 'change-email-confirmation', CONFIRMED_PAGE],
    ['second', 'change-email-verification', DONE_PAGE],
  ])('refuses a %s link issued before the account was created', async (_, requestType, page) => {
    await useFakeClock()
    const token = await createEmailVerificationToken(
      TEST_AUTH_SECRET,
      ines.email,
      'pirate@exemple.fr',
      60 * 60,
      { requestType },
    )
    later(5 * MINUTE)
    await ctx.verifiedMember(ines)
    later(MINUTE)
    const before = ctx.mailer.sent.length

    const res = await ctx.request(
      `/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(page)}`,
    )

    expect(res.status).toBe(302)
    expect(landing(res).error).not.toBeNull()
    expect((await accountOf('Inès')).email).toBe(ines.email)
    expect(ctx.mailer.sent.slice(before)).toEqual([])
  })
})

// ─── Les quotas (plan, S4) ────────────────────────────────────────────────────────────────────

describe('the limits on requests', () => {
  it('refuses a 6th request of the same member within 15 minutes, from any connection, even malformed', async () => {
    const cookie = await ctx.verifiedMember(ines)
    for (let i = 1; i <= 5; i++) {
      const res = await ask(cookie, { newEmail: `ines.${i}@exemple.fr`, password: ines.password })
      expect(res.status).toBe(200)
    }
    const before = ctx.mailer.sent.length

    const res = await ask(cookie, {}, { 'x-real-ip': '198.51.100.20' })

    expect(res.status).toBe(429)
    expect(ctx.mailer.sent.slice(before)).toEqual([])
    // Témoin : le quota est celui d'Inès, pas de la connexion. Malik, au même endroit, demande.
    const malikCookie = await ctx.verifiedMember(malik)
    const malikRes = await ask(
      malikCookie,
      { newEmail: 'malik.b@exemple.fr', password: malik.password },
      { 'x-real-ip': '198.51.100.20' },
    )
    expect(malikRes.status).toBe(200)
  })

  it('refuses an 11th request of the same member within a day', async () => {
    await useFakeClock()
    const cookie = await ctx.verifiedMember(ines)
    const askFrom = (i: number) =>
      ask(
        cookie,
        { newEmail: `ines.${i}@exemple.fr`, password: ines.password },
        { 'x-real-ip': `198.51.100.${i}` },
      )
    for (let i = 1; i <= 10; i++) {
      if (i === 6) later(16 * MINUTE) // une nouvelle fenêtre d'un quart d'heure
      expect((await askFrom(i)).status).toBe(200)
    }
    later(16 * MINUTE)
    const before = ctx.mailer.sent.length

    const res = await askFrom(11)

    expect(res.status).toBe(429)
    expect(ctx.mailer.sent.slice(before)).toEqual([])
  })

  it('sends no 4th second link within an hour', async () => {
    const cookie = await ctx.verifiedMember(ines)
    for (let i = 1; i <= 4; i++) {
      const newEmail = `ines.${i}@exemple.fr`
      expect((await ask(cookie, { newEmail, password: ines.password })).status).toBe(200)
      const res = await open(linkOf('changeEmail', ines.email))
      expect(res.status).toBe(302)
      expect(mailsOf('newEmail', newEmail)).toHaveLength(i <= 3 ? 1 : 0)
    }
  })
})

// ─── Le journal (plan, S8 et J8) ──────────────────────────────────────────────────────────────

// Une sauvegarde restaurée ramènerait l'ancienne adresse : le changement laisse une ligne de
// journal, « Email changed <identifiant> », pour le refaire (docs/ops/serveur.md). Jamais
// d'adresse dans les journaux : le jeton des liens est lisible par qui le voit.
describe('the trace of an address change', () => {
  const spyConsole = () =>
    (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
  const linesOf = (spies: ReturnType<typeof spyConsole>) =>
    spies.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' ')))

  it('writes one line with the identifier of the account, and no address at all', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const { id } = await accountOf('Inès')
    const spies = spyConsole()

    await open(await askAndConfirm(cookie), cookie)

    expect((await accountOf('Inès')).email).toBe(NEW_EMAIL)
    const lines = linesOf(spies)
    expect(lines.filter((line) => line.includes('Email changed'))).toEqual([`Email changed ${id}`])
    for (const address of [ines.email, NEW_EMAIL]) expect(lines.join('\n')).not.toContain(address)
  })

  it('writes nothing when the change fails', async () => {
    await useFakeClock()
    const cookie = await ctx.verifiedMember(ines)
    later(MINUTE)
    const link = await askAndConfirm(cookie)
    later(61 * MINUTE)
    const spies = spyConsole()

    const res = await open(link)

    expect(landing(res).error).not.toBeNull()
    expect(linesOf(spies).join('\n')).not.toContain('Email changed')
  })
})

// ─── Corrections après la relecture de la branche (sec-B1, jur-R1, sec-A1 à A4) ─────────────────

/**
 * Le même lien, avec un autre jeton écrit tel quel dans l'adresse (sans réencodage : un « %20 »
 * reste un « %20 »), et la même page de retour.
 */
const withRawToken = (link: URL, raw: string) => {
  const rest = new URLSearchParams(link.search)
  rest.delete('token')
  return new URL(`${link.origin}${link.pathname}?token=${raw}&${rest}`)
}

// L'alphabet du base64url, dans l'ordre : un caractère vaut sa position (6 bits).
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

describe('a first link written another way (sec-B1)', () => {
  // La bibliothèque des JWT accepte plusieurs écritures d'une même signature : des blancs au
  // milieu, ou un dernier caractère dont seuls les bits de remplissage changent. Chacune est le
  // même lien, et ne doit pas envoyer un second e-mail à la nouvelle adresse.
  it('refuses the same first link with a space in its signature, or its last character changed', async () => {
    const cookie = await ctx.verifiedMember(ines)
    expect((await ask(cookie)).status).toBe(200)
    const link = linkOf('changeEmail', ines.email)
    const token = link.searchParams.get('token') ?? ''
    const [header, payload, signature = ''] = token.split('.')
    const last = BASE64URL.indexOf(signature.at(-1) ?? '')
    const variants = [
      `${header}.${payload}.${signature.slice(0, 10)}%20${signature.slice(10)}`,
      `${header}.${payload}.${signature.slice(0, -1)}${BASE64URL[last ^ 1]}`,
    ]

    expect(landing(await open(link))).toEqual({ page: CONFIRMED_PAGE, error: null })
    for (const variant of variants) {
      const res = await open(withRawToken(link, variant))
      expect(res.status, variant).toBe(302)
      expect(landing(res), variant).toEqual({ page: CONFIRMED_PAGE, error: 'LINK_USED' })
    }
    expect(mailsOf('newEmail', NEW_EMAIL)).toHaveLength(1)
  })
})

describe('the link of the second e-mail (jur-R1)', () => {
  // Le second e-mail part vers une adresse pas encore vérifiée, peut-être celle d'un inconnu (une
  // faute de frappe) : son lien ne doit pas laisser lire l'ancienne adresse ni le nom du membre.
  it('carries neither the old address nor the name of the member, however it is decoded', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const link = await askAndConfirm(cookie)
    const raw = link.toString()
    const pieces = [raw, decodeURIComponent(raw), ...decodeURIComponent(raw).split(/[?&=./:]/)]
    const readings = pieces.flatMap((piece) => [
      piece,
      Buffer.from(piece, 'base64url').toString('utf8'),
      Buffer.from(piece, 'hex').toString('utf8'),
    ])

    for (const secret of [ines.email, ines.name]) expect(readings.join('\n')).not.toContain(secret)
    // Témoin : le lien marche toujours.
    expect(landing(await open(link, cookie))).toEqual({ page: DONE_PAGE, error: null })
    expect((await accountOf('Inès')).email).toBe(NEW_EMAIL)
  })

  it('refuses a second link whose token was damaged, and changes nothing', async () => {
    const cookie = await ctx.verifiedMember(ines)
    const link = await askAndConfirm(cookie)
    const token = link.searchParams.get('token') ?? ''
    const middle = Math.floor(token.length / 2)
    const damaged = `${token.slice(0, middle)}${token[middle] === '0' ? '1' : '0'}${token.slice(middle + 1)}`
    const sessions = await sessionCount()

    const res = await open(withRawToken(link, damaged))

    expect(res.status).toBe(302)
    expect(landing(res)).toEqual({ page: DONE_PAGE, error: 'INVALID_TOKEN' })
    expect(await accountOf('Inès')).toMatchObject({ email: ines.email, emailVerified: true })
    expect(await sessionCount()).toBe(sessions)
  })
})

describe('a link with a new address but no known step (sec-A1)', () => {
  // Better Auth a un ancien parcours, sans étape : il change l'adresse aussitôt, la marque non
  // vérifiée et connecte l'appareil. Aucun de nos liens n'en est un ; un tel jeton est refusé.
  it('is refused, and neither the address, its verification nor the sessions change', async () => {
    await ctx.verifiedMember(ines)
    const sessions = await sessionCount()
    const before = ctx.mailer.sent.length
    const token = await createEmailVerificationToken(
      TEST_AUTH_SECRET,
      ines.email,
      'pirate@exemple.fr',
      60 * 60,
    )

    const res = await ctx.request(`/api/auth/verify-email?token=${token}`)

    expect(res.status).toBe(302)
    expect(landing(res)).toEqual({ page: DONE_PAGE, error: 'INVALID_TOKEN' })
    expect(await accountOf('Inès')).toMatchObject({ email: ines.email, emailVerified: true })
    expect(await sessionCount()).toBe(sessions)
    expect(ctx.mailer.sent.slice(before)).toEqual([])
  })
})

describe('the limits, counted before anything else (sec-A3, sec-A4)', () => {
  it('counts malformed requests in the quota of the member', async () => {
    const cookie = await ctx.verifiedMember(ines)
    for (let i = 1; i <= 5; i++) expect((await ask(cookie, {})).status).toBe(400)
    const before = ctx.mailer.sent.length

    // D'une autre connexion : seul le compteur d'Inès peut refuser.
    const res = await ask(cookie, undefined, { 'x-real-ip': '198.51.100.30' })

    expect(res.status).toBe(429)
    expect(ctx.mailer.sent.slice(before)).toEqual([])
  })

  it('refuses a 31st opening of a link from the same connection within 15 minutes', async () => {
    const openFrom = () =>
      ctx.request('/api/auth/verify-email?token=not-a-token', {
        headers: { 'x-real-ip': '198.51.100.31' },
      })
    for (let i = 1; i <= 30; i++) expect((await openFrom()).status, `opening ${i}`).not.toBe(429)

    expect((await openFrom()).status).toBe(429)
  })
})
