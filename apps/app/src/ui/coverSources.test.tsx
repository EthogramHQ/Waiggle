// Tests des nouvelles cartes d'où la photo vole jusqu'à la page du projet (R17, scénario « La carte
// qui devient la page » : un carrousel d'Explorer, la vitrine de l'accueil, les vignettes du Fil sur
// ordinateur). Chaque composant reçoit l'identifiant du projet (`coverId`), confie sa photo à
// `useCoverSource` (sa `ref`) et ouvre le projet par `capture`, qui prépare le vol puis ouvre.
// Sans `coverId`, il ouvre comme aujourd'hui.
//
// `useCoverSource` est remplacé par un faux, qui garde la photo reçue et ouvre tout de suite.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { useCoverSource } from './coverTransition'
import { ShowcaseCard } from './ShowcaseCard'
import { TesterRow } from './TesterRow'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const mockRef = jest.fn()
const mockCapture = jest.fn((then: () => void) => then())
jest.mock('./coverTransition', () => ({
  ...jest.requireActual('./coverTransition'),
  useCoverSource: jest.fn(() => ({ ref: mockRef, capture: mockCapture, bounceStyle: {} })),
}))

const image = { source: { uri: 'https://example.test/rocket.webp' }, label: 'Décollage !' }

beforeEach(() => {
  mockRef.mockClear()
  mockCapture.mockClear()
  jest.mocked(useCoverSource).mockClear()
})

describe('ShowcaseCard as a cover source', () => {
  const card = (onPress: () => void, coverId?: string) => (
    <ShowcaseCard
      title="Décollage !"
      author={{ name: 'Papi Jean', avatar: null }}
      image={image}
      status={{ label: 'Testable', strong: true }}
      onPress={onPress}
      {...(coverId ? { coverId } : null)}
    />
  )

  it('opens the project through capture, and hands its photo to the cover source', async () => {
    const onPress = jest.fn()
    await renderWithProviders(card(onPress, 'p1'))

    expect(useCoverSource).toHaveBeenCalledWith('p1')
    expect(mockRef.mock.calls.some(([node]) => node !== null)).toBe(true)

    await fireEvent.press(screen.getByRole('link', { name: 'Décollage !' }))

    expect(mockCapture).toHaveBeenCalledTimes(1)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('opens the project directly without a cover id (témoin)', async () => {
    const onPress = jest.fn()
    await renderWithProviders(card(onPress))

    await fireEvent.press(screen.getByRole('link', { name: 'Décollage !' }))

    expect(mockCapture).not.toHaveBeenCalled()
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('TesterRow (the thumbnails beside the feed) as a cover source', () => {
  const row = (onOpen: () => void, coverId?: string) => (
    <TesterRow
      title="Décollage !"
      author="Papi Jean"
      image={image}
      onTest={() => {}}
      onOpen={onOpen}
      {...(coverId ? { coverId } : null)}
    />
  )

  it('opens the project through capture, and hands its thumbnail to the cover source', async () => {
    const onOpen = jest.fn()
    await renderWithProviders(row(onOpen, 'p1'))

    expect(useCoverSource).toHaveBeenCalledWith('p1')
    expect(mockRef.mock.calls.some(([node]) => node !== null)).toBe(true)

    await fireEvent.press(screen.getByRole('link', { name: 'Décollage !' }))

    expect(mockCapture).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('opens the project directly without a cover id (témoin)', async () => {
    const onOpen = jest.fn()
    await renderWithProviders(row(onOpen))

    await fireEvent.press(screen.getByRole('link', { name: 'Décollage !' }))

    expect(mockCapture).not.toHaveBeenCalled()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
