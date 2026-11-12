import { randomBytes } from 'node:crypto'
import { appName } from '@ruche/brand'
import { describe, expect, it } from 'vitest'
import { loadEnv } from './env'

// Un code d'invitation tiré au hasard à chaque lancement des tests, comme sur le serveur : aucun
// code qui ressemble à un vrai n'est écrit dans le dépôt.
const inviteCode = randomBytes(8).toString('hex')

// On passe de fausses variables d'environnement à loadEnv : pas besoin de toucher au vrai système.
const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://ruche:secret@db:5432/ruche',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  PUBLIC_API_URL: 'https://api.waiggle.com',
  APP_URL: 'https://waiggle.com',
  MAIL_PROVIDER: 'brevo',
  BREVO_API_KEY: 'key',
  MAIL_FROM_EMAIL: 'no-reply@waiggle.com',
  SIGNUP_INVITE_CODE: inviteCode,
}

describe('loadEnv', () => {
  it('uses safe defaults for local development', () => {
    expect(loadEnv({})).toMatchObject({
      port: 3000,
      nodeEnv: 'development',
      databaseUrl: undefined,
      publicApiUrl: 'http://localhost:3000',
      appUrl: 'http://localhost:8081',
      mail: { provider: 'console' },
      // Pas de code : en développement, l'inscription reste libre.
      inviteCode: null,
    })
  })

  it('reads a complete production configuration', () => {
    expect(loadEnv({ ...production, PORT: '8080' })).toMatchObject({
      port: 8080,
      nodeEnv: 'production',
      databaseUrl: production.DATABASE_URL,
      mail: {
        provider: 'brevo',
        apiKey: 'key',
        from: { email: 'no-reply@waiggle.com', name: appName },
      },
      inviteCode,
    })
  })

  it('signs emails with the app name unless another sender name is set', () => {
    // Une variable vide (« MAIL_FROM_NAME= » dans le .env) compte comme absente.
    expect(loadEnv({ ...production, MAIL_FROM_NAME: '' }).mail).toMatchObject({
      from: { name: appName },
    })
    expect(loadEnv({ ...production, MAIL_FROM_NAME: 'Famille Moreau' }).mail).toMatchObject({
      from: { name: 'Famille Moreau' },
    })
  })

  it('refuses an invalid port instead of starting half-configured', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow()
    expect(() => loadEnv({ PORT: '70000' })).toThrow()
  })

  it('refuses to start in production without a database or a strong secret', () => {
    expect(() => loadEnv({ ...production, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/)
    expect(() => loadEnv({ ...production, BETTER_AUTH_SECRET: 'short' })).toThrow(/SECRET/)
  })

  it('refuses to send real emails without an API key', () => {
    expect(() => loadEnv({ ...production, BREVO_API_KEY: undefined })).toThrow(/BREVO_API_KEY/)
  })

  it('reads a Scaleway configuration, in the Paris region only', () => {
    const scaleway = {
      ...production,
      MAIL_PROVIDER: 'scaleway',
      BREVO_API_KEY: undefined,
      SCALEWAY_SECRET_KEY: 'secret',
      SCALEWAY_PROJECT_ID: '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
    }
    expect(loadEnv(scaleway).mail).toEqual({
      provider: 'scaleway',
      secretKey: 'secret',
      projectId: '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
      region: 'fr-par',
      from: { email: 'no-reply@waiggle.com', name: appName },
    })
    // Le service n'existe qu'à Paris : une autre région est refusée au démarrage, pas au premier e-mail.
    expect(() => loadEnv({ ...scaleway, SCALEWAY_REGION: 'nl-ams' })).toThrow(/SCALEWAY_REGION/)
    // Sans clé ou sans projet, le serveur ne démarre pas plutôt que d'échouer au premier e-mail.
    expect(() => loadEnv({ ...scaleway, SCALEWAY_SECRET_KEY: undefined })).toThrow(
      /SCALEWAY_SECRET_KEY/,
    )
    expect(() => loadEnv({ ...scaleway, SCALEWAY_PROJECT_ID: 'not-a-uuid' })).toThrow(
      /SCALEWAY_PROJECT_ID/,
    )
  })

  it('refuses to start in production without an invite code: sign-up stays closed by default', () => {
    expect(() => loadEnv({ ...production, SIGNUP_INVITE_CODE: undefined })).toThrow(
      /SIGNUP_INVITE_CODE/,
    )
    expect(() => loadEnv({ ...production, SIGNUP_INVITE_CODE: '' })).toThrow(/SIGNUP_INVITE_CODE/)
  })

  it('refuses an invite code shorter than 12 characters, spaces around it not counted', () => {
    expect(() => loadEnv({ ...production, SIGNUP_INVITE_CODE: 'miel-2026' })).toThrow(
      /SIGNUP_INVITE_CODE/,
    )
    expect(() => loadEnv({ ...production, SIGNUP_INVITE_CODE: '  miel-2026  ' })).toThrow(
      /SIGNUP_INVITE_CODE/,
    )
  })

  it('refuses the example codes published in this repository, which anyone can read', () => {
    for (const example of ['Miel-2026-Noel', ' SMOKE-test-invite-code ', 'F3A9C2E17B4D8A06']) {
      expect(() => loadEnv({ ...production, SIGNUP_INVITE_CODE: example })).toThrow(
        /SIGNUP_INVITE_CODE/,
      )
    }
  })

  // L'interrupteur des e-mails de notification (tranche 6c, décision de Louis du 20/10/2026) : à
  // « off », l'ordonnanceur ne planifie ni le récap ni les e-mails de mentions (la purge de nuit
  // continue). On le coupe avant de restaurer une sauvegarde, qui ramènerait des comptes supprimés
  // et des désinscriptions annulées (docs/ops/serveur.md).
  it('turns the notification e-mails on by default, and lets them be turned off', () => {
    expect(loadEnv({}).emailJobs).toBe(true)
    expect(loadEnv(production).emailJobs).toBe(true)
    expect(loadEnv({ ...production, EMAIL_JOBS: 'on' }).emailJobs).toBe(true)
    expect(loadEnv({ ...production, EMAIL_JOBS: 'off' }).emailJobs).toBe(false)
    // Une variable vide compte comme absente ; une faute de frappe arrête le serveur.
    expect(loadEnv({ ...production, EMAIL_JOBS: '' }).emailJobs).toBe(true)
    expect(() => loadEnv({ ...production, EMAIL_JOBS: 'false' })).toThrow(/EMAIL_JOBS/)
    expect(() => loadEnv({ ...production, EMAIL_JOBS: 'OFF ' })).toThrow(/EMAIL_JOBS/)
  })

  // R8 : le SMTP de Scaleway. Sans TLS, l'identification (le projet et la clé secrète) partirait en
  // clair : seuls les ports 465 (TLS dès la connexion) et 587 (STARTTLS exigé) sont permis.
  it('refuses an SMTP configuration without TLS', () => {
    const smtp = {
      ...production,
      EMAIL_TRANSPORT: 'scaleway-smtp',
      BREVO_API_KEY: undefined,
      SCALEWAY_SECRET_KEY: 'secret',
      SCALEWAY_PROJECT_ID: '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
    }
    // Témoin : par défaut, le serveur de Scaleway sur le port 465.
    expect(loadEnv(smtp).mail).toEqual({
      provider: 'scaleway-smtp',
      host: 'smtp.tem.scaleway.com',
      port: 465,
      user: '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
      password: 'secret',
      from: { email: 'no-reply@waiggle.com', name: appName },
    })
    expect(loadEnv({ ...smtp, SMTP_PORT: '587' }).mail).toMatchObject({ port: 587 })
    // Les ports sans chiffrement, et un port qui n'en est pas un, arrêtent le serveur.
    for (const port of ['25', '2525', '80', 'abc']) {
      expect(() => loadEnv({ ...smtp, SMTP_PORT: port }), port).toThrow(/SMTP_PORT/)
    }
    // Un hôte qui n'est pas un nom de machine (adresse, identifiant, espace) est refusé.
    for (const host of ['smtp.example.com:25', 'user@smtp.example.com', 'smtp .example.com', 'x']) {
      expect(() => loadEnv({ ...smtp, SMTP_HOST: host }), host).toThrow(/SMTP_HOST/)
    }
    // Comme l'API, le SMTP veut la clé et le projet ; et EMAIL_TRANSPORT refuse une autre valeur.
    expect(() => loadEnv({ ...smtp, SCALEWAY_SECRET_KEY: undefined })).toThrow(
      /SCALEWAY_SECRET_KEY/,
    )
    expect(() => loadEnv({ ...smtp, EMAIL_TRANSPORT: 'smtp' })).toThrow(/EMAIL_TRANSPORT/)
    // Le retour à l'API HTTP se fait par la variable, sans toucher au reste.
    expect(loadEnv({ ...smtp, EMAIL_TRANSPORT: 'scaleway-api' }).mail).toMatchObject({
      provider: 'scaleway',
    })
  })

  it('refuses to write emails in the logs in production, unless allowed for a trial', () => {
    const consoleMail = { ...production, MAIL_PROVIDER: 'console', BREVO_API_KEY: undefined }
    expect(() => loadEnv(consoleMail)).toThrow(/MAIL_PROVIDER/)
    expect(loadEnv({ ...consoleMail, ALLOW_CONSOLE_MAIL: 'true' }).mail).toEqual({
      provider: 'console',
    })
    // En développement, les e-mails dans le terminal restent le réglage par défaut.
    expect(loadEnv({}).mail).toEqual({ provider: 'console' })
  })
})
