// La fenêtre de confirmation garde ses boutons en vue (relecture de design de R9, fenêtre
// « Bloquer ») : sur un écran assez haut, son haut (titre, texte) défile dans la fenêtre et ses
// boutons restent collés en bas, hors de la zone qui défile. Sur un écran bas (téléphone en
// paysage), toute la couche défile, comme avant : titre et boutons dans la même zone.
import { act, screen } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Dialog } from './Dialog'

/** Le nombre de zones qui défilent autour d'un élément (de la plus proche à la couche). */
const scrollersAround = (node: { type: unknown; parent: unknown } | null): number => {
  let count = 0
  let current = node
  while (current) {
    if (current.type === 'RCTScrollView') count += 1
    current = current.parent as typeof node
  }
  return count
}

const setScreen = (width: number, height: number) =>
  act(() => {
    Dimensions.set({
      window: { width, height, scale: 2, fontScale: 1 },
      screen: { width, height, scale: 2, fontScale: 1 },
    })
  })

const renderDialog = () =>
  renderWithProviders(
    <Dialog
      visible
      title="Bloquer Max Durand ?"
      message={['Un long texte.', 'Encore un paragraphe.']}
      onDismiss={() => {}}
    >
      <Button label="Bloquer" variant="confirm" onPress={() => {}} />
      <Button label="Annuler" variant="secondary" onPress={() => {}} />
    </Dialog>,
  )

afterEach(() => setScreen(750, 1334))

describe('Dialog buttons', () => {
  it('stay outside the scrolling text on a tall screen (390 × 844)', async () => {
    await setScreen(390, 844)
    await renderDialog()

    const title = screen.getByRole('header', { name: 'Bloquer Max Durand ?' })
    // Le titre est dans la zone du texte, elle-même dans la couche : deux zones.
    expect(scrollersAround(title)).toBe(2)
    // Les boutons, dans la couche seulement : le texte défile sans eux.
    expect(scrollersAround(screen.getByRole('button', { name: 'Bloquer' }))).toBe(1)
    expect(scrollersAround(screen.getByRole('button', { name: 'Annuler' }))).toBe(1)
  })

  it('scroll with the whole layer on a low screen (844 × 390, a phone held sideways)', async () => {
    await setScreen(844, 390)
    await renderDialog()

    const title = screen.getByRole('header', { name: 'Bloquer Max Durand ?' })
    expect(scrollersAround(title)).toBe(1)
    expect(scrollersAround(screen.getByRole('button', { name: 'Bloquer' }))).toBe(1)
  })
})
