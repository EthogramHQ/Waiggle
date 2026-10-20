// Tests de l'e-mail de mentions et de réponses (tranche 6c). Scénario : docs/scenarios/phase-1.md,
// « Précisions (tranche 6c) », « L'e-mail de mention ou de réponse » ; règles détaillées : plan 6c,
// « Les tâches », et les relectures du plan (sécurité S-B1, S-B2, S-A5 ; juridique R5).
//
// L'e-mail est désactivé par défaut : seul un membre qui l'a activé le reçoit. La tâche,
// mentionEmails({ db, mailer, appUrl, apiUrl, secret }, now), passe toutes les 5 minutes : elle
// envoie ce qui attend depuis 15 minutes au moins, en un seul e-mail, une fois par heure au plus.
// Les tests l'appellent eux-mêmes, à l'heure qu'ils choisissent (fausse horloge).
//
// Trois membres : Inès (qui active l'e-mail), Malik et Zoé (qui la mentionnent ou lui répondent).
import { schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mailer } from '../email/mailer'
import type { Email } from '../email/templates'
import { createUnsubscribeToken, readUnsubscribeToken } from '../email/unsubscribe-token'
import { activity } from '../testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from '../testing/context'
import { mentionEmails } from './mention-emails'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let malik: string
let zoe: string
let inesId: string
let zoeId: string
let velo: { id: string } // le projet de Zoé
let meteo: { id: string } // le projet d'Inès

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const START = new Date('2026-06-15T08:00:00.000Z')

const inesAccount = {
  name: 'Inès Morel',
  email: 'ines@example.com',
  password: 'ines-long-password',
}
const malikAccount = { name: 'Malik', email: 'malik@example.com', password: 'malik-long-password' }
const zoeAccount = { name: 'Zoé', email: 'zoe@example.com', password: 'zoe-long-password' }

const fr = resources.fr.translation.email
const en = resources.en.translation.email

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  ines = await ctx.verifiedMember(inesAccount)
  malik = await ctx.verifiedMember(malikAccount)
  zoe = await ctx.verifiedMember(zoeAccount)
  inesId = (await act.me(ines)).id
  zoeId = (await act.me(zoe)).id
  await act.setPreferences(ines, { mentionEmails: true })
  velo = await act.publish(zoe, 'Vélo')
  meteo = await act.publish(ines, 'Météo')
  later(MINUTE)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

const depsWith = (mailer: Mailer = ctx.mailer) => ({
  db: ctx.db,
  mailer,
  appUrl: TEST_APP_URL,
  apiUrl: TEST_API_URL,
  secret: TEST_AUTH_SECRET,
})

/** Lance la tâche à l'heure de la fausse horloge (comme pg-boss, toutes les 5 minutes). */
const runMentions = (mailer?: Mailer) => mentionEmails(depsWith(mailer), new Date())

const subjects = [fill(fr.mentions.subject), fill(en.mentions.subject)]
/** Les e-mails de mentions reçus par une adresse, dans l'ordre d'envoi. */
const mentionsTo = (address: string) =>
  ctx.mailer.sent.filter((email) => email.to === address && subjects.includes(email.subject))

const onlyMentionsTo = (address: string) => {
  const sent = mentionsTo(address)
  expect(sent).toHaveLength(1)
  return sent[0] as Email
}

/** La ligne qui présente un élément : « Malik (@malik) parle de toi dans un commentaire sur… ». */
const line = (
  kind: 'mention' | 'reply',
  title: string,
  name = 'Malik',
  handle = 'malik',
  t: { mentions: Record<'mention' | 'reply', string> } = fr,
) => fill(t.mentions[kind], { name, handle, title })

const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1])

