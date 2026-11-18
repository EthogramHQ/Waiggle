// Tests de la photo d'un projet qui défile moins vite que la page (R17, scénario « La photo d'un
// projet qui défile moins vite ») : à 45 % de la vitesse du défilement, et 1 % plus grande tous les
// 6 points tirés au-delà du haut de la page ; rien sous « Réduire les animations ».
import { parallax } from '@ruche/brand'
import { coverParallax } from './coverParallax'

describe('coverParallax', () => {
  it('moves the photo down at 45 % of the scroll', () => {
    const shift = coverParallax(100, false)

    expect(shift.translateY).toBeCloseTo(45)
    expect(shift.scale).toBe(1)
    // La valeur vient du jeton, pas d'un nombre écrit dans le composant.
    expect(coverParallax(200, false).translateY).toBeCloseTo(200 * parallax.rate)
  })

  it('grows the photo by 1 % every 6 points pulled above the top, without moving it', () => {
    const shift = coverParallax(-60, false)

    expect(shift.scale).toBeCloseTo(1.1)
    expect(shift.translateY).toBe(0)
  })

  it('leaves the photo in place at the top of the page', () => {
    expect(coverParallax(0, false)).toEqual({ translateY: 0, scale: 1 })
  })

  it('leaves the photo in place with reduced motion', () => {
    expect(coverParallax(100, true)).toEqual({ translateY: 0, scale: 1 })
    expect(coverParallax(-60, true)).toEqual({ translateY: 0, scale: 1 })
  })
})
