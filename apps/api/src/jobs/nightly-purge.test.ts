// Tests de la purge de nuit (tranche 6c, conformité n°4 : ne rien garder plus longtemps qu'il ne
// sert). nightlyPurge(db, now) efface, chaque nuit à 3 h :
// - les sessions expirées et les jetons de vérification expirés ;
// - les compteurs anti-abus périmés : ceux de Better Auth (rate_limit, plus d'une heure) et les
//   nôtres (api_rate_limit, plus de 25 heures : la plus longue fenêtre, 24 h, plus une marge) ;
// - les pseudos dont la réservation est finie (purgeExpiredHandles) ;
// - les inscriptions jamais vérifiées, au bout de 30 jours (décision de Louis du 20/10/2026).
// Elle rend le nombre de lignes effacées de chaque sorte.
//
// L'heure vient du paramètre `now`, jamais de now() en SQL (relecture de sécurité S-A5) : la fausse
// horloge part d'une date loin d'aujourd'hui, et une purge qui lirait l'heure de la base effacerait
// tout ce qui est « encore valide » dans le test. Et une date mal comparée selon le fuseau de la
// connexion déconnecterait des membres : un test fixe le fuseau à Paris.
import { schema } from '@ruche/db'
import { eq, type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRateLimiter, RATE_WINDOW_MAX_MS } from '../rate-limit'
import { activity } from '../testing/activity'
import { createTestContext, type TestContext } from '../testing/context'
import { nightlyPurge } from './nightly-purge'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookie de session
let inesId: string

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const START = new Date('2026-06-15T08:00:00.000Z')

