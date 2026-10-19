// Tests d'intégration de la tranche 5 : réagir à un projet (Bluffant, Inspirant, Utile, Drôle,
// Bravo), et les nombres de réactions sur la page du projet. Scénario : docs/scenarios/phase-1.md,
// « Précisions (tranche 5) », « Réagir ». Trois membres : Léa (l'autrice du projet), Max (qui
// réagit) et Zoé (une troisième, pour vérifier ce que voient les autres).
// L'export des réactions est testé dans projects.test.ts, avec le reste de l'export.
//
// Le temps est maîtrisé par le test, comme dans notes.test.ts : vi.useFakeTimers remplace l'horloge
// de JavaScript (Date) par une fausse, qu'on avance à la main. La limite de 120 réactions par heure
// se vérifie ainsi sans attendre une heure. Seule Date est remplacée (toFake) : la base et les
// minuteries tournent normalement.
import { ErrorResponse, Me, NO_REACTIONS, Project, REACTION_KINDS } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let lea: string // cookies de session
let max: string
let zoe: string
let maxId: string

const leaAccount = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }
const maxAccount = { name: 'Max', email: 'max@example.com', password: 'another-long-password' }

beforeEach(async () => {
  // La fausse horloge est posée avant de créer l'API : la limite de débit garde la fonction
  // Date.now qu'elle trouve à ce moment-là (voir feed.test.ts).
  const start = Date.now()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(start)

  ctx = await createTestContext()
  lea = await ctx.verifiedMember(leaAccount)
  max = await ctx.verifiedMember(maxAccount)
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  maxId = Me.parse(await (await send('GET', '/v1/me', max)).json()).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une minute). */
const later = (minutes = 1) => vi.setSystemTime(Date.now() + minutes * 60 * 1000)

const send = (
  method: string,
  path: string,
  cookie: string | null,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  ctx.request(path, {
    method,
    headers: {
      ...headers,
      ...(cookie && { cookie }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

/** Un identifiant bien formé, qui ne désigne aucun projet. */
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

/** Publie un projet et renvoie ce que l'API a répondu. */
const publish = async (cookie: string, body: object = {}) => {
  const res = await send('POST', '/v1/projects', cookie, {
    title: 'Mon agent de recettes',
    pitch: 'Un menu avec ce qu’il y a au frigo.',
    ...body,
  })
  expect(res.status).toBe(201)
  return Project.parse(await res.json())
}

// L'adresse d'une réaction. encodeURIComponent : un identifiant ou un type piégé (« ../ ») reste
// un simple morceau d'adresse.
const reactionPath = (projectId: string, kind: string) =>
  `/v1/projects/${encodeURIComponent(projectId)}/reactions/${encodeURIComponent(kind)}`
const react = (projectId: string, kind: string, cookie: string | null) =>
  send('PUT', reactionPath(projectId, kind), cookie)
const unreact = (projectId: string, kind: string, cookie: string | null) =>
  send('DELETE', reactionPath(projectId, kind), cookie)

/** La page d'un projet, telle que la voit ce membre (elle doit être visible). */
const readProject = async (id: string, cookie: string) => {
  const res = await send('GET', `/v1/projects/${id}`, cookie)
  expect(res.status).toBe(200)
  return Project.parse(await res.json())
}

/** Les réactions d'un projet, telles que les voit ce membre. */
const reactionsOf = async (id: string, cookie: string) => (await readProject(id, cookie)).reactions

/** Les nombres par type, tous à zéro sauf ceux donnés. */
const counts = (some: Partial<Record<(typeof REACTION_KINDS)[number], number>> = {}) => ({
  ...NO_REACTIONS.counts,
  ...some,
})

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Une réponse 204 : réussie, et sans corps (rien à lire, rien qui puisse fuiter). */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

/**
 * Une requête SQL brute, pour vérifier ce qui reste dans la base. Le résultat n'est pas typé : on
 * précise sa forme nous-mêmes (voir packages/db/src/db.test.ts).
 */
const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

describe('reacting to a project', () => {
  it('starts with no reaction', async () => {
    const project = await publish(lea)

    expect(project.reactions).toEqual(NO_REACTIONS)
    expect(await reactionsOf(project.id, max)).toEqual(NO_REACTIONS)
  })

  it('is only for signed-in members', async () => {
    const project = await publish(lea)

    await expectError(await react(project.id, 'bravo', null), 401, 'unauthorized')
    await expectError(await unreact(project.id, 'bravo', null), 401, 'unauthorized')
    // Témoin : la même demande, avec la session de Max, réussit (la route existe bien).
    await expectDone(await react(project.id, 'bravo', max))
  })

  it('cannot be triggered from another website', async () => {
    const project = await publish(lea)

    const res = await ctx.request(reactionPath(project.id, 'bravo'), {
      method: 'PUT',
      headers: { cookie: max, origin: 'https://evil.example' },
    })

    expect(res.status).toBe(403)
    expect((await reactionsOf(project.id, lea)).counts.bravo).toBe(0)
    await expectDone(await react(project.id, 'bravo', max)) // témoin
  })

  it('adds a reaction once, even when asked twice, and counts it for everyone', async () => {
    const project = await publish(lea)

    await expectDone(await react(project.id, 'bravo', max))
    await expectDone(await react(project.id, 'bravo', max))

    expect(await reactionsOf(project.id, max)).toEqual({
      counts: counts({ bravo: 1 }),
      mine: ['bravo'],
    })
    // L'autrice et Zoé voient le nombre, sans que la réaction soit la leur.
    expect(await reactionsOf(project.id, lea)).toEqual({ counts: counts({ bravo: 1 }), mine: [] })
    expect(await reactionsOf(project.id, zoe)).toEqual({ counts: counts({ bravo: 1 }), mine: [] })
  })

  it('lets a member put the five reactions on the same project, one of each kind', async () => {
    const project = await publish(lea)

    for (const kind of REACTION_KINDS) await expectDone(await react(project.id, kind, max))

    const seen = await reactionsOf(project.id, max)
    expect(seen.counts).toEqual({ amazing: 1, inspiring: 1, useful: 1, funny: 1, bravo: 1 })
    expect([...seen.mine].sort()).toEqual([...REACTION_KINDS].sort())
  })

  it('removes a reaction, and accepts to remove one that was never put', async () => {
    const project = await publish(lea)
    await react(project.id, 'bravo', max)
    await react(project.id, 'useful', max)

    await expectDone(await unreact(project.id, 'bravo', max))
    await expectDone(await unreact(project.id, 'bravo', max))
    await expectDone(await unreact(project.id, 'funny', zoe))

    expect(await reactionsOf(project.id, max)).toEqual({
      counts: counts({ useful: 1 }),
      mine: ['useful'],
    })
  })

  it('counts the reactions of several members, and tells each one only her own', async () => {
    const project = await publish(lea)
    await react(project.id, 'bravo', max)
    await react(project.id, 'useful', max)
    await react(project.id, 'bravo', zoe)

    const expected = counts({ bravo: 2, useful: 1 })
    expect(await reactionsOf(project.id, lea)).toEqual({ counts: expected, mine: [] })
    const fromMax = await reactionsOf(project.id, max)
    expect(fromMax.counts).toEqual(expected)
    expect([...fromMax.mine].sort()).toEqual(['bravo', 'useful'])
    expect(await reactionsOf(project.id, zoe)).toEqual({ counts: expected, mine: ['bravo'] })
  })

  it('never names who reacted', async () => {
    const project = await publish(lea)
    await react(project.id, 'bravo', max)

    const text = await (await send('GET', `/v1/projects/${project.id}`, lea)).text()

    expect(Project.parse(JSON.parse(text)).reactions.counts.bravo).toBe(1)
    for (const secret of [maxId, 'Max', 'max@example.com']) expect(text).not.toContain(secret)
  })

  it('refuses that a member reacts to her own project, public or private, in her language', async () => {
    const project = await publish(lea)
    const draft = await publish(lea, { visibility: 'private' })

    await expectError(await react(project.id, 'bravo', lea), 400, 'cannot_react_own')
    await expectError(await react(draft.id, 'bravo', lea), 400, 'cannot_react_own')
    // Le message suit la langue du visiteur (en-tête Accept-Language).
    const english = await send('PUT', reactionPath(project.id, 'bravo'), lea, undefined, {
      'Accept-Language': 'en',
    })
    expect(ErrorResponse.parse(await english.json()).error.message).toBe(
      'You can’t react to your own project.',
    )
    expect((await reactionsOf(project.id, lea)).counts.bravo).toBe(0)
  })

  it('answers « not found » for an unknown kind of reaction, as for an unknown project', async () => {
    const project = await publish(lea)
    await expectDone(await react(project.id, 'bravo', max)) // témoin
    const unknown = await (await react(UNKNOWN, 'bravo', max)).json()

    for (const kind of ['love', 'BRAVO', 'bravo ', "x' or '1'='1"]) {
      const put = await react(project.id, kind, max)
      expect(put.status, kind).toBe(404)
      expect(await put.json()).toEqual(unknown)
      const removed = await unreact(project.id, kind, max)
      expect(removed.status, kind).toBe(404)
    }
    expect((await reactionsOf(project.id, lea)).counts).toEqual(counts({ bravo: 1 }))
  })

  it('answers « not found » for an unknown or malformed project', async () => {
    await expectDone(await react((await publish(lea)).id, 'bravo', max)) // témoin
    for (const id of [UNKNOWN, 'pas-un-identifiant', "x' or '1'='1"]) {
      await expectError(await react(id, 'bravo', max), 404, 'not_found')
      await expectError(await unreact(id, 'bravo', max), 404, 'not_found')
    }
  })

  it('answers « not found » for the private project of another member, as for an unknown one', async () => {
    const draft = await publish(lea, { visibility: 'private' })

    const res = await react(draft.id, 'bravo', max)
    const unknown = await react(UNKNOWN, 'bravo', max)
    const removed = await unreact(draft.id, 'bravo', max)
    const removedUnknown = await unreact(UNKNOWN, 'bravo', max)

    // Même réponse, mot pour mot : impossible de deviner qu'un projet privé existe à cette adresse.
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual(await unknown.json())
    expect(removed.status).toBe(404)
    expect(await removed.json()).toEqual(await removedUnknown.json())
    expect((await reactionsOf(draft.id, lea)).counts).toEqual(counts())
  })

  it('keeps the reactions of a project gone private, shows them to nobody, and brings them back', async () => {
    const project = await publish(lea)
    await react(project.id, 'bravo', max)
    await react(project.id, 'inspiring', zoe)

    await send('PATCH', `/v1/projects/${project.id}`, lea, { visibility: 'private' })
    // Pendant qu'il est privé, personne ne voit les réactions des autres, l'autrice comprise
    // (décision du 19/10/2026) : les nombres sont à zéro. Pour Max, le projet n'existe plus.
    expect(await reactionsOf(project.id, lea)).toEqual(NO_REACTIONS)
    expect((await send('GET', `/v1/projects/${project.id}`, max)).status).toBe(404)
    await send('PATCH', `/v1/projects/${project.id}`, lea, { visibility: 'public' })

    expect(await reactionsOf(project.id, max)).toEqual({
      counts: counts({ bravo: 1, inspiring: 1 }),
      mine: ['bravo'],
    })
  })

  it('keeps the reactions of each project apart', async () => {
    const recipes = await publish(lea)
    const garden = await publish(lea, { title: 'Le carnet de jardin' })

    await react(recipes.id, 'bravo', max)

    expect((await reactionsOf(recipes.id, max)).counts).toEqual(counts({ bravo: 1 }))
    expect(await reactionsOf(garden.id, max)).toEqual(NO_REACTIONS)
  })
})

describe('the order of the checks', () => {
  it('asks to sign in before looking at the project or the kind', async () => {
    for (const [id, kind] of [
      [UNKNOWN, 'bravo'],
      ['pas-un-identifiant', 'love'],
    ] as const) {
      await expectError(await react(id, kind, null), 401, 'unauthorized')
    }
    // Témoin : avec une session, la route existe et répond (le 401 ne vient pas d'une route absente).
    await expectDone(await react((await publish(lea)).id, 'bravo', max))
  })

  it('counts even refused requests in the hourly limit', async () => {
    const project = await publish(lea)
    // Chaque demande compte, même celles qui visent un projet ou un type inconnu : on ne peut pas
    // sonder les adresses sans limite.
    for (let i = 0; i < 60; i++) {
      expect((await react(UNKNOWN, 'bravo', max)).status).toBe(404)
      expect((await react(project.id, 'love', max)).status).toBe(404)
    }

    // La 121e demande de l'heure, même valide, est refusée.
    await expectError(await react(project.id, 'bravo', max), 429, 'rate_limited')
  })
})

describe('limits against abuse', () => {
  it('blocks the 121st reaction change within an hour, putting and removing together', async () => {
    const project = await publish(lea)
    // 120 changements : on pose puis on retire, tour à tour « Bravo » et « Utile ».
    for (let i = 0; i < 30; i++) {
      await expectDone(await react(project.id, 'bravo', max))
      await expectDone(await unreact(project.id, 'bravo', max))
      await expectDone(await react(project.id, 'useful', max))
      await expectDone(await unreact(project.id, 'useful', max))
    }

    const res = await react(project.id, 'bravo', max)

    expect(res.status).toBe(429)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    // Le refus ne change rien : aucune réaction n'est posée.
    expect((await reactionsOf(project.id, lea)).counts).toEqual(counts())
    // La limite est propre à chaque membre : Zoé, elle, réagit encore.
    await expectDone(await react(project.id, 'bravo', zoe))
  })

  it('lets the member react again an hour later', async () => {
    const project = await publish(lea)
    for (let i = 0; i < 60; i++) {
      await react(project.id, 'bravo', max)
      await unreact(project.id, 'bravo', max)
    }
    expect((await react(project.id, 'bravo', max)).status).toBe(429)

    later(60)

    await expectDone(await react(project.id, 'bravo', max))
  })
})

describe('deleting an account', () => {
  it('removes her reactions, and lowers the counts accordingly', async () => {
    const project = await publish(lea)
    await react(project.id, 'bravo', max)
    await react(project.id, 'useful', max)
    await react(project.id, 'bravo', zoe)

    const res = await send('POST', '/api/auth/delete-user', max, {
      password: maxAccount.password,
    })
    expect(res.status).toBe(200)

    expect(await reactionsOf(project.id, zoe)).toEqual({
      counts: counts({ bravo: 1 }),
      mine: ['bravo'],
    })
    // Rien ne reste d'elle dans la table des réactions.
    expect(
      await rows(sql`select kind from project_reaction where member_id = ${maxId}`),
    ).toHaveLength(0)
  })

  it('takes the reactions to her projects with her', async () => {
    const project = await publish(lea)
    await react(project.id, 'bravo', max)
    await react(project.id, 'funny', zoe)

    await send('POST', '/api/auth/delete-user', lea, { password: leaAccount.password })

    expect(await rows(sql`select kind from project_reaction`)).toHaveLength(0)
  })

  it('forgets her counter of reactions', async () => {
    const project = await publish(lea)
    await expectDone(await react(project.id, 'bravo', max))

    await send('POST', '/api/auth/delete-user', max, { password: maxAccount.password })

    // Les compteurs anti-abus portent l'identifiant du membre : ils partent avec son compte.
    const keys = (await ctx.db.select().from(schema.apiRateLimit)).map((row) => row.key)
    expect(keys.filter((key) => key.includes(maxId))).toEqual([])
  })
})

describe('the API contract', () => {
  it('documents the reaction routes', async () => {
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, unknown>>
    }

    expect(Object.keys(doc.paths)).toContain('/v1/projects/{id}/reactions/{kind}')
    expect(doc.paths['/v1/projects/{id}/reactions/{kind}']).toHaveProperty('put')
    expect(doc.paths['/v1/projects/{id}/reactions/{kind}']).toHaveProperty('delete')
  })
})
