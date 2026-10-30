// Tests de l'aperçu des e-mails (tranches 6c et « adresse ») : chaque variante se rend, dans les
// deux langues, en suivant les règles des e-mails (liens chez nous seulement, aucune image, la
// langue de la page ; les en-têtes de désinscription en un clic pour les notifications, aucun pour
// les e-mails de service). Chaque modèle de templates.ts a son aperçu, ou une exception écrite.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { emailPreviews } from './preview'
import * as templates from './templates'

// Les e-mails de notification ; les autres sont des e-mails de service, sans désinscription.
const NOTIFICATIONS = [
  'mentions',
  'recap-first',
  'recap-long',
  'recap-short',
  'recap-third-without-visit',
]
const SERVICE = [
  'change-email',
  'email-changed',
  'existing-account',
  'moderation-alert',
  'new-email',
  // R2 : le mot de passe oublié et « Ton mot de passe a changé », deux e-mails de sécurité.
  'password-changed',
  'reset-password',
  'suspension-7d',
  'suspension-indefinite',
  'verification',
]

// Les modèles de templates.ts qui n'ont pas d'aperçu, chacun avec sa raison (efficacité,
// adresse-E1 : un e-mail sans aperçu n'est vu par aucune relecture de design). Aucun aujourd'hui.
const WITHOUT_PREVIEW: Record<string, string> = {}

describe('emailPreviews', () => {
  it('has a preview for every e-mail of templates.ts, or a written reason not to', () => {
    // Le code de preview.ts : un aperçu appelle son modèle par son nom.
    const source = readFileSync(new URL('./preview.ts', import.meta.url), 'utf8')
    const models = Object.entries(templates)
      .filter(([name, value]) => name.endsWith('Email') && typeof value === 'function')
      .map(([name]) => name)

    expect(models.length).toBeGreaterThan(0)
    for (const model of models) {
      if (model in WITHOUT_PREVIEW) {
        expect(WITHOUT_PREVIEW[model]?.trim(), model).toBeTruthy()
        expect(source, `${model} has a preview: remove its exception`).not.toContain(`${model}(`)
      } else {
        expect(source, `${model} has no preview in emailPreviews()`).toContain(`${model}(`)
      }
    }
    // Une exception qui ne nomme plus aucun modèle se retire.
    for (const model of Object.keys(WITHOUT_PREVIEW)) expect(models).toContain(model)
  })

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

  // R2 : le lien du mot de passe oublié mène à la page de l'appli, avec le jeton pour seul paramètre
  // (sec-S6) ; l'e-mail « mot de passe changé » mène aux réglages. Deux e-mails de service.
  it('links the reset e-mail to the app page with the token only, and the changed one to the settings', () => {
    const previews = emailPreviews()
    const hrefsOf = (file: string) =>
      [
        ...(previews.find((preview) => preview.file === file)?.email.html ?? '').matchAll(
          /href="([^"]+)"/g,
        ),
      ].map((m) => m[1] ?? '')

    for (const language of ['fr', 'en']) {
      const reset = hrefsOf(`reset-password.${language}.html`)
      expect(reset).toHaveLength(1)
      expect(reset[0]).toMatch(/^https:\/\/waiggle\.com\/reset-password\?token=[A-Za-z0-9_-]+$/)
      const changed = hrefsOf(`password-changed.${language}.html`)
      expect(changed).toHaveLength(1)
      expect(changed[0]?.startsWith('https://waiggle.com/')).toBe(true)
      expect(changed[0]).not.toContain('token')
    }
  })
})
