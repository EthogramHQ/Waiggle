// Tests de l'heure de Paris (relecture juridique J4) : une date de la modération s'écrit dans le
// fuseau de Paris, jamais dans celui de l'appareil ni en UTC. La fonction reçoit une heure UTC : ce
// qu'elle rend ne dépend pas du fuseau de la machine qui fait tourner les tests.
import { parisDateTime } from './parisTime'

/** Les blancs d'Intl (espaces insécables, fines) ramenés à des espaces simples. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

const now = new Date('2026-10-26T12:00:00.000Z')

describe('parisDateTime', () => {
  it('writes an end at 23:30 UTC on the next day at 0:30, in winter time', () => {
    const { date, time, dateTime } = parisDateTime('2026-11-02T23:30:00.000Z', 'fr', now)

    expect(plain(date)).toBe('3 novembre')
    expect(plain(time)).toMatch(/^0?0(:| h )30$/)
    expect(plain(dateTime)).toMatch(/^3 novembre .*0?0(:| h )30$/)
  })

  it('adds two hours in summer time', () => {
    const { date, time } = parisDateTime('2026-07-14T22:15:00.000Z', 'fr', now)

    expect(plain(date)).toBe('15 juillet')
    expect(plain(time)).toMatch(/^0?0(:| h )15$/)
  })

  it('keeps the same day when Paris is still on it', () => {
    const { date, time } = parisDateTime('2026-11-02T22:00:00.000Z', 'fr', now)

    expect(plain(date)).toBe('2 novembre')
    expect(plain(time)).toMatch(/^23(:| h )00$/)
  })

  it('writes the hour of Paris in English too', () => {
    const { date, time } = parisDateTime('2026-11-02T23:30:00.000Z', 'en', now)

    expect(plain(date)).toBe('November 3')
    expect(plain(time)).toBe('12:30 AM')
  })

  it('writes the hour on two digits, like the e-mail', () => {
    // « 00:30 », comme l'e-mail de la suspension : « 0:30 » donnerait deux heures différentes.
    const { time, dateTime } = parisDateTime('2026-11-02T23:30:00.000Z', 'fr', now)

    expect(plain(time)).toBe('00:30')
    expect(plain(dateTime)).toBe('3 novembre à 00:30')
  })

  it('writes the year only when it is not the current one, in Paris', () => {
    // Le 31 décembre à 23 h 30 UTC, c'est déjà le 1er janvier 2027 à Paris.
    expect(plain(parisDateTime('2026-12-31T23:30:00.000Z', 'fr', now).date)).toBe('1 janvier 2027')
    expect(plain(parisDateTime('2026-12-31T22:30:00.000Z', 'fr', now).date)).toBe('31 décembre')
  })
})
