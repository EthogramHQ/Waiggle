// Tests de `fontStack` (R13, « Le premier chargement ») : la valeur de `fontFamily` d'un texte. Sur
// le web, la police de la marque arrive après le texte (`font-display: swap`) ; d'ici là, le
// navigateur prend la famille du système nommée après elle, et non sa police par défaut (souvent à
// empattements). Text passe par elle, et `monoFont` (la chasse fixe du code dans le Markdown) aussi.
import { Platform } from 'react-native'
import { fontName, fontStack, monoFont } from './fonts'

afterEach(() => {
  jest.restoreAllMocks()
})

describe('fontStack, the font family of a text', () => {
  it('follows the brand font with a system family of the same kind on the web', () => {
    jest.replaceProperty(Platform, 'OS', 'web')

    expect(fontStack('text', fontName('text', 600))).toBe('FunnelSans-600, sans-serif')
    expect(fontStack('display', fontName('display', 700))).toBe('FunnelDisplay-700, sans-serif')
    expect(fontStack('mono', fontName('mono', 500))).toBe('GeistMono-500, monospace')
  })

  it('names the brand font alone on a phone, where a list would break the font', () => {
    expect(fontStack('text', fontName('text', 400))).toBe('FunnelSans-400')
    // Le module est chargé ici comme sur téléphone : la chasse fixe y est le nom seul.
    expect(monoFont).toBe('GeistMono-400')
  })
})
