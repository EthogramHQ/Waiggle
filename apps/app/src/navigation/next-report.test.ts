// Tests de safeNext pour la page « Signaler » (tranche 7a) : quand la session expire à l'envoi,
// « Me reconnecter » ramène sur la même page, avec la sorte et l'identifiant de la cible. À part de
// next.test.ts, écrit avant la tranche.
import { safeNext } from './next'

describe('safeNext, back to « Signaler »', () => {
  it('keeps the report page and its target', () => {
    for (const value of [
      '/report',
      '/report?kind=comment&id=5e6f7081-92a3-4b4c-8d5e-000000000011',
      '/report?kind=member&id=u7',
    ]) {
      expect(safeNext(value)).toBe(value)
    }
  })

  it('refuses a page that only starts like it', () => {
    for (const value of ['/reports', '/reporting?x=1', '/report-abuse']) {
      expect(safeNext(value)).toBeNull()
    }
  })
})
