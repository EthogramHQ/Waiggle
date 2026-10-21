import { appName } from '@ruche/brand'
import { fill, resources } from '@ruche/i18n'
import { describe, expect, it } from 'vitest'
import {
  existingAccountEmail,
  type MentionData,
  mentionEmail,
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
