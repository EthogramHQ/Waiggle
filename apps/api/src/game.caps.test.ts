// Tests d'intégration de la tranche R19 : les plafonds du jour du pollen. Scénario :
// docs/scenarios/refonte.md, « R19 — La gamification », « Le pollen » : chaque sorte de geste a un
// plafond par jour ; au-delà, le geste marche, sans pollen, et rien ne l'affiche comme une faute
// (pas d'en-tête `Waiggle-Pollen`, le statut habituel). Ce qu'un membre reçoit sur ses projets est
// plafonné à 50 pollen par jour, toutes réceptions confondues. Le jour est celui de Paris : minuit
// de Paris remet les compteurs à zéro. Contrat : `POLLEN_GESTURES`, `RECEIVE_DAILY_CAP`
// (packages/contracts/src/game.ts) ; plan, choix 2 (le verrou par membre) ; relecture de sécurité
// du plan, S1 (deux membres qui réagissent l'un chez l'autre au même instant).
// Le contrat de l'invité d'une ruche : 15 pollen, 5 par jour, comme l'invitant.
//
// Quatre membres : Léa (six projets testables), Max, Zoé et Sami, qui agissent sur ses projets.
import { REACTION_KINDS } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveGestures, signedUpMember, type TestMember } from './testing/hive-gestures'
import { ledgerOf, pollenHeader } from './testing/pollen-ledger'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveGestures>
let lea: TestMember
let max: TestMember
let zoe: TestMember
let sami: TestMember
let projects: string[] // les six projets de Léa

// Un lundi, 9 h à Paris (8 h en temps universel ; Paris est à UTC+1 en novembre).
const START = Date.parse('2026-11-23T08:00:00.000Z')
const MINUTE = 60 * 1000

/** Avance la fausse horloge (par défaut d'une minute : deux gestes n'ont jamais la même date). */
const later = (minutes = 1) => vi.setSystemTime(Date.now() + minutes * MINUTE)

const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveGestures(ctx, act)
  lea = await signedUpMember(ctx, act, 'Léa', '203.0.113.21')
  max = await signedUpMember(ctx, act, 'Max', '203.0.113.22')
  zoe = await signedUpMember(ctx, act, 'Zoé', '203.0.113.23')
  sami = await signedUpMember(ctx, act, 'Sami', '203.0.113.24')
  projects = []
  for (const title of ['Météo', 'Jardin', 'Quiz', 'Recettes', 'Budget', 'Piano']) {
    later()
    projects.push((await act.publish(lea.cookie, title, TESTABLE)).id)
  }
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Une requête qui doit réussir avec ce statut ; rend la réponse (pour lire son en-tête). */
const done = async (
  status: number,
  method: string,
  path: string,
  cookie: string,
  body?: unknown,
) => {
  later()
  const res = await act.send(method, path, cookie, body)
  expect(res.status, `${method} ${path}: ${await res.clone().text()}`).toBe(status)
  return res
}

const project = (id: string) => `/v1/projects/${encodeURIComponent(id)}`

/**
 * Toutes les réactions possibles sur les projets de Léa, une par sorte et par projet (6 × 5 = 30) :
 * chacune est une chose différente, payée une fois.
 */
const reactionPaths = () =>
  projects.flatMap((id) => REACTION_KINDS.map((kind) => `${project(id)}/reactions/${kind}`))

/** Ce membre pose ses `count` premières réactions ; rend les en-têtes de gain, dans l'ordre. */
const react = async (member: TestMember, count: number) => {
  const headers: (string | null)[] = []
  for (const path of reactionPaths().slice(0, count)) {
    headers.push(pollenHeader(await done(204, 'PUT', path, member.cookie)))
  }
  return headers
}

/** Le pollen d'un geste dans le grand livre d'un membre, toutes entrées confondues. */
const sumOf = async (memberId: string, gesture: string | ((name: string) => boolean)) =>
  (await ledgerOf(ctx, memberId))
    .filter((row) => (typeof gesture === 'string' ? row.gesture === gesture : gesture(row.gesture)))
    .reduce((sum, row) => sum + row.amount, 0)

/** Un retour « En partie », sur téléphone, sans capture. */
const feedback = {
  kind: 'feedback',
  outcome: 'partly',
  device: 'phone',
  text: 'Le score repart à zéro au niveau 3.',
  captureId: null,
}

