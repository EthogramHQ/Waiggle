// Tests des sections de la page « Activité » (notifications/days.ts, R8) : « Aujourd'hui », « Cette
// semaine » et « Plus tôt », en jours du calendrier de Paris comme toutes les dates de l'appli
// (décision de Louis du 12/11/2026, relecture du plan). « Cette semaine » : la veille et les cinq
// jours d'avant, ceux que la date relative nomme par leur jour (« hier », « mardi ») ; au-delà,
// « Plus tôt » (planche R8-Activite : « mardi » et « lundi » sous « Cette semaine », « 18 oct. »
// sous « Plus tôt »).
//
// L'API (plan, « API des modules partagés ») :
//   groupByDay<T extends { date: string }>(items: T[], now: Date)
//     → { key: 'today' | 'week' | 'earlier'; items: T[] }[]
// Les sections vides sont absentes ; l'ordre des éléments est gardé.
import { groupByDay } from './days'

/** Le jeudi 12 novembre 2026, 8 h 30 à Paris (7 h 30 UTC). */
const now = new Date('2026-11-12T07:30:00.000Z')

const item = (id: string, date: string) => ({ id, date })

/** Les identifiants de chaque section, pour comparer d'un coup d'œil. */
const shape = (groups: ReturnType<typeof groupByDay<{ id: string; date: string }>>) =>
  groups.map((group) => ({ key: group.key, ids: group.items.map((one) => one.id) }))

/**
 * Le fuseau de l'appareil, le temps d'une fonction. Node relit `TZ` à chaque changement : `Date`
 * (`getDate`, `getHours`) suit alors ce fuseau, comme un téléphone réglé ailleurs qu'en France.
 */
const inTimeZone = <R>(zone: string, run: () => R): R => {
  const before = process.env.TZ
  process.env.TZ = zone
  try {
    return run()
  } finally {
    if (before === undefined) delete process.env.TZ
    else process.env.TZ = before
  }
}

describe('groupByDay', () => {
  it('sorts the notifications into today, this week and earlier, keeping their order', () => {
    const items = [
      item('a', '2026-11-12T07:00:00.000Z'), // aujourd'hui, 8 h
      item('b', '2026-11-11T09:00:00.000Z'), // hier
      item('c', '2026-11-06T09:00:00.000Z'), // vendredi dernier, 6 jours avant
      item('d', '2026-11-05T09:00:00.000Z'), // 7 jours avant
      item('e', '2026-10-18T09:00:00.000Z'),
    ]

    expect(shape(groupByDay(items, now))).toEqual([
      { key: 'today', ids: ['a'] },
      { key: 'week', ids: ['b', 'c'] },
      { key: 'earlier', ids: ['d', 'e'] },
    ])
  })

  it('leaves out the empty sections', () => {
    const items = [item('a', '2026-11-12T07:00:00.000Z'), item('e', '2026-10-18T09:00:00.000Z')]

    expect(shape(groupByDay(items, now))).toEqual([
      { key: 'today', ids: ['a'] },
      { key: 'earlier', ids: ['e'] },
    ])
  })

  it('gives no section at all for no notification', () => {
    expect(groupByDay([], now)).toEqual([])
  })

  it('counts days of the calendar, not slices of 24 hours', () => {
    // Il est 0 h 05 à Paris ce jeudi. 0 h 01 : aujourd'hui ; 23 h 55 la veille, dix minutes plus
    // tôt seulement : « Cette semaine ». Dans l'ordre de l'API, du plus récent au plus ancien.
    const justAfterMidnight = new Date('2026-11-11T23:05:00.000Z')
    const items = [
      item('early', '2026-11-11T23:01:00.000Z'),
      item('late', '2026-11-11T22:55:00.000Z'),
    ]

    expect(shape(groupByDay(items, justAfterMidnight))).toEqual([
      { key: 'today', ids: ['early'] },
      { key: 'week', ids: ['late'] },
    ])
  })

  // Relecture du plan (interface) : la section suit le jour de Paris, jamais celui de l'appareil.
  // 22 h hier à Paris, c'est déjà aujourd'hui à Tokyo, et c'est encore « aujourd'hui » à Honolulu
  // (où il est 21 h 30 la veille) : une section lue à l'heure de l'appareil la mettrait sous
  // « Aujourd'hui ». La section de « hier » est « Cette semaine » (`week` de days.ts).
  it('puts a notification of 22:00 in Paris yesterday under « earlier days », whatever the device time zone', () => {
    const yesterdayAt22 = item('y', '2026-11-11T21:00:00.000Z')

    for (const zone of ['Europe/Paris', 'UTC', 'Asia/Tokyo', 'Pacific/Honolulu']) {
      const groups = inTimeZone(zone, () => groupByDay([yesterdayAt22], now))
      expect({ zone, groups: shape(groups) }).toEqual({
        zone,
        groups: [{ key: 'week', ids: ['y'] }],
      })
    }
  })

  it('keeps today at the hour of Paris on a device set elsewhere', () => {
    // 0 h 30 à Paris ce jeudi (23 h 30 UTC la veille) : aujourd'hui, même pour un appareil en UTC.
    const todayAtHalfPastMidnight = item('t', '2026-11-11T23:30:00.000Z')

    for (const zone of ['UTC', 'Pacific/Honolulu']) {
      const groups = inTimeZone(zone, () => groupByDay([todayAtHalfPastMidnight], now))
      expect({ zone, groups: shape(groups) }).toEqual({
        zone,
        groups: [{ key: 'today', ids: ['t'] }],
      })
    }
  })
})
