// Tests d'intégration de la tranche R4 : la date de la dernière lecture du fil « Abonnements ».
// Scénario : docs/scenarios/refonte.md, « R4 », section « Tu es à jour ». L'appli lit son fil, puis
// envoie PUT /v1/feed/read avec la date (`at`) du premier élément affiché ; le serveur la garde
// (table feed_state, une ligne par membre) et la rend sur chaque page suivante (`lastReadAt`),
// pour que l'appli pose la sphère « Tu es à jour » avant le premier élément déjà vu.
//
// Règles venues des relectures du plan (31/10/2026) :
// - sec-A2 : la date est bornée des deux côtés (pas avant le 1/1/2026, pas après l'heure du
//   serveur) ; une date bien formée hors de ces bornes (l'an 0000, l'an 9999) répond 204 et
//   n'enregistre rien, jamais 500 ; lire une page n'avance jamais la date ;
// - sec-A3 : le quota (600 par heure) compte aussi les demandes mal formées ;
// - jur-J3 : la date est une trace d'activité ; seuls feed/state.ts, la route du fil et l'export la
//   lisent (test statique plus bas), et personne d'autre ne la voit.
//
// Trois membres : Léa (qui publie), Max (qui la suit et lit son fil), Zoé (qui la suit aussi, et
// montre que la date de Max n'est qu'à lui ; administratrice dans le test de la suspension).
//
// Le temps est maîtrisé par le test (voir feed.test.ts) : une fausse horloge, posée avant de créer
// l'API, part d'une date fixe de juin 2026, après la borne basse du 1/1/2026.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, posix, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AccountExport,
  ErrorResponse,
  FollowingFeedPage,
  Me,
  type ModerationDecisionInput,
  Project,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string // cookies de session
let max: string
let zoe: string
let leaId: string
let maxId: string
let zoeId: string

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const START = new Date('2026-06-15T08:00:00.000Z')

const leaAccount = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }
const maxAccount = { name: 'Max', email: 'max@example.com', password: 'another-long-password' }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)

  ctx = await createTestContext()
  act = activity(ctx)
  lea = await ctx.verifiedMember(leaAccount)
  max = await ctx.verifiedMember(maxAccount)
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  leaId = (await me(lea)).id
  maxId = (await me(max)).id
  zoeId = (await me(zoe)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une minute : assez pour que les dates diffèrent). */
const later = (ms = MINUTE) => vi.setSystemTime(Date.now() + ms)

