// Tests des liens de la barre du haut sur une page fille (R16) : « Explorer » reste allumé sur la
// Recherche, « Tous les outils » et la page d'un outil (la table de la barre d'onglets), mais il
// n'y est pas la page ouverte. Le toucher, ou Entrée au clavier (sur le web, react-native-web passe
// par le même `onPress`), mène donc à Explorer, comme le clic dans le navigateur. Sur sa propre
// page, il ne fait toujours rien : rien à empiler une seconde fois (témoin).
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { createI18n } from '../i18n'
import { useUnreadCount } from '../notifications/api'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { TopNav } from './TopNav'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre lit le profil pour l'avatar : on remplace l'appel, qui n'arrive jamais.
jest.mock('../profile/api', () => ({ getMe: jest.fn().mockReturnValue(new Promise(() => {})) }))
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))
let mockPathname = '/'
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, replace: jest.fn(), setParams: jest.fn() }),
  useIsFocused: () => true,
}))

const { t } = createI18n('fr')
const explore = () => screen.getByRole('link', { name: t(($) => $.nav.explore) })

let restoreWindow: () => void

beforeEach(() => {
  restoreWindow = setDesktopWindow()
  mockPush.mockReset()
  mockSession({ user: { id: 'u5', name: 'Inès' } })
  jest.mocked(useUnreadCount).mockReset().mockReturnValue(0)
  // Le web : le geste du clavier et celui de la souris passent par le `<a>` de la barre.
  jest.replaceProperty(Platform, 'OS', 'web')
})

afterEach(() => {
  restoreWindow()
  jest.restoreAllMocks()
})

describe('« Explorer » of the top bar, on a page under it (R16)', () => {
  it.each(['/tools', '/search', '/tags/claude'])(
    'still marks Explorer on %s, and opens Explorer when activated',
    async (pathname) => {
      mockPathname = pathname
      await renderWithProviders(<TopNav />)
      expect(explore().props['aria-current']).toBe('page') // témoin : allumé comme avant

      await fireEvent.press(explore(), { preventDefault: () => {} })

      expect(mockPush).toHaveBeenCalledWith('/explore')
    },
  )

  it('does nothing on Explorer itself, where it is the open page', async () => {
    mockPathname = '/explore'
    await renderWithProviders(<TopNav />)

    await fireEvent.press(explore(), { preventDefault: () => {} })

    expect(mockPush).not.toHaveBeenCalled()
  })
})
