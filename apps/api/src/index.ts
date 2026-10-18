// Point de démarrage du serveur : c'est le seul fichier qui touche au « vrai monde »
// (variables d'environnement, base de données, port réseau, signaux du système).
// Il assemble les pièces, puis lance l'écoute. Le reste est testable sans lui.
import { serve } from '@hono/node-server'
import { connectPostgres, type DatabaseHandle } from '@ruche/db'
import { createApp } from './app'
import { createAuth } from './auth/auth'
import {
  createBrevoMailer,
  createConsoleMailer,
  createScalewayMailer,
  type Mailer,
} from './email/mailer'
import { loadEnv } from './env'
import { createDiskStorage } from './media/storage'

const env = loadEnv(process.env)
// Version affichée par /health : celle du package.json en développement, APP_VERSION en production.
const version = process.env.npm_package_version ?? process.env.APP_VERSION ?? 'dev'

// 1. La base : un vrai PostgreSQL si DATABASE_URL est fourni (production, Docker), sinon une base
// PGlite enregistrée dans un dossier local (développement, sans rien installer).
// L'import « dynamique » (await import) ne charge PGlite que dans ce cas : il n'est jamais
// embarqué en production.
const openDatabase = async (): Promise<DatabaseHandle> => {
  if (env.databaseUrl) return connectPostgres(env.databaseUrl, env.migrationsDir)
  const { createPgliteDb } = await import('@ruche/db/pglite')
  console.log(`No DATABASE_URL: using a local PGlite database in ${env.pgliteDir}`)
  return createPgliteDb(env.pgliteDir)
}

// 2. L'envoi des e-mails : Scaleway en production (ADR 0005), Brevo encore possible, la console en
// développement. Le reste du code ne voit que l'interface Mailer.
const createMailer = (): Mailer => {
  switch (env.mail.provider) {
    case 'scaleway':
      return createScalewayMailer(env.mail)
    case 'brevo':
      return createBrevoMailer(env.mail)
    default:
      return createConsoleMailer()
  }
}
const mailer = createMailer()

// En production, des e-mails écrits dans les logs y laisseraient des liens de vérification, qui
// connectent au compte. env.ts ne le permet que pour les essais (ALLOW_CONSOLE_MAIL=true) : on le
// rappelle dans les logs, pour ne pas l'oublier.
if (env.nodeEnv === 'production' && env.mail.provider === 'console') {
  console.warn('MAIL_PROVIDER=console in production: emails (and their links) go to the logs.')
}

// 3. Le stockage des fichiers (avatars) : un dossier du disque.
const storage = createDiskStorage(env.mediaDir)

const database = await openDatabase()

// 4. L'authentification, puis l'application qui rassemble toutes les routes.
const auth = createAuth({
  db: database.db,
  mailer,
  storage,
  secret: env.authSecret,
  publicApiUrl: env.publicApiUrl,
  appUrl: env.appUrl,
  rateLimit: env.nodeEnv === 'production',
  inviteCode: env.inviteCode,
})
const app = createApp({
  version,
  auth,
  db: database.db,
  storage,
  appUrl: env.appUrl,
  publicApiUrl: env.publicApiUrl,
})

const server = serve({ fetch: app.fetch, port: env.port }, ({ port }) => {
  console.log(`Ruche API listening on http://localhost:${port} (${env.nodeEnv})`)
})

// Arrêt propre : quand Docker ou Ctrl+C demandent l'arrêt (SIGTERM / SIGINT),
// on laisse les requêtes en cours se terminer, on ferme la base, puis on quitte.
const shutdown = () => {
  server.close(async () => {
    await database.close()
    process.exit(0)
  })
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