const spyOnLogs = () =>
  (['log', 'info', 'warn', 'error'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  )

describe('when the e-mail goes out', () => {
  it('waits 15 minutes after a mention, then sends it with its excerpt', async () => {
    await act.comment(velo.id, malik, '@ines_morel tu as vu la pluie de demain ?')

    later(14 * MINUTE)
    await runMentions()
    expect(mentionsTo(inesAccount.email)).toEqual([])

    later(2 * MINUTE)
    await runMentions()
    const email = onlyMentionsTo(inesAccount.email)
    expect(email.subject).toBe(fill(fr.mentions.subject))
    expect(email.text).toContain(line('mention', 'Vélo'))
    expect(email.text).toContain('@ines_morel tu as vu la pluie de demain ?')
    expect(email.text).toContain(fill(fr.mentions.button))
    // Il dit pourquoi on le reçoit, et comment l'arrêter (relecture juridique R2).
    expect(email.text).toContain(fill(fr.mentions.reason))
    expect(email.text).toContain(fr.mentions.unsubscribe)
    expect(email.text).toContain(`${TEST_APP_URL}/profile`)
    // L'objet s'affiche sur un écran verrouillé : ni titre ni extrait (relecture juridique R5).
    expect(email.subject).not.toContain('Vélo')
    expect(email.subject).not.toContain('pluie')
  })

  it('gathers in one e-mail everything that arrived in the meantime', async () => {
    const own = await act.comment(velo.id, ines, 'Je propose une carte.')
    later()
    await act.comment(velo.id, malik, '@ines_morel une idée ?')
    later(5 * MINUTE)
    await act.comment(velo.id, zoe, 'Bonne idée, la carte.', own.id)
    later(5 * MINUTE)
    await act.comment(meteo.id, malik, 'Et ici, @ines_morel ?')
    later(6 * MINUTE)

    // La première mention a 16 minutes : tout ce qui attend part avec elle, même la dernière.
    await runMentions()

    const email = onlyMentionsTo(inesAccount.email)
    expect(email.text).toContain(line('mention', 'Vélo'))
    expect(email.text).toContain(line('reply', 'Vélo', 'Zoé', 'zoe'))
    expect(email.text).toContain(line('mention', 'Météo'))
    expect(email.text).toContain('Bonne idée, la carte.')
  })

  it('sends one e-mail an hour at most, then only what is new', async () => {
    await act.comment(velo.id, malik, '@ines_morel premier message.')
    later(16 * MINUTE)
    await runMentions()
    const firstAt = Date.now()
    later(4 * MINUTE)
    await act.comment(velo.id, zoe, '@ines_morel second message.')

    vi.setSystemTime(firstAt + 20 * MINUTE)
    await runMentions()
    vi.setSystemTime(firstAt + HOUR - MINUTE)
    await runMentions()
    expect(mentionsTo(inesAccount.email)).toHaveLength(1)

    vi.setSystemTime(firstAt + HOUR + MINUTE)
    await runMentions()
    const sent = mentionsTo(inesAccount.email)
    expect(sent).toHaveLength(2)
    expect(sent[1]?.text).toContain('second message')
    expect(sent[1]?.text).not.toContain('premier message')
  })

  it('counts the minutes in UTC, whatever the time zone of the database', async () => {
    await act.comment(velo.id, malik, '@ines_morel à l’heure de Paris.')
    // Le fuseau de la connexion change : une date mal comparée (timestamptz contre timestamp) se
    // décalerait de deux heures (Paris est à UTC+2 en juin), et l'e-mail partirait trop tôt.
    await ctx.db.execute(sql`set time zone 'Europe/Paris'`)

    later(14 * MINUTE)
    await runMentions()
    expect(mentionsTo(inesAccount.email)).toEqual([])

    later(2 * MINUTE)
    await runMentions()
    expect(mentionsTo(inesAccount.email)).toHaveLength(1)
  })
})

describe('when nothing goes out', () => {
  it('is off by default', async () => {
    await act.comment(meteo.id, malik, '@ines_morel et @zoe, regardez.')
    later(16 * MINUTE)

    await runMentions()

    expect(await act.preferences(zoe)).toEqual({ weeklyRecap: true, mentionEmails: false })
    expect(mentionsTo(zoeAccount.email)).toEqual([])
    // Témoin : Inès, qui l'a activé, le reçoit.
    expect(mentionsTo(inesAccount.email)).toHaveLength(1)
  })

  it('sends nothing for what the member already saw in the app', async () => {
    await act.setPreferences(zoe, { mentionEmails: true })
    await act.comment(meteo.id, malik, '@ines_morel et @zoe, regardez.')
    later(5 * MINUTE)
    await act.openNotifications(ines)
    later(11 * MINUTE)

    await runMentions()

    expect(mentionsTo(inesAccount.email)).toEqual([])
    // Témoin : Zoé n'a pas ouvert ses notifications.
    expect(mentionsTo(zoeAccount.email)).toHaveLength(1)
  })

  it('sends nothing beyond 24 hours: an old mention never comes back', async () => {
    await act.comment(velo.id, malik, '@ines_morel ancien message.')
    later(24 * HOUR + MINUTE)
    await runMentions()
    expect(mentionsTo(inesAccount.email)).toEqual([])

    await act.comment(velo.id, malik, '@ines_morel nouveau message.')
    later(16 * MINUTE)
    await runMentions()

    const email = onlyMentionsTo(inesAccount.email)
    expect(email.text).toContain('nouveau message')
    expect(email.text).not.toContain('ancien message')
  })

  it('sends nothing for a plain comment on her project: only mentions and replies', async () => {
    await act.comment(meteo.id, malik, 'Super projet.')
    later(16 * MINUTE)

    await runMentions()

    expect(mentionsTo(inesAccount.email)).toEqual([])
  })

  it('sends nothing for a comment that disappeared: deleted, hidden or on a private project', async () => {
    const recettes = await act.publish(zoe, 'Recettes')
    const jardin = await act.publish(zoe, 'Jardin')
    later()
    const deleted = await act.comment(velo.id, malik, '@ines_morel effacé.')
    later()
    await act.deleteComment(velo.id, deleted.id, malik)
    later()
    const hidden = await act.comment(recettes.id, malik, '@ines_morel masqué.')
    later()
    await act.hide(recettes.id, hidden.id, zoe)
    later()
    await act.comment(jardin.id, malik, '@ines_morel devenu privé.')
    later()
    await act.setVisibility(jardin.id, zoe, 'private')
    later()
    // Témoin : la mention sur Météo reste.
    await act.comment(meteo.id, malik, '@ines_morel toujours là.')
    later(16 * MINUTE)

    await runMentions()

    const email = onlyMentionsTo(inesAccount.email)
    expect(email.text).toContain('toujours là')
    for (const gone of ['effacé', 'masqué', 'devenu privé', 'Vélo', 'Recettes', 'Jardin']) {
      expect(email.text).not.toContain(gone)
      expect(email.html).not.toContain(gone)
    }
  })
})

describe('only once', () => {
  it('sends one e-mail only when the task runs twice at the same time', async () => {
    await act.comment(velo.id, malik, '@ines_morel une fois.')
    later(16 * MINUTE)
    const now = new Date()

    await mentionEmails(depsWith(), now)
    await mentionEmails(depsWith(), now)
    // PGlite n'a qu'une connexion : les deux passent l'une après l'autre ; c'est la prise atomique
    // de la date d'envoi qui doit décider.
    await Promise.all([mentionEmails(depsWith(), now), mentionEmails(depsWith(), now)])

    expect(mentionsTo(inesAccount.email)).toHaveLength(1)
  })

  it('sends nothing to a member who unsubscribes while the e-mails go out', async () => {
    await act.setPreferences(zoe, { mentionEmails: true })
    await act.comment(meteo.id, malik, '@ines_morel et @zoe, regardez.')
    later(16 * MINUTE)
    const ids = new Map([
      [inesAccount.email, inesId],
      [zoeAccount.email, zoeId],
    ])
    let unsubscribed = false
    const mailer: Mailer = {
      async send(email) {
        if (!unsubscribed) {
          unsubscribed = true
          const other = [...ids].find(([address]) => address !== email.to)?.[1] ?? ''
          const token = createUnsubscribeToken(TEST_AUTH_SECRET, other, 'mentions')
          const res = await ctx.request(`/v1/email/unsubscribe?${new URLSearchParams({ token })}`, {
            method: 'POST',
          })
          expect(res.status).toBe(204)
        }
        await ctx.mailer.send(email)
      },
    }

    await runMentions(mailer)

    expect([...mentionsTo(inesAccount.email), ...mentionsTo(zoeAccount.email)]).toHaveLength(1)
  })

  it('goes on with the other members when one of them fails, and logs it without the address', async () => {
    await act.setPreferences(zoe, { mentionEmails: true })
    await act.comment(meteo.id, malik, '@ines_morel et @zoe, regardez.')
    later(16 * MINUTE)
    const logs = spyOnLogs()
    const mailer: Mailer = {
      async send(email) {
        if (email.to === zoeAccount.email) throw new Error(`refused: ${email.to}`)
        await ctx.mailer.send(email)
      },
    }

    await runMentions(mailer)

    expect(mentionsTo(inesAccount.email)).toHaveLength(1)
    expect(logs.some((spy) => spy.mock.calls.length > 0)).toBe(true)
    expect(JSON.stringify(logs.map((spy) => spy.mock.calls))).not.toContain(zoeAccount.email)
  })

  it('sends nothing to an account that is not verified', async () => {
    await act.comment(meteo.id, malik, '@ines_morel regarde.')
    later(16 * MINUTE)
    await ctx.db.execute(sql`update "user" set email_verified = false where id = ${inesId}`)

    await runMentions()

    expect(mentionsTo(inesAccount.email)).toEqual([])
    expect(await ctx.db.select().from(schema.user)).toHaveLength(3)
  })
})

describe('what the e-mail shows', () => {
  it('carries the one-click unsubscribe headers, for mention e-mails only', async () => {
    await act.comment(velo.id, malik, '@ines_morel regarde.')
    later(16 * MINUTE)

    await runMentions()

    const email = onlyMentionsTo(inesAccount.email)
    expect(email.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    const header = email.headers?.['List-Unsubscribe'] ?? ''
    const url = new URL(header.slice(1, -1))
    expect(url.origin + url.pathname).toBe(`${TEST_API_URL}/v1/email/unsubscribe`)
    const token = url.searchParams.get('token') ?? ''
    expect(readUnsubscribeToken(TEST_AUTH_SECRET, token)).toEqual({
      userId: inesId,
      kind: 'mentions',
    })
    expect(email.text).toContain(token)
  })

  it('has only links to the app or the API, no image, and the language of the page', async () => {
    await act.comment(velo.id, malik, '@ines_morel regarde.')
    later(16 * MINUTE)

    await runMentions()

    const email = onlyMentionsTo(inesAccount.email)
    const hrefs = hrefsOf(email.html)
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(
        href?.startsWith(`${TEST_APP_URL}/`) || href?.startsWith(`${TEST_API_URL}/`),
        href,
      ).toBe(true)
    }
    expect(email.html).not.toMatch(/<img/i)
    expect(email.html).toContain('<html lang="fr"')
  })

  it('shows no address written by a member: in the excerpt, the name or the title', async () => {
    await act.updateProfile(malik, { name: 'support.example.com' })
    const promo = await act.publish(zoe, 'Promo shop.example.net')
    later()
    await act.comment(
      promo.id,
      malik,
      '@ines_morel ton compte sera fermé : reconnecte-toi sur https://evil.example/login ou waiggle-login.com',
    )
    later(16 * MINUTE)

    await runMentions()

    const email = onlyMentionsTo(inesAccount.email)
    for (const part of [email.subject, email.text, email.html]) {
      for (const address of [
        'evil.example',
        'waiggle-login.com',
        'support.example.com',
        'shop.example.net',
      ]) {
        expect(part).not.toContain(address)
      }
    }
    expect(email.text).toContain('[lien]')
    expect(email.text).toContain('(@malik)')
  })

  it('escapes the HTML hidden in an excerpt', async () => {
    await act.comment(velo.id, malik, '@ines_morel <img src=x onerror=alert(1)>')
    later(16 * MINUTE)

    await runMentions()

    const email = onlyMentionsTo(inesAccount.email)
    expect(email.html).not.toMatch(/<img/i)
    expect(email.html).toContain('&lt;img')
  })

  it('is written in the language of the member', async () => {
    await act.updateProfile(ines, { language: 'en' })
    await act.comment(velo.id, malik, '@ines_morel look.')
    later(16 * MINUTE)

    await runMentions()

    const email = onlyMentionsTo(inesAccount.email)
    expect(email.subject).toBe(fill(en.mentions.subject))
    expect(email.text).toContain(line('mention', 'Vélo', 'Malik', 'malik', en))
    expect(email.text).toContain(en.mentions.unsubscribe)
    expect(email.html).toContain('<html lang="en"')
  })
})
