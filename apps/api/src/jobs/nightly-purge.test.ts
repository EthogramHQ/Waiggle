// Tests de la purge de nuit (tranche 6c, conformité n°4 : ne rien garder plus longtemps qu'il ne
// sert). nightlyPurge(db, now, storage) efface, chaque nuit à 3 h (R7a : aussi les photos de mise
// à jour restées en attente plus de 24 heures, ligne et fichier, d'où le stockage) :
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
import { randomUUID } from 'node:crypto'
import { foldTool, toolSlug } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq, type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_RATE_RULES, AUTH_RATE_WINDOW_MAX_MS } from '../auth/auth'
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

    const purged = await nightlyPurge(ctx.db, now, ctx.storage)

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

    const purged = await nightlyPurge(ctx.db, now, ctx.storage)

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

    const purged = await nightlyPurge(ctx.db, now, ctx.storage)

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

    const purged = await nightlyPurge(ctx.db, now, ctx.storage)

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

    expect((await nightlyPurge(ctx.db, at(START, 30 * DAY - MINUTE), ctx.storage)).handles).toBe(0)
    expect((await nightlyPurge(ctx.db, at(START, 30 * DAY + MINUTE), ctx.storage)).handles).toBe(1)

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
    expect((await nightlyPurge(ctx.db, at(START, 29 * DAY), ctx.storage)).unverifiedAccounts).toBe(
      0,
    )
    expect(await userIds()).toContain(paulId)

    // 30 jours et une minute : effacé, avec sa façon de se connecter. Inès, vérifiée et inscrite
    // le même jour, reste.
    const purged = await nightlyPurge(ctx.db, at(START, 30 * DAY + MINUTE), ctx.storage)

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

    await nightlyPurge(ctx.db, at(START, 30 * DAY + MINUTE), ctx.storage)

    expect(await userIds()).toEqual([inesId])
  })

  // Relecture de sécurité A3 : la purge efface en SQL, sans le ménage de la suppression d'un
  // compte (fichiers, commentaires, compteurs). Un compte qui a reçu un pseudo (donné à la
  // vérification de l'adresse) a été un vrai membre : même redevenu « non vérifié » (un futur
  // changement d'adresse, par exemple), la purge ne le touche jamais.
  it('keeps an unverified account that already has a handle (a former member)', async () => {
    await ctx.db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, inesId))

    const purged = await nightlyPurge(ctx.db, at(START, 30 * DAY + MINUTE), ctx.storage)

    expect(purged.unverifiedAccounts).toBe(0)
    expect(await userIds()).toEqual([inesId])
  })
})

