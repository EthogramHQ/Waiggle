// La fenêtre de confirmation ne colle ses boutons que s'ils laissent au moins la moitié de l'écran
// au texte (contre-visite de R9) : à 320 × 568 avec le texte à 200 %, les boutons font plus de la
// moitié de l'écran, et toute la fenêtre défile alors (sinon le texte n'a qu'une fente).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Dialog } from './Dialog'

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
    <Dialog visible title="Bloquer Max Durand ?" message="Un long texte." onDismiss={() => {}}>
      <Button label="Bloquer" variant="confirm" onPress={() => {}} />
      <Button label="Annuler" variant="secondary" onPress={() => {}} />
    </Dialog>,
  )

/** Le bloc des boutons dit sa hauteur, comme le ferait la mise en page. */
const measureButtons = (height: number) =>
  fireEvent(screen.getByRole('button', { name: 'Bloquer' }), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 280, height } },
  })

afterEach(() => setScreen(750, 1334))

describe('Dialog pinned footer', () => {
  it('stays pinned when the buttons leave half the screen to the text (390 × 844)', async () => {
    await setScreen(390, 844)
    await renderDialog()
    await measureButtons(120)

    const title = screen.getByRole('header', { name: 'Bloquer Max Durand ?' })
    expect(scrollersAround(title)).toBe(2)
    expect(scrollersAround(screen.getByRole('button', { name: 'Bloquer' }))).toBe(1)
  })

  it('lets the whole layer scroll when the buttons take too much (320 × 568, text at 200 %)', async () => {
    await setScreen(320, 568)
    await renderDialog()
    await measureButtons(330)

    const title = screen.getByRole('header', { name: 'Bloquer Max Durand ?' })
    expect(scrollersAround(title)).toBe(1)
    expect(scrollersAround(screen.getByRole('button', { name: 'Bloquer' }))).toBe(1)
  })

  it('stays pinned at 320 × 568 with the normal text size', async () => {
    await setScreen(320, 568)
    await renderDialog()
    await measureButtons(110)

    const title = screen.getByRole('header', { name: 'Bloquer Max Durand ?' })
    expect(scrollersAround(title)).toBe(2)
  })
})
