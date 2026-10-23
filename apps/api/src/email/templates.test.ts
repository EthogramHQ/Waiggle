import { appName, contactEmail } from '@ruche/brand'
import { fill, resources } from '@ruche/i18n'
import { describe, expect, it } from 'vitest'
import {
  existingAccountEmail,
  type MentionData,
  mentionEmail,
  moderationAlertEmail,
  type NotificationLinks,
  type RecapData,
  recapEmail,
  verificationEmail,
} from './templates'

describe('verificationEmail', () => {
  const url = 'https://api.waiggle.io/api/auth/verify-email?token=abc'

  it('is written in French, with the link in the text and in the button', () => {
    const email = verificationEmail('fr', { name: 'Léa', url })

    expect(email.subject).toBe(`Active ton compte ${appName}`)
    expect(email.text).toContain('Bonjour Léa,')
    expect(email.text).toContain(url)
    expect(email.html).toContain(`href="${url}"`)
  })

  it('is written in English for an English-speaking member', () => {
    const email = verificationEmail('en', { name: 'Sam', url })

    expect(email.subject).toBe(`Activate your ${appName} account`)
    expect(email.text).toContain('Hi Sam,')
  })

  it('neutralises HTML hidden in a name, so an email cannot be booby-trapped', () => {
    const email = verificationEmail('fr', { name: '<img src=x onerror=alert(1)>', url })

    expect(email.html).not.toContain('<img')
    expect(email.html).toContain('&lt;img')
  })
})

describe('existingAccountEmail', () => {
  it('tells the owner someone tried to sign up, and points to sign-in', () => {
    const signInUrl = 'https://waiggle.io/sign-in'
    const email = existingAccountEmail('fr', { name: 'Léa', signInUrl })

    expect(email.subject).toBe(`Tentative d’inscription sur ${appName}`)
    expect(email.text).toContain(signInUrl)
  })
})

// Ajoutés avec les corrections des relectures de la branche 6c (sécurité B1, A2 ; design 5 à 9).
const links: NotificationLinks = {
  button: 'https://waiggle.io/notifications',
  unsubscribe: 'https://waiggle.io/unsubscribe?token=t',
  manage: 'https://waiggle.io/profile',
  oneClick: 'https://api.waiggle.io/v1/email/unsubscribe?token=t',
}

const recapData = (overrides: Partial<RecapData> = {}): RecapData => ({
  name: 'Inès Morel',
  lines: [{ kind: 'comment', name: 'Malik', handle: 'malik', title: 'Météo' }],
  more: 0,
  reactions: 0,
  follows: 0,
  first: false,
  last: false,
  links,
  ...overrides,
})

const mentionData = (overrides: Partial<MentionData> = {}): MentionData => ({
  name: 'Inès Morel',
  items: [
    { kind: 'mention', name: 'Malik', handle: 'malik', title: 'Vélo', excerpt: '@ines_morel ?' },
  ],
  links,
  ...overrides,
})

const fr = resources.fr.translation.email
const en = resources.en.translation.email

describe('a name written to trap the account e-mails', () => {
  const trap = 'Ton compte est bloqué, va sur waiggle-login.com'

  it('turns the address of a name into « [lien] » in the verification e-mail', () => {
    const email = verificationEmail('fr', { name: trap, url: 'https://api.waiggle.io/verify' })

    for (const part of [email.text, email.html]) {
      expect(part).not.toContain('waiggle-login.com')
      expect(part).toContain('[lien]')
    }
  })

  it('does the same in the e-mail sent to the owner of an existing account, in her language', () => {
    const email = existingAccountEmail('en', { name: trap, signInUrl: 'https://waiggle.io/x' })

    for (const part of [email.text, email.html]) {
      expect(part).not.toContain('waiggle-login.com')
      expect(part).toContain('[link]')
    }
  })
})

describe('the addresses written by members in a notification e-mail', () => {
  it('turns a domain glued to a hyphen into « [lien] », in a line of the recap', () => {
    const email = recapEmail(
      'fr',
      recapData({
        lines: [
          {
            kind: 'comment',
            name: 'Support -waiggle-login.com',
            handle: 'mallory',
            title: 'Météo',
          },
        ],
      }),
    )

    for (const part of [email.subject, email.text, email.html]) {
      expect(part).not.toContain('waiggle-login.com')
    }
    expect(email.text).toContain('Support -[lien] (@mallory)')
  })

  it('writes the placeholder in the language of the e-mail', () => {
    const recap = recapEmail(
      'en',
      recapData({
        lines: [{ kind: 'comment', name: 'evil.com', handle: 'mallory', title: 'www.evil.com' }],
      }),
    )
    const mention = mentionEmail(
      'en',
      mentionData({
        items: [
          { kind: 'reply', name: 'Malik', handle: 'malik', title: 'Vélo', excerpt: 'see evil.com' },
        ],
      }),
    )

    for (const email of [recap, mention]) {
      expect(email.text).toContain(en.link)
      expect(email.text).not.toContain(fr.link)
      expect(email.text).not.toContain('evil.com')
    }
  })
})

