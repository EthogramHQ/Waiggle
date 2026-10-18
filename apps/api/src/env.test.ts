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
  PUBLIC_API_URL: 'https://api.waiggle.io',
  APP_URL: 'https://waiggle.io',
  MAIL_PROVIDER: 'brevo',
  BREVO_API_KEY: 'key',
  MAIL_FROM_EMAIL: 'no-reply@waiggle.io',
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
        from: { email: 'no-reply@waiggle.io', name: appName },
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
      from: { email: 'no-reply@waiggle.io', name: appName },
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
