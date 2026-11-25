// Les gestes et les lectures du jeu (R19, « La gamification ») dont ont besoin les tests de la
// récolte : lire « Ma récolte », régler son jeu, lire un classement, offrir du miel, décorer son
// rayon, et les gestes qui rapportent (devenir testeur, faire un retour, le régler, publier une mise
// à jour). Chaque geste passe par l'API, comme dans l'appli, et vérifie son statut : un geste qui
// échoue dit lequel, au lieu de laisser le test échouer plus loin sans qu'on sache pourquoi.
//
// Le temps : les tests partent d'un mercredi (`START`) et sautent au lundi suivant (`nextMonday`),
// le jour où les défis changent et où les classements repartent à zéro. Une session dure 7 jours :
// un test qui saute plus loin se reconnecte (`act.signInAgain`).
//
// Rien ici n'est utilisé en production.
import {
  type DecorationChoice,
  ErrorResponse,
  Harvest,
  Member,
  Ranking,
  TesterMessage,
  weekOf,
} from '@ruche/contracts'
import { sql } from 'drizzle-orm'
import { expect } from 'vitest'
import type { activity } from './activity'
import type { TestContext } from './context'
import { later } from './visitor-world'

/** Un mercredi de novembre, 10 h à Paris (9 h en temps universel, l'hiver) : milieu de semaine. */
export const START = new Date('2026-11-18T09:00:00.000Z')

/** Un projet « testable », avec une démo : on peut en devenir testeur et y faire un retour. */
export const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }

/** Un jour, en millisecondes. */
export const DAY = 24 * 60 * 60 * 1000

/**
 * Saute au lundi suivant, 10 h à Paris (en novembre et décembre, Paris est à UTC+1). `weekOf` donne
 * le lundi de la semaine en cours ; on ajoute sept jours.
 */
export const nextMonday = (vi: { setSystemTime: (date: Date) => void }) => {
  const monday = new Date(`${weekOf(new Date())}T09:00:00.000Z`)
  vi.setSystemTime(new Date(monday.getTime() + 7 * DAY))
}

/** Vérifie le statut et le code d'une erreur de l'API, et rend son corps. */
export const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status, `${status} ${code}`).toBe(status)
  const body = await res.json()
  expect(ErrorResponse.parse(body).error.code).toBe(code)
  return body as unknown
}

/** Une réponse 204 : réussie, et sans corps. */
export const expectDone = async (res: Response) => {
  expect(res.status, await res.clone().text()).toBe(204)
  expect(await res.text()).toBe('')
}

