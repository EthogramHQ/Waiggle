// La répartition des captures en parts (scripts/shard.ts) : chaque part en prend un morceau, et
// toutes ensemble reprennent la liste entière, sans doublon ni oubli.
import { parseShard, shardOf } from './shard'

// Une liste qui ressemble à celle des captures : des pages lourdes groupées au début (chacune en
// quatre travaux : téléphone / ordinateur × jour / nuit), puis des légères.
const jobs = Array.from({ length: 23 }, (_, i) => `travail-${i}`)

describe('shardOf', () => {
  it.each([1, 2, 3, 4])('splits the list in %i parts that together make the whole list', (n) => {
    const parts = Array.from({ length: n }, (_, i) => shardOf(jobs, { index: i + 1, count: n }))
    const all = parts.flat()
    expect(all).toHaveLength(jobs.length)
    expect(new Set(all).size).toBe(jobs.length)
    expect([...all].sort()).toEqual([...jobs].sort())
  })

  it('gives parts that differ by one job at most', () => {
    const sizes = [1, 2, 3].map((i) => shardOf(jobs, { index: i, count: 3 }).length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
  })

  it('spreads neighbours (the four jobs of one heavy page) over different parts', () => {
    const first = shardOf(jobs, { index: 1, count: 2 })
    expect(first).toContain('travail-0')
    expect(first).not.toContain('travail-1')
  })

  it('keeps the order of the list inside a part, and is stable from one call to the next', () => {
    const part = shardOf(jobs, { index: 2, count: 2 })
    expect(part).toEqual(shardOf(jobs, { index: 2, count: 2 }))
    expect(part).toEqual(jobs.filter((_, i) => i % 2 === 1))
  })

  it('returns the whole list without a shard', () => {
    expect(shardOf(jobs, undefined)).toEqual(jobs)
  })
})

describe('parseShard', () => {
  it('reads "i/n"', () => {
    expect(parseShard('2/3')).toEqual({ index: 2, count: 3 })
  })

  it.each(['0/2', '3/2', '1/0', 'a/b', '1', '1/2/3', '1.5/2', ''])('refuses %j', (value) => {
    expect(() => parseShard(value)).toThrow(/--shard/)
  })
})
