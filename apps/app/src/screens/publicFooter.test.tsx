// Tests du pied des pages publiques à langue (tranche R12, plan R12, décision 16), sur les pages d'un
// visiteur autres que l'accueil (ShowcaseScreen.test.tsx) : la page d'un projet public, ses mises à
// jour et une page légale sous `/fr/…`. Chacune a le pied de R11, avec les quatre pages dans la
// langue de l'adresse, et au bout « English », qui mène à la même page en anglais. Le faux serveur,
// les données et le faux routeur : Public.testkit.tsx.
import { screen } from '@testing-library/react-native'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { LegalPageScreen } from './LegalPageScreen'
import { decollageId, resetPublic } from './Public.testkit'
import { PublicProjectScreen } from './PublicProjectScreen'
import { PublicUpdatesScreen } from './PublicUpdatesScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../notifications/api', () => ({ useUnreadCount: () => 0 }))
jest.mock('expo-router', () => {
  const kit = () => require('./Public.testkit').mockNav
  return {
    useRouter: () => kit().router,
    usePathname: () => kit().pathname,
    useNavigation: () => kit().navigation,
    useLocalSearchParams: () => kit().params,
    useGlobalSearchParams: () => kit().params,
    useSegments: () => [],
    useFocusEffect: () => {},
    useIsFocused: () => true,
  }
})

const rules = fr.t(($) => $.legal.links.rules)
const privacy = fr.t(($) => $.legal.links.privacy)
const report = fr.t(($) => $.legal.links.report)

beforeEach(() => mockSession(null))

describe('the footer of the public pages of a visitor (R12)', () => {
  it('ends the page of a public project with the footer, in the language of the address', async () => {
    const address = `/fr/projects/${decollageId}`
    resetPublic(address, { id: decollageId, lang: 'fr' })
    await renderWithProviders(<PublicProjectScreen id={decollageId} />)

    const english = await screen.findByRole('link', { name: 'English' })
    expect(pathOf(english.props.href)).toBe(`/en/projects/${decollageId}`)
    expect(pathOf(screen.getByRole('link', { name: rules }).props.href)).toBe('/fr/rules')
    // « Signaler ce projet » est juste au-dessus : pas de second « Signaler ».
    expect(screen.queryByRole('link', { name: report })).toBeNull()
  })

  it('ends the updates of a public project with the footer', async () => {
    const address = `/fr/projects/${decollageId}/updates`
    resetPublic(address, { id: decollageId, lang: 'fr' })
    await renderWithProviders(<PublicUpdatesScreen id={decollageId} />)

    const english = await screen.findByRole('link', { name: 'English' })
    expect(pathOf(english.props.href)).toBe(`/en/projects/${decollageId}/updates`)
    expect(pathOf(screen.getByRole('link', { name: rules }).props.href)).toBe('/fr/rules')
  })

  it('offers the same legal page in English, at the end of its footer', async () => {
    resetPublic('/fr/rules', { lang: 'fr' })
    await renderWithProviders(<LegalPageScreen page="rules" />)

    const english = await screen.findByRole('link', { name: 'English' })
    expect(pathOf(english.props.href)).toBe('/en/rules')
    expect(pathOf(screen.getByRole('link', { name: privacy }).props.href)).toBe('/fr/privacy')
  })
})
