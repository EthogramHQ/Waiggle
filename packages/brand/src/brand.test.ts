// Tests de l'identité visuelle : ils protègent la lisibilité et la cohérence des jetons, pour qu'on
// puisse changer une couleur ou une taille sans craindre de casser l'appli sans le voir.
import { describe, expect, it } from 'vitest'
import {
  contrastPairs,
  contrastRatio,
  fontWeights,
  palettes,
  parseColor,
  schemes,
  shadows,
  springs,
  textStyles,
} from './index'

describe('colors', () => {
  it('has the same color names by day and by night', () => {
    expect(Object.keys(palettes.night).sort()).toEqual(Object.keys(palettes.day).sort())
    expect(Object.keys(shadows.night).sort()).toEqual(Object.keys(shadows.day).sort())
  })

  it('only uses color formats every platform understands', () => {
    for (const scheme of schemes) {
      for (const [name, color] of Object.entries(palettes[scheme])) {
        expect(() => parseColor(color), `${scheme}.${name}`).not.toThrow()
      }
    }
  })

  // it.each : le même test, répété pour le jour puis pour la nuit.
  it.each(schemes)('keeps every text readable on its background (%s)', (scheme) => {
    const palette = palettes[scheme]
    for (const { text, on, min } of contrastPairs) {
      const ratio = contrastRatio(palette[text], palette[on], palette.background)
      expect(ratio, `${scheme}: ${text} on ${on} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        min,
      )
    }
  })
})

describe('contrastRatio', () => {
  it('gives 21:1 for black on white and 1:1 for a color on itself', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFC21A', '#FFC21A')).toBeCloseTo(1, 5)
  })

  it('lays a transparent background on the page before measuring', () => {
    // Du verre blanc à moitié transparent sur une page noire donne un gris moyen.
    const onGlass = contrastRatio('#FFFFFF', 'rgba(255,255,255,0.5)', '#000000')
    expect(onGlass).toBeGreaterThan(1.5)
    expect(onGlass).toBeLessThan(5)
  })
})

describe('type scale', () => {
  it('only asks for font weights shipped with the app', () => {
    for (const [variant, style] of Object.entries(textStyles)) {
      const shipped: readonly number[] = fontWeights[style.family]
      expect(shipped, `${variant} uses ${style.family} ${style.weight}`).toContain(style.weight)
    }
  })

  it('gives every text a line height at least as tall as the letters', () => {
    for (const [variant, style] of Object.entries(textStyles)) {
      expect(style.lineHeight, variant).toBeGreaterThanOrEqual(style.size)
    }
  })
})

describe('motion', () => {
  it('overshoots by about 5 % with the honey spring', () => {
    // Formule du ressort amorti : dépassement = e^(-ζπ/√(1-ζ²)), avec ζ = amortissement / (2√(raideur × masse)).
    const { stiffness, damping, mass } = springs.honey
    const zeta = damping / (2 * Math.sqrt(stiffness * mass))
    const overshoot = Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta ** 2))
    expect(overshoot).toBeGreaterThan(0.03)
    expect(overshoot).toBeLessThan(0.07)
  })
})