const inesAccount = {
  name: 'Inès Morel',
  email: 'ines@example.com',
  password: 'ines-long-password',
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  ines = await ctx.verifiedMember(inesAccount)
  inesId = (await act.me(ines)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Une requête SQL brute ; on précise nous-mêmes la forme du résultat. */
const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

const at = (base: Date, offset: number) => new Date(base.getTime() + offset)

/** Une session d'Inès qui expire à `expiresAt` (le reste comme Better Auth l'écrit). */
const sessionExpiring = (id: string, expiresAt: Date) =>
  ctx.db.insert(schema.session).values({
    id,
    token: `token-${id}`,
    userId: inesId,
    expiresAt,
    createdAt: START,
    updatedAt: START,
  })

const sessionIds = async () =>
  (await ctx.db.select({ id: schema.session.id }).from(schema.session)).map(({ id }) => id)

describe('the nightly purge', () => {
  it('erases expired sessions and keeps valid ones, whatever the time zone of the database', async () => {
    const now = at(START, HOUR)
    await sessionExpiring('expired', at(now, -MINUTE))
    await sessionExpiring('valid', at(now, 30 * MINUTE))
    // Le fuseau de la connexion : Paris (UTC+2 en juin). Une comparaison qui en dépendrait
    // effacerait la session qui expire dans 30 minutes.
    await ctx.db.execute(sql`set time zone 'Europe/Paris'`)
    const before = (await sessionIds()).length

    const purged = await nightlyPurge(ctx.db, now)

    const left = await sessionIds()
    expect(left).toContain('valid')
    expect(left).not.toContain('expired')
    expect(purged.sessions).toBe(before - left.length)
  })

  it('erases expired verification tokens and keeps valid ones', async () => {
    const now = at(START, HOUR)
    await ctx.db.insert(schema.verification).values([
      { id: 'expired', identifier: 'a', value: 'x', expiresAt: at(now, -MINUTE) },
      { id: 'valid', identifier: 'b', value: 'y', expiresAt: at(now, 30 * MINUTE) },
    ])
    const ids = async () =>
      (await ctx.db.select({ id: schema.verification.id }).from(schema.verification)).map(
        ({ id }) => id,
      )
    const before = (await ids()).length

    const purged = await nightlyPurge(ctx.db, now)

    const left = await ids()
    expect(left).toContain('valid')
    expect(left).not.toContain('expired')
    expect(purged.verifications).toBe(before - left.length)
  })

  it('erases the counters of Better Auth older than an hour', async () => {
    const now = at(START, 2 * HOUR)
    await ctx.db.insert(schema.rateLimit).values([
      {
        id: 'old',
        key: '198.51.100.1/sign-in/email',
        count: 3,
        lastRequest: now.getTime() - 61 * MINUTE,
      },
      {
        id: 'recent',
        key: '198.51.100.2/sign-in/email',
        count: 3,
        lastRequest: now.getTime() - 59 * MINUTE,
      },
    ])
    const ids = async () =>
      (await ctx.db.select({ id: schema.rateLimit.id }).from(schema.rateLimit)).map(({ id }) => id)
    const before = (await ids()).length

    const purged = await nightlyPurge(ctx.db, now)

    const left = await ids()
    expect(left).toContain('recent')
    expect(left).not.toContain('old')
    expect(purged.rateLimits).toBe(before - left.length)
  })

  it('erases our counters older than the longest window, plus a margin', async () => {
    const now = at(START, 2 * DAY)
    await ctx.db.insert(schema.apiRateLimit).values([
      { key: 'old', count: 3, windowStart: now.getTime() - 25 * HOUR - MINUTE },
      { key: 'recent', count: 3, windowStart: now.getTime() - 23 * HOUR - 59 * MINUTE },
    ])
    const keys = async () =>
      (await ctx.db.select({ key: schema.apiRateLimit.key }).from(schema.apiRateLimit)).map(
        ({ key }) => key,
      )
    const before = (await keys()).length

    const purged = await nightlyPurge(ctx.db, now)

    const left = await keys()
    expect(left).toContain('recent')
    expect(left).not.toContain('old')
    expect(purged.apiRateLimits).toBe(before - left.length)
  })

  it('erases the handles whose reservation is over', async () => {
    await act.updateProfile(ines, { handle: 'ines' })
    const handles = () =>
      rows<{ handle: string }>(
        sql`select handle from member_handle where user_id = ${inesId} order by handle`,
      )
    expect(await handles()).toEqual([{ handle: 'ines' }, { handle: 'ines_morel' }])

    expect((await nightlyPurge(ctx.db, at(START, 30 * DAY - MINUTE))).handles).toBe(0)
    expect((await nightlyPurge(ctx.db, at(START, 30 * DAY + MINUTE))).handles).toBe(1)

    expect(await handles()).toEqual([{ handle: 'ines' }])
  })
})

describe('sign-ups never verified', () => {
  const paul = { name: 'Paul', email: 'paul@example.com', password: 'paul-long-password' }
  const userIds = async () =>
    (await ctx.db.select({ id: schema.user.id }).from(schema.user)).map(({ id }) => id)

  it('erases an account still unverified after 30 days, and never a verified one', async () => {
    expect((await ctx.signUp(paul)).status).toBe(200)
    const [paulRow] = await ctx.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, paul.email))
    const paulId = paulRow?.id ?? ''

    // 29 jours : encore gardé.
    expect((await nightlyPurge(ctx.db, at(START, 29 * DAY))).unverifiedAccounts).toBe(0)
    expect(await userIds()).toContain(paulId)

    // 30 jours et une minute : effacé, avec sa façon de se connecter. Inès, vérifiée et inscrite
    // le même jour, reste.
    const purged = await nightlyPurge(ctx.db, at(START, 30 * DAY + MINUTE))

    expect(purged.unverifiedAccounts).toBe(1)
    expect(await userIds()).toEqual([inesId])
    expect(
      await ctx.db.select().from(schema.account).where(eq(schema.account.userId, paulId)),
    ).toEqual([])
    // Témoin : Inès se connecte toujours.
    expect((await ctx.signIn(inesAccount)).status).toBe(200)
  })

  it('counts the 30 days from the sign-up, not from the last attempt', async () => {
    expect((await ctx.signUp(paul)).status).toBe(200)
    // Paul retente de s'inscrire 20 jours plus tard (la même adresse) : son compte reste celui du
    // premier jour, et sa date aussi.
    vi.setSystemTime(at(START, 20 * DAY))
    await ctx.signUp(paul)

    await nightlyPurge(ctx.db, at(START, 30 * DAY + MINUTE))

    expect(await userIds()).toEqual([inesId])
  })
})

describe('the longest window of our counters', () => {
  it('is one day, and no counter may use a longer one: the purge relies on it', async () => {
    expect(RATE_WINDOW_MAX_MS).toBe(DAY)
    const limiter = createRateLimiter(ctx.db)

    await expect(limiter.hit('too-long', { windowMs: DAY + HOUR, max: 1 })).rejects.toThrow()
    await expect(limiter.hit('one-day', { windowMs: DAY, max: 1 })).resolves.toEqual({
      allowed: true,
    })
  })
})
