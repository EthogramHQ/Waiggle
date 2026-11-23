// Les outils des tests de « Ma récolte » (R19) : lire sa récolte, changer ses réglages du jeu, lire
// ses notifications, et choisir la semaine d'un test. Les défis de la semaine sont tirés au sort de
// façon déterministe (`challengeFor` du contrat, graine : l'identifiant du membre ou de la ruche) :
// un test qui a besoin d'un défi précis ne peut pas choisir l'identifiant, mais il peut choisir la
// semaine. `firstWeekWhere` avance donc la fausse horloge jusqu'au premier lundi dont le tirage lui
// convient. Rien ici n'est utilisé en production.
import {
  challengeFor,
  ErrorResponse,
  Harvest,
  HIVE_CHALLENGES,
  NotificationPage,
  PERSONAL_CHALLENGES,
  UnreadCount,
  weekOf,
} from '@ruche/contracts'
import { expect } from 'vitest'
import type { activity } from './activity'

export const SECOND = 1000
export const MINUTE = 60 * SECOND
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
export const WEEK = 7 * DAY

/**
 * Le lundi de la semaine de Paris de `date`, à 9 h en temps universel (10 h ou 11 h à Paris) : une
 * heure qui tombe toujours dans ce lundi-là, été comme hiver.
 */
export const mondayOf = (date: Date) => new Date(`${weekOf(date)}T09:00:00.000Z`)

/**
 * La première semaine, celle de `from` comprise, que `accept` retient (il reçoit son lundi,
 * `YYYY-MM-DD`). Rend l'instant où placer l'horloge : `from` lui-même si sa semaine convient (on ne
 * recule jamais), sinon le lundi 9 h UTC de la semaine trouvée. Cinquante-deux semaines au plus :
 * au-delà, le tirage ne donne jamais ce que le test attend, et il le dit.
 */
export const firstWeekWhere = (from: Date, accept: (week: string) => boolean) => {
  for (let n = 0; n < 52; n += 1) {
    const monday = new Date(mondayOf(from).getTime() + n * WEEK)
    if (accept(weekOf(monday))) return n === 0 ? from : monday
  }
  throw new Error('no week of the next year draws the challenge this test needs')
}

/** Les trois défis perso proposés à ce membre cette semaine-là (les trois premiers du tirage). */
export const offeredOn = (memberId: string, week: string): string[] =>
  challengeFor(memberId, week, PERSONAL_CHALLENGES)
    .slice(0, 3)
    .map((challenge) => challenge.code)

/** Le défi de cette ruche cette semaine-là (le premier du tirage). */
export const hiveCodeOn = (hiveId: string, week: string): string | undefined =>
  challengeFor(hiveId, week, HIVE_CHALLENGES)[0]?.code

/** Le code d'erreur d'une réponse refusée, après avoir vérifié son statut. */
export const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

export const harvestGestures = (act: ReturnType<typeof activity>) => {
  const expectStatus = async (
    status: number,
    method: string,
    path: string,
    cookie: string,
    body?: unknown,
  ) => {
    const res = await act.send(method, path, cookie, body)
    if (res.status !== status) {
      throw new Error(`${method} ${path}: ${res.status} instead of ${status}`)
    }
    return res
  }

  return {
    /** « Ma récolte » (GET /v1/me/harvest), qui tire aussi les défis de la semaine. */
    harvest: async (cookie: string) =>
      Harvest.parse(await (await expectStatus(200, 'GET', '/v1/me/harvest', cookie)).json()),

    /** PATCH /v1/me/game, réponse brute. */
    patchGame: (cookie: string, body: unknown) => act.send('PATCH', '/v1/me/game', cookie, body),

    /** PATCH /v1/me/game qui doit réussir (204). */
    setGame: async (cookie: string, body: object) => {
      await expectStatus(204, 'PATCH', '/v1/me/game', cookie, body)
    },

    /** Offre du miel à un projet (POST /v1/projects/{id}/honey → 204). */
    offerHoney: async (projectId: string, cookie: string) => {
      await expectStatus(204, 'POST', `/v1/projects/${encodeURIComponent(projectId)}/honey`, cookie)
    },

    /** La première page de l'Activité. */
    notifications: async (cookie: string) =>
      NotificationPage.parse(
        await (await expectStatus(200, 'GET', '/v1/notifications', cookie)).json(),
      ).items,

    /** Le nombre de la cloche. */
    unread: async (cookie: string) =>
      UnreadCount.parse(
        await (await expectStatus(200, 'GET', '/v1/notifications/unread', cookie)).json(),
      ).count,

    /** Publie une mise à jour d'une ligne sur son projet (POST /v1/projects/{id}/updates → 201). */
    postUpdate: async (projectId: string, cookie: string) => {
      await expectStatus(
        201,
        'POST',
        `/v1/projects/${encodeURIComponent(projectId)}/updates`,
        cookie,
        {
          title: null,
          version: null,
          lines: [{ family: 'new', text: 'Un compte à rebours avant chaque question' }],
          photos: [],
          beforeAfter: false,
        },
      )
    },
  }
}
