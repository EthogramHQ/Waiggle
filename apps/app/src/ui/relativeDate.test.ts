// Tests des dates relatives du fil (refonte, tranche R4, décision F-Fil3) : « à l'instant », « il y a
// 5 min », « il y a 3 h », « hier », « dimanche », puis la date courte (« 13 oct. »). Les jours se
// comptent à l'heure de Paris, jamais dans le fuseau de l'appareil ni en UTC : à 00 h 30 à Paris, il
// est encore 22 h 30 la veille en UTC.
//
// `relativeDate(iso, langue, maintenant)` est une fonction pure : le test lui donne l'heure qu'il
// est (`now`), le résultat ne dépend donc ni de l'horloge ni du fuseau de la machine. Elle rend trois
// textes :
// - `label`, ce qu'on affiche seul (« hier ») ;
// - `full`, la date et l'heure complètes, celles que lit un lecteur d'écran (`parisDateTime`) ;
// - `afterVerb`, la forme posée après un verbe (« publié hier », « publié le 13 oct. ») : une date
//   au-delà de 7 jours y prend « le » (relecture de l'interface ui-B2 et juridique J2).

import { createI18n } from '../i18n'
import { fr } from '../testing/text'
import { parisDateTime } from './parisTime'
import { relativeDate } from './relativeDate'

const en = createI18n('en')

/** Les blancs d'Intl et de la typographie française (insécables, fines) ramenés à des espaces. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

/** Le mardi 20 octobre 2026 à midi, heure de Paris (UTC+2 jusqu'au 25 octobre). */
const now = new Date('2026-10-20T10:00:00.000Z')

/** Une date, `ms` millisecondes avant `now` (après, si `ms` est négatif). */
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Le texte affiché seul, en français, normalisé. */
const label = (iso: string, at: Date = now) => plain(relativeDate(iso, 'fr', at).label)

const text = {
  now: plain(fr.t(($) => $.dates.now)),
  minutes: (count: number) => plain(fr.t(($) => $.dates.minutes, { count })),
  hours: (count: number) => plain(fr.t(($) => $.dates.hours, { count })),
  yesterday: plain(fr.t(($) => $.dates.yesterday)),
}

describe('relativeDate, the thresholds', () => {
  it('says à l’instant under a minute', () => {
    expect(label(ago(30_000))).toBe(text.now)
    expect(label(ago(59_000))).toBe(text.now)
  })

  it('counts the minutes from one minute to under an hour', () => {
    expect(label(ago(MINUTE))).toBe(text.minutes(1))
    expect(label(ago(5 * MINUTE))).toBe(text.minutes(5))
    expect(label(ago(59 * MINUTE))).toBe(text.minutes(59))
  })

  it('counts the hours the same day, from one hour on', () => {
    expect(label(ago(HOUR))).toBe(text.hours(1))
    expect(label(ago(3 * HOUR + 20 * MINUTE))).toBe(text.hours(3))
  })

  it('counts the day in Paris: 00:30 in Paris is still today, though yesterday in UTC', () => {
    // 2026-10-19T22:30Z : le 20 octobre à 00 h 30 à Paris, le même jour que `now`.
    expect(label('2026-10-19T22:30:00.000Z')).toBe(text.hours(11))
  })

  it('says hier for the day before in Paris', () => {
    // Le 19 octobre à 23 h 30 à Paris, 12 h 30 plus tôt seulement.
    expect(label('2026-10-19T21:30:00.000Z')).toBe(text.yesterday)
    // Le 19 octobre à 00 h 30 à Paris : en UTC, c'est encore le 18 (deux jours plus tôt).
    expect(label('2026-10-18T22:30:00.000Z')).toBe(text.yesterday)
  })

  it('gives the day of the week up to 7 days', () => {
    // Le dimanche 18 et le mercredi 14 octobre 2026.
    expect(label('2026-10-18T10:00:00.000Z')).toBe('dimanche')
    expect(label('2026-10-14T10:00:00.000Z')).toBe('mercredi')
  })

  it('shows the short date at exactly 7 days', () => {
    // Le mardi 13 octobre : « mardi » se confondrait avec aujourd'hui.
    expect(label('2026-10-13T10:00:00.000Z')).toBe('13 oct.')
  })

  it('shows the short date beyond 7 days', () => {
    expect(label('2026-10-01T10:00:00.000Z')).toBe('1 oct.')
  })

  it('adds the year when it differs', () => {
    const january = new Date('2026-01-10T11:00:00.000Z')
    expect(label('2025-12-20T11:00:00.000Z', january)).toBe('20 déc. 2025')
  })

  it('says à l’instant for a date slightly ahead', () => {
    // L'horloge de l'appareil retarde un peu sur celle du serveur : jamais « dans 2 min ».
    expect(label(ago(-2 * MINUTE))).toBe(text.now)
  })
})

