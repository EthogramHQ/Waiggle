// Tests d'intégration de la tranche R7b : l'entrée du coin des testeurs (GET
// /v1/projects/{id}/testers) et le retrait d'un testeur par l'auteur (DELETE
// /v1/projects/{id}/testers/{memberId}). Scénario : docs/scenarios/refonte.md, section R7b, « Le coin
// des testeurs » et « Retirer et quitter » ; relecture de sécurité du plan : A5 et A6 (le retrait
// sous le verrou du projet, 204 sans rien écrire pour un non-testeur), A7 (409 `corner_closed` pour
// un auteur suspendu) ; décisions de Louis du 11/11/2026 (l'ancien testeur garde son fil en lecture
// seule, le coin fermé l'est à tous sauf à l'auteur).
// La réinscription d'un membre retiré et `Project.testerJoinable` sont testés par testers.test.ts,
// les appels par tester-calls.test.ts, les fils et les fichiers par leurs propres fichiers.
//
// Cinq membres : Papi Jean (l'auteur), Inès et Malik (ses testeurs), Sami (ni l'un ni l'autre) et
// Louis (l'administrateur, qui suspend). Les tables neuves de R7b ne sont lues qu'à travers les
// routes : elles n'existent pas encore quand ces tests sont écrits.
import { ErrorResponse, NotificationPage, Project, TesterCorner } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let jean: string // cookies de session
let ines: string
let malik: string
let sami: string
let louis: string
let jeanId: string
let inesId: string
let malikId: string

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
  sami = await ctx.verifiedMember({
    name: 'Sami',
    email: 'sami@example.com',
    password: 'sami-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  jeanId = (await act.me(jean)).id
  inesId = (await act.me(ines)).id
  malikId = (await act.me(malik)).id
  await act.makeAdmin((await act.me(louis)).id)
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une minute). */
const later = (minutes = 1) => vi.setSystemTime(Date.now() + minutes * MINUTE)

/** Un identifiant bien formé, qui ne désigne aucun projet. */
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

/** Un projet « Testable » avec une démo : le seul qu'on peut rejoindre comme testeur. */
const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }

const publishProject = (cookie = jean, body: object = TESTABLE) =>
  act.publish(cookie, 'Décollage !', { pitch: 'Un quiz de l’espace pour les petits.', ...body })

const testersPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}/testers`
const testerPath = (projectId: string, memberId: string) =>
  `${testersPath(projectId)}/${encodeURIComponent(memberId)}`

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Une réponse 204 : réussie, et sans corps (rien à lire, rien qui puisse fuiter). */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

/** Rejoindre les testeurs (R7a), une minute après ce qui précède ; rend la date d'inscription. */
const join = async (projectId: string, cookie: string) => {
  later()
  await expectDone(await act.send('POST', testersPath(projectId), cookie))
  return new Date().toISOString()
}

/** Quitter les testeurs (R7a). */
const quit = async (projectId: string, cookie: string) => {
  later()
  await expectDone(await act.send('DELETE', testersPath(projectId), cookie))
}

/** L'auteur retire un membre de ses testeurs ; réponse brute. */
const remove = (projectId: string, memberId: string, cookie: string | null = jean) => {
  later()
  return act.send('DELETE', testerPath(projectId, memberId), cookie)
}

/** Ouvre le coin ; réponse brute. */
const openCorner = (projectId: string, cookie: string | null) =>
  act.send('GET', testersPath(projectId), cookie)

/** Ouvre le coin et le lit, en vérifiant qu'il s'ouvre. */
const corner = async (projectId: string, cookie: string) => {
  const res = await openCorner(projectId, cookie)
  expect(res.status).toBe(200)
  return TesterCorner.parse(await res.json())
}

/** Le corps d'un 404 sur un projet inconnu : la référence de « comme un projet inconnu ». */
const unknownCornerBody = async (cookie: string) => {
  const res = await openCorner(UNKNOWN, cookie)
  expect(res.status).toBe(404)
  return res.json()
}

/** Vérifie que le coin répond comme un projet inconnu à ce membre. */
const expectHidden = async (projectId: string, cookie: string, what: string) => {
  const expected = await unknownCornerBody(cookie)
  const res = await openCorner(projectId, cookie)
  expect(res.status, what).toBe(404)
  expect(await res.json(), what).toEqual(expected)
}

/**
 * Le testeur envoie un retour dans son fil (« En partie », sur téléphone) : c'est ce fil qui fait
 * de lui un ancien testeur une fois parti. La route des fils est testée ailleurs ; ici, elle ne
 * sert qu'à préparer la scène.
 */
const sendFeedback = async (projectId: string, cookie: string, testerId: string) => {
  later()
  const res = await act.send(
    'POST',
    `/v1/projects/${projectId}/threads/${testerId}/messages`,
    cookie,
    {
      kind: 'feedback',
      outcome: 'partly',
      device: 'phone',
      text: 'Le score repart à zéro au niveau 3.',
      captureId: null,
    },
  )
  expect(res.status).toBe(201)
}

const readProject = async (id: string, cookie: string) => {
  const res = await act.send('GET', `/v1/projects/${id}`, cookie)
  expect(res.status).toBe(200)
  return Project.parse(await res.json())
}

/** La modération retire un projet entier (écrit en base, comme dans testers.test.ts). */
const removeProject = (projectId: string) =>
  ctx.db
    .update(schema.project)
    .set({ removedAt: new Date() })
    .where(eq(schema.project.id, projectId))

/** Louis suspend Papi Jean pour 7 jours. */
const suspendJean = async () => {
  later()
  await act.decide(louis, {
    action: 'suspend',
    memberId: jeanId,
    duration: '7d',
    ground: 'rules',
    explanation: 'Des messages répétés malgré les avertissements.',
  })
}

/** Les notifications d'un membre, telles que l'écran Activité les lit. */
const notificationsOf = async (cookie: string) => {
  const res = await act.send('GET', '/v1/notifications', cookie)
  expect(res.status).toBe(200)
  return NotificationPage.parse(await res.json()).items
}

describe('opening the testers corner', () => {
  it('shows the author the tester count and the list, most recent first', async () => {
    const project = await publishProject()
    const inesSince = await join(project.id, ines)
    const malikSince = await join(project.id, malik)
    const inesMe = await act.me(ines)
    const malikMe = await act.me(malik)

    expect(await corner(project.id, jean)).toEqual({
      role: 'author',
      closed: false,
      testerCount: 2,
      testers: [
        {
          id: malikId,
          name: 'Malik',
          handle: malikMe.handle,
          avatarUrl: malikMe.avatarUrl,
          since: malikSince,
        },
        {
          id: inesId,
          name: 'Inès',
          handle: inesMe.handle,
          avatarUrl: inesMe.avatarUrl,
          since: inesSince,
        },
      ],
    })
  })

  it('opens an empty corner to the author of a project nobody tests yet', async () => {
    const project = await publishProject()

    expect(await corner(project.id, jean)).toEqual({
      role: 'author',
      closed: false,
      testerCount: 0,
      testers: [],
    })
  })

  it('shows a tester the tester count, never the list', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)

    const res = await openCorner(project.id, ines)
    expect(res.status).toBe(200)
    const raw = await res.text()

    expect(TesterCorner.parse(JSON.parse(raw))).toEqual({
      role: 'tester',
      closed: false,
      testerCount: 2,
      testers: null,
    })
    // Les testeurs ne se voient pas entre eux : ni l'identifiant ni le nom de Malik.
    expect(raw).not.toContain(malikId)
    expect(raw).not.toContain('"name":"Malik"')
  })

  it('answers « not found » to another member, like an unknown project', async () => {
    const project = await publishProject()
    await join(project.id, ines)

    await expectHidden(project.id, sami, 'another member')
    // Ni le nombre ni la liste ne sortent par la page du projet.
    const raw = await (await act.send('GET', `/v1/projects/${project.id}`, sami)).text()
    expect(raw).not.toContain(inesId)
    expect((await corner(project.id, jean)).role).toBe('author') // témoin
  })

  it('answers « not found » for an unknown or malformed project', async () => {
    const project = await publishProject()
    expect((await corner(project.id, jean)).role).toBe('author') // témoin
    for (const id of [UNKNOWN, 'pas-un-identifiant', "x' or '1'='1"]) {
      await expectError(await openCorner(id, jean), 404, 'not_found')
    }
  })

  it('is only for signed-in members', async () => {
    const project = await publishProject()

    await expectError(await openCorner(project.id, null), 401, 'unauthorized')
    await expectError(await remove(project.id, inesId, null), 401, 'unauthorized')
    expect((await corner(project.id, jean)).role).toBe('author') // témoin
  })

  it('answers « not found » to a member who follows the project without testing it', async () => {
    const project = await publishProject()
    expect((await act.send('POST', `/v1/projects/${project.id}/follow`, sami)).status).toBe(204)

    await expectHidden(project.id, sami, 'a follower')
    expect((await corner(project.id, jean)).role).toBe('author') // témoin
  })
})

describe('a former tester', () => {
  it('keeps a read-only corner after quitting, without the count', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await sendFeedback(project.id, ines, inesId)

    await quit(project.id, ines)

    expect(await corner(project.id, ines)).toEqual({
      role: 'former_tester',
      closed: false,
      testerCount: null,
      testers: null,
    })
  })

  it('keeps a read-only corner after being removed by the author', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await sendFeedback(project.id, ines, inesId)

    await expectDone(await remove(project.id, inesId))

    expect(await corner(project.id, ines)).toMatchObject({
      role: 'former_tester',
      testerCount: null,
      testers: null,
    })
  })

  it('keeps a read-only corner after a block, in both directions', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    await sendFeedback(project.id, ines, inesId)
    await sendFeedback(project.id, malik, malikId)

    // Inès bloque l'auteur ; l'auteur bloque Malik. Le blocage les retire des testeurs (R7a).
    await act.block(jeanId, ines)
    await act.block(malikId, jean)

    for (const [who, cookie] of [
      ['Inès', ines],
      ['Malik', malik],
    ] as const) {
      expect(await corner(project.id, cookie), who).toMatchObject({
        role: 'former_tester',
        testerCount: null,
        testers: null,
      })
    }
  })

  it('becomes a tester again by joining again after quitting', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await sendFeedback(project.id, ines, inesId)
    await quit(project.id, ines)

    await join(project.id, ines)

    expect(await corner(project.id, ines)).toMatchObject({ role: 'tester', testerCount: 1 })
  })
})

describe('a closed corner', () => {
  it('stays readable to the author of a private project, and is not found for its testers', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    await sendFeedback(project.id, malik, malikId)
    await quit(project.id, malik) // un ancien testeur : la fermeture l'emporte aussi pour lui

    await act.setVisibility(project.id, jean, 'private')

    expect(await corner(project.id, jean)).toMatchObject({
      role: 'author',
      closed: true,
      testerCount: 1,
    })
    await expectHidden(project.id, ines, 'a tester')
    await expectHidden(project.id, malik, 'a former tester')

    // Le projet redevient public : le coin se rouvre, l'inscription est restée.
    await act.setVisibility(project.id, jean, 'public')
    expect(await corner(project.id, ines)).toMatchObject({ role: 'tester', closed: false })
  })

  it('stays readable to the author of a removed project, and is not found for its testers', async () => {
    const project = await publishProject()
    await join(project.id, ines)

    await removeProject(project.id)

    expect(await corner(project.id, jean)).toMatchObject({ role: 'author', closed: true })
    await expectHidden(project.id, ines, 'a tester')
  })

  it('stays readable to a suspended author, and is not found for the testers', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    await sendFeedback(project.id, malik, malikId)
    await quit(project.id, malik)

    await suspendJean()

    expect(await corner(project.id, jean)).toMatchObject({
      role: 'author',
      closed: true,
      testerCount: 1,
    })
    await expectHidden(project.id, ines, 'a tester')
    await expectHidden(project.id, malik, 'a former tester')
  })
})

describe('removing a tester', () => {
  it('lets the author remove a tester from the list', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)

    await expectDone(await remove(project.id, inesId))

    expect(await corner(project.id, jean)).toMatchObject({
      testerCount: 1,
      testers: [{ id: malikId }],
    })
    expect(await readProject(project.id, ines)).toMatchObject({ isTester: false })
    // Malik, resté testeur, compte un testeur de moins.
    expect((await corner(project.id, malik)).testerCount).toBe(1)
  })

  it('is idempotent', async () => {
    const project = await publishProject()
    await join(project.id, ines)

    await expectDone(await remove(project.id, inesId))
    await expectDone(await remove(project.id, inesId))

    expect((await corner(project.id, jean)).testerCount).toBe(0)
  })

  it('does not tell the removed tester', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    const before = await notificationsOf(ines)
    const sent = ctx.mailer.sent.length

    await expectDone(await remove(project.id, inesId))
    later()

    expect(await notificationsOf(ines)).toEqual(before)
    expect(ctx.mailer.sent.slice(sent)).toEqual([])
  })

  it('answers 204 and writes nothing for a member who does not test the project', async () => {
    const project = await publishProject()

    // Sami ne teste pas le projet : 204, et aucun retrait n'est écrit pour lui…
    await expectDone(await remove(project.id, (await act.me(sami)).id))
    // … ni pour l'auteur lui-même, ni pour un identifiant qui ne désigne personne.
    await expectDone(await remove(project.id, jeanId))
    await expectDone(await remove(project.id, 'nobody-has-this-id'))

    // Preuve qu'aucune ligne n'est écrite : Sami rejoint ensuite les testeurs sans refus.
    expect(await readProject(project.id, sami)).toMatchObject({ testerJoinable: true })
    await join(project.id, sami)
    expect((await corner(project.id, jean)).testerCount).toBe(1)
  })

  it('refuses another member and a tester, and removes no one', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await join(project.id, malik)
    const expected = await (await remove(UNKNOWN, inesId, sami)).json()

    // Un autre membre : comme un projet inconnu.
    const outsider = await remove(project.id, inesId, sami)
    expect(outsider.status).toBe(404)
    expect(await outsider.json()).toEqual(expected)
    // Un testeur entre dans le coin, mais n'y retire personne.
    const tester = await remove(project.id, inesId, malik)
    expect([403, 404]).toContain(tester.status)

    expect((await corner(project.id, jean)).testerCount).toBe(2)
    await expectDone(await remove(project.id, inesId)) // témoin : l'auteur, lui, le peut
  })

  it('answers « not found » for an unknown or malformed project', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    for (const id of [UNKNOWN, 'pas-un-identifiant']) {
      await expectError(await remove(id, inesId), 404, 'not_found')
    }
    await expectDone(await remove(project.id, inesId)) // témoin
  })

  it('refuses a suspended author removing a tester with 409 corner_closed', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    await suspendJean()

    await expectError(await remove(project.id, inesId), 409, 'corner_closed')

    expect((await corner(project.id, jean)).testerCount).toBe(1)
  })

  it('refuses to remove a tester from a private or removed project with 409 corner_closed', async () => {
    const hidden = await publishProject()
    const removed = await publishProject()
    await join(hidden.id, ines)
    await join(removed.id, ines)
    await act.setVisibility(hidden.id, jean, 'private')
    await removeProject(removed.id)

    await expectError(await remove(hidden.id, inesId), 409, 'corner_closed')
    await expectError(await remove(removed.id, inesId), 409, 'corner_closed')

    // L'inscription est restée : le projet redevenu public la retrouve.
    await act.setVisibility(hidden.id, jean, 'public')
    expect(await readProject(hidden.id, ines)).toMatchObject({ isTester: true })
  })

  it('counts even requests on an unknown project in the tester quota', async () => {
    const project = await publishProject()
    await join(project.id, ines)
    // Le quota des testeurs (60 par heure, celui de R7a) passe avant l'identifiant : chaque demande
    // compte, même celle qui ne trouve rien.
    for (let i = 0; i < 60; i++) {
      expect((await act.send('DELETE', testerPath(crypto.randomUUID(), inesId), jean)).status).toBe(
        404,
      )
    }

    const res = await remove(project.id, inesId)

    await expectError(res, 429, 'rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect(await readProject(project.id, ines)).toMatchObject({ isTester: true })
  })
})

// PGlite n'a qu'une connexion : deux requêtes ne peuvent pas y courir en même temps. L'espion sur
// `transaction` fait le geste de l'autre membre juste avant la transaction du retrait, puis la
// laisse faire : cela prouve que le retrait relit l'inscription dans sa transaction (sous le verrou
// du projet), pas l'attente du verrou elle-même (sécurité A5, A6).
describe('removing a tester who joins at the same moment', () => {
  it('reads the inscription again inside its transaction', async () => {
    const project = await publishProject()
    const original = ctx.db.transaction.bind(ctx.db)
    let armed = true
    const spy = vi.spyOn(ctx.db, 'transaction').mockImplementation(async (...args) => {
      if (armed) {
        armed = false
        // Inès rejoint les testeurs entre la première lecture du retrait et sa transaction.
        await join(project.id, ines)
      }
      return original(...args)
    })

    await expectDone(await remove(project.id, inesId))

    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
    // Le retrait l'a trouvée inscrite : elle n'est plus testeuse, et ne peut plus revenir.
    expect(await readProject(project.id, ines)).toMatchObject({
      isTester: false,
      testerJoinable: false,
    })
  })
})

describe('the API contract', () => {
  it('documents the corner routes', async () => {
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, unknown>>
    }

    expect(doc.paths['/v1/projects/{id}/testers']).toHaveProperty('get')
    expect(doc.paths['/v1/projects/{id}/testers/{memberId}']).toHaveProperty('delete')
  })
})