describe('the layout of a notification e-mail', () => {
  it('starts with the name of the app, then the heading in bold, then the greeting', () => {
    const recap = recapEmail('fr', recapData())
    const mention = mentionEmail('fr', mentionData())

    for (const [email, heading] of [
      [recap, fill(fr.recap.heading)],
      [mention, fill(fr.mentions.heading)],
    ] as const) {
      const name = email.html.indexOf(`>${appName}</p>`)
      const title = email.html.indexOf(`>${heading}</p>`)
      const greeting = email.html.indexOf('Bonjour Inès Morel')
      expect(name).toBeGreaterThan(0)
      expect(title).toBeGreaterThan(name)
      expect(greeting).toBeGreaterThan(title)
      // Le titre est en gras.
      expect(email.html.slice(email.html.lastIndexOf('<p', title), title)).toContain(
        'font-weight:bold',
      )
    }
  })

  it('stacks the footer links, 14 px at least, without a middle dot between them', () => {
    const email = recapEmail('fr', recapData())

    expect(email.html).not.toContain(' · ')
    for (const label of [fr.recap.unsubscribe, fr.manage]) {
      const at = email.html.indexOf(`>${label}</a>`)
      expect(at, label).toBeGreaterThan(0)
      // Chaque lien a son propre paragraphe, en 14 px au moins, avec du jeu autour.
      const paragraph = email.html.slice(email.html.lastIndexOf('<p', at), at)
      expect(paragraph, label).not.toContain('</a>')
      const size = Number(/font-size:(\d+)px/.exec(paragraph)?.[1])
      expect(size, label).toBeGreaterThanOrEqual(14)
      expect(paragraph, label).toMatch(/padding:\d+px/)
    }
  })

  it('says it is the last recap for now right under the introduction, before the button', () => {
    const email = recapEmail('fr', recapData({ last: true }))
    const last = fill(fr.recap.last)

    const at = email.html.indexOf(last)
    expect(at).toBeGreaterThan(email.html.indexOf(fill(fr.recap.intro)))
    expect(at).toBeLessThan(email.html.indexOf(fr.recap.button))
    // Au corps normal, pas en petites lettres grises.
    expect(email.html.slice(email.html.lastIndexOf('<p', at), at)).toContain('font-size:16px')
    expect(email.text.indexOf(last)).toBeLessThan(email.text.indexOf(fr.recap.button))
  })

  it('tightens its margins on a narrow screen', () => {
    const email = mentionEmail('fr', mentionData())

    expect(email.html).toMatch(/@media \(max-width:480px\)/)
    expect(email.html).toContain('class="card"')
  })
})

// ─── Tranche 7a ──────────────────────────────────────────────────────────────────────────────────

// Règle 23 de la relecture du plan : l'adresse de contact dans le pied de chaque e-mail, en texte,
// jamais en lien « mailto: » (tout lien d'un e-mail mène à l'appli ou à l'API).
describe('the contact address in the footer', () => {
  const emails = () => [
    verificationEmail('fr', { name: 'Léa', url: 'https://api.waiggle.io/verify' }),
    existingAccountEmail('en', { name: 'Sam', signInUrl: 'https://waiggle.io/sign-in' }),
    recapEmail('fr', recapData()),
    mentionEmail('en', mentionData()),
    moderationAlertEmail('fr', { name: 'Louis', count: 2, url: 'https://waiggle.io/moderation' }),
  ]

  it('is written in every e-mail, as text and never as a link', () => {
    for (const email of emails()) {
      expect(email.text, email.subject).toContain(contactEmail)
      expect(email.html, email.subject).toContain(contactEmail)
      expect(email.html, email.subject).not.toContain('mailto:')
      expect(email.html, email.subject).not.toMatch(new RegExp(`href="[^"]*${contactEmail}`))
    }
  })
})

// L'e-mail d'alerte à l'administrateur (plan 7a, « Tâche et e-mail » ; précision 5) : le nombre
// de signalements en attente et un lien vers « Modération », sans aucun extrait.
describe('moderationAlertEmail', () => {
  const url = 'https://waiggle.io/moderation'

  it('gives the number of pending reports and a button to the moderation screen', () => {
    const email = moderationAlertEmail('fr', { name: 'Louis', count: 3, url })

    expect(email.subject).toBe(fill(fr.moderationAlert.subject))
    expect(email.text).toContain('Bonjour Louis')
    expect(email.text).toContain(fill(fr.moderationAlert.body_other, { count: '3' }))
    expect(email.text).toContain(url)
    expect(email.text).toContain(fill(fr.moderationAlert.reason))
    expect(email.html).toContain(`href="${url}"`)
    expect(email.html).toContain(`>${fill(fr.moderationAlert.button)}</a>`)
  })

  it('speaks of one report in the singular, and in English for an English-speaking administrator', () => {
    expect(moderationAlertEmail('fr', { name: 'Louis', count: 1, url }).text).toContain(
      fill(fr.moderationAlert.body_one, { count: '1' }),
    )
    const english = moderationAlertEmail('en', { name: 'Louis', count: 2, url })
    expect(english.subject).toBe(fill(en.moderationAlert.subject))
    expect(english.text).toContain(fill(en.moderationAlert.body_other, { count: '2' }))
  })

  it('links to the app only', () => {
    const email = moderationAlertEmail('fr', { name: 'Louis', count: 2, url })

    const hrefs = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? '')
    expect(hrefs).toContain(url)
    for (const href of hrefs) expect(href.startsWith('https://waiggle.io/'), href).toBe(true)
  })
})
