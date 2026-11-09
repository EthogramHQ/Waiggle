// Le mois « Commencé en » d'un projet, écrit dans la langue de l'appli (R6a, projects/month.ts).
import { startedMonth } from './month'

describe('startedMonth', () => {
  it('writes the month in full, then the year, in French and in English', () => {
    expect(startedMonth('2026-09', 'fr')).toBe('septembre 2026')
    expect(startedMonth('2026-03', 'en')).toBe('March 2026')
  })

  it('keeps the first month of the year whatever the time zone (read as UTC)', () => {
    expect(startedMonth('2027-01', 'fr')).toBe('janvier 2027')
  })

  it('writes nothing for a value that is not a month', () => {
    expect(startedMonth('2026-13', 'fr')).toBeNull()
    expect(startedMonth('2026-9', 'fr')).toBeNull()
    expect(startedMonth('2026-09-01', 'fr')).toBeNull()
    expect(startedMonth('', 'fr')).toBeNull()
  })
})
