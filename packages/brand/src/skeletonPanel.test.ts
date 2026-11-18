// Tests du panneau de la carte vide (R16, « Les squelettes ») : en bas d'une carte de projet vide,
// un panneau plein tient la place du verre. Il a son rôle de couleur à lui (`skeletonPanel`) : la
// feuille crème de jour, le fond groupé de nuit, un peu plus clair que la carte vide (planche
// R16-Fil-1440-Nuit) ; de nuit, la feuille avait la couleur exacte de la carte, et le panneau s'y
// confondait. Les formes du squelette s'y posent : elles doivent s'y voir, à 1,5:1 au moins.
import { describe, expect, it } from 'vitest'
import { contrastPairs, contrastRatio, palettes, schemes } from './index'

describe('the panel of an empty project card (R16)', () => {
  it('has its own colour role, cream by day and the grouped background by night', () => {
    expect(palettes.day.skeletonPanel).toBe('#FFFCF5')
    expect(palettes.night.skeletonPanel).toBe('#221E17')
  })

  it.each(schemes)('stands apart from the empty card it sits on (%s)', (scheme) => {
    // Témoin de la confusion d'avant : le panneau n'a jamais la couleur de la carte vide.
    expect(palettes[scheme].skeletonPanel).not.toBe(palettes[scheme].skeletonCard)
  })

  it.each(schemes)('keeps the skeleton shapes visible on it (%s)', (scheme) => {
    const palette = palettes[scheme]
    expect(contrastRatio(palette.skeleton, palette.skeletonPanel)).toBeGreaterThanOrEqual(1.5)
  })

  it('measures the skeleton shapes on the panel among the contrast pairs', () => {
    const measured = contrastPairs
      .filter(({ text }) => text === 'skeleton')
      .map(({ on, min }) => `${on} ${min}`)
    expect(measured).toContain('skeletonPanel 1.5')
  })
})