describe('the daily caps of the gestures', () => {
  it('pays no pollen for the 26th reaction of the day, and still records it', async () => {
    const headers = await react(max, 26)

    expect(headers.slice(0, 25)).toEqual(Array(25).fill('2'))
    // Le 26e geste marche (204, plus haut), sans pollen ni en-tête.
    expect(headers[25]).toBeNull()
    expect(await sumOf(max.id, 'reaction')).toBe(50)
    expect((await ledgerOf(ctx, max.id)).filter((row) => row.gesture === 'reaction')).toHaveLength(
      25,
    )
  })

  it('starts counting again at midnight in Paris, not at midnight UTC', async () => {
    await react(max, 25)
    const [late, early] = reactionPaths().slice(25, 27) as [string, string]

    // 23 h 30 à Paris : toujours le même jour, le plafond tient.
    vi.setSystemTime(Date.parse('2026-11-23T22:30:00.000Z'))
    const lateEvening = await act.send('PUT', late, max.cookie)
    // 0 h 05 à Paris le mardi, alors qu'il n'est que 23 h 05 du lundi en temps universel.
    vi.setSystemTime(Date.parse('2026-11-23T23:05:00.000Z'))
    const afterMidnight = await act.send('PUT', early, max.cookie)

    expect(lateEvening.status).toBe(204)
    expect(pollenHeader(lateEvening)).toBeNull()
    expect(afterMidnight.status).toBe(204)
    expect(pollenHeader(afterMidnight)).toBe('2')
    expect((await ledgerOf(ctx, max.id)).at(-1)).toEqual(
      expect.objectContaining({ gesture: 'reaction', day: '2026-11-24' }),
    )
  })

  it('pays no pollen for the 11th comment of the day', async () => {
    const headers: (string | null)[] = []
    for (let i = 1; i <= 11; i += 1) {
      const res = await done(201, 'POST', `${project(projects[0] ?? '')}/comments`, max.cookie, {
        body: `Remarque numéro ${i}.`,
      })
      headers.push(pollenHeader(res))
    }

    expect(headers).toEqual([...Array(10).fill('10'), null])
    expect(await sumOf(max.id, 'comment')).toBe(100)
  })

  it('pays no pollen for the 11th follow of the day', async () => {
    // Onze choses à suivre : les six projets de Léa, deux projets de Zoé, et trois membres.
    const zoeProjects: string[] = []
    for (const title of ['Couture', 'Vélo']) {
      later()
      zoeProjects.push((await act.publish(zoe.cookie, title)).id)
    }
    const paths = [
      ...[...projects, ...zoeProjects].map((id) => `${project(id)}/follow`),
      ...[lea.id, zoe.id, sami.id].map((id) => `/v1/members/${id}/follow`),
    ]
    const headers: (string | null)[] = []
    for (const path of paths) headers.push(pollenHeader(await done(204, 'POST', path, max.cookie)))

    expect(headers).toEqual([...Array(10).fill('3'), null])
    expect(await sumOf(max.id, 'follow')).toBe(30)
  })

  it('pays no pollen for the 6th tester sign-up and the 5th feedback of the day', async () => {
    const joined: (string | null)[] = []
    for (const id of projects) {
      joined.push(pollenHeader(await done(204, 'POST', `${project(id)}/testers`, max.cookie)))
    }
    const sent: (string | null)[] = []
    for (const id of projects.slice(0, 5)) {
      const res = await done(201, 'POST', `${project(id)}/threads/${max.id}/messages`, max.cookie, {
        ...feedback,
      })
      sent.push(pollenHeader(res))
    }

    expect(joined).toEqual([...Array(5).fill('10'), null])
    expect(sent).toEqual([...Array(4).fill('25'), null])
    expect(await sumOf(max.id, 'tester')).toBe(50)
    expect(await sumOf(max.id, 'feedback')).toBe(100)
  })

  it('pays no pollen for the 3rd project published and the 4th update of the day', async () => {
    const published: (string | null)[] = []
    for (const title of ['Un', 'Deux', 'Trois']) {
      const res = await done(201, 'POST', '/v1/projects', max.cookie, {
        title,
        pitch: 'Un petit projet pour essayer.',
        primaryCategory: 'other',
      })
      published.push(pollenHeader(res))
    }
    const updates: (string | null)[] = []
    for (let i = 1; i <= 4; i += 1) {
      const res = await done(201, 'POST', `${project(projects[0] ?? '')}/updates`, lea.cookie, {
        title: null,
        version: null,
        lines: [{ family: 'new', text: `Nouveauté numéro ${i}` }],
        photos: [],
        beforeAfter: false,
      })
      updates.push(pollenHeader(res))
    }

    expect(published).toEqual(['50', '50', null])
    expect(updates).toEqual(['20', '20', '20', null])
    expect(await sumOf(max.id, 'publish')).toBe(100)
    expect(await sumOf(lea.id, 'update')).toBe(60)
  })

  it('pays no pollen for the 2nd hive created in a day', async () => {
    const created: (string | null)[] = []
    for (const name of ['Famille', 'Voisins']) {
      const res = await done(201, 'POST', '/v1/hives', lea.cookie, { name, icon: 'house-line' })
      created.push(pollenHeader(res))
    }

    expect(created).toEqual(['15', null])
    expect(await sumOf(lea.id, 'hive_created')).toBe(15)
  })

  it('pays the invitee 15 pollen and the inviter 20, five accepted invitations a day each', async () => {
    // Léa crée six ruches (seule la première rapporte) et invite Max dans chacune.
    const hiveIds: string[] = []
    for (const name of ['Famille', 'Voisins', 'Club', 'Chorale', 'Atelier', 'Bureau']) {
      later()
      hiveIds.push((await hives.create(lea.cookie, name)).id)
    }
    const accepted: (string | null)[] = []
    for (const hiveId of hiveIds) {
      later()
      await hives.invite(hiveId, lea.cookie, max.id)
      const invitation = await hives.invitationTo(hiveId, max.cookie)
      const res = await done(
        200,
        'POST',
        `/v1/hive-invitations/${invitation.id}/accept`,
        max.cookie,
      )
      accepted.push(pollenHeader(res))
    }

    expect(accepted).toEqual([...Array(5).fill('15'), null])
    expect(await sumOf(max.id, 'invitation_joined')).toBe(75)
    expect(await sumOf(lea.id, 'invitation_accepted')).toBe(100)
  })
})

