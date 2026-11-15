// Tests du pied commun des e-mails (R11) : chaque modèle qui reçoit l'adresse de l'appli donne, en
// dernière ligne, l'adresse de la page Confidentialité (`appUrl/privacy`), en texte et dans le HTML.
// Le récap de la semaine et l'e-mail « tout de suite » ont leur propre mise en page : hors de ce
// fichier.
import { fill, resources } from '@ruche/i18n'
import { describe, expect, it } from 'vitest'
import { instantEmail, instantPreviewData } from './instant'
import { emailPreviews } from './preview'
import {
  changeEmailConfirmationEmail,
  type EmailContent,
  emailChangedEmail,
  existingAccountEmail,
  moderationAlertEmail,
  newEmailVerificationEmail,
  otherRecapEmail,
  passwordChangedEmail,
  resetPasswordEmail,
  suspensionEmail,
  verificationEmail,
} from './templates'

const APP_URL = 'https://preview.waiggle.example'
const URL_ = `${APP_URL}/sign-in`

const emails: [string, (appUrl?: string) => EmailContent][] = [
  ['verification', (a) => verificationEmail('fr', { name: 'Léa', url: URL_ }, a)],
  ['existing account', (a) => existingAccountEmail('fr', { name: 'Léa', signInUrl: URL_ }, a)],
  ['reset password', (a) => resetPasswordEmail('fr', { url: URL_, hours: 1 }, a)],
  ['password changed', (a) => passwordChangedEmail('fr', { name: 'Léa', settingsUrl: URL_ }, a)],
  [
    'change email',
    (a) => changeEmailConfirmationEmail('fr', { name: 'Léa', newEmail: 'l@x.fr', url: URL_ }, a),
  ],
  ['new email', (a) => newEmailVerificationEmail('fr', { url: URL_ }, a)],
  ['email changed', (a) => emailChangedEmail('fr', { name: 'Léa', newEmail: 'l@x.fr' }, a)],
  ['moderation alert', (a) => moderationAlertEmail('fr', { name: 'Léa', count: 2, url: URL_ }, a)],
  [
    'other recap',
    (a) =>
      otherRecapEmail(
        'fr',
        { name: 'Léa', tools: 1, projects: 1, older: 0, toolsUrl: URL_, projectsUrl: URL_ },
        a,
      ),
  ],
  [
    'suspension',
    (a) =>
      suspensionEmail(
        'fr',
        { endsAt: null, ground: 'rules', explanation: 'Insultes.', afterReport: false },
        a,
      ),
  ],
]

describe('the common footer of the e-mails', () => {
  const line = fill(resources.fr.translation.email.privacy, { url: `${APP_URL}/privacy` })

  for (const [name, build] of emails) {
    it(`gives the address of the Privacy page at the end of the ${name} e-mail`, () => {
      const sent = build(APP_URL)

      expect(sent.text.endsWith(line)).toBe(true)
      expect(sent.html).toContain(`${APP_URL}/privacy`)
      // Témoin : sans l'adresse de l'appli (les anciens tests des modèles), la ligne manque.
      expect(build().text).not.toContain(`${APP_URL}/privacy`)
    })
  }
})

// Le récap de la semaine et l'e-mail « tout de suite » ont leur propre mise en page : leurs
// aperçus (preview.ts) les rendent avec l'adresse de l'appli, comme le fait chaque envoi du serveur.
describe('the footer of the weekly recap and of the instant e-mail', () => {
  const previews = emailPreviews()
  const names = ['recap-short', 'recap-long', 'recap-first', 'instant-one', 'instant-many']

  for (const language of ['fr', 'en'] as const) {
    const line = fill(resources[language].translation.email.privacy, {
      url: 'https://waiggle.com/privacy',
    })
    for (const name of names) {
      it(`ends the ${name} e-mail with the address of the Privacy page (${language})`, () => {
        const sent = previews.find((p) => p.file === `${name}.${language}.html`)?.email

        expect(sent?.text.endsWith(line)).toBe(true)
        expect(sent?.html).toContain(line)
      })
    }
  }

  it('leaves the instant e-mail without the line when the address of the app is unknown', () => {
    expect(instantEmail(instantPreviewData(), 'fr').text).not.toContain('/privacy')
  })
})
