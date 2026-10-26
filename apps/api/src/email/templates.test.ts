import { appName, contactEmail } from '@ruche/brand'
import { fill, resources } from '@ruche/i18n'
import { describe, expect, it } from 'vitest'
import {
  changeEmailConfirmationEmail,
  emailChangedEmail,
  existingAccountEmail,
  type MentionData,
  mentionEmail,
  moderationAlertEmail,
  type NotificationLinks,
  newEmailVerificationEmail,
  type RecapData,
  recapEmail,
  verificationEmail,
} from './templates'

describe('verificationEmail', () => {
  const url = 'https://api.waiggle.com/api/auth/verify-email?token=abc'

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
    const signInUrl = 'https://waiggle.com/sign-in'
    const email = existingAccountEmail('fr', { name: 'Léa', signInUrl })

    expect(email.subject).toBe(`Tentative d’inscription sur ${appName}`)
    expect(email.text).toContain(signInUrl)
  })
})

// Ajoutés avec les corrections des relectures de la branche 6c (sécurité B1, A2 ; design 5 à 9).
const links: NotificationLinks = {
  button: 'https://waiggle.com/notifications',
  unsubscribe: 'https://waiggle.com/unsubscribe?token=t',
  manage: 'https://waiggle.com/profile',
  oneClick: 'https://api.waiggle.com/v1/email/unsubscribe?token=t',
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
    const email = verificationEmail('fr', { name: trap, url: 'https://api.waiggle.com/verify' })

    for (const part of [email.text, email.html]) {
      expect(part).not.toContain('waiggle-login.com')
      expect(part).toContain('[lien]')
    }
  })

  it('does the same in the e-mail sent to the owner of an existing account, in her language', () => {
    const email = existingAccountEmail('en', { name: trap, signInUrl: 'https://waiggle.com/x' })

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
    verificationEmail('fr', { name: 'Léa', url: 'https://api.waiggle.com/verify' }),
    existingAccountEmail('en', { name: 'Sam', signInUrl: 'https://waiggle.com/sign-in' }),
    recapEmail('fr', recapData()),
    mentionEmail('en', mentionData()),
    moderationAlertEmail('fr', { name: 'Louis', count: 2, url: 'https://waiggle.com/moderation' }),
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
  const url = 'https://waiggle.com/moderation'

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
    for (const href of hrefs) expect(href.startsWith('https://waiggle.com/'), href).toBe(true)
  })
})

// ─── Tranche « adresse » : les trois e-mails d'un changement d'adresse ──────────────────────────
// 1. à l'adresse actuelle, pour donner son accord (changeEmailConfirmationEmail) ;
// 2. à la nouvelle adresse, pour la vérifier (newEmailVerificationEmail) ;
// 3. à l'ancienne adresse, une fois le changement fait (emailChangedEmail).
// Ce sont des e-mails de service : ni publicité, ni lien de désinscription.

describe('changeEmailConfirmationEmail', () => {
  const url = 'https://api.waiggle.com/api/auth/verify-email?token=abc'
  const data = { name: 'Inès', newEmail: 'ines.b@exemple.fr', url }

  it('is written in French, cites the new address, and links to the confirmation', () => {
    const email = changeEmailConfirmationEmail('fr', data)

    expect(email.subject).toBe(fill(fr.changeEmail.subject))
    expect(email.text).toContain(fill(fr.greeting, { name: 'Inès' }))
    for (const sentence of [
      fr.changeEmail.body,
      fr.changeEmail.next,
      fr.changeEmail.expires,
      fr.changeEmail.ignore,
    ]) {
      expect(email.text).toContain(fill(sentence))
    }
    expect(email.text).toContain(url)
    expect(email.html).toContain(`href="${url}"`)
    expect(email.html).toContain(`>${fill(fr.changeEmail.button)}</a>`)
  })

  it('is written in English for an English-speaking member', () => {
    const email = changeEmailConfirmationEmail('en', { ...data, name: 'Sam' })

    expect(email.subject).toBe(fill(en.changeEmail.subject))
    expect(email.text).toContain(fill(en.greeting, { name: 'Sam' }))
    expect(email.text).toContain(fill(en.changeEmail.ignore))
  })
})

describe('newEmailVerificationEmail', () => {
  const url = 'https://api.waiggle.com/api/auth/verify-email?token=def'

  it('is written in French, with the link in the text and in the button', () => {
    const email = newEmailVerificationEmail('fr', { url })

    expect(email.subject).toBe(fill(fr.newEmail.subject))
    for (const sentence of [fr.newEmail.body, fr.newEmail.expires, fr.newEmail.ignore]) {
      expect(email.text).toContain(fill(sentence))
    }
    expect(email.text).toContain(url)
    expect(email.html).toContain(`href="${url}"`)
    expect(email.html).toContain(`>${fill(fr.newEmail.button)}</a>`)
  })

  // Avec une faute de frappe, cet e-mail part chez un inconnu (plan, S6 et J6) : il ne lui
  // apprend ni le nom du membre ni son adresse actuelle. La salutation est neutre, et la seule
  // adresse écrite est celle pour nous écrire.
  it('greets nobody by name and gives no address but the contact one', () => {
    for (const language of ['fr', 'en'] as const) {
      const email = newEmailVerificationEmail(language, { url })
      const t = resources[language].translation.email

      expect(email.subject).toBe(fill(t.newEmail.subject))
      expect(email.text.split('\n')[0]).toBe(fill(t.newEmail.greeting))
      const addresses = (email.text.match(/[^\s@]+@[^\s@]+/g) ?? []).map((found: string) =>
        found.replace(/[.,;:!?)]+$/, ''),
      )
      expect(new Set(addresses)).toEqual(new Set([contactEmail]))
    }
  })
})

