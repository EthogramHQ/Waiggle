// Tests d'intégration de la tranche R7a : rejoindre et quitter les testeurs d'un projet
// (POST et DELETE /v1/projects/{id}/testers), et ce que la page du projet en dit (`isTester`,
// `testerCount`). Scénario : docs/scenarios/refonte.md, section R7a, « Les testeurs » ; relecture de
// sécurité du plan : B2 (le blocage retire le testeur), A2 (le quota avant tout), A3 (l'ordre des
// réponses et ce que dit `testers_full`).
// L'export (`testerOf`) et la suppression du compte sont testés par accounts.test.ts, les
// notifications des testeurs par notifications.test.ts.
//
// Trois membres : Papi Jean (l'auteur), Inès (qui rejoint les testeurs) et Malik (ni l'un ni
// l'autre). La table neuve `project_tester` se lit en SQL brut : elle n'est pas encore dans le
// schéma typé quand ces tests sont écrits.
import { ErrorResponse, Project, TESTERS_MAX } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq, type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let jean: string // cookies de session
let ines: string
let malik: string
let jeanId: string
let inesId: string

const START = Date.parse('2026-11-02T08:00:00.000Z')
const MINUTE = 60 * 1000

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  jean = await ctx.verifiedMember({
    name: 'Papi Jean',
    email: 'jean@example.com',
    password: 'jean-long-password',
  })
  ines = await ctx.verifiedMember({
    name: 'Inès',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  malik = await ctx.verifiedMember({
    name: 'Malik',
    email: 'malik@example.com',
    password: 'malik-long-password',
  })
  jeanId = (await act.me(jean)).id
  inesId = (await act.me(ines)).id
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const later = (minutes = 1) => vi.setSystemTime(Date.now() + minutes * MINUTE)

/** Un identifiant bien formé, qui ne désigne aucun projet. */
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

/** Le nombre d'inscriptions de testeur gardées en base pour ce projet. */
const testerRows = async (projectId: string) =>
  (
    await rows<{ n: number }>(
      sql`select count(*)::int as n from project_tester where project_id = ${projectId}`,
    )
  )[0]?.n

/** Un projet « Testable » avec une démo : le seul qu'on peut rejoindre comme testeur. */
const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }

const publishProject = (cookie = jean, body: object = TESTABLE) =>
  act.publish(cookie, 'Décollage !', { pitch: 'Un quiz de l’espace pour les petits.', ...body })

const testersPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}/testers`

/** Rejoindre les testeurs, une minute après ce qui précède ; réponse brute. */
const join = (projectId: string, cookie: string | null) => {
  later()
  return act.send('POST', testersPath(projectId), cookie)
}

/** Quitter les testeurs ; réponse brute. */
const quit = (projectId: string, cookie: string | null) => {
  later()
  return act.send('DELETE', testersPath(projectId), cookie)
}

const readProject = async (id: string, cookie: string) => {
  const res = await act.send('GET', `/v1/projects/${id}`, cookie)
  expect(res.status).toBe(200)
  return Project.parse(await res.json())
}

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Une réponse 204 : réussie, et sans corps (rien à lire, rien qui puisse fuiter). */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

/** Le corps d'un 404 sur un projet inconnu : la référence de « comme un projet inconnu ». */
const unknownProjectBody = async (cookie: string) => {
  const res = await join(UNKNOWN, cookie)
  expect(res.status).toBe(404)
  return res.json()
}

describe('joining the testers', () => {
  it('lets a member join the testers of a testable project with a demo', async () => {
    const project = await publishProject()

    await expectDone(await join(project.id, ines))

    expect(await readProject(project.id, ines)).toMatchObject({ isTester: true })
    expect(await readProject(project.id, malik)).toMatchObject({ isTester: false })
    // L'auteur voit le nombre de testeurs, à côté de celui des abonnés.
    expect(await readProject(project.id, jean)).toMatchObject({ isTester: false, testerCount: 1 })
  })

  it('starts with no tester, and is idempotent', async () => {
    const project = await publishProject()
    expect(project).toMatchObject({ isTester: false, testerCount: 0 })

    await expectDone(await join(project.id, ines))
    await expectDone(await join(project.id, ines))

    expect(await testerRows(project.id)).toBe(1)
    expect((await readProject(project.id, jean)).testerCount).toBe(1)
  })

  it('never makes a member a tester by following the project', async () => {
    // Témoin du sens des champs : suivre et tester sont deux inscriptions distinctes.
    const project = await publishProject()
    expect((await act.send('POST', `/v1/projects/${project.id}/follow`, ines)).status).toBe(204)

    expect(await readProject(project.id, ines)).toMatchObject({ isFollowed: true, isTester: false })
    expect((await readProject(project.id, jean)).testerCount).toBe(0)
  })

  it('refuses the author on his own project', async () => {
    const project = await publishProject()

    await expectError(await join(project.id, jean), 400, 'cannot_test_own')

    expect(await testerRows(project.id)).toBe(0)
  })

  it('refuses a project that is not testable, or that has no demo', async () => {
    const building = await publishProject(jean, {
      status: 'building',
      demoUrl: 'https://demo.example.com/',
    })
    const noDemo = await publishProject(jean, { status: 'testable', demoUrl: null })

    await expectError(await join(building.id, ines), 409, 'not_testable')
    await expectError(await join(noDemo.id, ines), 409, 'not_testable')

    expect(await testerRows(building.id)).toBe(0)
    expect(await testerRows(noDemo.id)).toBe(0)
  })

  it('keeps answering 204 to a tester of a full project', async () => {
    // 199 testeurs semés en base (des comptes fabriqués, sans session), puis Inès, la 200e.
    const project = await publishProject()
    await ctx.db.execute(sql`
      insert into "user" (id, name, email, email_verified, created_at, updated_at)
      select 'seed-tester-' || n, 'Testeur ' || n, 'seed-tester-' || n || '@example.com', true,
             now(), now()
      from generate_series(1, ${TESTERS_MAX - 1}) as n`)
    await ctx.db.execute(sql`
      insert into project_tester (member_id, project_id, created_at)
      select 'seed-tester-' || n, ${project.id}::uuid, now()
      from generate_series(1, ${TESTERS_MAX - 1}) as n`)
    await expectDone(await join(project.id, ines))
    expect(await testerRows(project.id)).toBe(TESTERS_MAX)

    // Déjà testeuse : 204 avant tout autre refus, même projet plein.
    await expectDone(await join(project.id, ines))
    // Un 201e membre est refusé, et rien n'est écrit.
    await expectError(await join(project.id, malik), 409, 'testers_full')
    expect(await testerRows(project.id)).toBe(TESTERS_MAX)
  })

  it('keeps answering 204 to a tester after the project stopped being testable', async () => {
    const project = await publishProject()
    await expectDone(await join(project.id, ines))
    expect(
      (await act.send('PATCH', `/v1/projects/${project.id}`, jean, { status: 'done' })).status,
    ).toBe(200)

    await expectDone(await join(project.id, ines))

    // Ses testeurs gardent leur place quand le statut change ; un nouveau venu est refusé.
    expect(await readProject(project.id, ines)).toMatchObject({ isTester: true })
    await expectError(await join(project.id, malik), 409, 'not_testable')
  })

  it('is only for signed-in members', async () => {
    const project = await publishProject()

    await expectError(await join(project.id, null), 401, 'unauthorized')
    await expectError(await quit(project.id, null), 401, 'unauthorized')
    await expectDone(await join(project.id, ines)) // témoin
  })

  it('cannot be triggered from another website', async () => {
    const project = await publishProject()

    const res = await ctx.request(testersPath(project.id), {
      method: 'POST',
      headers: { cookie: ines, origin: 'https://evil.example' },
    })

    expect(res.status).toBe(403)
    expect(await testerRows(project.id)).toBe(0)
    await expectDone(await join(project.id, ines)) // témoin
  })

  it('answers « not found » for an unknown or malformed project', async () => {
    await expectDone(await join((await publishProject()).id, ines)) // témoin
    for (const id of [UNKNOWN, 'pas-un-identifiant', "x' or '1'='1"]) {
      await expectError(await join(id, ines), 404, 'not_found')
    }
  })

  it('refuses to test a private or removed project of someone else like an unknown one', async () => {
    const expected = await unknownProjectBody(ines)
    const hidden = await publishProject(jean, { ...TESTABLE, visibility: 'private' })
    const removed = await publishProject()
    await ctx.db
      .update(schema.project)
      .set({ removedAt: new Date() })
      .where(eq(schema.project.id, removed.id))

    for (const [what, id] of [
      ['private', hidden.id],
      ['removed', removed.id],
    ]) {
      const res = await join(id ?? '', ines)
      expect(res.status, what).toBe(404)
      expect(await res.json(), what).toEqual(expected)
    }
    expect(await testerRows(hidden.id)).toBe(0)
    expect(await testerRows(removed.id)).toBe(0)
  })

  it('keeps the tester when the project becomes private for a while', async () => {
    // Le scénario garde l'inscription : un projet privé ne prévient plus ses testeurs, mais ils
    // retrouvent leur place quand il redevient visible.
    const project = await publishProject()
    await expectDone(await join(project.id, ines))

    await act.setVisibility(project.id, jean, 'private')
    expect(await testerRows(project.id)).toBe(1)
    await act.setVisibility(project.id, jean, 'public')

    expect(await readProject(project.id, ines)).toMatchObject({ isTester: true })
  })

  it('takes its testers away with a deleted project', async () => {
    const project = await publishProject()
    await expectDone(await join(project.id, ines))

    expect((await act.send('DELETE', `/v1/projects/${project.id}`, jean)).status).toBe(204)

    expect(await testerRows(project.id)).toBe(0)
  })
})

describe('quitting the testers', () => {
  it('lets a tester quit, and the project forgets them', async () => {
    const project = await publishProject()
    await expectDone(await join(project.id, ines))

    await expectDone(await quit(project.id, ines))

    expect(await readProject(project.id, ines)).toMatchObject({ isTester: false })
    expect((await readProject(project.id, jean)).testerCount).toBe(0)
    // Quitter une seconde fois répond pareil.
    await expectDone(await quit(project.id, ines))
  })

  it('answers 204 to quitting, whatever the project', async () => {
    const hidden = await publishProject(jean, { ...TESTABLE, visibility: 'private' })
    const notMine = await publishProject()

    // Un projet privé d'un autre, un projet inconnu, un projet où je ne suis pas testeur : 204,
    // corps vide, sans rien révéler.
    for (const id of [hidden.id, UNKNOWN, notMine.id]) await expectDone(await quit(id, ines))
    expect(await testerRows(notMine.id)).toBe(0)
  })

  it('only removes the tester who quits', async () => {
    const project = await publishProject()
    await expectDone(await join(project.id, ines))
    await expectDone(await join(project.id, malik))

    await expectDone(await quit(project.id, malik))

    expect(await readProject(project.id, ines)).toMatchObject({ isTester: true })
    expect((await readProject(project.id, jean)).testerCount).toBe(1)
  })
})

describe('who sees the testers', () => {
  it('never tells another member how many testers a project has', async () => {
    const project = await publishProject()
    await expectDone(await join(project.id, ines))

    // Ni la testeuse, ni un autre membre : le nombre n'est que pour l'auteur.
    expect((await readProject(project.id, ines)).testerCount).toBeNull()
    expect((await readProject(project.id, malik)).testerCount).toBeNull()
    expect((await readProject(project.id, jean)).testerCount).toBe(1)

    // Aucune carte (fil, Découvrir, recherche, page du membre) ne porte ces champs.
    expect((await act.send('POST', `/v1/members/${jeanId}/follow`, ines)).status).toBe(204)
    for (const path of [
      '/v1/feed/following',
      '/v1/feed/discover',
      '/v1/search?q=decollage',
      `/v1/members/${jeanId}`,
    ]) {
      const res = await act.send('GET', path, ines)
      expect(res.status, path).toBe(200)
      const raw = await res.text()
      expect(raw, path).toContain(project.id) // témoin : la carte du projet est bien là
      expect(raw, path).not.toContain('"testerCount"')
      expect(raw, path).not.toContain('"isTester"')
    }
  })
})

describe('blocking and the testers', () => {
  it('removes the tester when the author blocks them', async () => {
    const project = await publishProject()
    await expectDone(await join(project.id, ines))

    await act.block(inesId, jean)

    expect(await testerRows(project.id)).toBe(0)
    expect((await readProject(project.id, jean)).testerCount).toBe(0)
  })

  it('removes the tester when they block the author', async () => {
    const project = await publishProject()
    await expectDone(await join(project.id, ines))

    await act.block(jeanId, ines)

    expect(await testerRows(project.id)).toBe(0)
    expect((await readProject(project.id, jean)).testerCount).toBe(0)
  })

  it('does not bring the tester back after unblocking', async () => {
    const project = await publishProject()
    await expectDone(await join(project.id, ines))
    await act.block(inesId, jean)

    await act.unblock(inesId, jean)

    expect(await readProject(project.id, ines)).toMatchObject({ isTester: false })
    expect((await readProject(project.id, jean)).testerCount).toBe(0)
  })

  it('answers 404 to a blocked member who tries to become a tester, in both directions', async () => {
    const project = await publishProject()
    const expected = await unknownProjectBody(ines)

    await act.block(inesId, jean)
    const blockedByAuthor = await join(project.id, ines)
    expect(blockedByAuthor.status).toBe(404)
    expect(await blockedByAuthor.json()).toEqual(expected)

    await act.unblock(inesId, jean)
    await act.block(jeanId, ines)
    const blockedTheAuthor = await join(project.id, ines)
    expect(blockedTheAuthor.status).toBe(404)
    expect(await blockedTheAuthor.json()).toEqual(expected)

    expect(await testerRows(project.id)).toBe(0)
    // Témoin : sans blocage, Malik rejoint le même projet.
    await expectDone(await join(project.id, malik))
  })
})

// R7b : l'auteur peut retirer un testeur (DELETE /v1/projects/{id}/testers/{memberId}, testé par
// tester-corner.test.ts). Le membre retiré ne peut plus rejoindre les testeurs de ce projet, sans
// que la réponse le distingue d'un projet fermé (choix du plan, validé avec le scénario).
describe('a member removed by the author', () => {
  /** L'auteur retire un membre de ses testeurs. */
  const removeTester = async (projectId: string, memberId: string) => {
    later()
    await expectDone(
      await act.send('DELETE', `${testersPath(projectId)}/${encodeURIComponent(memberId)}`, jean),
    )
  }

  it('refuses a removed member who joins again with 409 not_testable, like a closed project', async () => {
    const project = await publishProject()
    const building = await publishProject(jean, {
      status: 'building',
      demoUrl: 'https://demo.example.com/',
    })
    const closed = await join(building.id, ines)
    expect(closed.status).toBe(409)
    const expected = await closed.json()
    await expectDone(await join(project.id, ines))

    await removeTester(project.id, inesId)
    const res = await join(project.id, ines)

    // Le même corps que n'importe quel projet fermé : le retrait n'est pas révélé.
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual(expected)
    expect(await testerRows(project.id)).toBe(0)
    // Témoin : le projet reste ouvert aux autres.
    await expectDone(await join(project.id, malik))
  })

  it('does not lift the removal when the member quits and joins again', async () => {
    const project = await publishProject()
    await expectDone(await join(project.id, ines))
    await removeTester(project.id, inesId)

    await expectDone(await quit(project.id, ines))

    await expectError(await join(project.id, ines), 409, 'not_testable')
    expect(await testerRows(project.id)).toBe(0)
  })

  it('only bars the removed member from this project', async () => {
    const project = await publishProject()
    const garden = await publishProject(jean, { ...TESTABLE, title: 'Le carnet de jardin' })
    await expectDone(await join(project.id, ines))
    await removeTester(project.id, inesId)

    await expectDone(await join(garden.id, ines))
    expect(await readProject(garden.id, ines)).toMatchObject({ isTester: true })
  })

  it('checks the removal under the lock of the project', async () => {
    // PGlite n'a qu'une connexion : l'espion fait le retrait juste avant la transaction de
    // l'inscription, puis la laisse faire. Inès, déjà testeuse, redemande à rejoindre (204 tant
    // qu'elle l'est) : sa transaction doit relire le retrait, sinon elle se réinscrirait. Cela
    // prouve la relecture sous le verrou, pas l'attente du verrou elle-même.
    const project = await publishProject()
    await expectDone(await join(project.id, ines))
    const original = ctx.db.transaction.bind(ctx.db)
    let armed = true
    const spy = vi.spyOn(ctx.db, 'transaction').mockImplementation(async (...args) => {
      if (armed) {
        armed = false
        await removeTester(project.id, inesId)
      }
      return original(...args)
    })

    const res = await join(project.id, ines)

    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
    await expectError(res, 409, 'not_testable')
    expect(await testerRows(project.id)).toBe(0)
  })
})

describe('who may join, as the project page says (testerJoinable)', () => {
  it('offers to join to any other member, whatever the status of the project', async () => {
    const testable = await publishProject()
    const building = await publishProject(jean, { status: 'building', demoUrl: null })

    expect(await readProject(testable.id, ines)).toMatchObject({ testerJoinable: true })
    expect(await readProject(building.id, ines)).toMatchObject({ testerJoinable: true })
    // L'auteur ne rejoint pas ses propres testeurs.
    expect(await readProject(testable.id, jean)).toMatchObject({ testerJoinable: false })
  })

  it('no longer offers to join to a member removed by the author, even after quitting', async () => {
    const project = await publishProject()
    await expectDone(await join(project.id, ines))
    await expectDone(await join(project.id, malik))
    expect(await readProject(project.id, ines)).toMatchObject({ testerJoinable: true }) // témoin

    later()
    await expectDone(
      await act.send('DELETE', `${testersPath(project.id)}/${encodeURIComponent(inesId)}`, jean),
    )

    expect(await readProject(project.id, ines)).toMatchObject({
      isTester: false,
      testerJoinable: false,
    })
    await expectDone(await quit(project.id, ines))
    expect(await readProject(project.id, ines)).toMatchObject({ testerJoinable: false })
    // Malik, resté testeur, et l'auteur n'en savent rien de plus.
    expect(await readProject(project.id, malik)).toMatchObject({ testerJoinable: true })
  })

  it('still offers to join to a member who quit by himself', async () => {
    const project = await publishProject()
    await expectDone(await join(project.id, ines))

    await expectDone(await quit(project.id, ines))

    expect(await readProject(project.id, ines)).toMatchObject({ testerJoinable: true })
    await expectDone(await join(project.id, ines))
  })
})

describe('limits against abuse', () => {
  it('counts even requests on an unknown project in the tester quota', async () => {
    const project = await publishProject()
    // Le quota passe avant l'identifiant et la recherche du projet (relecture A2) : chaque demande
    // compte, même celle qui ne trouve rien.
    for (let i = 0; i < 60; i++) {
      expect((await act.send('POST', testersPath(crypto.randomUUID()), ines)).status).toBe(404)
    }
    await expectError(await join(project.id, ines), 429, 'rate_limited')
    expect(await testerRows(project.id)).toBe(0)

    // Même chose pour quitter, une heure plus tard : POST et DELETE partagent le même quota.
    later(61)
    for (let i = 0; i < 60; i++) {
      await expectDone(await act.send('DELETE', testersPath(crypto.randomUUID()), ines))
    }
    const res = await quit(project.id, ines)
    await expectError(res, 429, 'rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    await expectError(await join(project.id, ines), 429, 'rate_limited')
  })
})

describe('the API contract', () => {
  it('documents the tester routes', async () => {
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, unknown>>
    }

    expect(doc.paths['/v1/projects/{id}/testers']).toHaveProperty('post')
    expect(doc.paths['/v1/projects/{id}/testers']).toHaveProperty('delete')
  })
})
