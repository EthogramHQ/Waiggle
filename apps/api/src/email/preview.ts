// L'aperçu de chaque e-mail de templates.ts (notifications de la tranche 6c, changement d'adresse,
// inscription, mot de passe, alerte de modération, récap des « Autre »), pour les relectures de design et juridique : les e-mails
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
  otherRecapEmail,
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
  updates: [],
  updatesMore: 0,
  links: linksFor('recap'),
  ...overrides,
})

// R7a, « Les projets que tu suis ou que tu testes ». Le lien est l'adresse réelle, la plus longue
// possible (un identifiant de projet a toujours 36 caractères) ; un titre de la longueur maximale
// (PROJECT_TITLE_MAX, 80), d'un seul mot, que la carte doit couper sans défiler à l'horizontale
// (adresse-E1).
const updatesOf = (id: string) => `${APP_URL}/projects/${id}/updates`
const LONG_TITLE =
  'Assistantdecuisinequiproposedesrecettesaveclesrestesdufrigoetlesproduitsdesaison'
const updatedProjects: RecapData['updates'] = [
  { title: 'Décollage !', count: 3, url: updatesOf('0b6f2a52-5d1e-4c43-9a51-1f0c3e2b7a10') },
  { title: LONG_TITLE, count: 1, url: updatesOf('7d1c9e04-3b2a-4f68-8e15-a2c4d6b8f901') },
  { title: 'Jardin', count: 2, url: updatesOf('c3e1a7f2-9b44-4d0e-8a6c-5f2b1d9e7a03') },
  { title: 'Météo', count: 1, url: updatesOf('e8a4b2c6-1d3f-4e5a-9b7c-0f1e2d3c4b05') },
  { title: 'Vélo', count: 1, url: updatesOf('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c06') },
]

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
  // Le récap le plus long : cinq lignes et « Et 2 autres », les nombres, puis (R7a) les cinq
  // projets suivis ou testés et « Et 2 autres projets ». La liste des variantes est fixée par
  // preview.test.ts : la nouvelle partie entre dans celle-ci, et dans le premier récap (un seul
  // projet, au singulier).
  [
    'recap-long',
    (language) =>
      recapEmail(
        language,
        recap({
          lines: manyLines.slice(0, 5),
          more: 2,
          reactions: 3,
          follows: 2,
          updates: updatedProjects,
          updatesMore: 2,
        }),
      ),
  ],
  [
    'recap-first',
    (language) =>
      recapEmail(language, recap({ first: true, updates: updatedProjects.slice(3, 4) })),
  ],
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
  // Le récap des « Autre » (tranche R6b), à un administrateur : des nombres et deux boutons. Une
  // semaine chargée (pluriels, « et 4 autres »), puis une semaine d'un seul projet à ranger (aucune
  // ligne pour un nombre nul) dont l'administrateur porte un nom de 88 caractères sans espace : la
  // carte doit le couper sans défiler (adresse-E1). Les liens sont les vrais, les plus longs.
  [
    'other-recap',
    (language) =>
      otherRecapEmail(language, {
        name: 'Malik',
        tools: 3,
        projects: 2,
        older: 4,
        toolsUrl: `${APP_URL}/moderation/tools`,
        projectsUrl: `${APP_URL}/moderation/categories`,
      }),
  ],
  [
    'other-recap-one-project',
    (language) =>
      otherRecapEmail(language, {
        name: `Malik${'o'.repeat(83)}`,
        tools: 0,
        projects: 1,
        older: 0,
        toolsUrl: `${APP_URL}/moderation/tools`,
        projectsUrl: `${APP_URL}/moderation/categories`,
      }),
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