export const gameWorld = (ctx: TestContext, act: ReturnType<typeof activity>) => {
  /** « Ma récolte » (GET /v1/me/harvest), qui doit répondre 200. */
  const harvest = async (cookie: string) => {
    const res = await act.send('GET', '/v1/me/harvest', cookie)
    expect(res.status, `GET /v1/me/harvest: ${await res.clone().text()}`).toBe(200)
    return Harvest.parse(await res.json())
  }

  /** PATCH /v1/me/game, réponse brute (204 attendu, ou 422). */
  const patchGame = (cookie: string, body: unknown) => {
    later()
    return act.send('PATCH', '/v1/me/game', cookie, body)
  }

  /** Le classement, réponse brute : `query` est la chaîne de recherche (« scope=close »). */
  const rankingRaw = (cookie: string, query: string) =>
    act.send('GET', `/v1/rankings?${query}`, cookie)

  /** Le classement, qui doit répondre 200. */
  const ranking = async (cookie: string, query: string) => {
    const res = await rankingRaw(cookie, query)
    expect(res.status, `GET /v1/rankings?${query}: ${await res.clone().text()}`).toBe(200)
    return Ranking.parse(await res.json())
  }

  /** Offrir du miel à un projet (POST /v1/projects/{id}/honey), réponse brute. */
  const offerHoney = (cookie: string, projectId: string) => {
    later()
    return act.send('POST', `/v1/projects/${encodeURIComponent(projectId)}/honey`, cookie)
  }

  /** Décorer son rayon (PUT /v1/me/game/decoration), réponse brute. */
  const decorate = (cookie: string, choice: DecorationChoice) => {
    later()
    return act.send('PUT', '/v1/me/game/decoration', cookie, choice)
  }

  /** La page d'un membre (GET /v1/members/{id}), lue par ce membre. */
  const memberPage = async (memberId: string, cookie: string) => {
    const res = await act.send('GET', `/v1/members/${encodeURIComponent(memberId)}`, cookie)
    expect(res.status).toBe(200)
    return Member.parse(await res.json())
  }

  /** Publie un projet testable, une seconde après ce qui précède ; rend son identifiant. */
  const testable = async (cookie: string, title: string, fields: object = {}) => {
    later()
    return (await act.publish(cookie, title, { ...TESTABLE, ...fields })).id
  }

  /** Devient testeur d'un projet (POST /v1/projects/{id}/testers → 204). */
  const joinTesters = async (projectId: string, cookie: string) => {
    later()
    await expectDone(await act.send('POST', `/v1/projects/${projectId}/testers`, cookie))
  }

  /** Le testeur envoie un retour dans son fil (« En partie », sur téléphone) et le rend. */
  const feedback = async (projectId: string, tester: { id: string; cookie: string }) => {
    later()
    const res = await act.send(
      'POST',
      `/v1/projects/${projectId}/threads/${tester.id}/messages`,
      tester.cookie,
      {
        kind: 'feedback',
        outcome: 'partly',
        device: 'phone',
        text: 'Le score repart à zéro au niveau 3.',
        captureId: null,
      },
    )
    expect(res.status, `feedback: ${await res.clone().text()}`).toBe(201)
    return TesterMessage.parse(await res.json())
  }

  /** L'auteur marque « réglé » le retour d'un testeur (la route des fils de testeurs, sans le testeur dans le chemin). */
  const settle = async (projectId: string, messageId: string, cookie: string) => {
    later()
    const res = await act.send(
      'POST',
      `/v1/projects/${projectId}/messages/${messageId}/settled`,
      cookie,
    )
    expect([200, 204], `settle: ${res.status}`).toContain(res.status)
  }

  /** Publie une mise à jour d'une ligne sur son projet (201). */
  const postUpdate = async (projectId: string, cookie: string) => {
    later()
    const res = await act.send('POST', `/v1/projects/${projectId}/updates`, cookie, {
      title: null,
      version: null,
      lines: [{ family: 'new', text: 'Un compte à rebours avant chaque question' }],
      photos: [],
      beforeAfter: false,
    })
    expect(res.status, `update: ${await res.clone().text()}`).toBe(201)
  }

  /** Commente le projet d'un autre membre, une seconde après ce qui précède. */
  const comment = async (projectId: string, cookie: string, body = 'Bravo, ça marche bien !') => {
    later()
    return act.comment(projectId, cookie, body)
  }

  /** Réagit à un projet, une seconde après ce qui précède. */
  const react = async (projectId: string, cookie: string, kind = 'bravo') => {
    later()
    await act.react(projectId, kind, cookie)
  }

  /**
   * Marque un compte d'exemples (R12b) : en production, seul `infra/mark-example.sh` le fait,
   * directement en base ; le test écrit donc lui aussi dans la table `example_account`.
   */
  const markExample = (userId: string) =>
    ctx.db.execute(
      sql`insert into example_account (user_id, marked_at)
          values (${userId}, ${new Date().toISOString()}::timestamptz at time zone 'UTC')`,
    )

  return {
    harvest,
    patchGame,
    rankingRaw,
    ranking,
    offerHoney,
    decorate,
    memberPage,
    testable,
    joinTesters,
    feedback,
    settle,
    postUpdate,
    comment,
    react,
    markExample,
  }
}
