// Tests du lien vers la même page dans l'autre langue (tranche R12, plan R12, décision 16) : au pied
// d'une page publique à langue (`/fr/…`, `/en/…`), un lien nommé dans la langue d'arrivée
// (« English », « Français »), qui porte l'attribut `lang` de cette langue et mène à la même page.
// Ailleurs (`/`, le Fil), et sur le web avant l'hydratation, il n'y a rien.
import { fireEvent, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { pathOf, visited } from '../testing/navigation'
import { renderWithProviders } from '../testing/render'
import { LanguageLink } from './LanguageLink'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
const mockPush = jest.fn()
let mockPathname = '/fr/projects/p-1'
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))
// L'hydratation, que chaque test peut retarder (la page web pré-rendue, avant que React la reprenne).
let mockHydrated = true
jest.mock('./theme/hydration', () => ({
  ...jest.requireActual('./theme/hydration'),
  useHydrated: () => mockHydrated,
}))

beforeEach(() => {
  mockPathname = '/fr/projects/p-1'
  mockHydrated = true
  mockPush.mockReset()
})

/** L'attribut `lang` du lien, ou de l'un de ses parents. */
const langOf = (node: ReturnType<typeof screen.getByRole> | null): unknown => {
  let current = node
  while (current) {
    if (current.props.lang !== undefined) return current.props.lang
    current = current.parent
  }
  return undefined
}

/** Un témoin, pour qu'un test d'absence prouve que le rendu a bien eu lieu. */
const Witness = () => <Text>témoin</Text>

describe('LanguageLink', () => {
  it('on a French page, links to the same page in English, named and marked in English', async () => {
    await renderWithProviders(<LanguageLink />)

    const link = screen.getByRole('link', { name: 'English' })
    expect(langOf(link)).toBe('en')
    expect(pathOf(link.props.href)).toBe('/en/projects/p-1')
    await fireEvent.press(link)
    expect(visited(mockPush).map(pathOf)).toEqual(['/en/projects/p-1'])
  })

  it('on an English page, links to the French page, named « Français » even in English', async () => {
    mockPathname = '/en/'
    await renderWithProviders(<LanguageLink />, 'en')

    const link = screen.getByRole('link', { name: 'Français' })
    expect(langOf(link)).toBe('fr')
    expect(pathOf(link.props.href)).toBe('/fr/')
  })

  it('shows nothing on a page without a language in its address', async () => {
    mockPathname = '/'
    await renderWithProviders(
      <>
        <Witness />
        <LanguageLink />
      </>,
    )

    expect(screen.getByText('témoin')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('waits for the page to be hydrated before showing the link', async () => {
    mockHydrated = false
    await renderWithProviders(
      <>
        <Witness />
        <LanguageLink />
      </>,
    )

    expect(screen.getByText('témoin')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('takes the address it is given, as in the catalogue', async () => {
    mockPathname = '/catalogue'
    await renderWithProviders(<LanguageLink path="/fr/rules" />)

    expect(pathOf(screen.getByRole('link', { name: 'English' }).props.href)).toBe('/en/rules')
  })
})
