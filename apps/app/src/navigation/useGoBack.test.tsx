// Tests du retour commun à tous les écrans (`useGoBack`) pendant les passages de page (R17) : arrivé
// par un lien direct, le « Retour » de la page remplace par sa page de secours (`router.replace`).
// Rien dans cette action ne dit « retour » : `useGoBack` l'annonce au moteur des passages juste
// avant (`announcePassage('back')`), pour que le contenu descende comme à un vrai retour.
import { renderHook } from '@testing-library/react-native'
import { announcePassage } from '../ui/pageTransition'
import { useGoBack } from './useGoBack'

let order: string[] = []
let mockCanGoBack = false
const mockRouter = {
  canGoBack: () => mockCanGoBack,
  back: jest.fn(() => {
    order.push('back')
  }),
  replace: jest.fn((href: string) => {
    order.push(`replace ${href}`)
  }),
}
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
jest.mock('../ui/pageTransition', () => ({
  ...jest.requireActual('../ui/pageTransition'),
  announcePassage: jest.fn(),
}))

beforeEach(() => {
  order = []
  mockCanGoBack = false
  jest.mocked(announcePassage).mockReset()
  jest.mocked(announcePassage).mockImplementation((kind) => {
    order.push(`announce ${kind}`)
  })
})

describe('useGoBack and the page passages', () => {
  it('announces a way back just before replacing by the fallback page', async () => {
    const { result } = await renderHook(() => useGoBack('/feed'))

    result.current()

    expect(order).toEqual(['announce back', 'replace /feed'])
  })

  it('goes back without announcing anything when there is a page before (témoin)', async () => {
    mockCanGoBack = true
    const { result } = await renderHook(() => useGoBack('/feed'))

    result.current()

    // GO_BACK dit lui-même que c'est un retour.
    expect(order).toEqual(['back'])
  })
})
