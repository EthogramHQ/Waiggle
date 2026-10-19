// Tests de l'entretien des pseudos (tranche 6a, corrections après relectures) : le rattrapage du
// démarrage ne bloque jamais l'API, un pseudo donné « en filet » ne se heurte pas à un changement
// de pseudo au même instant, et une réservation finie disparaît vraiment de la base (la durée
// promise aux membres est tenue). Les règles du pseudo elles-mêmes sont dans handles.test.ts.
import { Me } from '@ruche/contracts'
import { type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backfillHandles, purgeExpiredHandles } from './handles/claim'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let ines: string // cookie de session
let inesId: string

const DAY = 24 * 60 * 60 * 1000
const inesAccount = {
  name: 'Inès Morel',
  email: 'ines@example.com',
  password: 'correct-horse-battery',
}

beforeEach(async () => {
  // La fausse horloge avant l'API, comme dans handles.test.ts : la limite de débit garde la
  // fonction Date.now qu'elle trouve à sa création.
  const start = Date.now()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(start)
  ctx = await createTestContext()
  ines = await ctx.verifiedMember(inesAccount)
  inesId = (await me(ines)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const later = (ms: number) => vi.setSystemTime(Date.now() + ms)

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  ctx.request(path, {
    method,
    headers: {
      cookie,
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

const me = async (cookie: string) => {
  const res = await send('GET', '/v1/me', cookie)
  expect(res.status).toBe(200)
  return Me.parse(await res.json())
}

/** Une requête SQL brute ; on précise nous-mêmes la forme du résultat (voir handles.test.ts). */
const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

/** Toutes les lignes de pseudo d'un membre, actuelles et anciennes. */
const handleRows = (userId: string) =>
  rows<{ handle: string; released: boolean }>(
    sql`select handle, released_at is not null as released from member_handle
        where user_id = ${userId} order by handle`,
  )

describe('giving handles at startup', () => {
  it('goes on with the other members when one of them fails, and never stops the start', async () => {
    await ctx.db.execute(sql`insert into "user" (id, name, email, email_verified) values
      ('old-1', 'Zoé Martin', 'zoe@example.com', true),
      ('broken', 'Paul Durand', 'paul@example.com', true),
      ('old-3', 'Léa Petit', 'lea@example.com', true)`)
    // Une panne simulée : un « déclencheur » (trigger) de PostgreSQL, une fonction que la base
    // lance avant chaque insertion dans la table, refuse toute ligne de pseudo pour « broken ».
    await ctx.db.execute(sql`create function refuse_broken() returns trigger language plpgsql as
      $$ begin raise exception 'simulated failure'; end $$`)
    await ctx.db.execute(sql`create trigger refuse_broken before insert on member_handle
      for each row when (new.user_id = 'broken') execute function refuse_broken()`)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await backfillHandles(ctx.db)).toBe(2)

    expect(await handleRows('old-1')).toEqual([{ handle: 'zoe_martin', released: false }])
    expect(await handleRows('old-3')).toEqual([{ handle: 'lea_petit', released: false }])
    expect(await handleRows('broken')).toEqual([])
    // La panne est notée une fois, sans rien de ce que le membre a écrit (ni nom, ni adresse).
    expect(logged).toHaveBeenCalledTimes(1)
    const text = JSON.stringify(logged.mock.calls)
    expect(text).toContain('broken')
    expect(text).not.toMatch(/Paul|paul@example/)
  })
})

describe('giving a handle on the way while the member changes it', () => {
  it('answers both requests, and leaves the member with a single current handle', async () => {
    // Inès n'a pas encore de pseudo (comme un compte d'avant la tranche) : « Mon profil » lui en
    // donne un en filet, au moment même où elle en choisit un.
    await ctx.db.execute(sql`delete from member_handle where user_id = ${inesId}`)

    const [changed, read] = await Promise.all([
      send('PATCH', '/v1/me', ines, { handle: 'ines_x' }),
      send('GET', '/v1/me', ines),
    ])

    expect([changed.status, read.status]).toEqual([200, 200])
    expect((await me(ines)).handle).toBe('ines_x')
    const current = (await handleRows(inesId)).filter((row) => !row.released)
    expect(current).toEqual([{ handle: 'ines_x', released: false }])
  })
})

describe('the end of a reservation', () => {
  it('removes the finished reservations from the database at startup', async () => {
    await send('PATCH', '/v1/me', ines, { handle: 'ines' })
    later(30 * DAY - 60 * 1000)
    expect(await purgeExpiredHandles(ctx.db, new Date())).toBe(0)
    expect(await handleRows(inesId)).toHaveLength(2)

    later(60 * 1000)
    expect(await purgeExpiredHandles(ctx.db, new Date())).toBe(1)

    expect(await handleRows(inesId)).toEqual([{ handle: 'ines', released: false }])
  })

  it('removes a finished reservation as soon as the member exports her data', async () => {
    await send('PATCH', '/v1/me', ines, { handle: 'ines' })
    later(30 * DAY)
    const res = await ctx.signIn(inesAccount)
    const session = ctx.cookiesFrom(res)

    const exported = await send('GET', '/v1/me/export', session)

    expect(exported.status).toBe(200)
    expect(await handleRows(inesId)).toEqual([{ handle: 'ines', released: false }])
  })
})