const send = (method: string, path: string, cookie: string | null, body?: unknown) =>
  ctx.request(path, {
    method,
    headers: {
      ...(cookie && { cookie }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

const me = async (cookie: string) => {
  const res = await send('GET', '/v1/me', cookie)
  expect(res.status).toBe(200)
  return Me.parse(await res.json())
}

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Une réponse 204 : réussie, et sans corps. */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

/** Publie un projet public, une minute après ce qui précède. */
const publish = async (cookie: string, title = 'Carnet de cafés') => {
  later()
  const res = await send('POST', '/v1/projects', cookie, { title, pitch: 'Un petit projet.' })
  expect(res.status).toBe(201)
  return Project.parse(await res.json())
}

const followMember = async (id: string, cookie: string) =>
  expectDone(await send('POST', `/v1/members/${id}/follow`, cookie))

/** Une page du fil « Abonnements » (la première sans curseur). */
const readFollowing = async (cookie: string, cursor?: string) => {
  const query = cursor === undefined ? '' : `?${new URLSearchParams({ cursor })}`
  const res = await send('GET', `/v1/feed/following${query}`, cookie)
  expect(res.status).toBe(200)
  return FollowingFeedPage.parse(await res.json())
}

/** Ce que l'appli envoie quand elle a affiché le fil : « lu jusqu'à `upTo` ». */
const markRead = (cookie: string | null, upTo: unknown) =>
  send('PUT', '/v1/feed/read', cookie, { upTo })

/** La date retenue, telle que la rend la première page du fil. */
const lastReadAt = async (cookie: string) => (await readFollowing(cookie)).lastReadAt

const exportOf = async (cookie: string) => {
  const res = await send('GET', '/v1/me/export', cookie)
  expect(res.status).toBe(200)
  return AccountExport.parse(await res.json())
}

/** Range directement un compteur d'un membre, comme s'il avait déjà fait `count` demandes. */
const alreadyUsed = (key: string, count: number) =>
  ctx.db.insert(schema.apiRateLimit).values({ key, count, windowStart: Date.now() })

/** Les lignes d'une requête SQL brute (la table feed_state n'a pas encore de nom dans le schéma). */
const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

/** Max suit Léa, qui publie : le fil de Max a un élément, dont rend la date (`at`). */
const maxFollowsLeaWhoPublishes = async (title?: string) => {
  await followMember(leaId, max)
  await publish(lea, title)
  const page = await readFollowing(max)
  const newest = page.items[0]?.at
  if (newest === undefined) throw new Error('the feed of Max should not be empty')
  return newest
}

// ─── Qui peut marquer son fil lu ──────────────────────────────────────────────────────────────────

describe('who may mark the feed read', () => {
  it('asks to sign in', async () => {
    await expectError(await markRead(null, START.toISOString()), 401, 'unauthorized')
    // Témoin : la même demande, avec la session de Max, réussit (la route existe bien).
    await expectDone(await markRead(max, START.toISOString()))
  })

  it('refuses something that is not a date', async () => {
    for (const upTo of ['maintenant', '', '2026-06-15', null, 12]) {
      await expectError(await markRead(max, upTo), 400, 'validation')
    }
    await expectError(await send('PUT', '/v1/feed/read', max, {}), 400, 'validation')
    // Témoin : une vraie date passe.
    await expectDone(await markRead(max, START.toISOString()))
  })

  it('keeps the date for one member only, and shows it to nobody else', async () => {
    await maxFollowsLeaWhoPublishes()
    await followMember(leaId, zoe)
    // Une date qu'aucune autre donnée ne porte (les comptes datent de START, le projet d'une
    // minute après) : si elle apparaît ailleurs, c'est bien la date de lecture de Max.
    const upTo = new Date(START.getTime() + 30 * SECOND).toISOString()

    await expectDone(await markRead(max, upTo))

    expect(await lastReadAt(max)).toBe(upTo)
    // Zoé lit le même fil : rien ne dit qu'elle l'a lu, ni jusqu'où Max l'a lu.
    expect(await lastReadAt(zoe)).toBeNull()
    expect((await exportOf(zoe)).feed).toEqual({ readAt: null })
    // Léa, dont Max lit les projets, ne voit nulle part la date de Max.
    for (const path of ['/v1/feed/following', `/v1/members/${maxId}`, '/v1/me/export']) {
      const res = await send('GET', path, lea)
      expect(res.status, path).toBe(200)
      expect(await res.text(), path).not.toContain(upTo)
    }
  })

  it('lets a suspended member mark the feed read, as he still reads it', async () => {
    const newest = await maxFollowsLeaWhoPublishes()
    await act.makeAdmin(zoeId)
    later()
    const suspension: ModerationDecisionInput = {
      action: 'suspend',
      memberId: maxId,
      duration: '7d',
      ground: 'rules',
      explanation: 'Messages insultants répétés sous les projets des autres.',
    }
    await act.decide(zoe, suspension)
    // Témoin : la suspension refuse bien à Max d'écrire ailleurs (publier).
    later()
    const refused = await send('POST', '/v1/projects', max, { title: 'Non', pitch: 'Refusé.' })
    expect(refused.status).toBe(403)

    await expectDone(await markRead(max, newest))
    expect(await lastReadAt(max)).toBe(newest)
  })
})

// ─── La date retenue ──────────────────────────────────────────────────────────────────────────────

describe('the date of the last reading', () => {
  it('is null until the feed is marked read, then given back as it was sent', async () => {
    const newest = await maxFollowsLeaWhoPublishes()
    expect(await lastReadAt(max)).toBeNull()

    await expectDone(await markRead(max, newest))

    expect(await lastReadAt(max)).toBe(newest)
  })

  it('gives the date kept before this reading on every page, the next ones too', async () => {
    // 21 projets publics de Léa, rangés directement dans la base (la publication est limitée à 20
    // par jour), une seconde d'écart chacun : la première page en montre 20, la seconde 1.
    await followMember(leaId, max)
    const start = Date.now()
    await ctx.db.insert(schema.project).values(
      Array.from({ length: 21 }, (_, i) => {
        const at = new Date(start + i * SECOND)
        return {
          id: crypto.randomUUID(),
          authorId: leaId,
          title: `Projet ${i}`,
          pitch: 'Un petit projet.',
          description: '',
          status: 'idea' as const,
          visibility: 'public' as const,
          tools: [],
          toolSlugs: [],
          createdAt: at,
          updatedAt: at,
          publishedAt: at,
        }
      }),
    )
    later()
    const first = await readFollowing(max)
    const newest = first.items[0]?.at ?? ''
    await expectDone(await markRead(max, newest))

    const again = await readFollowing(max)
    expect(again.lastReadAt).toBe(newest)
    expect(again.nextCursor).not.toBeNull()
    const second = await readFollowing(max, again.nextCursor ?? '')
    expect(second.items).toHaveLength(1)
    expect(second.lastReadAt).toBe(newest)
  })

  it('never goes back: an older date changes nothing', async () => {
    const older = await maxFollowsLeaWhoPublishes('Plus ancien')
    await publish(lea, 'Plus récent')
    const newest = (await readFollowing(max)).items[0]?.at ?? ''
    await expectDone(await markRead(max, newest))

    // Un autre appareil de Max, resté sur une page plus ancienne, envoie une date plus ancienne.
    await expectDone(await markRead(max, older))

    expect(await lastReadAt(max)).toBe(newest)
  })

  it('moves forward when a newer item is read', async () => {
    const older = await maxFollowsLeaWhoPublishes('Plus ancien')
    await expectDone(await markRead(max, older))
    await publish(lea, 'Plus récent')
    const newest = (await readFollowing(max)).items[0]?.at ?? ''

    await expectDone(await markRead(max, newest))

    expect(await lastReadAt(max)).toBe(newest)
  })

  it('never moves lastReadAt when the feed is read, only PUT /v1/feed/read does', async () => {
    const first = await maxFollowsLeaWhoPublishes('Premier')
    // Lire, relire, et lire Découvrir : aucune lecture n'écrit la date.
    expect(await lastReadAt(max)).toBeNull()
    expect((await send('GET', '/v1/feed/discover', max)).status).toBe(200)
    expect(await lastReadAt(max)).toBeNull()

    await expectDone(await markRead(max, first))
    await publish(lea, 'Second')
    // La page qui montre le second projet rend la date d'avant : celle du premier. La lire ne
    // l'avance pas ; c'est l'appli qui enverra la nouvelle date, quand elle l'aura affichée.
    const page = await readFollowing(max)
    expect(page.items).toHaveLength(2)
    expect(page.lastReadAt).toBe(first)
    expect(await lastReadAt(max)).toBe(first)
    expect((await exportOf(max)).feed).toEqual({ readAt: first })
  })

  it('stores nothing beyond the time of the server', async () => {
    const newest = await maxFollowsLeaWhoPublishes()

    // Une date de demain, bien formée : 204, et rien n'est retenu (contrat, FeedReadBody).
    await expectDone(await markRead(max, new Date(Date.now() + DAY).toISOString()))
    expect(await lastReadAt(max)).toBeNull()

    // Et une date déjà retenue n'est pas poussée vers l'avenir.
    await expectDone(await markRead(max, newest))
    await expectDone(await markRead(max, new Date(Date.now() + HOUR).toISOString()))
    expect(await lastReadAt(max)).toBe(newest)
  })

  it('answers 204, never 500, to a well-formed date of year 0000 or 9999, and stores nothing before the launch', async () => {
    const newest = await maxFollowsLeaWhoPublishes()
    const outOfBounds = [
      '0000-01-01T00:00:00Z', // PostgreSQL refuse l'an 0 : il ne doit jamais le recevoir
      '9999-12-31T23:59:59Z',
      '2025-12-31T12:00:00.000Z', // avant le 1/1/2026, l'ouverture du site
    ]

    // Sans ligne encore : rien n'est créé.
    for (const upTo of outOfBounds) await expectDone(await markRead(max, upTo))
    expect(await lastReadAt(max)).toBeNull()
    expect((await exportOf(max)).feed).toEqual({ readAt: null })

    // Avec une ligne : elle ne bouge pas (greatest avec l'an 9999 l'aurait poussée).
    await expectDone(await markRead(max, newest))
    for (const upTo of outOfBounds) await expectDone(await markRead(max, upTo))
    expect(await lastReadAt(max)).toBe(newest)

    // Témoin de la borne basse : le 2/1/2026 est retenu (sur un autre membre, sans ligne).
    await expectDone(await markRead(zoe, '2026-01-02T00:00:00.000Z'))
    expect(await lastReadAt(zoe)).toBe('2026-01-02T00:00:00.000Z')
  })
})

// ─── Le quota ─────────────────────────────────────────────────────────────────────────────────────

describe('the rate of « read »', () => {
  it('answers 600 « read » an hour, counting malformed ones, then asks to wait', async () => {
    await alreadyUsed(memberCounterKeys(maxId).feedReadHour, 599)
    // La 600e, mal formée, compte aussi (le quota passe avant la validation).
    await expectError(await markRead(max, 'maintenant'), 400, 'validation')

    const blocked = await markRead(max, START.toISOString())
    await expectError(blocked, 429, 'rate_limited')
    const retryAfter = Number(blocked.headers.get('retry-after'))
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(3600)

    // Chaque membre a son compteur, et le fil se lit toujours (autre compteur).
    await expectDone(await markRead(zoe, START.toISOString()))
    expect((await send('GET', '/v1/feed/following', max)).status).toBe(200)
    // Une heure plus tard, Max marque de nouveau son fil lu.
    later(HOUR)
    await expectDone(await markRead(max, START.toISOString()))
  })
})

// ─── L'export et l'effacement ─────────────────────────────────────────────────────────────────────

describe('the date in the export and with the account', () => {
  it('exports how far the feed was read, and null before any reading', async () => {
    const newest = await maxFollowsLeaWhoPublishes()
    expect((await exportOf(max)).feed).toEqual({ readAt: null })

    await expectDone(await markRead(max, newest))

    expect((await exportOf(max)).feed).toEqual({ readAt: newest })
  })

  it('forgets the date with the deleted account', async () => {
    const newest = await maxFollowsLeaWhoPublishes()
    await expectDone(await markRead(max, newest))
    await expectDone(await markRead(zoe, newest))
    const stored = sql`select member_id from feed_state order by member_id`
    // Témoin : les deux lignes sont en base.
    expect((await rows<{ member_id: string }>(stored)).map((r) => r.member_id)).toEqual(
      [maxId, zoeId].sort(),
    )

    await act.deleteAccount(max, maxAccount.password)

    // La ligne de Max part avec son compte (cascade) ; celle de Zoé reste.
    expect((await rows<{ member_id: string }>(stored)).map((r) => r.member_id)).toEqual([zoeId])
  })
})

// ─── Qui lit la date (jur-J3) ─────────────────────────────────────────────────────────────────────

describe('who reads the date of the last reading', () => {
  // La date de lecture est une trace d'activité : rien ne doit pouvoir s'en servir sans une
  // relecture (le récapitulatif de la semaine, un « actif il y a… », une statistique). Ce test lit
  // le code de l'API (hors tests) : seul feed/state.ts touche à la table, et seules la route du
  // fil et celle de l'export (routes/me.ts) importent feed/state.ts. Un nouvel appelant fait
  // échouer ce test : il faut alors la relecture juridique, puis l'ajouter ici.
  const root = dirname(fileURLToPath(import.meta.url))
  const sources = (readdirSync(root, { recursive: true, encoding: 'utf8' }) as string[])
    .map((file) => file.split(sep).join(posix.sep))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .filter((file) => !file.startsWith('testing/'))
  const read = (file: string) => readFileSync(join(root, file), 'utf8')
  /**
   * Le code seul, sans ses commentaires : un commentaire qui parle de la table ne la lit pas. On
   * retire les blocs « /* … *\/ » et les fins de ligne « // … » (pas « https:// » : un « // »
   * précédé de « : » est une adresse).
   */
  const code = (file: string) =>
    read(file)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

  /** Les modules qu'un fichier importe, en chemins depuis src/ (sans « .ts »). */
  const importsOf = (file: string) =>
    [...read(file).matchAll(/from '(\.{1,2}\/[^']+)'/g)].map((match) =>
      posix.join(posix.dirname(file), match[1] ?? ''),
    )

  it('is read only by feed/state.ts, the feed route and the export', () => {
    // Le registre des entrées des membres (moderation/inputs.ts) nomme chaque colonne de chaque
    // table pour la classer (member-inputs.test.ts l'exige) : il cite la table sans jamais la lire.
    const touchTable = sources
      .filter((file) => file !== 'moderation/inputs.ts')
      .filter((file) => /\bfeedState\b|\bfeed_state\b/.test(code(file)))
    expect(touchTable).toEqual(['feed/state.ts'])

    const importers = sources.filter((file) => importsOf(file).includes('feed/state')).sort()
    expect(importers).toContain('routes/feed.ts')
    // Tout autre appelant est nommé dans le message d'échec.
    expect(importers.filter((file) => !['routes/feed.ts', 'routes/me.ts'].includes(file))).toEqual(
      [],
    )
    // Garde-fou du test lui-même : il voit bien les fichiers de l'API, le récapitulatif de la
    // semaine compris (qui ne doit rien en savoir, jur-J3).
    expect(sources).toEqual(expect.arrayContaining(['routes/me.ts', 'jobs/weekly-recap.ts']))
    expect(importsOf('routes/feed.ts')).toContain('feed/load')
  })
})

// ─── Le contrat ───────────────────────────────────────────────────────────────────────────────────

describe('the API contract', () => {
  it('documents PUT /v1/feed/read', async () => {
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, unknown>>
    }
    expect(Object.keys(doc.paths['/v1/feed/read'] ?? {})).toContain('put')
  })
})
