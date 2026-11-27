// La garde du bouton « N nouveaux commentaires » contre la double tape (relecture de design de R21).
// Le bouton s'en va dès le premier toucher ; sur le web, la seconde tape d'une double tape (150 ms
// plus tard) tombait sur ce qui était dessous : « Offrir du miel » à 320 px, « Suivre ce projet » à
// 768 px, une autre carte dans la feuille. Au toucher, la page ignore donc les tapes un moment
// (`holdPageTaps`, comme la feuille qui se ferme sous le doigt), écoutées à la capture sur le document.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { NewCommentsButton } from './NewCommentsButton'
import { TAP_GUARD_MS } from './tapGuard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un document de navigateur réduit à ce que lit la garde : ses écouteurs. */
const fakeDocument = () => ({
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  activeElement: null,
  body: null,
})

/** Les écouteurs de `click` posés à la capture sur le document : ceux de la garde. */
const clickGuards = () =>
  (
    (globalThis as unknown as { document: ReturnType<typeof fakeDocument> }).document
      .addEventListener as jest.Mock
  ).mock.calls.filter(([type, , capture]) => type === 'click' && capture === true)

describe('NewCommentsButton, against a double tap', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    Object.defineProperty(globalThis, 'document', { value: fakeDocument(), configurable: true })
  })
  afterEach(() => {
    jest.useRealTimers()
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('makes the page ignore taps for a moment once touched, as it goes away', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<NewCommentsButton count={1} onPress={onPress} />)
    // Témoin : rien n'est retenu tant qu'on n'a pas touché le bouton.
    expect(clickGuards()).toHaveLength(0)

    await fireEvent.press(screen.getByRole('button', { name: '1 nouveau commentaire' }))

    expect(onPress).toHaveBeenCalledTimes(1)
    expect(clickGuards()).toHaveLength(1)
    // La garde s'en va d'elle-même : une tape plus tardive est un geste à part.
    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
    const removed = (
      (globalThis as unknown as { document: ReturnType<typeof fakeDocument> }).document
        .removeEventListener as jest.Mock
    ).mock.calls.filter(([type]) => type === 'click')
    expect(removed).toHaveLength(1)
  })
})