// Relecture de sécurité A4 : la purge garde les compteurs de Better Auth pendant sa plus longue
// fenêtre, lue dans ses règles (auth.ts). Un compteur encore dans la fenêtre de n'importe quelle
// règle est gardé : sinon la règle repartirait de zéro chaque nuit.
describe('the counters of Better Auth', () => {
  it('are kept as long as the longest window of its rules', async () => {
    const now = at(START, 2 * DAY)
    const windows = Object.values(AUTH_RATE_RULES).map(({ window }) => window * 1000)
    expect(AUTH_RATE_WINDOW_MAX_MS).toBe(Math.max(...windows))
    await ctx.db.insert(schema.rateLimit).values(
      windows.map((windowMs, i) => ({
        id: `rule-${i}`,
        key: `198.51.100.${i}/rule`,
        count: 1,
        lastRequest: now.getTime() - windowMs + MINUTE,
      })),
    )

    await nightlyPurge(ctx.db, now, ctx.storage)

    const left = (await ctx.db.select({ id: schema.rateLimit.id }).from(schema.rateLimit)).map(
      ({ id }) => id,
    )
    expect(left).toEqual(expect.arrayContaining(windows.map((_, i) => `rule-${i}`)))
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

// ─── Tranche 7a : les signalements et les décisions de modération ─────────────────────────────────
// Règles 16 et 17 de la relecture du plan (22/10/2026), durées à faire valider par un
// professionnel :
// - un signalement sans objet (compte de l'auteur supprimé, contenu disparu) est effacé au bout de
//   30 jours, jamais la nuit même (le temps de prévenir les autorités) ;
// - un signalement clos (retiré, classé), un an après la décision ;
// - une décision, un an après la dernière décision sur la même cible ; jamais tant que son contenu
//   reste retiré (sinon l'auteur perdrait l'explication).
// Les lignes sont écrites directement en base : ces tests ne vérifient que la purge.
describe('the reports and decisions of the moderation', () => {
  type ReportRow = typeof schema.contentReport.$inferInsert

  /** Un signalement d'Inès (elle signale : on ne teste ici que les durées). */
  const insertReport = async (values: Partial<ReportRow>) => {
    const id = randomUUID()
    await ctx.db.insert(schema.contentReport).values({
      id,
      reporterId: inesId,
      targetKind: 'project',
      targetId: randomUUID(),
      projectId: null,
      targetAuthorId: null,
      reason: 'other',
      // Tranche 7b : la copie est un tableau de champs.
      snapshot: [{ field: 'title', value: 'Le texte signalé' }],
      status: 'open',
      createdAt: START,
      ...values,
    })
    return id
  }
  const reportStatuses = async () =>
    Object.fromEntries(
      (
        await ctx.db
          .select({ id: schema.contentReport.id, status: schema.contentReport.status })
          .from(schema.contentReport)
      ).map(({ id, status }) => [id, status]),
    )
  const insertDecision = async (targetId: string, action: string, createdAt: Date) => {
    const id = randomUUID()
    await ctx.db.insert(schema.moderationDecision).values({
      id,
      targetKind: 'project',
      targetId,
      action,
      ground: action === 'remove' ? 'rules' : null,
      explanation: action === 'remove' ? 'Publicité déguisée.' : null,
      adminId: null,
      createdAt,
    })
    return id
  }
  const decisionIds = async () =>
    (await ctx.db.select({ id: schema.moderationDecision.id }).from(schema.moderationDecision)).map(
      ({ id }) => id,
    )

  it('erases a void report after 30 days, never the same night', async () => {
    const id = await insertReport({ status: 'void', decidedAt: START })

    await nightlyPurge(ctx.db, at(START, HOUR), ctx.storage)
    expect(await reportStatuses()).toEqual({ [id]: 'void' })
    await nightlyPurge(ctx.db, at(START, 29 * DAY), ctx.storage)
    expect(await reportStatuses()).toEqual({ [id]: 'void' })

    await nightlyPurge(ctx.db, at(START, 30 * DAY + HOUR), ctx.storage)
    expect(await reportStatuses()).toEqual({})
  })

  // R7a (relecture juridique P7) : la migration 0018 efface les notes du Journal et classe « sans
  // objet » leurs signalements encore ouverts, datés du jour de la migration. La purge les efface
  // 30 jours plus tard, comme tout signalement sans objet ; une décision prise sur une note part au
  // bout d'un an, sa note n'existant plus pour la retenir. Ces deux tests passent avant R7a : ils
  // gardent la purge quand la table project_note aura disparu (reports/retention.ts la lit).
  it('erases a report on a journal note voided by the migration, 30 days later', async () => {
    const id = await insertReport({ targetKind: 'note', status: 'void', decidedAt: START })

    await nightlyPurge(ctx.db, at(START, 29 * DAY), ctx.storage)
    expect(await reportStatuses()).toEqual({ [id]: 'void' })

    await nightlyPurge(ctx.db, at(START, 30 * DAY + HOUR), ctx.storage)
    expect(await reportStatuses()).toEqual({})
  })

  it('erases a decision taken on a journal note one year later', async () => {
    const id = randomUUID()
    await ctx.db.insert(schema.moderationDecision).values({
      id,
      targetKind: 'note',
      targetId: randomUUID(),
      action: 'remove',
      ground: 'rules',
      explanation: 'Publicité déguisée.',
      adminId: null,
      createdAt: START,
    })

    await nightlyPurge(ctx.db, at(START, 365 * DAY - HOUR), ctx.storage)
    expect(await decisionIds()).toEqual([id])

    await nightlyPurge(ctx.db, at(START, 365 * DAY + HOUR), ctx.storage)
    expect(await decisionIds()).toEqual([])
  })

  it('voids the open or dismissed reports whose author is gone, and erases them 30 days later', async () => {
    // L'auteur du contenu est parti (target_author_id mis à null par la base), mais la suppression
    // du compte n'a pas pu les classer : la purge rattrape.
    const open = await insertReport({ status: 'open', targetKind: 'member', targetId: 'gone-id' })
    const dismissed = await insertReport({ status: 'dismissed', decidedAt: START })
    const removed = await insertReport({ status: 'removed', decidedAt: START })

    await nightlyPurge(ctx.db, at(START, HOUR), ctx.storage)

    expect(await reportStatuses()).toEqual({
      [open]: 'void',
      [dismissed]: 'void',
      // Suivi d'un retrait : gardé tel quel, avec son texte, jusqu'au terme d'un an.
      [removed]: 'removed',
    })
    await nightlyPurge(ctx.db, at(START, 31 * DAY + 2 * HOUR), ctx.storage)
    expect(await reportStatuses()).toEqual({ [removed]: 'removed' })
  })

  it('voids the open reports of a content its author deleted', async () => {
    // Précision 6 du plan : sans code dans chaque route de suppression.
    const id = await insertReport({
      targetKind: 'comment',
      targetId: randomUUID(), // aucun commentaire de ce nom : supprimé depuis
      targetAuthorId: inesId,
    })

    await nightlyPurge(ctx.db, at(START, HOUR), ctx.storage)

    expect(await reportStatuses()).toEqual({ [id]: 'void' })
  })

  it('keeps a closed report one year after the decision, whatever the time zone', async () => {
    const meteo = await act.publish(ines, 'Météo')
    const base = { targetId: meteo.id, projectId: meteo.id, targetAuthorId: inesId }
    const dismissed = await insertReport({ ...base, status: 'dismissed', decidedAt: START })
    const removed = await insertReport({
      ...base,
      reporterId: null,
      targetAuthorId: null,
      status: 'removed',
      decidedAt: at(START, DAY),
    })
    await ctx.db.execute(sql`set time zone 'Europe/Paris'`)

    await nightlyPurge(ctx.db, at(START, 365 * DAY - HOUR), ctx.storage)
    expect(await reportStatuses()).toEqual({ [dismissed]: 'dismissed', [removed]: 'removed' })

    await nightlyPurge(ctx.db, at(START, 365 * DAY + HOUR), ctx.storage)
    expect(await reportStatuses()).toEqual({ [removed]: 'removed' })
    await nightlyPurge(ctx.db, at(START, 366 * DAY + HOUR), ctx.storage)
    expect(await reportStatuses()).toEqual({})
  })

  it('keeps the decisions on a target one year after the last one', async () => {
    const meteo = await act.publish(ines, 'Météo')
    const removal = await insertDecision(meteo.id, 'remove', START)
    const restore = await insertDecision(meteo.id, 'restore', at(START, 200 * DAY))

    await nightlyPurge(ctx.db, at(START, 366 * DAY), ctx.storage)
    expect((await decisionIds()).sort()).toEqual([removal, restore].sort())

    await nightlyPurge(ctx.db, at(START, 566 * DAY), ctx.storage)
    expect(await decisionIds()).toEqual([])
  })

  it('never erases the decision of a content still removed', async () => {
    const meteo = await act.publish(ines, 'Météo')
    const removal = await insertDecision(meteo.id, 'remove', START)
    await ctx.db
      .update(schema.project)
      .set({ removedAt: START, removalId: removal })
      .where(eq(schema.project.id, meteo.id))

    await nightlyPurge(ctx.db, at(START, 2 * 365 * DAY), ctx.storage)

    expect(await decisionIds()).toEqual([removal])
    const [row] = await ctx.db
      .select({ removalId: schema.project.removalId })
      .from(schema.project)
      .where(eq(schema.project.id, meteo.id))
    expect(row?.removalId).toBe(removal)
  })
})

// ─── Tranche R6b : les « Autre » orphelins et le journal du catalogue ─────────────────────────────
// Décision 5 du plan (sec-A5, jur-T6) : un « Autre » s'efface dans la transaction qui retire
// sa dernière référence ; la purge de nuit est le filet qui rattrape ce qui aurait échappé (une
// panne entre deux écritures, une suppression faite en SQL). Le journal « Changements récents »
// (catalogue_change) est effacé au bout d'un an. Les lignes sont écrites en SQL brut : les tables
// n'existent pas encore dans le schéma typé quand ces tests sont écrits, et un « Autre » orphelin ne
// peut pas naître par l'API.
describe('the « other » tools and the catalogue journal (R6b)', () => {
  /** Une date ISO, liée comme texte puis lue en UTC (voir code-api.md : dates en SQL brut). */
  const utc = (date: Date) => sql`${date.toISOString()}::timestamptz at time zone 'UTC'`

  /** Un outil posé en base : un « Autre » (sans famille) ou un outil du catalogue. */
  const insertTool = async (name: string, status: 'catalogue' | 'other') => {
    const id = randomUUID()
    await ctx.db.execute(
      sql`insert into tool (id, slug, name, folded, status, family, created_at) values (${id}, ${toolSlug(name)}, ${name}, ${foldTool(name)}, ${status}, ${status === 'catalogue' ? 'assistant' : null}, ${utc(START)})`,
    )
    return id
  }

  const toolNames = async () =>
    (await rows<{ name: string }>(sql`select name from tool order by name`)).map(({ name }) => name)

  const catalogueCount = async () =>
    (
      await rows<{ n: number }>(sql`select count(*)::int as n from tool where status = 'catalogue'`)
    )[0]?.n

  it('purges orphan « other » tools at night', async () => {
    const meteo = await act.publish(ines, 'Météo')
    const orphan = await insertTool('Zorblax Orphelin', 'other')
    const cited = await insertTool('Zorblax Cité', 'other')
    await insertTool('Zorblax Studio', 'catalogue')
    await ctx.db.execute(
      sql`insert into project_tool (project_id, tool_id, position, label) values (${meteo.id}, ${cited}, 0, 'Zorblax Cité')`,
    )
    const catalogue = await catalogueCount()

    await nightlyPurge(ctx.db, at(START, HOUR), ctx.storage)

    const left = await toolNames()
    expect(left).not.toContain('Zorblax Orphelin')
    expect(left).toContain('Zorblax Cité')
    // Un outil du catalogue n'est jamais purgé, même quand aucun projet ne le cite.
    expect(left).toContain('Zorblax Studio')
    expect(await catalogueCount()).toBe(catalogue)
    expect(await rows(sql`select 1 from tool where id = ${orphan}`)).toEqual([])
  })

  it('deletes an other tool that no project and no profile cites any more', async () => {
    const favourite = await insertTool('Zorblax Favori', 'other')
    await ctx.db.execute(
      sql`insert into profile_tool (user_id, tool_id, position, label) values (${inesId}, ${favourite}, 0, 'Zorblax Favori')`,
    )

    // Cité par le profil d'Inès seulement : gardé.
    await nightlyPurge(ctx.db, at(START, HOUR), ctx.storage)
    expect(await toolNames()).toContain('Zorblax Favori')

    // Le profil ne le cite plus (une suppression faite hors de l'API) : la nuit suivante l'efface.
    await ctx.db.execute(sql`delete from profile_tool where tool_id = ${favourite}`)
    await nightlyPurge(ctx.db, at(START, DAY + HOUR), ctx.storage)
    expect(await toolNames()).not.toContain('Zorblax Favori')
  })

  it('keeps no author on an other tool', async () => {
    // Décision 5 : tool.created_by est toujours nul pour un « Autre », même créé par un membre.
    await act.publish(ines, 'Mon trieur de photos', { tools: ['Teachable Machine'] })

    const authors = () =>
      rows<{ created_by: string | null }>(
        sql`select created_by from tool where folded = 'teachablemachine'`,
      )
    expect(await authors()).toEqual([{ created_by: null }])

    // La purge le garde (il est cité), toujours sans auteur.
    await nightlyPurge(ctx.db, at(START, HOUR), ctx.storage)
    expect(await authors()).toEqual([{ created_by: null }])
  })

  // Relecture juridique jur-J5 (décision de Louis du 9/11/2026 au soir) : un « Autre » laissé hors
  // du catalogue (souvent un nom injurieux, ou qui nomme quelqu'un) ne se garde pas sans fin. Un an
  // après sa ligne `tool_dismiss`, il s'efface la nuit dès que plus rien ne le cite, comme tout
  // « Autre » ; tant qu'un projet ou un profil le cite, il reste (et s'efface la nuit qui suit le
  // retrait de sa dernière mention, même si la ligne du journal est déjà partie).
  it('deletes an « other » tool left out of the catalogue a year after it was dismissed', async () => {
    const dismiss = async (name: string, at: Date) => {
      const id = await insertTool(name, 'other')
      await ctx.db.execute(sql`update tool set status = 'dismissed' where id = ${id}`)
      await ctx.db.execute(
        sql`insert into catalogue_change (id, action, tool_id, created_at) values (${randomUUID()}, 'tool_dismiss', ${id}, ${utc(at)})`,
      )
      return id
    }
    const old = await dismiss('Zorblax Laissé', START)
    await dismiss('Zorblax Récent', at(START, 200 * DAY))
    const cited = await dismiss('Zorblax Cité', START)
    await ctx.db.execute(
      sql`insert into profile_tool (user_id, tool_id, position, label) values (${inesId}, ${cited}, 0, 'Zorblax Cité')`,
    )

    // Le catalogue semé par la migration reste là : on ne regarde que les noms de ce test.
    const zorblax = async () => (await toolNames()).filter((name) => name.startsWith('Zorblax'))
    const catalogue = await catalogueCount()

    // Moins d'un an : tout reste, même l'écarté que plus rien ne cite.
    await nightlyPurge(ctx.db, at(START, 365 * DAY - HOUR), ctx.storage)
    expect(await zorblax()).toEqual(['Zorblax Cité', 'Zorblax Laissé', 'Zorblax Récent'])

    // Un an après : l'écarté orphelin s'efface ; celui qu'un profil cite reste, le récent aussi.
    await nightlyPurge(ctx.db, at(START, 365 * DAY + HOUR), ctx.storage)
    expect(await zorblax()).toEqual(['Zorblax Cité', 'Zorblax Récent'])
    expect(await rows(sql`select 1 from tool where id = ${old}`)).toEqual([])

    // La dernière mention retirée (sa ligne du journal est partie la nuit d'avant) : il s'efface.
    await ctx.db.execute(sql`delete from profile_tool where tool_id = ${cited}`)
    await nightlyPurge(ctx.db, at(START, 366 * DAY + HOUR), ctx.storage)
    expect(await zorblax()).toEqual(['Zorblax Récent'])
    // Le catalogue, lui, n'a rien perdu.
    expect(await catalogueCount()).toBe(catalogue)
  })

  it('deletes the catalogue journal lines older than a year', async () => {
    const insertChange = async (createdAt: Date) => {
      const id = randomUUID()
      await ctx.db.execute(
        sql`insert into catalogue_change (id, action, merged_name, created_at) values (${id}, 'tool_merge', 'Chat GPT', ${utc(createdAt)})`,
      )
      return id
    }
    const old = await insertChange(START)
    const recent = await insertChange(at(START, 2 * DAY))
    const changeIds = async () =>
      (await rows<{ id: string }>(sql`select id from catalogue_change`)).map(({ id }) => id).sort()

    await nightlyPurge(ctx.db, at(START, 365 * DAY - HOUR), ctx.storage)
    expect(await changeIds()).toEqual([old, recent].sort())

    await nightlyPurge(ctx.db, at(START, 365 * DAY + HOUR), ctx.storage)
    expect(await changeIds()).toEqual([recent])

    await nightlyPurge(ctx.db, at(START, 367 * DAY + HOUR), ctx.storage)
    expect(await changeIds()).toEqual([])
  })
})

// R7a (relecture de sécurité A5) : une photo envoyée pour une mise à jour pas encore publiée
// (slot = 'update', sans update_id) est « en attente ». Au bout de 24 heures, la purge efface la
// ligne, puis le fichier ; une photo rattachée à une mise à jour, ou de la galerie, ne part jamais
// ici. La purge reçoit donc le stockage des fichiers en troisième argument.
describe('the pending photos of an update (R7a)', () => {
  /**
   * Un projet d'Inès, posé directement en base : ces tests ne regardent que la purge, pas la
   * réponse de l'API (dont la forme change avec R7a).
   */
  const insertProject = async () => {
    const id = randomUUID()
    await ctx.db.insert(schema.project).values({
      id,
      authorId: inesId,
      title: 'Mon carnet',
      pitch: 'Un carnet de jardin.',
      primaryCategory: 'other',
      createdAt: START,
      updatedAt: START,
      publishedAt: START,
    })
    return { id }
  }
  /** Une photo du projet, posée directement en base avec son fichier, à la date voulue. */
  const insertPhoto = async (projectId: string, slot: 'gallery' | 'update', createdAt: Date) => {
    const id = randomUUID()
    const storageKey = `visuals/${randomUUID()}.webp`
    await ctx.storage.put(storageKey, new Uint8Array([1, 2, 3]))
    await ctx.db.insert(schema.projectMedia).values({
      id,
      projectId,
      slot,
      position: 0,
      storageKey,
      width: 1200,
      height: 800,
      thumbhash: 'AAAA',
      createdAt,
    })
    return { id, storageKey }
  }
  const photoIds = async () =>
    (await ctx.db.select({ id: schema.projectMedia.id }).from(schema.projectMedia))
      .map(({ id }) => id)
      .sort()
  const hasFile = (key: string) => ctx.storage.files.has(key)

  it('erases a pending update photo after 24 hours, row and file', async () => {
    const project = await insertProject()
    const pending = await insertPhoto(project.id, 'update', START)

    await nightlyPurge(ctx.db, at(START, DAY - MINUTE), ctx.storage)
    expect(await photoIds()).toEqual([pending.id])
    expect(hasFile(pending.storageKey)).toBe(true)

    await nightlyPurge(ctx.db, at(START, DAY + MINUTE), ctx.storage)
    expect(await photoIds()).toEqual([])
    expect(hasFile(pending.storageKey)).toBe(false)
  })

  it('never erases a photo attached to an update, nor a gallery photo', async () => {
    const project = await insertProject()
    const gallery = await insertPhoto(project.id, 'gallery', START)
    const attached = await insertPhoto(project.id, 'update', START)
    // Une mise à jour publiée, qui cite la photo (SQL brut : la table naît avec la migration 0018).
    const updateId = randomUUID()
    await ctx.db.execute(
      sql`insert into project_update (id, project_id, title, version, lines, before_after, created_at) values (${updateId}, ${project.id}, null, 'v1.1', ${JSON.stringify([{ family: 'new', text: 'Un mode sombre' }])}::jsonb, false, ${START.toISOString()}::timestamptz at time zone 'UTC')`,
    )
    await ctx.db.execute(
      sql`update project_media set update_id = ${updateId} where id = ${attached.id}`,
    )

    await nightlyPurge(ctx.db, at(START, 30 * DAY), ctx.storage)

    expect(await photoIds()).toEqual([gallery.id, attached.id].sort())
    expect(hasFile(gallery.storageKey)).toBe(true)
    expect(hasFile(attached.storageKey)).toBe(true)
  })

  it('keeps purging when one file cannot be erased', async () => {
    const project = await insertProject()
    const first = await insertPhoto(project.id, 'update', START)
    const second = await insertPhoto(project.id, 'update', at(START, MINUTE))
    // Le premier fichier effacé lève une erreur (un disque plein, un fichier verrouillé).
    const erase = vi
      .spyOn(ctx.storage, 'delete')
      .mockRejectedValueOnce(new Error('the file cannot be erased'))

    await expect(nightlyPurge(ctx.db, at(START, 2 * DAY), ctx.storage)).resolves.toBeDefined()

    // Les deux lignes sont parties (la ligne d'abord, puis le fichier) ; le second fichier aussi,
    // malgré l'échec du premier.
    expect(await photoIds()).toEqual([])
    expect(erase).toHaveBeenCalledTimes(2)
    expect([first, second].filter(({ storageKey }) => hasFile(storageKey))).toHaveLength(1)
  })
})
