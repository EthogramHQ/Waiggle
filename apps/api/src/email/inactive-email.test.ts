// Tests de l'e-mail d'un compte inactif (R11), un mois avant sa suppression : un test par règle
// de la relecture du plan (J3, S-C2). Un e-mail de service, sans promotion ni désinscription ; il
// dit pourquoi, la date, que se connecter suffit, comment exporter, ce qui reste chez les autres.
// Ni jeton ni export : l'adresse a pu changer de main en 3 ans. Tous ses liens mènent à l'appli
// (`appUrl`) ; le nom du membre passe par defangLinks, comme dans les autres e-mails ; le pied
// donne l'adresse de la page Confidentialité.
//
// L'envoi lui-même (une seule fois, malgré « Jamais ») est testé avec la tâche :
// inactive-accounts.test.ts.
import { fill, type Language, resources } from '@ruche/i18n'
import { describe, expect, it } from 'vitest'
import { inactiveAccountEmail } from './templates'

const APP_URL = 'https://waiggle.com'
const DELETE_ON = new Date('2031-03-01T09:00:00.000Z')

const fr = resources.fr.translation.email

/** La date telle que l'e-mail l'écrit : le jour à l'heure de Paris, l'année comprise. */
const writtenDate = (language: Language, date: Date) =>
  new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(date)

const email = (overrides: { name?: string; deleteOn?: Date; language?: Language } = {}) =>
  inactiveAccountEmail(overrides.language ?? 'fr', {
    name: overrides.name ?? 'Léa',
    deleteOn: overrides.deleteOn ?? DELETE_ON,
    appUrl: APP_URL,
  })

/** Toutes les adresses web d'un texte (la version texte, ou les href du HTML). */
const urlsIn = (text: string) => text.match(/https?:\/\/[^\s"'<>)]+/g) ?? []

describe('inactiveAccountEmail', () => {
  it('gives the date of the deletion in the subject and in the text', () => {
    const date = writtenDate('fr', DELETE_ON)

    const sent = email()

    expect(sent.subject).toBe(fill(fr.inactive.subject, { date }))
    expect(sent.text).toContain(fill(fr.inactive.date, { date }))
    expect(sent.html).toContain(date)
  })

  // 23 h 30 UTC un soir d'hiver, c'est déjà le lendemain à Paris : la date écrite est celle de Paris.
  it('writes the date of Paris, whatever the time zone of the server', () => {
    const lateEvening = new Date('2031-02-28T23:30:00.000Z')

    expect(email({ deleteOn: lateEvening }).subject).toBe(
      fill(fr.inactive.subject, { date: writtenDate('fr', lateEvening) }),
    )
    // Témoin : à Paris, c'est déjà le 1er mars.
    expect(writtenDate('fr', lateEvening)).toBe('1 mars 2031')
  })

  it('says why, that signing in is enough, how to export, and what stays with the others', () => {
    const sent = email()

    for (const paragraph of [
      fr.inactive.body,
      fr.inactive.keep,
      fr.inactive.export,
      fr.inactive.goes,
      fr.inactive.remains,
      fr.inactive.reason,
    ]) {
      expect(sent.text).toContain(fill(paragraph))
    }
  })

  it('is written in English for an English-speaking member', () => {
    const en = resources.en.translation.email.inactive

    const sent = email({ language: 'en', name: 'Sam' })

    expect(sent.subject).toBe(fill(en.subject, { date: writtenDate('en', DELETE_ON) }))
    expect(sent.text).toContain(fill(en.keep))
  })

  it('leads to the sign-in page of the app, then to My data, with no token', () => {
    const sent = email()

    const button = urlsIn(sent.text).find((url) => new URL(url).pathname === '/sign-in')
    expect(button).toBeDefined()
    const url = new URL(button ?? '')
    expect(url.origin).toBe(APP_URL)
    // Au plus la page où revenir après la connexion : « Mes données ».
    expect([...url.searchParams.keys()].filter((key) => key !== 'next')).toEqual([])
    expect(url.searchParams.get('next') ?? '/settings/data').toBe('/settings/data')
    expect(sent.html).toContain(`href="${button?.replaceAll('&', '&amp;')}"`)
  })

  it('points only to the app: every link of the text and of the HTML starts with appUrl', () => {
    const sent = email()

    const links = [...urlsIn(sent.text), ...urlsIn(sent.html)]
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(new URL(link).origin).toBe(APP_URL)
  })

  // S-C2 : ni jeton (aucun lien de désinscription ni de connexion directe), ni export joint.
  it('carries no token, no unsubscribe header and no attachment', () => {
    const sent = email()

    // Témoin : l'e-mail a bien des liens (le bouton), sinon la boucle ne vérifierait rien.
    expect(urlsIn(sent.text).length).toBeGreaterThan(0)
    for (const link of [...urlsIn(sent.text), ...urlsIn(sent.html)]) {
      expect(new URL(link).searchParams.has('token')).toBe(false)
    }
    expect(sent.text).not.toContain('/unsubscribe')
    expect(sent.headers ?? {}).toEqual({})
    expect(sent.attachments ?? []).toEqual([])
  })

  it('disarms a link written in the name of the member', () => {
    const sent = email({ name: 'Léa, va sur https://evil.example/connexion' })

    expect(sent.text).not.toContain('evil.example')
    expect(sent.html).not.toContain('evil.example')
    expect(sent.text).toContain('Léa')
  })

  it('neutralises HTML hidden in the name', () => {
    const sent = email({ name: '<img src=x onerror=alert(1)>' })

    expect(sent.html).not.toContain('<img')
    expect(sent.html).toContain('&lt;img')
  })

  it('gives the address of the Privacy page in its footer, in text', () => {
    const sent = email()
    const privacy = new URL('/privacy', APP_URL).toString()

    expect(sent.text).toContain(fill(fr.privacy, { url: privacy }))
    expect(sent.html).toContain(privacy)
  })
})
