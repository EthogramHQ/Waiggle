// Lecture de la configuration du serveur (les « variables d'environnement »).
// Elles arrivent toujours sous forme de texte, et peuvent manquer ou être fausses :
// on les vérifie toutes au démarrage avec Zod, pour échouer tout de suite et clairement.
import { appName } from '@ruche/brand'
import {
  INVITE_CODE_MAX_LENGTH,
  INVITE_CODE_MIN_LENGTH,
  normalizeInviteCode,
} from '@ruche/contracts'
import { z } from 'zod'

// Les chaînes vides ("") sont traitées comme absentes : c'est ce que produit souvent un .env mal rempli.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional())

const EnvSchema = z
  .object({
    // z.coerce.number() convertit le texte "8080" en nombre 8080, puis vérifie qu'il est valide.
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // Absente en développement : une base PGlite locale est utilisée à la place.
    DATABASE_URL: optional(z.string()),
    PGLITE_DIR: z.string().default('.data/pglite'),
    // Dossier des fichiers envoyés par les membres (avatars…). Dans Docker : un volume.
    MEDIA_DIR: z.string().default('.data/media'),
    MIGRATIONS_DIR: optional(z.string()),
    // Clé secrète qui signe les sessions. Qui la connaît peut se faire passer pour n'importe qui.
    BETTER_AUTH_SECRET: optional(z.string()),
    // Adresse publique de l'API (pour construire les liens dans les e-mails) et de l'appli web.
    PUBLIC_API_URL: z.url().default('http://localhost:3000'),
    APP_URL: z.url().default('http://localhost:8081'),
    // Qui envoie les e-mails : la console (développement), Brevo, ou Scaleway (ADR 0005).
    MAIL_PROVIDER: z.enum(['console', 'brevo', 'scaleway']).default('console'),
    BREVO_API_KEY: optional(z.string()),
    SCALEWAY_SECRET_KEY: optional(z.string()),
    // L'identifiant du projet Scaleway, un UUID : z.uuid() refuse une valeur mal copiée.
    SCALEWAY_PROJECT_ID: optional(z.uuid()),
    // Transactional Email n'existe qu'à Paris (constaté le 14/10/2026). Une autre région ferait
    // démarrer le serveur, puis échouer au premier e-mail : on la refuse dès le départ.
    SCALEWAY_REGION: z.enum(['fr-par']).default('fr-par'),
    // « true » autorise les e-mails écrits dans les logs (console) en production. Seulement pour
    // les essais (tests de la pile Docker) : sinon les liens des e-mails, qui connectent au compte,
    // finiraient dans les logs du serveur.
    ALLOW_CONSOLE_MAIL: optional(z.enum(['true'])),
    MAIL_FROM_EMAIL: z.email().default('no-reply@localhost.localdomain'),
    // Nom de l'expéditeur des e-mails. Vide : le nom de l'appli (@ruche/brand).
    MAIL_FROM_NAME: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().default(appName),
    ),
    // Le code d'invitation demandé à l'inscription (docs/scenarios/phase-1.md). trim() retire les
    // espaces autour avant de compter les caractères : 12 au moins, pour qu'on ne le devine pas.
    // Absent : inscription libre, ce qui n'est permis qu'en développement et dans les tests.
    SIGNUP_INVITE_CODE: optional(
      z.string().trim().min(INVITE_CODE_MIN_LENGTH).max(INVITE_CODE_MAX_LENGTH),
    ),
  })
  // superRefine : des règles qui dépendent de plusieurs variables à la fois.
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (!env.DATABASE_URL) {
        ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'required in production' })
      }
      if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
        ctx.addIssue({
          code: 'custom',
          path: ['BETTER_AUTH_SECRET'],
          message: 'required in production, at least 32 characters (openssl rand -base64 32)',
        })
      }
      // En production, l'inscription est fermée par défaut : sans code, le serveur ne démarre pas.
      if (!env.SIGNUP_INVITE_CODE) {
        ctx.addIssue({
          code: 'custom',
          path: ['SIGNUP_INVITE_CODE'],
          message: `required in production, at least ${INVITE_CODE_MIN_LENGTH} characters`,
        })
      }
    }
    if (
      env.SIGNUP_INVITE_CODE &&
      PUBLIC_EXAMPLE_INVITE_CODES.includes(normalizeInviteCode(env.SIGNUP_INVITE_CODE))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['SIGNUP_INVITE_CODE'],
        message:
          'this code is a public example of the repository: choose another one (openssl rand -hex 8)',
      })
    }
    if (
      env.NODE_ENV === 'production' &&
      env.MAIL_PROVIDER === 'console' &&
      env.ALLOW_CONSOLE_MAIL !== 'true'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_PROVIDER'],
        message: 'console writes the sign-in links in the logs: use scaleway in production',
      })
    }
    if (env.MAIL_PROVIDER === 'brevo' && !env.BREVO_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['BREVO_API_KEY'], message: 'required to send emails' })
    }
    if (env.MAIL_PROVIDER === 'scaleway') {
      for (const key of ['SCALEWAY_SECRET_KEY', 'SCALEWAY_PROJECT_ID'] as const) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'required to send emails' })
      }
    }
  })

