// Tests de la place que la barre du haut fait réserver à l'écran (R16, scénario « La page ne bouge
// plus en arrivant » : « la barre du haut est à sa place dès la première image, et le contenu ne
// descend plus quand la session se confirme » ; plan, choix 3). La place vide que `TopNav` rend
// pendant la lecture de la session ne suffit pas : l'écran pose son contenu sous la hauteur mesurée
// de la barre, et la mesure vient une image plus tard (63 points de saut au rechargement d'Explorer,
// mesuré le 17/11). Sur le web, avec le repère `waiggle_member=1`, la barre déclare donc sa place à
// la bande (`ScreenTopBar`), qui la rend à l'écran avant toute mesure ; sans repère, rien.
import { layout } from '@ruche/brand'
import { Platform } from 'react-native'
import { useUnreadCount } from '../notifications/api'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { forgetTopBarSpace, ScreenTopBar } from '../ui/ScreenTopBar'
import { TopNav } from './TopNav'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn(() => new Promise(() => {})) }))
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/explore',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
  useIsFocused: () => true,
}))

/** Ce que rend `document.cookie` à la lecture. */
let cookieJar = ''
let restoreWindow: () => void = () => {}
beforeEach(() => {
  forgetTopBarSpace()
  cookieJar = ''
  restoreWindow = setDesktopWindow()
  jest.mocked(useUnreadCount).mockReturnValue(0)
  jest.replaceProperty(Platform, 'OS', 'web')
  // Un faux document : ses cookies, et ce que le thème de la page y touche (couleurs, attributs).
  const style = { setProperty: () => {}, colorScheme: '', backgroundColor: '' }
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      get cookie() {
        return cookieJar
      },
      set cookie(_value: string) {},
      documentElement: { style, setAttribute: () => {}, removeAttribute: () => {} },
      body: { style },
    },
  })
})
afterEach(() => {
  restoreWindow()
  jest.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'document')
})

const firstSpace = async () => {
  const onSpace = jest.fn()
  await renderWithProviders(
    <ScreenTopBar onSpace={onSpace}>
      <TopNav />
    </ScreenTopBar>,
  )
  return onSpace.mock.calls[0]?.[0] as { height: number } | undefined
}

describe('the place the top bar has the screen keep, on the web (R16)', () => {
  it('has the screen keep the place of the bar before any measure when the member marker is set', async () => {
    cookieJar = 'waiggle_member=1'
    mockSession(null, true)

    expect(await firstSpace()).toMatchObject({ height: layout.topBarHeight.regular })
  })

  it('has the screen keep nothing for a visitor without the marker, whose bar shows nothing', async () => {
    mockSession(null, true)

    expect(await firstSpace()).toMatchObject({ height: 0 })
  })

  it('has the screen keep nothing for a marker of another value', async () => {
    cookieJar = 'waiggle_member=yes'
    mockSession(null, true)

    expect(await firstSpace()).toMatchObject({ height: 0 })
  })
})
