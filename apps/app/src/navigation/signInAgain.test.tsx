// Tests du lien « Me reconnecter » (tranche 6c) : il mène à la connexion, qui ramène ensuite sur la
// page où l'on était, paramètres de l'adresse compris (?announce=…). La page est une Notice qui
// reçoit l'action du hook, comme dans les écrans.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { visited } from '../testing/navigation'
import { renderWithProviders } from '../testing/render'
import { Notice } from '../ui/Notice'
import { useSignInAgain } from './signInAgain'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/abc',
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}))

function Expired({ before }: { before?: () => void }) {
  const signInAgain = useSignInAgain()
  return <Notice message="Ta session a expiré." action={signInAgain(before)} />
}

/** L'adresse affichée par le navigateur (web), le temps d'un test. */
const browserAt = (search: string) =>
  Object.defineProperty(globalThis, 'location', { value: { search }, configurable: true })

const press = () => fireEvent.press(screen.getByRole('link', { name: 'Me reconnecter' }))

beforeEach(() => mockPush.mockReset())
afterEach(() => {
  jest.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'location')
})

describe('useSignInAgain', () => {
  it('comes back to the page after signing in', async () => {
    await renderWithProviders(<Expired />)

    await press()

    expect(visited(mockPush)).toEqual(['/sign-in?next=/projects/abc'])
  })

  it('closes what must be closed before leaving', async () => {
    const before = jest.fn()
    await renderWithProviders(<Expired before={before} />)

    await press()

    expect(before).toHaveBeenCalledTimes(1)
  })

  it('keeps the parameters of the address on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    browserAt('?announce=testable')
    await renderWithProviders(<Expired />)

    await press()

    expect(visited(mockPush)).toEqual(['/sign-in?next=/projects/abc?announce=testable'])
  })

  it('drops parameters that the sign-in page would refuse, and keeps the page', async () => {
    // Une barre oblique encodée (%2F) ferait refuser toute l'adresse par safeNext (next.ts) : on
    // revient alors au moins sur la page, sans ses paramètres.
    jest.replaceProperty(Platform, 'OS', 'web')
    browserAt('?from=%2F%2Fevil.example')
    await renderWithProviders(<Expired />)

    await press()

    expect(visited(mockPush)).toEqual(['/sign-in?next=/projects/abc'])
  })
})
