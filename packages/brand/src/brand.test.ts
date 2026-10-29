// Tests de l'identité visuelle : ils protègent la lisibilité et la cohérence des jetons, pour qu'on
// puisse changer une couleur ou une taille sans craindre de casser l'appli sans le voir.
import { describe, expect, it } from 'vitest'
import {
  brandNames,
  type ColorName,
  contrastPairs,
  contrastRatio,
  durations,
  easings,
  fontWeights,
  palettes,
  parseColor,
  pressScale,
  pressScaleFab,
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
    for (const { text, on, min, base = ['background'] } of contrastPairs) {
      // Un fond transparent se mesure sur chacun des fonds qu'il peut recouvrir.
      for (const backdrop of base) {
        const below = backdrop.startsWith('#') ? backdrop : palette[backdrop as ColorName]
        const ratio = contrastRatio(palette[text], palette[on], below)
        expect(
          ratio,
          `${scheme}: ${text} on ${on} over ${backdrop} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(min)
      }
    }
  })
})

describe('Miel 2 colors', () => {
  it('measures every new text on its background', () => {
    // Les rôles ajoutés par Miel 2 (refonte, R1) : le texte sur le verre, le bandeau d'erreur, le
    // nom de l'auteur sur une tuile miel, et le choix actif d'un segmenté (crème la nuit). Un rôle
    // de texte absent de contrastPairs ne serait jamais mesuré.
    const measured = contrastPairs.map(({ text, on }) => `${text} on ${on}`)
    for (const pair of [
      'text on background',
      'textMuted on background',
      'textOnGlass on glass',
      'dangerText on errorBand',
      'onHoneyTile on honey',
      'onHoney on surfaceRaised',
    ]) {
      expect(measured).toContain(pair)
    }
  })

  it('measures a text on glass over the page and over the honey light', () => {
    // Le verre laisse voir ce qu'il y a dessous (J7) : sa paire se mesure sur plusieurs fonds.
    const onGlass = contrastPairs.find(({ text, on }) => text === 'textOnGlass' && on === 'glass')
    expect(onGlass?.base).toEqual(expect.arrayContaining(['background', 'honey']))
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
    // Les noms géants d'un outil (64 et 100 points, maquettes Miel 2 du 28/10/2026) se serrent à
    // 0,92 : en titre si grand, des lignes à 1 paraissent décollées. Seuls les titres de 56 points
    // et plus y ont droit, jamais en dessous de 0,9 (en deçà, les accents seraient coupés).
    for (const [variant, style] of Object.entries(textStyles)) {
      const tightest = style.family === 'display' && style.size >= 56 ? 0.9 : 1
      expect(style.lineHeight, variant).toBeGreaterThanOrEqual(style.size * tightest)
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

  it('presses the round button deeper than the others, and both stay smaller than at rest', () => {
    // Le bouton « + » flottant s'enfonce plus (0,92) que les autres (0,96) ; une échelle de 1 ou
    // plus ne s'enfoncerait pas du tout.
    expect(pressScaleFab).toBeLessThan(pressScale)
    expect(pressScale).toBeLessThan(1)
    expect(pressScaleFab).toBeGreaterThan(0)
  })

  it('makes the honey curve overshoot its target, like the spring', () => {
    // Une courbe de Bézier dépasse sa cible quand l'un de ses points de contrôle passe au-dessus
    // de 1 (en ordonnée : les nombres 2 et 4 de la liste).
    const [, y1, , y2] = easings.honey
    expect(Math.max(y1, y2)).toBeGreaterThan(1)
    // La courbe de sortie, elle, ne revient jamais en arrière.
    expect(easings.exit.every((value) => value >= 0 && value <= 1)).toBe(true)
  })

  it('gives every duration a positive length', () => {
    for (const [name, duration] of Object.entries(durations)) {
      expect(duration, name).toBeGreaterThan(0)
    }
  })
})

describe('brand names', () => {
  it.each(schemes)('only names colors the palette has (%s)', (scheme) => {
    // Le catalogue affiche le nom de marque à côté du rôle : un nom posé sur un rôle disparu ne
    // s'afficherait nulle part sans qu'on le voie.
    for (const [color, name] of Object.entries(brandNames[scheme])) {
      expect(Object.keys(palettes[scheme]), `${scheme}: ${name}`).toContain(color)
      expect(name, color).not.toBe('')
    }
  })

  it('names the seven colors of the brand', () => {
    // Miel, Ambre, Pollen, Crème, Encre et Cire le jour ; la Nuit est le fond de nuit.
    const names = schemes.flatMap((scheme) => Object.values(brandNames[scheme]))
    expect(names.sort()).toEqual(['Ambre', 'Cire', 'Crème', 'Encre', 'Miel', 'Nuit', 'Pollen'])
  })
})
