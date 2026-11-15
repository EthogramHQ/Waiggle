// Tests d'intégration de R10 « Ruches » : un projet réservé à une ruche ne paraît nulle part pour qui
// n'en est pas membre (une inconnue, une invitée qui n'a pas accepté, un ancien membre), sur chaque
// route qui montre un projet. Ce sont les preuves « ruche » de l'inventaire des routes
// (route-inventory.test.ts, HIVE_PROOFS ; relecture de sécurité du plan, point 1). Le détail de la
// règle (les testeurs, les photos, les nombres, l'export, le catalogue) est dans les tests de la règle
// d'accès ; ici, une seule question, route par route : la réponse trahit-elle le projet ?
//
// Deux façons de le prouver :
// - une route qui lit le projet par son adresse répond, à chacun des trois, mot pour mot comme pour
//   un projet qui n'existe pas ; un membre de la ruche, lui, le lit (témoin) ;
// - une liste ou un nombre (page du membre, Fil, Découvrir, recherche, outils, catégories,
//   notifications, « Proches à suivre ») ne change pas d'un caractère quand le projet réservé est
//   publié ; la même publication en « Membres » la change (témoin : la route montrerait bien ce
//   projet).
//
// Les membres : Inès Haddad (qui anime « Famille » et publie), Léa (membre), Max (ancien membre),
// Zoé (invitée), Nora (une inconnue), Paul (une inconnue qui ne suit personne, pour « Proches à
// suivre »).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveGestures, signedUpMember, type TestMember } from './testing/hive-gestures'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveGestures>
let ines: TestMember
let lea: TestMember
let max: TestMember
let zoe: TestMember
let nora: TestMember
let paul: TestMember
let familleId: string

const UNKNOWN = '00000000-0000-4000-8000-000000000000'

const later = () => vi.setSystemTime(Date.now() + 1000)

