// Tests de l'écart du carrousel et de sa forme vide (R16, relecture de l'interface A1) : le
// squelette d'une bande (`CarouselShapes`) lit l'écart du carrousel lui-même (`carouselGap`), au
// lieu de le recopier dans l'écran ; changé dans `Carousel`, il suit.
import { space } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { CarouselShapes, carouselGap } from './Carousel'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('carouselGap', () => {
  it('keeps chips as tight as a line of text, at every width', () => {
    expect(carouselGap('chips', 'compact')).toBe(space.sm)
    expect(carouselGap('chips', 'wide')).toBe(space.sm)
  })

  it('spaces cards more on a computer than on a phone', () => {
    expect(carouselGap('cards', 'compact')).toBe(space.md)
    expect(carouselGap('cards', 'medium')).toBe(space.xxl)
    expect(carouselGap('cards', 'wide')).toBe(space.xxl)
  })
})

describe('CarouselShapes', () => {
  it('lays its pieces side by side with the gap of the real cards, without a role of its own', async () => {
    await renderWithProviders(
      <CarouselShapes variant="chips">
        <Text>une</Text>
        <Text>deux</Text>
      </CarouselShapes>,
    )
    // La vue qui range les pièces : le premier parent du texte posé en rangée.
    let band = screen.getByText('une').parent
    while (
      band &&
      (band.props.style as { flexDirection?: string } | undefined)?.flexDirection !== 'row'
    )
      band = band.parent
    expect(band?.props.style).toMatchObject({ flexDirection: 'row', gap: space.sm })
    expect(band?.props.accessibilityRole).toBeUndefined()
    expect(screen.getByText('deux')).toBeTruthy()
  })
})
