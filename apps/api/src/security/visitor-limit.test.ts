// Tests de la limite de lecture des visiteurs (R12, décision 6), sans l'API : la fenêtre, son
// renouvellement, et l'indépendance de deux réseaux. Le test d'intégration de la route est dans
// public-projects.test.ts ; celui-ci prouve aussi le retour après dix minutes à lui seul.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVisitorLimit } from './visitor-limit'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T08:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the read limit of a visitor network', () => {
  it('allows 300 reads in ten minutes, refuses the next ones, then opens a new window', () => {
    const limit = createVisitorLimit()
    for (let i = 0; i < 300; i += 1) expect(limit.hit('2001:db8:1:2::/64').allowed).toBe(true)
    const refused = limit.hit('2001:db8:1:2::/64')
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfterSeconds).toBe(600)
    // Une autre adresse n'est pas touchée.
    expect(limit.hit('198.51.100.23').allowed).toBe(true)

    // Une seconde avant la fin de la fenêtre : toujours refusé, et il reste une seconde.
    vi.setSystemTime(Date.now() + 10 * 60 * 1000 - 1000)
    expect(limit.hit('2001:db8:1:2::/64')).toEqual({ allowed: false, retryAfterSeconds: 1 })
    // La fenêtre passée, le compte repart de zéro.
    vi.setSystemTime(Date.now() + 1000)
    expect(limit.hit('2001:db8:1:2::/64').allowed).toBe(true)
  })

  it('keeps one counter per limit: two APIs never share it', () => {
    const first = createVisitorLimit({ windowMs: 1000, max: 1 })
    const second = createVisitorLimit({ windowMs: 1000, max: 1 })
    expect(first.hit('198.51.100.23').allowed).toBe(true)
    expect(first.hit('198.51.100.23').allowed).toBe(false)
    expect(second.hit('198.51.100.23').allowed).toBe(true)
  })
})
