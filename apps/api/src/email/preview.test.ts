// Tests de l'aperçu des e-mails (tranches 6c et « adresse ») : chaque variante se rend, dans les
// deux langues, en suivant les règles des e-mails (liens chez nous seulement, aucune image chargée à
// distance, la langue de la page ; les en-têtes de désinscription en un clic pour les notifications,
// aucun pour les e-mails de service). Chaque modèle de templates.ts et d'instant.ts a son aperçu, ou
// une exception écrite.
//
// R8 : l'e-mail « tout de suite » (instant.ts, instantPreviewData) a ses aperçus, et le récap habillé
// joint ses vignettes : une image n'est permise que « en ligne » (src="cid:…"), avec sa pièce jointe.
import { readFileSync } from 'node:fs'
import { RECAP_IMAGES_MAX } from '@ruche/contracts'
import { describe, expect, it } from 'vitest'
import * as instant from './instant'
import { emailPreviews } from './preview'
import * as templates from './templates'

// Les e-mails de notification ; les autres sont des e-mails de service, sans désinscription.
const NOTIFICATIONS = [
  // R8 : l'e-mail « tout de suite », avec une seule nouveauté, puis avec plusieurs.
  'instant-many',
  'instant-one',
  'mentions',
  'recap-first',
  'recap-long',
  // R8 : la note unique du premier récap du dimanche, pour qui le recevait déjà.
  'recap-news',
  'recap-short',
  'recap-third-without-visit',
]
const SERVICE = [
  'change-email',
  'email-changed',
  'existing-account',
  'moderation-alert',
  'new-email',
  // R6b : le récap hebdomadaire des « Autre » aux administrateurs.
  'other-recap-one-project',
  'other-recap',
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
    const models = Object.entries({ ...templates, ...instant })
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
        .flatMap((name) => [`${name}.en.html`, `${name}.fr.html`])
        // Trié après les suffixes : « other-recap » est le début d'un autre nom.
        .sort(),
    )
    for (const { file, email } of previews) {
      const [name, language] = file.split('.')
      expect(email.html, file).toContain(`<html lang="${language}"`)
      // Une image seulement « en ligne », jointe à l'e-mail : jamais chargée à distance.
      const sources = [...email.html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/gi)].map((m) => m[1])
      expect(email.html.match(/<img\b/gi)?.length ?? 0, file).toBe(sources.length)
      const cids = (email.attachments ?? []).map((attachment) => attachment.cid)
      for (const src of sources) {
        expect(src, file).toMatch(/^cid:/)
        expect(cids, file).toContain(src?.slice('cid:'.length))
      }
      expect(cids.length, file).toBeLessThanOrEqual(RECAP_IMAGES_MAX)
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

// R8 : les aperçus du récap habillé et de l'e-mail « tout de suite ».
describe('the previews of R8', () => {
  const previewOf = (file: string) => {
    const preview = emailPreviews().find((p) => p.file === file)
    if (preview === undefined) throw new Error(`no preview ${file}`)
    return preview.email
  }

  it('shows the dressed recap with its images, joined and shown by their content id', () => {
    for (const language of ['fr', 'en']) {
      const email = previewOf(`recap-long.${language}.html`)
      // Le récap de la planche : ses projets, un proche, un projet à tester, quatre vignettes.
      expect(email.attachments?.length, language).toBe(RECAP_IMAGES_MAX)
      for (const attachment of email.attachments ?? []) {
        expect(['image/jpeg', 'image/png']).toContain(attachment.contentType)
        expect(email.html).toContain(`src="cid:${attachment.cid}"`)
        expect(attachment.content.byteLength).toBeGreaterThan(0)
      }
    }
  })

  it('tells the one-time news in its own preview only', () => {
    const news = previewOf('recap-news.fr.html')
    const short = previewOf('recap-short.fr.html')

    expect(news.text).toContain('Nouveau : ton récap arrive le dimanche')
    expect(short.text).not.toContain('Nouveau : ton récap arrive le dimanche')
  })

  it('renders the instant e-mail with one line, and with several', () => {
    const one = previewOf('instant-one.fr.html')
    const many = previewOf('instant-many.fr.html')

    expect(one.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(many.subject).not.toBe(one.subject)
    expect(many.text.length).toBeGreaterThan(one.text.length)
  })
})