// Les codes d'invitation qui servent d'exemples dans ce dépôt (documentation, tests). Le dépôt est
// public : un serveur réglé avec l'un d'eux serait ouvert à tous.
const PUBLIC_EXAMPLE_INVITE_CODES = [
  'miel-2026-noel',
  'smoke-test-invite-code',
  'stack-test-invite-code',
  'f3a9c2e17b4d8a06', // ancien code des tests, resté lisible dans l'historique du dépôt
]

// Secret de secours, uniquement hors production : il est public (il est dans ce fichier !).
const DEVELOPMENT_SECRET = 'development-only-secret-do-not-use-in-production'

type Sender = { email: string; name: string }

export type MailConfig =
  | { provider: 'console' }
  | { provider: 'brevo'; apiKey: string; from: Sender }
  | { provider: 'scaleway'; secretKey: string; projectId: string; region: string; from: Sender }

export type Env = {
  port: number
  nodeEnv: 'development' | 'test' | 'production'
  databaseUrl: string | undefined
  pgliteDir: string
  mediaDir: string
  migrationsDir: string | undefined
  authSecret: string
  publicApiUrl: string
  appUrl: string
  mail: MailConfig
  /** Le code d'invitation exigé à l'inscription ; null : inscription libre (développement). */
  inviteCode: string | null
}

/**
 * Valide la configuration. Une valeur invalide arrête le serveur au démarrage,
 * plutôt que de provoquer une panne bizarre plus tard.
 * On passe la source en paramètre (au lieu de lire process.env directement) pour pouvoir la tester.
 */
export const loadEnv = (source: Record<string, string | undefined>): Env => {
  const result = EnvSchema.safeParse(source)
  if (!result.success) {
    // Message lisible : « BETTER_AUTH_SECRET: required in production… », une ligne par problème.
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid configuration:\n${problems.join('\n')}`)
  }
  const env = result.data
  const from: Sender = { email: env.MAIL_FROM_EMAIL, name: env.MAIL_FROM_NAME }
  // Les « ?? '' » ne servent qu'au typage : superRefine a déjà refusé une clé absente.
  const mail: MailConfig =
    env.MAIL_PROVIDER === 'scaleway'
      ? {
          provider: 'scaleway',
          secretKey: env.SCALEWAY_SECRET_KEY ?? '',
          projectId: env.SCALEWAY_PROJECT_ID ?? '',
          region: env.SCALEWAY_REGION,
          from,
        }
      : env.MAIL_PROVIDER === 'brevo'
        ? { provider: 'brevo', apiKey: env.BREVO_API_KEY ?? '', from }
        : { provider: 'console' }
  return {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    pgliteDir: env.PGLITE_DIR,
    mediaDir: env.MEDIA_DIR,
    migrationsDir: env.MIGRATIONS_DIR,
    authSecret: env.BETTER_AUTH_SECRET ?? DEVELOPMENT_SECRET,
    publicApiUrl: env.PUBLIC_API_URL,
    appUrl: env.APP_URL,
    mail,
    inviteCode: env.SIGNUP_INVITE_CODE ?? null,
  }
}
