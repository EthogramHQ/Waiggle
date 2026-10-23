// Tests de l'aperçu des e-mails de notification (tranche 6c) : chaque variante se rend, dans les
// deux langues, en suivant les règles des e-mails (liens chez nous seulement, aucune image, la
// langue de la page, les en-têtes de désinscription en un clic).
import { describe, expect, it } from 'vitest'
import { emailPreviews } from './preview'

describe('emailPreviews', () => {
  it('renders every variant in French and in English, following the rules of the e-mails', () => {
    const previews = emailPreviews()

    expect(previews.map(({ file }) => file).sort()).toEqual(
      ['mentions', 'recap-first', 'recap-long', 'recap-short', 'recap-third-without-visit'].flatMap(
        (name) => [`${name}.en.html`, `${name}.fr.html`],
      ),
    )
    for (const { file, email } of previews) {
      const language = file.split('.')[1]
      expect(email.html, file).toContain(`<html lang="${language}"`)
      expect(email.html, file).not.toMatch(/<img/i)
      for (const [, href] of email.html.matchAll(/href="([^"]*)"/g)) {
        expect(
          href?.startsWith('https://waiggle.com/') || href?.startsWith('https://api.waiggle.com/'),
          href,
        ).toBe(true)
      }
      expect(email.headers?.['List-Unsubscribe-Post'], file).toBe('List-Unsubscribe=One-Click')
    }
  })

  it('turns the address written in a mention into « [lien] »', () => {
    const mentions = emailPreviews().find(({ file }) => file === 'mentions.fr.html')

    expect(mentions?.email.text).toContain('[lien]')
    expect(mentions?.email.text).not.toContain('meteo.example.org')
  })
})