describe('relativeDate, around midnight in Paris', () => {
  // 00 h 10 à Paris le 20 octobre (22 h 10 UTC le 19).
  const justAfterMidnight = new Date('2026-10-19T22:10:00.000Z')

  it('keeps counting minutes across midnight', () => {
    // 23 h 50 la veille, à Paris : 20 minutes plus tôt.
    expect(label('2026-10-19T21:50:00.000Z', justAfterMidnight)).toBe(text.minutes(20))
  })

  it('says hier past an hour before, once the day has changed', () => {
    // 22 h 30 la veille, à Paris : 1 h 40 plus tôt, mais hier.
    expect(label('2026-10-19T20:30:00.000Z', justAfterMidnight)).toBe(text.yesterday)
  })
})

describe('relativeDate, the full date', () => {
  it('reads the full date and hour in Paris', () => {
    const iso = '2026-10-18T08:00:00.000Z'
    expect(relativeDate(iso, 'fr', now).full).toBe(parisDateTime(iso, 'fr', now).dateTime)
  })

  it('reads the full date even for a date of a few minutes', () => {
    const iso = ago(5 * MINUTE)
    expect(relativeDate(iso, 'fr', now).full).toBe(parisDateTime(iso, 'fr', now).dateTime)
  })
})

describe('relativeDate, in English', () => {
  const label = (iso: string) => plain(relativeDate(iso, 'en', now).label)

  it('speaks English at each threshold', () => {
    expect(label(ago(30_000))).toBe(plain(en.t(($) => $.dates.now)))
    expect(label(ago(5 * MINUTE))).toBe(plain(en.t(($) => $.dates.minutes, { count: 5 })))
    expect(label(ago(3 * HOUR))).toBe(plain(en.t(($) => $.dates.hours, { count: 3 })))
    expect(label('2026-10-19T21:30:00.000Z')).toBe(plain(en.t(($) => $.dates.yesterday)))
    expect(label('2026-10-18T10:00:00.000Z')).toBe('Sunday')
    expect(label('2026-10-13T10:00:00.000Z')).toBe('Oct 13')
  })

  it('reads the full date in English', () => {
    const iso = '2026-10-18T08:00:00.000Z'
    expect(relativeDate(iso, 'en', now).full).toBe(parisDateTime(iso, 'en', now).dateTime)
  })
})

describe('relativeDate, after a verb', () => {
  /** « publié … », la phrase de la page d'un projet (project.page.publishedWhen). */
  const published = (iso: string, language: 'fr' | 'en' = 'fr') => {
    const i18n = language === 'fr' ? fr : en
    const when = relativeDate(iso, language, now).afterVerb
    return plain(i18n.t(($) => $.project.page.publishedWhen, { when }))
  }

  it('phrases a date after a verb: publié hier, publié le 12 oct.', () => {
    expect(published('2026-10-19T21:30:00.000Z')).toBe('publié hier')
    expect(published('2026-10-12T10:00:00.000Z')).toBe('publié le 12 oct.')
  })

  it('keeps the short forms as they are after a verb', () => {
    expect(published(ago(30_000))).toBe(`publié ${text.now}`)
    expect(published(ago(5 * MINUTE))).toBe(`publié ${text.minutes(5)}`)
    expect(published('2026-10-18T10:00:00.000Z')).toBe('publié dimanche')
  })

  it('uses the forms of dates.onDay and dates.onDate', () => {
    expect(plain(relativeDate('2026-10-18T10:00:00.000Z', 'fr', now).afterVerb)).toBe(
      plain(fr.t(($) => $.dates.onDay, { day: 'dimanche' })),
    )
    expect(plain(relativeDate('2026-10-12T10:00:00.000Z', 'fr', now).afterVerb)).toBe(
      plain(fr.t(($) => $.dates.onDate, { date: '12 oct.' })),
    )
  })

  it('phrases it in English too: published on Sunday, published on Oct 12', () => {
    expect(published('2026-10-19T21:30:00.000Z', 'en')).toBe('published yesterday')
    expect(published('2026-10-18T10:00:00.000Z', 'en')).toBe('published on Sunday')
    expect(published('2026-10-12T10:00:00.000Z', 'en')).toBe('published on Oct 12')
  })
})
