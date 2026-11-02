// Tests de l'écriture courte des nombres de réactions (R5a, décision de Louis du 2/11) : sous 1 000,
// le nombre tel quel ; à partir de 1 000, « 1,2 k » en français (espace insécable avant le « k »),
// « 1.2K » en anglais ; « 1,2 M » / « 1.2M » à partir du million. Une décimale au plus, retirée si
// elle est nulle, et jamais arrondie vers le haut (un nombre ne se gonfle pas).
import { shortCount } from './shortCount'

// L'espace insécable, écrite par son code : un éditeur la confondrait avec une espace ordinaire.
const NBSP = String.fromCharCode(0xa0)

describe('shortCount', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [999, '999'],
  ])('writes %i as it is, under a thousand', (count, expected) => {
    expect(shortCount(count, 'fr')).toBe(expected)
    expect(shortCount(count, 'en')).toBe(expected)
  })

  it.each([
    [1000, `1${NBSP}k`, '1K'],
    [1234, `1,2${NBSP}k`, '1.2K'],
    [2000, `2${NBSP}k`, '2K'],
    // Tronqué, pas arrondi : 9 950 ne devient pas « 10 k ».
    [9950, `9,9${NBSP}k`, '9.9K'],
    [12345, `12,3${NBSP}k`, '12.3K'],
    // Jamais « 1000 k » : la dernière valeur sous le million reste en milliers.
    [999999, `999,9${NBSP}k`, '999.9K'],
  ])('writes %i in thousands: %s (fr), %s (en)', (count, fr, en) => {
    expect(shortCount(count, 'fr')).toBe(fr)
    expect(shortCount(count, 'en')).toBe(en)
  })

  it.each([
    [1000000, `1${NBSP}M`, '1M'],
    [1250000, `1,2${NBSP}M`, '1.2M'],
    [12000000, `12${NBSP}M`, '12M'],
  ])('writes %i in millions: %s (fr), %s (en)', (count, fr, en) => {
    expect(shortCount(count, 'fr')).toBe(fr)
    expect(shortCount(count, 'en')).toBe(en)
  })

  it('takes a regional language code (« fr-FR », « en-GB ») for its language', () => {
    expect(shortCount(1234, 'en-GB')).toBe('1.2K')
    expect(shortCount(1234, 'fr-FR')).toBe(`1,2${NBSP}k`)
  })
})
