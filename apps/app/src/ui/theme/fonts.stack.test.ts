// Tests de `fontStack` (R13, « Le premier chargement ») : la valeur de `fontFamily` d'un texte. Sur
// le web, la police de la marque arrive après le texte (`font-display: swap`) ; d'ici là, le
// navigateur prend la police nommée après elle. R16 (« La page ne bouge plus en arrivant ») : c'est
// d'abord sa police de secours calibrée (`<nom>-fallback`, ui/theme/fontFallback.ts), aux mesures de
// la marque, pour que rien ne bouge à son arrivée ; puis, si même celle-là manque, la famille du
// système de la même sorte, et non la police par défaut du navigateur (souvent à empattements).
// Text passe par elle, et `monoFont` (la chasse fixe du code dans le Markdown) aussi.
import type { FontFamily } from '@ruche/brand'
import { Platform } from 'react-native'
import { fontFallbacks } from './fontFallback'
import { fontFiles, fontName, fontStack, monoFont, prefixes } from './fonts'

afterEach(() => {
  jest.restoreAllMocks()
})

describe('fontStack, the font family of a text', () => {
  it('follows the brand font with a system family of the same kind on the web', () => {
    jest.replaceProperty(Platform, 'OS', 'web')

    expect(fontStack('text', fontName('text', 600))).toBe(
      'FunnelSans-600, FunnelSans-600-fallback, sans-serif',
    )
    expect(fontStack('display', fontName('display', 700))).toBe(
      'FunnelDisplay-700, FunnelDisplay-700-fallback, sans-serif',
    )
    expect(fontStack('mono', fontName('mono', 500))).toBe(
      'GeistMono-500, GeistMono-500-fallback, monospace',
    )
  })

  it('writes the measured fallback of the same font before the system family on the web', () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const generic: Record<FontFamily, string> = {
      display: 'sans-serif',
      text: 'sans-serif',
      mono: 'monospace',
    }
    const declared = fontFallbacks.map((face) => face.name)

    // Chaque police livrée : la sienne, jamais celle d'une autre graisse, et une face déclarée.
    for (const name of Object.keys(fontFiles)) {
      const family = (Object.keys(prefixes) as FontFamily[]).find((one) =>
        name.startsWith(`${prefixes[one]}-`),
      )
      if (!family) throw new Error(`no family for ${name}`)
      expect(fontStack(family, name)).toBe(`${name}, ${name}-fallback, ${generic[family]}`)
      expect(declared).toContain(`${name}-fallback`)
    }
  })

  it('names the brand font alone on a phone, where a list would break the font', () => {
    expect(fontStack('text', fontName('text', 400))).toBe('FunnelSans-400')
    // Le module est chargé ici comme sur téléphone : la chasse fixe y est le nom seul.
    expect(monoFont).toBe('GeistMono-400')
  })
})
