// Tests de la fin d'une liste sur téléphone (R7a, ui-C6) : il n'y a pas de focus du clavier, mais le
// lecteur d'écran, qui repartirait du haut de l'écran quand « Afficher la suite » disparaît, est
// amené par `moveReaderTo` sur la phrase de fin s'il y en a une, sinon sur la première carte arrivée.
// Les tests web de `FeedEnd.test.tsx` règlent le cas du clavier ; ici, `Platform.OS` reste natif.
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef, type RefObject } from 'react'
import { View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { FeedEnd } from './FeedEnd'
import { moveReaderTo } from './focus'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// L'aide, telle quelle, mais dont le test lit les appels.
jest.mock('./focus', () => {
  const actual = jest.requireActual('./focus')
  return { ...actual, moveReaderTo: jest.fn((node: unknown) => actual.moveReaderTo(node)) }
})

const MORE = 'Afficher la suite'
const END = 'Tu as tout lu'

type State = 'more' | 'loading' | 'end'

/** Une liste : la carte arrivée avec la dernière page, puis le bas de la liste. */
const list = (state: State, arrived: RefObject<View | null>, endLabel?: string) => (
  <>
    <View ref={arrived} accessibilityRole="link" accessibilityLabel="Le carnet de jardin" />
    <FeedEnd
      state={state}
      moreLabel={MORE}
      onMore={() => {}}
      firstArrived={arrived}
      {...(endLabel ? { endLabel } : null)}
    />
  </>
)

/** Du doigt : un toucher sur « Afficher la suite », puis la page arrive et la liste finit. */
const reachTheEnd = async (endLabel?: string) => {
  const arrived = createRef<View>()
  const view = await renderWithProviders(list('more', arrived, endLabel))
  jest.mocked(moveReaderTo).mockClear()
  await fireEvent.press(screen.getByRole('button', { name: MORE }))
  await view.rerender(list('loading', arrived, endLabel))
  await view.rerender(list('end', arrived, endLabel))
  return arrived
}

describe('FeedEnd on a phone when the last page arrives (R7a, ui-C6)', () => {
  it('moves the screen reader to the first card that arrived, when the list ends without a sentence', async () => {
    const arrived = await reachTheEnd()

    // Témoin : le bouton a disparu, la liste est finie.
    expect(screen.queryByRole('button', { name: MORE })).toBeNull()
    expect(jest.mocked(moveReaderTo).mock.calls.map(([node]) => node)).toEqual([arrived.current])
  })

  it('moves the screen reader to the end sentence when there is one', async () => {
    const arrived = await reachTheEnd(END)

    const sentence = screen.getByText(END)
    expect(sentence).toBeTruthy()
    const [call] = jest.mocked(moveReaderTo).mock.calls
    expect(call?.[0]).toBeTruthy()
    expect(call?.[0]).not.toBe(arrived.current)
    expect(jest.mocked(moveReaderTo)).toHaveBeenCalledTimes(1)
  })
})
