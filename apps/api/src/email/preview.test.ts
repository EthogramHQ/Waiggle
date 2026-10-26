// Tests de l'aperçu des e-mails (tranches 6c et « adresse ») : chaque variante se rend, dans les
// deux langues, en suivant les règles des e-mails (liens chez nous seulement, aucune image, la
// langue de la page ; les en-têtes de désinscription en un clic pour les notifications, aucun pour
// les e-mails de service du changement d'adresse).
import { describe, expect, it } from 'vitest'
import { emailPreviews } from './preview'

// Les e-mails de notification ; les autres sont des e-mails de service, sans désinscription.
const NOTIFICATIONS = [
  'mentions',
  'recap-first',
  'recap-long',
  'recap-short',
  'recap-third-without-visit',
]
const SERVICE = ['change-email', 'email-changed', 'new-email']

describe('emailPreviews', () => {
  it('renders every variant in French and in English, following the rules of the e-mails', () => {
    const previews = emailPreviews()

    expect(previews.map(({ file }) => file).sort()).toEqual(
      [...NOTIFICATIONS, ...SERVICE]
        .sort()
        .flatMap((name) => [`${name}.en.html`, `${name}.fr.html`]),
    )
    for (const { file, email } of previews) {
      const [name, language] = file.split('.')
      expect(email.html, file).toContain(`<html lang="${language}"`)
      expect(email.html, file).not.toMatch(/<img/i)
      for (const [, href] of email.html.matchAll(/href="([^"]*)"/g)) {
        expect(
          href?.startsWith('https://waiggle.com/') || href?.startsWith('https://api.waiggle.com/'),
          href,
        ).toBe(true)
      }
      if (NOTIFICATIONS.includes(name ?? '')) {
        expect(email.headers?.['List-Unsubscribe-Post'], file).toBe('List-Unsubscribe=One-Click')
      } else {
        expect(email.headers?.['List-Unsubscribe'], file).toBeUndefined()
      }
    }
  })

  it('turns the address written in a mention into « [lien] »', () => {
    const mentions = emailPreviews().find(({ file }) => file === 'mentions.fr.html')

    expect(mentions?.email.text).toContain('[lien]')
    expect(mentions?.email.text).not.toContain('meteo.example.org')
  })

  it('shows the new address in the first and last e-mails of an address change, not in the second', () => {
    const textOf = (file: string) => emailPreviews().find((preview) => preview.file === file)

    for (const language of ['fr', 'en']) {
      expect(textOf(`change-email.${language}.html`)?.email.text).toContain('ines.morel@exemple.fr')
      expect(textOf(`email-changed.${language}.html`)?.email.text).toContain(
        'ines.morel@exemple.fr',
      )
      const second = textOf(`new-email.${language}.html`)?.email
      expect(second?.text).not.toContain('ines.morel@exemple.fr')
      expect(second?.text).not.toContain('Inès')
    }
  })
})
