// L'aperçu des e-mails de notification (tranche 6c), pour les relectures de design et juridique :
// les e-mails rendus, en français et en anglais, avec les données des tests (Inès reçoit, Malik,
// Zoé et Sam commentent, répondent et la mentionnent). Rien ici n'est envoyé ni lu par l'API :
// `pnpm --filter @ruche/api email:preview <dossier>` (scripts/email-preview.ts) écrit ces fichiers.
import { type Language, supportedLanguages } from '@ruche/i18n'
import {
  type EmailContent,
  type MentionData,
  mentionEmail,
  type NotificationLinks,
  type RecapData,
  type RecapLine,
  recapEmail,
} from './templates'
import { createUnsubscribeToken } from './unsubscribe-token'

const APP_URL = 'https://waiggle.io'
const API_URL = 'https://api.waiggle.io'
// Une clé d'exemple : les jetons de l'aperçu ne valent rien sur le vrai serveur.
const PREVIEW_SECRET = 'preview-only-secret-not-used-anywhere'
const MEMBER_ID = 'Xk3vQ9pLm2RtY7wZ4aBcD8eFgH1jKlMn'

const linksFor = (kind: 'recap' | 'mentions'): NotificationLinks => {
  const query = new URLSearchParams({
    token: createUnsubscribeToken(PREVIEW_SECRET, MEMBER_ID, kind),
  })
  return {
    button: `${APP_URL}/notifications`,
    unsubscribe: `${APP_URL}/unsubscribe?${query}`,
    manage: `${APP_URL}/profile`,
    oneClick: `${API_URL}/v1/email/unsubscribe?${query}`,
  }
}

const malik = { name: 'Malik', handle: 'malik' }
const zoe = { name: 'Zoé', handle: 'zoe' }
const sam = { name: 'Sam', handle: 'sam' }

// Sept éléments, comme le premier test du récap : cinq lignes, puis « Et 2 autres ».
const manyLines: RecapLine[] = [
  { kind: 'comment', ...zoe, title: 'Météo' },
  { kind: 'mention', ...malik, title: 'Jardin' },
  { kind: 'mention', ...sam, title: 'Jardin' },
  { kind: 'reply', ...zoe, title: 'Météo' },
  { kind: 'comment', ...malik, title: 'Météo' },
  { kind: 'comment', ...malik, title: 'Météo' },
  { kind: 'comment', ...malik, title: 'Météo' },
]

const recap = (overrides: Partial<RecapData>): RecapData => ({
  name: 'Inès Morel',
  lines: [{ kind: 'comment', ...malik, title: 'Météo' }],
  more: 0,
  reactions: 1,
  follows: 1,
  first: false,
  last: false,
  links: linksFor('recap'),
  ...overrides,
})

const mentions: MentionData = {
  name: 'Inès Morel',
  items: [
    {
      kind: 'mention',
      ...malik,
      title: 'Vélo',
      excerpt: '@ines_morel tu as vu la pluie de demain ?',
    },
    { kind: 'reply', ...zoe, title: 'Vélo', excerpt: 'Bonne idée, la carte.' },
    // Une adresse écrite par un membre : elle devient « [lien] » dans l'e-mail.
    {
      kind: 'mention',
      ...malik,
      title: 'Météo',
      excerpt: 'Et ici, @ines_morel ? Les données viennent de meteo.example.org',
    },
  ],
  links: linksFor('mentions'),
}

/** Les variantes montrées : le nom du fichier (sans la langue) et l'e-mail rendu. */
const variants: [string, (language: Language) => EmailContent][] = [
  ['recap-short', (language) => recapEmail(language, recap({}))],
  [
    'recap-long',
    (language) =>
      recapEmail(
        language,
        recap({ lines: manyLines.slice(0, 5), more: 2, reactions: 3, follows: 2 }),
      ),
  ],
  ['recap-first', (language) => recapEmail(language, recap({ first: true }))],
  ['recap-third-without-visit', (language) => recapEmail(language, recap({ last: true }))],
  ['mentions', (language) => mentionEmail(language, mentions)],
]

/** Tous les aperçus : un fichier HTML par variante et par langue (« recap-short.fr.html »…). */
export const emailPreviews = () =>
  variants.flatMap(([name, render]) =>
    supportedLanguages.map((language) => ({
      file: `${name}.${language}.html`,
      email: render(language),
    })),
  )
