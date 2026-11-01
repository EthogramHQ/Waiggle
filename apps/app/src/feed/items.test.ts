// Tests de la place de « Tu es à jour » dans le fil (upToDateIndex, R4, F-Fil5) : une règle pure,
// testée sans écran, avec des éléments réduits à leur date.
import type { FeedItem } from '@ruche/contracts'
import { upToDateIndex } from './items'

/** Un élément du fil daté (le reste ne compte pas pour la règle). */
const at = (iso: string) => ({ at: iso }) as FeedItem
const items = [at('2026-10-20T12:00:00.000Z'), at('2026-10-15T12:00:00.000Z')]

describe('upToDateIndex', () => {
  it('stands before the first item whose date is not after the last reading', () => {
    expect(upToDateIndex(items, '2026-10-15T12:00:00.000Z', true)).toBe(1)
  })

  it('compares instants, not texts', () => {
    // Le même instant écrit autrement : l'élément est déjà vu.
    expect(upToDateIndex(items, '2026-10-15T14:00:00.000+02:00', true)).toBe(1)
  })

  it('stands at the top when nothing is newer than the last reading', () => {
    expect(upToDateIndex(items, '2026-10-21T00:00:00.000Z', true)).toBe(0)
  })

  it('stands at the end of a finished feed with nothing seen, or on a first visit', () => {
    expect(upToDateIndex(items, '2026-10-01T00:00:00.000Z', false)).toBe(2)
    expect(upToDateIndex(items, null, false)).toBe(2)
    expect(upToDateIndex([], null, false)).toBe(0)
  })

  it('is nowhere while the feed goes on and nothing shown is already seen', () => {
    expect(upToDateIndex(items, '2026-10-01T00:00:00.000Z', true)).toBeNull()
    expect(upToDateIndex(items, null, true)).toBeNull()
  })
})