describe('emailChangedEmail', () => {
  const data = { name: 'Inès', newEmail: 'ines.b@exemple.fr' }

  // Décision de Louis du 26/10/2026 (relecture juridique R6) : aucun bouton ni lien ; le seul
  // geste proposé est d'écrire au contact, en texte.
  it('tells the old address the new one, with no button nor link, only the contact to write to', () => {
    const email = emailChangedEmail('fr', data)

    expect(email.subject).toBe(fill(fr.emailChanged.subject))
    expect(email.text).toContain(fill(fr.greeting, { name: 'Inès' }))
    for (const sentence of [fr.emailChanged.body, fr.emailChanged.after, fr.emailChanged.help]) {
      expect(email.text).toContain(fill(sentence))
    }
    expect(email.html).not.toMatch(/<a\s/i)
    expect(email.text).not.toMatch(/https?:\/\//)
  })

  it('is written in English for an English-speaking member', () => {
    const email = emailChangedEmail('en', { ...data, name: 'Sam' })

    expect(email.subject).toBe(fill(en.emailChanged.subject))
    expect(email.text).toContain(fill(en.greeting, { name: 'Sam' }))
    expect(email.text).toContain(fill(en.emailChanged.help))
  })
})

describe('the new address written in the e-mails of an address change', () => {
  // Une adresse valide, avec une apostrophe à échapper en HTML et un « + ».
  const newEmail = "o'brien+x@exemple.fr"
  const emails = () => [
    changeEmailConfirmationEmail('fr', {
      name: 'Inès',
      newEmail,
      url: 'https://api.waiggle.com/v',
    }),
    emailChangedEmail('en', { name: 'Sam', newEmail }),
  ]

  // Plan, S10 et J6 : l'adresse se lit telle que saisie, seule sur sa ligne, pour qu'une faute de
  // frappe saute aux yeux. Elle n'est pas filtrée en « [lien] » (le membre doit la reconnaître),
  // mais échappée dans le HTML.
  it('stands alone on its line, as typed, escaped in the HTML', () => {
    for (const email of emails()) {
      expect(email.text.split('\n'), email.subject).toContain(newEmail)
      expect(email.html, email.subject).toMatch(/>o&#39;brien\+x@exemple\.fr</)
      expect(email.html, email.subject).not.toContain("o'brien")
      for (const part of [email.text, email.html]) {
        expect(part, email.subject).not.toMatch(/\[lien\]|\[link\]/)
      }
    }
  })
})

describe('a name written to trap the e-mails of an address change', () => {
  const trap = 'Ton compte est bloqué, va sur waiggle-login.com'

  it('turns the address of a name into « [lien] », in the language of the e-mail', () => {
    const confirmation = changeEmailConfirmationEmail('fr', {
      name: trap,
      newEmail: 'ines.b@exemple.fr',
      url: 'https://api.waiggle.com/v',
    })
    const changed = emailChangedEmail('en', { name: trap, newEmail: 'ines.b@exemple.fr' })

    for (const part of [confirmation.text, confirmation.html]) {
      expect(part).not.toContain('waiggle-login.com')
      expect(part).toContain('[lien]')
    }
    for (const part of [changed.text, changed.html]) {
      expect(part).not.toContain('waiggle-login.com')
      expect(part).toContain('[link]')
    }
  })
})

describe('the rules shared by the e-mails of an address change', () => {
  const emails = () => [
    changeEmailConfirmationEmail('fr', {
      name: 'Inès',
      newEmail: 'ines.b@exemple.fr',
      url: 'https://api.waiggle.com/api/auth/verify-email?token=abc',
    }),
    newEmailVerificationEmail('en', {
      url: 'https://api.waiggle.com/api/auth/verify-email?token=def',
    }),
    emailChangedEmail('fr', { name: 'Inès', newEmail: 'ines.b@exemple.fr' }),
  ]

  it('give the contact address, as text and never as a link', () => {
    for (const email of emails()) {
      expect(email.text, email.subject).toContain(contactEmail)
      expect(email.html, email.subject).toContain(contactEmail)
      expect(email.html, email.subject).not.toContain('mailto:')
    }
  })

  it('link to the app or the API only, with no image and no unsubscribe link', () => {
    for (const email of emails()) {
      const hrefs = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? '')
      // Le bouton, rien d'autre ; et aucun dans l'e-mail final (décision de Louis du 26/10, R6).
      const final =
        email.subject === fill(en.emailChanged.subject) ||
        email.subject === fill(fr.emailChanged.subject)
      expect(hrefs, email.subject).toHaveLength(final ? 0 : 1)
      for (const href of hrefs) {
        expect(/^https:\/\/(api\.)?waiggle\.com\//.test(href), href).toBe(true)
      }
      expect(email.html, email.subject).not.toMatch(/<img|unsubscribe/i)
      expect(email.headers, email.subject).toBeUndefined()
    }
  })

  // Un objet s'affiche sur un écran verrouillé : il ne cite aucune adresse.
  it('have a fixed subject, without any address', () => {
    for (const email of emails()) {
      expect(email.subject).not.toContain('@')
      expect(email.subject).not.toContain('exemple.fr')
    }
  })
})
