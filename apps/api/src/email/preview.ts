// L'aperçu de chaque e-mail de templates.ts (notifications de la tranche 6c, changement d'adresse,
// inscription, mot de passe, alerte de modération), pour les relectures de design et juridique : les e-mails
// rendus, en français et en anglais, avec les données des tests (Inès reçoit, Malik, Zoé et Sam
// commentent, répondent et la mentionnent ; Inès change d'adresse). preview.test.ts refuse un
// modèle sans aperçu ni exception écrite. Rien ici n'est envoyé ni lu par l'API :
// `pnpm --filter @ruche/api email:preview <dossier>` (scripts/email-preview.ts) écrit ces fichiers.
import { REMOVAL_EXPLANATION_MAX } from '@ruche/contracts'
import { type Language, supportedLanguages } from '@ruche/i18n'
import {
  changeEmailConfirmationEmail,
  type EmailContent,
  emailChangedEmail,
  existingAccountEmail,
  type MentionData,
  mentionEmail,
  moderationAlertEmail,
  type NotificationLinks,
  newEmailVerificationEmail,
  passwordChangedEmail,
  type RecapData,
  type RecapLine,
  recapEmail,
  resetPasswordEmail,
  suspensionEmail,
  verificationEmail,
} from './templates'
import { createUnsubscribeToken } from './unsubscribe-token'

const APP_URL = 'https://waiggle.com'
const API_URL = 'https://api.waiggle.com'
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

// Le changement d'adresse d'Inès. Les jetons des liens sont des exemples : le premier est un JWT
// lisible, le second un jeton chiffré (auth/change-email.ts) ; aucun ne vaut rien sur le serveur.
const NEW_EMAIL = 'ines.morel@exemple.fr'
// Le second lien n'a pas de page de retour (callbackURL) : l'API l'impose à l'ouverture
// (auth/change-email.ts, sendNewEmailLink ; relecture de design des-E6).
const verifyLink = (token: string, page?: string) =>
  `${API_URL}/api/auth/verify-email?${new URLSearchParams({ token, ...(page && { callbackURL: `${APP_URL}${page}` }) })}`
const firstLink = verifyLink('eyJhbGciOiJIUzI1NiJ9.apercu.signature', '/email-change/confirmed')
const secondLink = verifyLink('9f2c4e7a1b3d5f60apercu')

// L'explication la plus longue qu'un administrateur peut écrire (REMOVAL_EXPLANATION_MAX), avec un
// mot de 88 caractères sans espace (une adresse) : la carte de l'e-mail doit la couper sans
// défiler à l'horizontale (adresse-E1).
const LONG_EXPLANATION =
  `${'Annonces répétées pour un service payant, malgré deux rappels des règles. '.repeat(5)}Voir ${'a'.repeat(76)}@exemple.fr et meteo.example.org/inscription ; `.padEnd(
    REMOVAL_EXPLANATION_MAX,
    '.',
  )

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
  // Les trois e-mails de service du changement d'adresse : ni publicité ni désinscription.
  [
    'change-email',
    (language) =>
      changeEmailConfirmationEmail(language, {
        name: 'Inès Morel',
        newEmail: NEW_EMAIL,
        url: firstLink,
      }),
  ],
  ['new-email', (language) => newEmailVerificationEmail(language, { url: secondLink })],
  [
    'email-changed',
    (language) => emailChangedEmail(language, { name: 'Inès Morel', newEmail: NEW_EMAIL }),
  ],
  // Les e-mails de service de l'inscription (tranche 2) : le lien qui active le compte, et
  // l'avertissement au propriétaire d'une adresse déjà inscrite.
  [
    'verification',
    (language) =>
      verificationEmail(language, {
        name: 'Inès Morel',
        url: verifyLink('eyJhbGciOiJIUzI1NiJ9.inscription.signature', '/verified'),
      }),
  ],
  [
    'existing-account',
    (language) =>
      existingAccountEmail(language, { name: 'Inès Morel', signInUrl: `${APP_URL}/sign-in` }),
  ],
  // Les deux e-mails de sécurité du mot de passe (tranche R2). Le lien du mot de passe oublié a la
  // longueur réelle : la page de l'appli et un jeton de 24 caractères (Better Auth), seul paramètre.
  [
    'reset-password',
    (language) =>
      resetPasswordEmail(language, {
        url: `${APP_URL}/reset-password?token=Xk3vQ9pLm2RtY7wZ4aBcD8eF`, // gitleaks:allow
        hours: 1,
      }),
  ],
  [
    'password-changed',
    (language) =>
      passwordChangedEmail(language, {
        name: 'Inès Morel',
        settingsUrl: `${APP_URL}/settings/security`,
      }),
  ],
  // L'alerte de modération (tranche 7a), à un administrateur : le nombre et le lien, rien d'autre.
  [
    'moderation-alert',
    (language) =>
      moderationAlertEmail(language, { name: 'Malik', count: 3, url: `${APP_URL}/moderation` }),
  ],
  // La suspension d'un compte (tranche 7c), e-mail de service : 7 jours après un signalement, avec
  // la fin à l'heure de Paris (23 h 30 UTC un soir de novembre : le lendemain à 0 h 30), puis sans
  // fin, à l'initiative de la modération, avec l'explication la plus longue permise (500
  // caractères) et une adresse écrite dedans, qui devient « [lien] ».
  [
    'suspension-7d',
    (language) =>
      suspensionEmail(language, {
        endsAt: new Date('2026-11-03T23:30:00.000Z'),
        ground: 'rules',
        explanation: 'Messages insultants répétés sous les projets des autres membres.',
        afterReport: true,
      }),
  ],
  [
    'suspension-indefinite',
    (language) =>
      suspensionEmail(language, {
        endsAt: null,
        ground: 'illegal',
        explanation: LONG_EXPLANATION,
        afterReport: false,
      }),
  ],
]

/** Tous les aperçus : un fichier HTML par variante et par langue (« recap-short.fr.html »…). */
export const emailPreviews = () =>
  variants.flatMap(([name, render]) =>
    supportedLanguages.map((language) => ({
      file: `${name}.${language}.html`,
      email: render(language),
    })),
  )
