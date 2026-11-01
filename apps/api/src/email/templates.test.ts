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
  passwordChangedEmail,
  type RecapData,
  recapEmail,
  resetPasswordEmail,
  suspensionEmail,
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
  // R2 (jur-B2) : le même e-mail part quand quelqu'un s'inscrit avec l'adresse, et quand un nouveau
  // membre corrige son adresse vers elle (A4) : le texte est vrai pour les deux voies, il ne parle
  // plus d'« inscription ».
  it('tells the owner someone used her address, and points to sign-in', () => {
    const signInUrl = 'https://waiggle.com/sign-in'
    const email = existingAccountEmail('fr', { name: 'Léa', signInUrl })

    expect(email.subject).toBe(fill(fr.existingAccount.subject))
    expect(email.subject).toContain(appName)
    expect(email.text).toContain(fill(fr.existingAccount.body))
    expect(email.text).toContain(signInUrl)
    for (const part of [email.subject, email.text]) expect(part).not.toMatch(/inscri/i)
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
    suspensionEmail('en', {
      endsAt: null,
      ground: 'rules',
      explanation: 'Repeated insults.',
      afterReport: false,
    }),
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

// ─── Tranche 7c : l'e-mail de suspension ─────────────────────────────────────────────────────────
// Un e-mail de service (article 17 du DSA), le seul de la suspension : la raison, l'explication,
// la fin (ou « jusqu'à nouvel ordre »), ce qu'on peut encore faire, comment contester. Ni le nom de
// l'administrateur, ni qui a signalé, ni lien de désinscription, ni image.
describe('suspensionEmail', () => {
  // J4 : une fin à 23 h 30 UTC, un soir de novembre (Paris est alors à UTC+1), s'écrit le
  // lendemain à 0 h 30, heure de Paris, quelle que soit la langue.
  const endsAt = new Date('2026-11-03T23:30:00.000Z')
  const explanation = 'Messages insultants répétés sous les projets des autres.'

  it('gives the ground, the explanation, the end at Paris time, what stays possible and how to contest', () => {
    const email = suspensionEmail('fr', { endsAt, ground: 'rules', explanation, afterReport: true })
    const t = fr.suspension

    expect(email.subject).toBe(fill(t.subject))
    for (const line of [
      fill(t.bodyAfterReport),
      fill(t.until, { date: '4 novembre 2026', time: '00:30' }),
      fill(t.earlier),
      fill(t.grounds.rules),
      fill(t.explanation, { explanation }),
      fill(t.meanwhile),
      fill(t.contest),
    ]) {
      expect(email.text).toContain(line)
    }
    expect(email.text).not.toContain('3 novembre')
    expect(email.text).toContain(contactEmail)
  })

  it('says « until further notice » for an endless suspension, in English for an English-speaking member', () => {
    const email = suspensionEmail('en', {
      endsAt: null,
      ground: 'illegal',
      explanation: 'Illegal content.',
      afterReport: false,
    })
    const t = en.suspension

    expect(email.subject).toBe(fill(t.subject))
    expect(email.text).toContain(fill(t.body))
    expect(email.text).toContain(fill(t.indefinite))
    expect(email.text).toContain(fill(t.grounds.illegal))
    expect(email.text).not.toContain(fill(t.bodyAfterReport))
    expect(email.text).not.toContain('(Paris time)')
  })

  it('writes the end at Paris time in English too', () => {
    const email = suspensionEmail('en', {
      endsAt,
      ground: 'rules',
      explanation,
      afterReport: false,
    })

    expect(email.text).toContain('November 4, 2026')
    expect(email.text).not.toContain('November 3')
    expect(email.text).toContain('(Paris time)')
  })

  it('turns an address in the explanation into « [lien] », and escapes its HTML', () => {
    const email = suspensionEmail('fr', {
      endsAt,
      ground: 'rules',
      explanation: 'Va voir https://evil.example/piege et <b>clique</b>.',
      afterReport: false,
    })

    expect(email.text).not.toContain('evil.example')
    expect(email.html).not.toContain('evil.example')
    expect(email.text).toContain(fr.link)
    expect(email.html).not.toContain('<b>clique')
    expect(email.html).toContain('&lt;b&gt;')
  })

  // Relecture de design de la branche (7c) : l'explication est un texte libre. Un mot de 76
  // caractères sans espace faisait défiler l'e-mail de 431 px à l'horizontale sur un écran de
  // 320 px. Son paragraphe, et lui seul, se coupe n'importe où quand un mot ne tient pas.
  it('lets a very long word of the explanation break anywhere, and only in its paragraph', () => {
    const longWord = 'a'.repeat(76)
    const email = suspensionEmail('fr', {
      endsAt,
      ground: 'rules',
      explanation: `Voir ${longWord}.`,
      afterReport: false,
    })

    const paragraphs = [...email.html.matchAll(/<p style="([^"]*)">([^<]*)<\/p>/g)]
    const styleOf = (text: string) => paragraphs.find(([, , inner]) => inner?.includes(text))?.[1]
    expect(styleOf(longWord)).toContain('overflow-wrap:anywhere')
    expect(styleOf(longWord)).toContain('word-break:break-word')
    // Témoin : un autre paragraphe garde le corps ordinaire.
    const meanwhile = fill(fr.suspension.meanwhile)
    expect(styleOf(meanwhile.slice(0, 20))).toBeDefined()
    expect(styleOf(meanwhile.slice(0, 20))).not.toContain('overflow-wrap')
  })

  it('links to nothing outside the app, with no image, no unsubscribe link and no tracker', () => {
    for (const email of [
      suspensionEmail('fr', { endsAt, ground: 'rules', explanation, afterReport: false }),
      suspensionEmail('en', { endsAt: null, ground: 'illegal', explanation, afterReport: true }),
    ]) {
      const hrefs = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? '')
      for (const href of hrefs) expect(href.startsWith('https://waiggle.com/'), href).toBe(true)
      expect(email.html).not.toMatch(/<img|unsubscribe|mailto:/i)
      expect(email.headers).toBeUndefined()
    }
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

  // Relecture de design des-E1 et des-E3 : une adresse n'a pas d'espace ; un paragraphe ordinaire
  // ne la coupe qu'aux tirets, et à 320 px une adresse de 88 caractères faisait défiler l'e-mail
  // de 224 px. Son paragraphe la coupe n'importe où, et la met en gras pour qu'elle se voie.
  it('is drawn in bold in a paragraph of its own that may break it anywhere', () => {
    for (const email of emails()) {
      const paragraph = email.html.match(/<p style="([^"]*)">o&#39;brien\+x@exemple\.fr<\/p>/)
      expect(paragraph, email.subject).not.toBeNull()
      const style = paragraph?.[1] ?? ''
      for (const rule of ['font-weight:bold', 'word-break:break-all', 'overflow-wrap:anywhere']) {
        expect(style, email.subject).toContain(rule)
      }
    }
  })
})

describe('the help to write to us in the e-mails of an address change', () => {
  // des-E2 et des-E4 (décisions de Louis du 26/10/2026) : « Ce n'est pas toi ? » est le geste qui
  // compte s'il s'agit d'un vol de compte. Un paragraphe au corps normal, pas une note grise, et
  // l'adresse de contact en gras, en texte (jamais en lien « mailto: »).
  const cases = () => [
    {
      email: changeEmailConfirmationEmail('fr', {
        name: 'Inès',
        newEmail: 'ines.b@exemple.fr',
        url: 'https://api.waiggle.com/v',
      }),
      sentence: fr.changeEmail.ignore,
    },
    {
      email: changeEmailConfirmationEmail('en', {
        name: 'Sam',
        newEmail: 'ines.b@exemple.fr',
        url: 'https://api.waiggle.com/v',
      }),
      sentence: en.changeEmail.ignore,
    },
    {
      email: emailChangedEmail('fr', { name: 'Inès', newEmail: 'ines.b@exemple.fr' }),
      sentence: fr.emailChanged.help,
    },
    {
      email: emailChangedEmail('en', { name: 'Sam', newEmail: 'ines.b@exemple.fr' }),
      sentence: en.emailChanged.help,
    },
  ]

  it('is a paragraph of normal size, with the contact address in bold', () => {
    for (const { email, sentence } of cases()) {
      const [before = ''] = sentence.split('{{contactEmail}}')
      const opening = escapeForTest(fill(before))
      const paragraph = email.html.match(new RegExp(`<p style="([^"]*)">${opening}(.*?)</p>`))
      expect(paragraph, email.subject).not.toBeNull()
      expect(paragraph?.[1], email.subject).toBe('font-size:16px;line-height:1.5')
      expect(paragraph?.[2], email.subject).toContain(`<strong>${contactEmail}</strong>`)
      expect(email.text, email.subject).toContain(fill(sentence))
    }
  })
})

/** Un texte rendu cherchable mot pour mot dans une expression régulière (le « ? » de la question). */
const escapeForTest = (value: string) =>
  value.replaceAll("'", '&#39;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('the order of the e-mails of an address change', () => {
  // des-E5 : les conséquences d'abord, puis la consigne, juste avant la durée et le bouton.
  it('asks to confirm right before the validity and the button', () => {
    const email = changeEmailConfirmationEmail('fr', {
      name: 'Inès',
      newEmail: 'ines.b@exemple.fr',
      url: 'https://api.waiggle.com/v',
    })
    const lines = email.text.split('\n').filter((line) => line !== '')
    const next = lines.indexOf(fill(fr.changeEmail.next))
    expect(lines.slice(next, next + 4)).toEqual([
      fill(fr.changeEmail.next),
      fill(fr.changeEmail.expires),
      fill(fr.changeEmail.button),
      'https://api.waiggle.com/v',
    ])
  })

  // des-E6 : la version texte n'a pas de bouton ; l'adresse du lien, longue avec son jeton chiffré,
  // suit un libellé qui dit à quoi elle sert.
  it('writes « Confirm this address: » above the link in the text of the second e-mail', () => {
    const url = 'https://api.waiggle.com/api/auth/verify-email?token=def'
    for (const [language, label] of [
      ['fr', fr.newEmail.textLink],
      ['en', en.newEmail.textLink],
    ] as const) {
      const lines = newEmailVerificationEmail(language, { url }).text.split('\n')
      expect(lines[lines.indexOf(url) - 1]).toBe(fill(label))
    }
    expect(fill(en.newEmail.textLink)).toBe('Confirm this address:')
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

// ─── Tranche R2 : les deux e-mails de sécurité du mot de passe ──────────────────────────────────
// Des e-mails de service (jur-1) : ils disent pourquoi ils arrivent, sans publicité ni lien de
// désinscription. Le premier porte le lien pour choisir un nouveau mot de passe ; le second prévient
// qu'il a changé, sans jamais le mot de passe.

describe('resetPasswordEmail', () => {
  // Le lien mène à la page de l'appli et ne porte que le jeton (sec-S6, jur-2).
  const url = 'https://waiggle.com/reset-password?token=abc123'
  // La phrase de validité, remplie avec la durée en toutes lettres (décision du 30/10/2026) :
  // « une heure » pour 1, « N heures » au-delà.
  // `typeof en` : la forme des textes, sans les phrases françaises figées dans le type.
  const expiresIn = (t: typeof en, hours: number) =>
    fill(t.resetPassword.expires, {
      duration:
        hours === 1
          ? fill(t.resetPassword.oneHour)
          : fill(t.resetPassword.hours, { hours: String(hours) }),
    })

  it('is written in French, with the link in the text and in the button, and says why it arrives', () => {
    const email = resetPasswordEmail('fr', { url, hours: 1 })
    const t = fr.resetPassword

    expect(email.subject).toBe(fill(t.subject))
    for (const sentence of [t.body, t.ignore, t.reason]) {
      expect(email.text).toContain(fill(sentence))
    }
    expect(email.text).toContain(expiresIn(fr, 1))
    expect(email.text).toContain(url)
    expect(email.html).toContain(`href="${url}"`)
    expect(email.html).toContain(`>${fill(t.button)}</a>`)
    expect(email.html).toContain('<html lang="fr"')
    // La version texte n'a pas de bouton : le libellé, puis l'adresse du lien en dessous.
    const lines = email.text.split('\n')
    expect(lines[lines.indexOf(url) - 1]).toBe(fill(t.textLink))
  })

  it('is written in English for an English-speaking member', () => {
    const email = resetPasswordEmail('en', { url, hours: 1 })

    expect(email.subject).toBe(fill(en.resetPassword.subject))
    expect(email.text).toContain(expiresIn(en, 1))
    expect(email.text).not.toContain(fill(fr.resetPassword.body))
    expect(email.html).toContain('<html lang="en"')
  })

  // jur-2 : l'adresse n'a peut-être rien prouvé ; la salutation ne porte aucun nom.
  it('greets nobody by name: the first line is the bare greeting', () => {
    for (const language of ['fr', 'en'] as const) {
      const email = resetPasswordEmail(language, { url, hours: 1 })
      const t = resources[language].translation.email

      expect(email.text.split('\n')[0]).toBe(fill(t.resetPassword.greeting))
    }
  })

  // jur-4 : la durée écrite vient du réglage du serveur, pas d'un texte figé.
  it('writes the validity it is given, in hours', () => {
    const one = resetPasswordEmail('fr', { url, hours: 1 })
    const two = resetPasswordEmail('fr', { url, hours: 2 })

    expect(one.text).toContain(expiresIn(fr, 1))
    expect(two.text).toContain(expiresIn(fr, 2))
    expect(two.text).not.toContain(expiresIn(fr, 1))
  })

  // Décision du 30/10/2026 : la durée s'écrit en toutes lettres, « une heure », puis « 2 heures ».
  it('writes the duration in words: one hour, then a number of hours', () => {
    const one = (language: 'fr' | 'en') => resetPasswordEmail(language, { url, hours: 1 }).text
    const two = (language: 'fr' | 'en') => resetPasswordEmail(language, { url, hours: 2 }).text

    expect(one('fr')).toContain('valable une heure')
    expect(two('fr')).toContain('valable 2 heures')
    expect(one('en')).toContain('valid for one hour')
    expect(two('en')).toContain('valid for 2 hours')
    // L'ancienne écriture abrégée ne revient pas.
    for (const text of [one('fr'), two('fr'), one('en'), two('en')]) {
      expect(text).not.toMatch(/\d h\b/)
    }
  })

  // jur-3 : la conséquence (tous les appareils déconnectés) est dite avant le geste (le lien).
  it('tells the consequence before the link', () => {
    const email = resetPasswordEmail('fr', { url, hours: 1 })

    const consequence = email.text.indexOf(expiresIn(fr, 1))
    expect(consequence).toBeGreaterThan(0)
    expect(consequence).toBeLessThan(email.text.indexOf(url))
  })

  it('links to the reset page only, with no image, no unsubscribe link and no extra header', () => {
    for (const language of ['fr', 'en'] as const) {
      const email = resetPasswordEmail(language, { url, hours: 1 })

      const hrefs = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? '')
      expect(hrefs).toEqual([url])
      expect(email.html).not.toMatch(/<img|unsubscribe|mailto:/i)
      expect(email.headers).toBeUndefined()
      expect(email.text).toContain(contactEmail)
      expect(email.subject).not.toContain('@')
      // Le jeton n'apparaît que dans le lien, jamais ailleurs dans le texte.
      expect(email.text.split('abc123')).toHaveLength(2)
    }
  })
})

describe('passwordChangedEmail', () => {
  const settingsUrl = 'https://waiggle.com/settings/security'
  const data = { name: 'Inès', settingsUrl }

  it('tells the member the password changed and the other devices were signed out, without the password', () => {
    const email = passwordChangedEmail('fr', data)
    const t = fr.passwordChanged

    expect(email.subject).toBe(fill(t.subject))
    expect(email.text).toContain(fill(fr.greeting, { name: 'Inès' }))
    for (const sentence of [t.body, t.notYou, t.reason]) {
      expect(email.text).toContain(fill(sentence))
    }
    expect(email.html).toContain(`href="${settingsUrl}"`)
    expect(email.html).toContain(`>${fill(t.button)}</a>`)
    expect(email.html).toContain('<html lang="fr"')
  })

  it('is written in English for an English-speaking member', () => {
    const email = passwordChangedEmail('en', { ...data, name: 'Sam' })

    expect(email.subject).toBe(fill(en.passwordChanged.subject))
    expect(email.text).toContain(fill(en.greeting, { name: 'Sam' }))
    expect(email.text).toContain(fill(en.passwordChanged.notYou))
    expect(email.html).toContain('<html lang="en"')
  })

  // jur-5 : « Ce n'est pas toi ? » : d'abord reprendre la main (Réglages, Sécurité), puis nous
  // écrire ; l'adresse de contact en texte, jamais en lien.
  it('tells first how to take the account back, then to write to us, as text', () => {
    for (const language of ['fr', 'en'] as const) {
      const email = passwordChangedEmail(language, data)
      const notYou = fill(resources[language].translation.email.passwordChanged.notYou)

      expect(notYou.indexOf(contactEmail)).toBeGreaterThan(notYou.search(/Réglages|Settings/))
      expect(email.text).toContain(notYou)
      expect(email.html).toContain(contactEmail)
      expect(email.html).not.toContain('mailto:')
    }
  })

  it('links to the settings only, with no image, no unsubscribe link and no extra header', () => {
    for (const language of ['fr', 'en'] as const) {
      const email = passwordChangedEmail(language, data)

      const hrefs = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? '')
      expect(hrefs).toEqual([settingsUrl])
      expect(email.html).not.toMatch(/<img|unsubscribe/i)
      expect(email.headers).toBeUndefined()
      expect(email.subject).not.toContain('@')
    }
  })

  it('turns the address of a name into « [lien] », in the language of the e-mail', () => {
    const trap = 'Ton compte est bloqué, va sur waiggle-login.com'
    const french = passwordChangedEmail('fr', { ...data, name: trap })
    const english = passwordChangedEmail('en', { ...data, name: trap })

    for (const part of [french.text, french.html]) {
      expect(part).not.toContain('waiggle-login.com')
      expect(part).toContain('[lien]')
    }
    for (const part of [english.text, english.html]) {
      expect(part).not.toContain('waiggle-login.com')
      expect(part).toContain('[link]')
    }
  })
})
