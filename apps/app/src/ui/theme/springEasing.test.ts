// Tests de la courbe CSS tirée d'un ressort des jetons (R17, `springEasing`) : le vol de la photo
// partagée (View Transitions) suit le ressort `open` en CSS, par `linear(...)`. La courbe part de 0,
// finit à 1, et ne dépasse jamais 1,1 (un léger rebond, pas un saut).
import { durations, springs } from '@ruche/brand'
import { springEasing } from './springEasing'

/** Les valeurs de `linear(0, 0.3 12%, …)` : le premier nombre de chaque point. */
const values = (easing: string) => {
  const inside = /^linear\((.*)\)$/.exec(easing.trim())?.[1]
  if (inside === undefined) throw new Error(`not a linear() easing: « ${easing} »`)
  return inside.split(',').map((point) => Number.parseFloat(point.trim()))
}

describe('springEasing', () => {
  it('writes a CSS linear() curve with enough points to look smooth', () => {
    const curve = values(springEasing(springs.open, durations.medium))

    expect(curve.every(Number.isFinite)).toBe(true)
    expect(curve.length).toBeGreaterThanOrEqual(10)
  })

  it('starts at 0 and ends at 1', () => {
    const curve = values(springEasing(springs.open, durations.medium))

    expect(curve[0]).toBe(0)
    expect(curve.at(-1)).toBe(1)
  })

  it('never goes beyond 1.1, for each spring of the tokens', () => {
    for (const spring of Object.values(springs)) {
      const curve = values(springEasing(spring, durations.medium))
      expect(Math.max(...curve)).toBeLessThanOrEqual(1.1)
      expect(Math.min(...curve)).toBeGreaterThanOrEqual(0)
    }
  })

  it('rises like a spring: past half way at the middle of the flight', () => {
    const curve = values(springEasing(springs.open, durations.medium))

    expect(curve[Math.floor(curve.length / 2)]).toBeGreaterThan(0.5)
  })
})
