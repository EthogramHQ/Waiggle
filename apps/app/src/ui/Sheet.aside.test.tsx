// La fenêtre d'ordinateur avec sa colonne d'à côté (R6a, correction C1, design-C3) : elle a la
// largeur de la planche R6-Publier-Desktop (1 120 points, l'aperçu en prenant 420), et non 888.
// Jest ne mesure pas la mise en page : on lit la largeur permise, posée sur la fenêtre.
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { Sheet } from './Sheet'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const widthOf = () =>
  StyleSheet.flatten(screen.getByLabelText('Publier un projet').props.style).maxWidth

describe('Sheet with an aside column', () => {
  let restoreWindow: () => void
  beforeEach(() => {
    restoreWindow = setDesktopWindow()
  })
  afterEach(() => restoreWindow())

  it('opens as wide as the artboard, 1 120 points plus the margins around it', async () => {
    await renderWithProviders(
      <Sheet open title="Publier un projet" aside={<Text>Aperçu</Text>} onClose={() => {}}>
        <Text>Contenu</Text>
      </Sheet>,
    )

    expect(screen.getByText('Aperçu')).toBeTruthy()
    expect(widthOf()).toBe(1120 + 2 * 32)
  })

  it('keeps the form width without the column', async () => {
    await renderWithProviders(
      <Sheet open title="Publier un projet" onClose={() => {}}>
        <Text>Contenu</Text>
      </Sheet>,
    )

    expect(widthOf()).toBe(520)
  })
})