describe('the daily cap of what is received', () => {
  it('caps what the author receives at 50 pollen a day, all receptions together', async () => {
    // 25 réactions de Max et 25 de Zoé : 50 fois 1 pollen reçu par Léa, le plafond tout juste.
    await react(max, 25)
    await react(zoe, 25)
    const comment = await done(201, 'POST', `${project(projects[0] ?? '')}/comments`, sami.cookie, {
      body: 'Très pratique.',
    })

    // Sami gagne son commentaire ; Léa ne reçoit plus rien ce jour-là.
    expect(pollenHeader(comment)).toBe('10')
    expect(await sumOf(lea.id, (name) => name.startsWith('receive_'))).toBe(50)
    expect(await sumOf(lea.id, 'receive_comment')).toBe(0)

    // Le lendemain à Paris, Léa reçoit de nouveau.
    vi.setSystemTime(Date.parse('2026-11-24T08:00:00.000Z'))
    await done(201, 'POST', `${project(projects[1] ?? '')}/comments`, sami.cookie, {
      body: 'Et celui-ci aussi.',
    })
    expect(await sumOf(lea.id, 'receive_comment')).toBe(3)
  })
})

describe('gestures at the same instant', () => {
  // Sous PGlite, une seule connexion : les deux demandes passent l'une après l'autre, avec ou sans
  // verrou (pieges/drizzle-pglite.md). Ces deux tests disent le résultat attendu ; seule la pile
  // PostgreSQL (infra/stack-test.sh) prouve le verrou lui-même.
  it('keeps the daily cap when two reactions arrive at once', async () => {
    await react(max, 24)
    const [one, two] = reactionPaths().slice(24, 26) as [string, string]
    later()
    const both = await Promise.all([
      act.send('PUT', one, max.cookie),
      act.send('PUT', two, max.cookie),
    ])

    expect(both.map((res) => res.status)).toEqual([204, 204])
    expect(both.map(pollenHeader).filter((header) => header !== null)).toEqual(['2'])
    expect(await sumOf(max.id, 'reaction')).toBe(50)
  })

  it("keeps both reactions when two members react to each other's projects at once", async () => {
    later()
    const garden = (await act.publish(max.cookie, 'Potager')).id
    later()
    const [maxReacts, leaReacts] = await Promise.all([
      act.send('PUT', `${project(projects[0] ?? '')}/reactions/bravo`, max.cookie),
      act.send('PUT', `${project(garden)}/reactions/bravo`, lea.cookie),
    ])

    expect([maxReacts.status, leaReacts.status]).toEqual([204, 204])
    expect([pollenHeader(maxReacts), pollenHeader(leaReacts)]).toEqual(['2', '2'])
    expect(await sumOf(max.id, 'receive_reaction')).toBe(1)
    expect(await sumOf(lea.id, 'receive_reaction')).toBe(1)
  })
})
