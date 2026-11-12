// Le liseré d'une notification nouvelle (`highlightEdge`, R8, relecture de design) se voit sur la
// lumière miel de la page Activité. Un couple de `contrastPairs` ne mesure qu'un rôle contre un
// autre rôle ; la lumière, elle, est un dégradé : on la mesure arrêt par arrêt, comme le squelette.
import { describe, expect, it } from 'vitest'
import { contrastRatio, honeyLight, palettes } from './index'

describe('the edge of a new notification (R8)', () => {
  // De jour, la lumière derrière les lignes d'Activité est voilée par la page : mesurée dans le
  // navigateur, elle ne dépasse pas rgb(255,229,157), plus pâle que `honeyLight`. On garde de la
  // marge : le liseré se voit jusqu'au miel vif (`honey`, l'arrêt à 0,78). Le dernier arrêt, le
  // miel le plus foncé, ne se pose que derrière le visuel d'un projet, jamais derrière une ligne.
  it('stays visible on the day honey light, up to the bright honey', () => {
    for (const { at, color } of honeyLight.day) {
      if (at > 0.78) continue
      expect(contrastRatio(palettes.day.highlightEdge, color), color).toBeGreaterThanOrEqual(1.5)
    }
  })

  // De nuit, la lanterne passe du miel vif au noir : le liseré doit se voir sur chacun de ses arrêts.
  it('stays visible on every stop of the night lantern', () => {
    for (const { color } of honeyLight.night) {
      expect(contrastRatio(palettes.night.highlightEdge, color), color).toBeGreaterThanOrEqual(1.5)
    }
  })

  // Témoin de l'ancien défaut : le miel pâle seul ne se détachait pas de la lumière.
  it('is needed: the pale honey alone does not stand out from the honey light', () => {
    expect(contrastRatio(palettes.day.highlightSoft, '#FFE59D')).toBeLessThan(1.5)
    expect(contrastRatio(palettes.night.highlightSoft, palettes.night.background)).toBeLessThan(1.5)
  })
})
