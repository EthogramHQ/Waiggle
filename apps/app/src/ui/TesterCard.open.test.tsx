// Tests du lien de la carte d'un testeur (décision de Louis du 31/10/2026) : toucher la photo ou le
// titre ouvre la page du projet. C'est un lien nommé par le titre, frère du lien « Tester » et
// jamais imbriqué avec lui (relecture de l'interface, ui-4) ; « Tester » n'ouvre pas la page ; une
// double tape n'ouvre la page qu'une fois (TAP_GUARD_MS, comme « Tester »).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { TesterCard } from './TesterCard'
import { TAP_GUARD_MS } from './tapGuard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const title = 'Carnet de cafés'
const image = {
  source: { uri: 'https://api.example/cafes.webp' },
  thumbhash: null,
  label: 'Photo de Carnet de cafés',
}
const testName = fr.t(($) => $.explore.testProject, { title })

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; parent: Node | null }

const card = (handlers: { onTest?: () => void; onOpen?: () => void }) => (
  <TesterCard
    title={title}
    author="Sam Petit"
    image={image}
    onTest={handlers.onTest ?? (() => {})}
    onOpen={handlers.onOpen ?? (() => {})}
  />
)

const openLink = () => screen.getByRole('link', { name: title })
const testLink = () => screen.getByRole('link', { name: testName })

/** Vrai si un ancêtre de l'élément est un lien ou un bouton. */
const insideControl = (element: unknown): boolean => {
  let parent = (element as Node).parent
  while (parent) {
    const role = parent.props.accessibilityRole ?? parent.props.role
    if (role === 'link' || role === 'button') return true
    parent = parent.parent
  }
  return false
}

describe('TesterCard, the link of the card', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('is a link named after the project, holding the photo and the title', async () => {
    await renderWithProviders(card({}))

    const link = openLink()
    // La photo et le titre sont dans le lien : les toucher ouvre la page.
    expect(screen.getByLabelText(image.label)).toBeTruthy()
    let photo = screen.getByLabelText(image.label) as unknown as Node | null
    while (photo && photo.props.accessibilityLabel !== title) photo = photo.parent
    expect(photo).not.toBeNull()
    expect(link).toBeTruthy()
  })

  it('opens the project page once for a double tap, again after the guard', async () => {
    const onOpen = jest.fn()
    await renderWithProviders(card({ onOpen }))

    await fireEvent.press(openLink())
    await fireEvent.press(openLink())
    expect(onOpen).toHaveBeenCalledTimes(1)

    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
    await fireEvent.press(openLink())
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('does not open the project page when « Tester » is touched', async () => {
    const onOpen = jest.fn()
    const onTest = jest.fn()
    await renderWithProviders(card({ onOpen, onTest }))

    await fireEvent.press(testLink())

    expect(onTest).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('keeps the two links side by side, neither inside the other (ui-4)', async () => {
    await renderWithProviders(card({}))

    expect(insideControl(openLink())).toBe(false)
    expect(insideControl(testLink())).toBe(false)
  })
})

describe('TesterCard without onOpen', () => {
  it('has no link but « Tester »', async () => {
    await renderWithProviders(
      <TesterCard title={title} author="Sam Petit" image={image} onTest={() => {}} />,
    )

    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(testLink()).toBeTruthy()
  })
})