/** Ce qu'un projet porte pour paraître dans chaque liste : un outil, une démo testable. */
const visible = {
  tools: ['Claude'],
  status: 'testable',
  demoUrl: 'https://zygomatique.example.com/',
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveGestures(ctx, act)
  ines = await signedUpMember(ctx, act, 'Inès Haddad', '198.51.100.1')
  lea = await signedUpMember(ctx, act, 'Léa', '198.51.100.2')
  max = await signedUpMember(ctx, act, 'Max', '198.51.100.3')
  zoe = await signedUpMember(ctx, act, 'Zoé', '198.51.100.4')
  nora = await signedUpMember(ctx, act, 'Nora', '198.51.100.5')
  paul = await signedUpMember(ctx, act, 'Paul', '198.51.100.6')
  later()
  familleId = (await hives.create(ines.cookie)).id
  later()
  await hives.join(familleId, ines.cookie, lea)
  later()
  await hives.join(familleId, ines.cookie, max)
  later()
  await hives.removeMember(familleId, max.cookie, max.id)
  later()
  await hives.invite(familleId, ines.cookie, zoe.id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const answer = async (path: string, cookie: string) => {
  const res = await act.send('GET', path, cookie)
  return `${res.status} ${await res.text()}`
}

const outsiders = () =>
  [
    ['stranger', nora],
    ['invitee', zoe],
    ['former member', max],
  ] as const

describe('a hive-reserved project', () => {
  it('answers a stranger, an invitee and a former member as an unknown project, on every route that reads it by its address', async () => {
    later()
    const plan = await hives.publishReserved(ines.cookie, 'Le plan de table', familleId, visible)
    later()
    // Le commentaire est d'Inès : Léa, témoin, peut ainsi le signaler (on ne signale pas le sien).
    const comment = await act.comment(plan.id, ines.cookie, 'Je viens avec les cousins.')
    const routes = (projectId: string, commentId: string, testerId: string) => [
      `/v1/projects/${projectId}`,
      `/v1/projects/${projectId}/updates`,
      `/v1/projects/${projectId}/comments`,
      `/v1/projects/${projectId}/testers`,
      `/v1/projects/${projectId}/calls`,
      `/v1/projects/${projectId}/threads`,
      `/v1/projects/${projectId}/threads/${encodeURIComponent(testerId)}/messages`,
      `/v1/comments/${commentId}/context`,
      `/v1/reports/target?${new URLSearchParams({ kind: 'project', id: projectId })}`,
      `/v1/reports/target?${new URLSearchParams({ kind: 'comment', id: commentId })}`,
    ]

    const wrong: string[] = []
    for (const [who, outsider] of outsiders()) {
      const absent = routes(UNKNOWN, UNKNOWN, outsider.id)
      for (const [index, path] of routes(plan.id, comment.id, outsider.id).entries()) {
        const got = await answer(path, outsider.cookie)
        const unknown = await answer(absent[index] ?? '', outsider.cookie)
        if (!got.startsWith('404 ') || got !== unknown)
          wrong.push(`${who}, ${path}: ${got.slice(0, 80)}`)
      }
    }
    expect(wrong.join('\n')).toBe('')
    // Témoins : Léa, membre de la ruche, lit le projet, ses commentaires, et peut le signaler.
    for (const path of routes(plan.id, comment.id, lea.id).filter(
      (one) => !one.includes('/testers') && !one.includes('/calls') && !one.includes('/threads'),
    )) {
      expect(await answer(path, lea.cookie), path).toMatch(/^200 /)
    }
  })

  it('leaves every list and count of a stranger, an invitee and a former member unchanged', async () => {
    // Les trois suivent Inès et l'un de ses projets « Membres » : son Fil, ses notifications et sa
    // page les leur montreraient.
    later()
    const carnet = await act.publish(ines.cookie, 'Carnet de cafés', visible)
    for (const [, outsider] of outsiders()) {
      later()
      await act.followMember(ines.id, outsider.cookie)
      later()
      expect(
        (await act.send('POST', `/v1/projects/${carnet.id}/follow`, outsider.cookie)).status,
      ).toBe(204)
    }
    const reads: [string, TestMember][] = [
      ...outsiders().flatMap(([, outsider]) =>
        [
          `/v1/members/${encodeURIComponent(ines.id)}`,
          '/v1/tags/claude',
          '/v1/feed/following',
          '/v1/feed/discover',
          '/v1/search?q=zygomatique',
          '/v1/tools',
          '/v1/categories',
          '/v1/notifications',
          '/v1/notifications/unread',
        ].map((path): [string, TestMember] => [path, outsider]),
      ),
      ['/v1/suggestions/members', paul],
    ]
    // L'heure de la lecture (`asOf` des notifications) n'est pas un contenu : on la retire.
    const snapshot = async () => {
      const texts: string[] = []
      for (const [path, member] of reads) {
        texts.push((await answer(path, member.cookie)).replace(/"asOf":"[^"]*"/g, ''))
      }
      return texts
    }
    const differing = (before: string[], after: string[]) =>
      reads
        .filter((_, index) => before[index] !== after[index])
        .map(([path, member]) => `${path} (${member.email})`)
    const before = await snapshot()

    // Inès publie un projet réservé à Famille, testable, avec un outil ; Léa le commente.
    later()
    const plan = await hives.publishReserved(
      ines.cookie,
      'Zygomatique en famille',
      familleId,
      visible,
    )
    later()
    await act.comment(plan.id, lea.cookie, 'Je viens avec les cousins.')
    const reserved = await snapshot()
    expect(differing(before, reserved).join('\n')).toBe('')

    // Témoin : le même projet en « Membres », et une mise à jour du projet qu'ils suivent, changent
    // chacune de ces lectures.
    later()
    await act.publish(ines.cookie, 'Zygomatique ouvert', visible)
    later()
    const update = await act.send('POST', `/v1/projects/${carnet.id}/updates`, ines.cookie, {
      title: null,
      version: 'v2',
      lines: [{ family: 'new', text: 'Une carte des cafés du quartier.' }],
      photos: [],
      beforeAfter: false,
    })
    expect(update.status).toBe(201)
    expect(differing(reserved, await snapshot())).toEqual(
      reads.map(([path, member]) => `${path} (${member.email})`),
    )
  })
})
