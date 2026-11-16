// Tests de la barre du haut d'un visiteur sans compte (tranche R12, `ui/VisitorBar`) : le logo
// ramène à l'accueil de la langue de la page, « Se connecter » mène à la connexion, qui ramène
// ensuite à la page (`?next=`). Sur téléphone comme sur ordinateur, et sans jamais lire la session
// ni le profil (plan R12, relecture de l'interface C1).
import { appName } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { useSession } from '../accounts/api'
import { createI18n } from '../i18n'
import { useMe } from '../profile/hooks'
import { pathOf } from '../testing/navigation'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { Text } from './Text'
import { VisitorBar } from './VisitorBar'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/hooks', () => ({ useMe: jest.fn() }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/fr/projects/p-decollage',
  useRouter: () => ({ push: mockPush, replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

const en = createI18n('en')
const page = '/fr/projects/p-decollage'
const signIn = fr.t(($) => $.visitor.signIn)
const pushed = () => mockPush.mock.calls.map(([href]) => pathOf(href))

beforeEach(() => {
  mockPush.mockReset()
  jest.mocked(useSession).mockClear()
  jest.mocked(useMe).mockClear()
})

describe('VisitorBar (R12)', () => {
  it('leads home in the language of the page from the logo, on a phone', async () => {
    await renderWithProviders(<VisitorBar homeHref="/fr/" next={page} />)

    await fireEvent.press(screen.getByRole('link', { name: appName }))

    expect(pushed()).toEqual(['/fr/'])
  })

  it('leads to signing in, then back to the page, on a phone', async () => {
    await renderWithProviders(<VisitorBar homeHref="/fr/" next={page} />)

    await fireEvent.press(screen.getByRole('link', { name: signIn }))

    const target = pushed()[0] ?? ''
    expect(target.startsWith('/sign-in?')).toBe(true)
    expect(new URLSearchParams(target.slice(target.indexOf('?'))).get('next')).toBe(page)
  })

  it('does the same in the capsule of a computer', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(<VisitorBar homeHref="/en/" next="/en/members/u-ines" />, 'en')

      await fireEvent.press(screen.getByRole('link', { name: appName }))
      await fireEvent.press(screen.getByRole('link', { name: en.t(($) => $.visitor.signIn) }))

      expect(pushed()[0]).toBe('/en/')
      expect(pushed()[1]).toBe('/sign-in?next=/en/members/u-ines')
    } finally {
      restore()
    }
  })

  it('never reads the session nor the profile', async () => {
    await renderWithProviders(<VisitorBar homeHref="/fr/" next={page} />)

    // Témoin : la barre est là.
    expect(screen.getByRole('link', { name: signIn })).toBeTruthy()
    expect(useSession).not.toHaveBeenCalled()
    expect(useMe).not.toHaveBeenCalled()
  })

  it('places the action of the page before « Se connecter »', async () => {
    await renderWithProviders(
      <VisitorBar homeHref="/fr/" next={page} action={<Text>Partager</Text>} />,
    )

    expect(screen.getByText('Partager')).toBeTruthy()
  })
})
