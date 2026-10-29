// Tests du mot-symbole en contraste élevé de Windows (relecture de R1) : le navigateur y impose ses
// couleurs, le vrai mot (transparent) redevient visible, et la copie au point miel posée dessus
// doublerait le mot. Une règle CSS de la page cache alors la copie ; on vérifie qu'elle existe, et
// que la copie porte bien la marque qu'elle vise.
import { screen } from '@testing-library/react-native'
import type { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Wordmark } from './Wordmark'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// La marque de la copie, remplacée par un repère de test (sur téléphone, elle ne pose rien).
jest.mock('./theme/document', () => ({
  ...jest.requireActual('./theme/document'),
  wordmarkCopy: { testID: 'wordmark-copy' },
}))

afterEach(() => jest.restoreAllMocks())

describe('Wordmark in forced colors', () => {
  it('hides the honey-dot copy when the system forces its colours', () => {
    const { documentCss } = jest.requireActual('./theme/document') as { documentCss: string }
    const css = documentCss.replace(/\s+/g, ' ')

    expect(css).toContain(
      '@media (forced-colors: active) { [data-wordmark="copy"] { display: none; } }',
    )
  })

  it('marks the copy for that rule on the web', () => {
    let marker: unknown
    // La marque se calcule au chargement du module : on le recharge à part, avec un React Native
    // rechargé lui aussi (isolateModules), dont la plateforme est le web.
    jest.isolateModules(() => {
      const isolated = require('react-native') as { Platform: typeof Platform }
      jest.replaceProperty(isolated.Platform, 'OS', 'web')
      marker = (jest.requireActual('./theme/document') as { wordmarkCopy: unknown }).wordmarkCopy
    })

    // react-native-web écrit dataSet en attributs data- : data-wordmark="copy".
    expect(marker).toEqual({ dataSet: { wordmark: 'copy' } })
  })

  it('puts the marker on the copy, never on the real word read by screen readers', async () => {
    await renderWithProviders(<Wordmark />)

    const copy = screen.getByTestId('wordmark-copy', { includeHiddenElements: true })
    // « wa », le i en miel sous deux « ı » à l'encre, « ggle ».
    expect(copy).toHaveTextContent('waiııggle')
    // Le vrai mot reste lu, hors de la copie.
    expect(screen.getByLabelText('Waiggle')).toBeTruthy()
  })
})
