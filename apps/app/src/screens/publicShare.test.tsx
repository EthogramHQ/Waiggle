// Tests de « Partager » sur les pages d'un visiteur (tranche R12, scénario « Partager », planches
// R12-Visiteur-Projet et R12-Visiteur-Profil) : la page d'un projet public et une page publique de
// membre offrent « Partager », dont la feuille dit « Tout le monde pourra l'ouvrir. » et montre
// l'adresse publique dans la langue de la page. Et le pied des pages publiques sur la page d'un
// membre (plan R12, décision 16), sans « Signaler un contenu » (« Signaler ce profil » est juste
// au-dessus), absent de l'aperçu « comme un visiteur ». Le faux serveur, les données et le faux
// routeur : Public.testkit.tsx.
import { fireEvent, screen } from '@testing-library/react-native'
import { webAppUrl } from '../config'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { decollageId, inesId, resetPublic } from './Public.testkit'
import { PublicMemberScreen } from './PublicMemberScreen'
import { PublicProjectScreen } from './PublicProjectScreen'

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

const share = fr.t(($) => $.share.action)
const everyone = fr.t(($) => $.share.everyone)
const addressOf = (path: string) => new URL(path, webAppUrl).href

beforeEach(() => mockSession(null))

describe('« Partager » on the pages of a visitor (R12)', () => {
  it('shares a public project at its address in the language of the page', async () => {
    resetPublic(`/fr/projects/${decollageId}`, { id: decollageId, lang: 'fr' })
    await renderWithProviders(<PublicProjectScreen id={decollageId} />)

    await fireEvent.press(await screen.findByRole('button', { name: share }))

    expect(await screen.findByText(everyone)).toBeTruthy()
    expect(screen.getByText(addressOf(`/fr/projects/${decollageId}`))).toBeTruthy()
  })

  it('shares a public member page at its address in the language of the page', async () => {
    resetPublic(`/fr/members/${inesId}`, { id: inesId, lang: 'fr' })
    await renderWithProviders(<PublicMemberScreen id={inesId} />)

    await fireEvent.press(await screen.findByRole('button', { name: share }))

    expect(await screen.findByText(everyone)).toBeTruthy()
    expect(screen.getByText(addressOf(`/fr/members/${inesId}`))).toBeTruthy()
  })
})

describe('the footer of a public member page (R12)', () => {
  it('ends the page with the footer, in the language of the address, without « Signaler un contenu »', async () => {
    resetPublic(`/fr/members/${inesId}`, { id: inesId, lang: 'fr' })
    await renderWithProviders(<PublicMemberScreen id={inesId} />)

    const english = await screen.findByRole('link', { name: 'English' })
    expect(pathOf(english.props.href)).toBe(`/en/members/${inesId}`)
    expect(
      pathOf(screen.getByRole('link', { name: fr.t(($) => $.legal.links.rules) }).props.href),
    ).toBe('/fr/rules')
    expect(screen.queryByRole('link', { name: fr.t(($) => $.legal.links.report) })).toBeNull()
  })

  it('offers neither the footer nor « Partager » in the preview', async () => {
    resetPublic('/settings/public-page', { id: inesId })
    await renderWithProviders(<PublicMemberScreen id={inesId} preview />)

    // Témoin : la page est arrivée.
    expect(await screen.findByRole('header', { name: 'Inès Haddad' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: fr.t(($) => $.legal.links.rules) })).toBeNull()
    expect(screen.queryByRole('button', { name: share })).toBeNull()
  })
})
