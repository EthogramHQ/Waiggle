// Les places de recherche (search/slots.ts), sans HTTP : l'ordre de la file d'attente et le compte
// des places. Les cas vus par la route (attente, refus, abandon) sont dans search.test.ts.
import { describe, expect, it } from 'vitest'
import { createSearchSlots } from './slots'

/** Laisse passer les promesses déjà réglées, et leurs `then`. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('search slots', () => {
  it('gives a freed place to the oldest waiting search that can run', async () => {
    const slots = createSearchSlots({ perMember: 1, atOnce: 2, waitMs: 5000, maxWaiting: 5 })
    const served: string[] = []
    const releaseA = await slots.take('a')
    const releaseB = await slots.take('b')
    // Trois demandes attendent, dans cet ordre : une deuxième de « a », puis « c », puis « d ».
    const waits = (
      [
        ['a2', 'a'],
        ['c1', 'c'],
        ['d1', 'd'],
      ] as const
    ).map(([name, member]) =>
      slots.take(member).then((release) => {
        served.push(name)
        return release
      }),
    )

    // La place de « b » : « a » cherche encore, sa deuxième demande ne peut pas partir ; « c »,
    // arrivée ensuite, passe avant « d ».
    releaseB?.()
    await tick()
    expect(served).toEqual(['c1'])
    // La place de « a » revient à sa deuxième demande, toujours avant « d ».
    releaseA?.()
    await tick()
    expect(served).toEqual(['c1', 'a2'])

    const [releaseA2, releaseC] = await Promise.all(waits.slice(0, 2))
    releaseC?.()
    const releaseD = await waits[2]
    expect(served).toEqual(['c1', 'a2', 'd1'])
    releaseA2?.()
    releaseD?.()
  })

  it('keeps a member to their share of the waiting line, and lets the others in', async () => {
    const slots = createSearchSlots({
      perMember: 1,
      atOnce: 1,
      waitMs: 5000,
      maxWaiting: 5,
      waitingPerMember: 2,
    })
    const release = await slots.take('a')
    const waits = [slots.take('a'), slots.take('a')]
    // La troisième demande de « a » qui attendrait : refusée tout de suite. Celle de « b » attend.
    let thirdDone = false
    const third = slots.take('a').then((result) => {
      thirdDone = true
      return result
    })
    let otherDone = false
    const other = slots.take('b').then((result) => {
      otherDone = true
      return result
    })
    await tick()
    expect(thirdDone).toBe(true)
    expect(await third).toBeNull()
    expect(otherDone).toBe(false)

    // Les places se suivent dans l'ordre d'arrivée : les deux de « a », puis « b ».
    release?.()
    const releaseA2 = await waits[0]
    releaseA2?.()
    const releaseA3 = await waits[1]
    releaseA3?.()
    const releaseB = await other
    expect([releaseA2, releaseA3, releaseB].every((r) => typeof r === 'function')).toBe(true)
    releaseB?.()
  })

  it('frees a single place when the same release is called twice', async () => {
    const slots = createSearchSlots({ perMember: 1, atOnce: 1, waitMs: 50, maxWaiting: 5 })
    const release = await slots.take('a')
    release?.()
    release?.()
    const releaseB = await slots.take('b')
    expect(releaseB).not.toBeNull()
    // Une seule place : « c » attend, puis renonce au bout de 50 ms.
    expect(await slots.take('c')).toBeNull()
    releaseB?.()
  })
})
