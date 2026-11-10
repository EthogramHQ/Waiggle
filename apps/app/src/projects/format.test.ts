import { hostOf, shortDate } from './format'

describe('shortDate', () => {
  const now = new Date('2026-10-13T10:00:00Z')

  it('leaves the year out for this year', () => {
    expect(shortDate('2026-10-12T08:00:00Z', 'fr', now)).toBe('12 oct.')
  })

  it('writes the year for another year', () => {
    expect(shortDate('2025-03-02T08:00:00Z', 'en', now)).toBe('Mar 2, 2025')
  })
})

describe('hostOf', () => {
  it('keeps only the name of the website', () => {
    expect(hostOf('https://carnet-cafes.example.com/demo?x=1')).toBe('carnet-cafes.example.com')
  })
})
