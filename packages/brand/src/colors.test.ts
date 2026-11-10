// Tests des couleurs des trois familles d'une mise à jour (R7a) : « Nouveau » (ambre), « Réparé »
// (vert), « Plus joli » (encre discrète). Chaque famille a trois rôles, de jour et de nuit
// (décision prise à la relecture du plan, interface B5) : le fond de sa pastille
// (`family<X>Surface`), son icône (`family<X>Icon`) et son nom écrit en couleur dans la feuille
// (`family<X>Text`). Dans la frise, l'icône est la seule marque visible de la famille : elle doit
// se voir sur son fond (3:1, WCAG 1.4.11) ; le nom est un texte (4,5:1, WCAG 1.4.3). Ces couples
// entrent dans `contrastPairs` : le test de brand.test.ts les mesure alors un par un, jour et nuit.
import { describe, expect, it } from 'vitest'
import { contrastPairs, palettes, schemes } from './index'

/** Les trois familles, telles qu'elles s'écrivent dans le nom des rôles. */
const families = ['New', 'Fixed', 'Polish'] as const

/** Le contraste exigé d'un couple « couleur sur fond », s'il est déclaré dans `contrastPairs`. */
const declared = (text: string, on: string) =>
  contrastPairs.find((pair) => pair.text === text && pair.on === on)?.min

describe('update family colors', () => {
  it.each(families)(
    'gives the %s family a surface, an icon and a text color, day and night',
    (x) => {
      for (const scheme of schemes) {
        const palette = palettes[scheme] as Record<string, string | undefined>
        for (const role of [`family${x}Surface`, `family${x}Icon`, `family${x}Text`]) {
          expect(palette[role], `${scheme}.${role}`).toEqual(expect.any(String))
        }
      }
    },
  )

  // Relecture du plan, interface B5 : `it('lists the icon and label of each update family in
  // contrastPairs')` (noms des rôles selon cette décision).
  it.each(families)('lists the icon and label of the %s family in contrastPairs', (x) => {
    // L'icône sur le fond de sa pastille : 3:1 au moins.
    expect(declared(`family${x}Icon`, `family${x}Surface`)).toBeGreaterThanOrEqual(3)
    // Le nom de la famille, au-dessus du champ de la ligne, sur la feuille et sur une carte.
    expect(declared(`family${x}Text`, 'sheet')).toBe(4.5)
    expect(declared(`family${x}Text`, 'surface')).toBe(4.5)
  })

  // Trois familles qu'on distingue : jamais le même fond ni la même icône pour deux d'entre elles.
  it.each(schemes)('keeps the three families apart (%s)', (scheme) => {
    const palette = palettes[scheme] as Record<string, string | undefined>
    const surfaces = families.map((x) => palette[`family${x}Surface`])
    const icons = families.map((x) => palette[`family${x}Icon`])

    expect(surfaces.every((color) => typeof color === 'string')).toBe(true)
    expect(new Set(surfaces).size).toBe(3)
    expect(new Set(icons).size).toBe(3)
  })
})
