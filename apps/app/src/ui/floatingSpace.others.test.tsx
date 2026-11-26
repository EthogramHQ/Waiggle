// La plus haute place réservée par les autres (R20) : la Goutte s'en sert pour se poser au-dessus
// de la capsule des réactions d'un projet sur téléphone, sans compter sa propre réserve (sinon elle
// se pousserait elle-même vers le haut sans fin).
import { renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { FloatingClaimsContext, useFloatingTopOfOthers } from './floatingSpace'

const drop = {}
const projectScreen = {}
const otherScreen = {}

const withClaims =
  (claims: ReadonlyMap<object, number>) =>
  ({ children }: { children: ReactNode }) => (
    <FloatingClaimsContext.Provider value={claims}>{children}</FloatingClaimsContext.Provider>
  )

describe('useFloatingTopOfOthers', () => {
  it('gives the highest place claimed by the others, never its own', async () => {
    const claims = new Map([
      [drop, 160],
      [projectScreen, 96],
      [otherScreen, 40],
    ])
    const { result } = await renderHook(() => useFloatingTopOfOthers(drop), {
      wrapper: withClaims(claims),
    })
    expect(result.current).toBe(96)
  })

  it('gives 0 when nobody else claims a place', async () => {
    const { result } = await renderHook(() => useFloatingTopOfOthers(drop), {
      wrapper: withClaims(new Map([[drop, 160]])),
    })
    expect(result.current).toBe(0)
  })

  it('gives 0 outside a provider', async () => {
    const { result } = await renderHook(() => useFloatingTopOfOthers(drop))
    expect(result.current).toBe(0)
  })
})
