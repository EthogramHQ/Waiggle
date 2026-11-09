// Tests de la page « Outils » de la Modération, ajoutés par les corrections d'après les relectures
// de R6b (rapports du design et de l'interface) :
// - U1 (des-B1) : « Laisser hors du catalogue » écrit sans fenêtre ; pendant l'écriture, le bouton
//   touché le montre (`loading`, lu « occupé »), et une panne se lit dans la carte, au-dessus de ses
//   boutons, pas en tête de page (915 px au-dessus du doigt sur téléphone) ;
// - U4 (ui-S3) : le groupe d'onglets a son propre nom, pas celui du titre de la page (un lecteur
//   d'écran entendait deux fois « Outils »).
// Mêmes simulations que `ModerationToolsScreen.test.tsx` : le réseau est remplacé au plus bas.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import {
  cardOf,
  catalogueServer,
  heldReply,
  installCatalogueServer,
  refusal,
} from './ModerationCatalogue.testkit'
import { ModerationToolsScreen } from './ModerationToolsScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
jest.mock('../accounts/auth-client', () => ({
  authClient: { getCookie: jest.fn().mockResolvedValue(null) },
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => ({
  usePathname: () => '/moderation/tools',
  useRouter: () => ({
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useNavigation: () => ({ addListener: () => () => {} }),
  useLocalSearchParams: () => ({}),
}))

const t = fr.t.bind(fr)
const DISMISS = t(($) => $.moderation.catalogue.dismiss)
const DISMISSED = t(($) => $.moderation.catalogue.dismissed)
const FAILED = t(($) => $.errors.internal)
const TITLE = t(($) => $.moderation.catalogue.title)
const TAB_PENDING = t(($) => $.moderation.catalogue.tabPending)
const CITED = /^Cité par \d+ projets?$/

const card = (name: string) => cardOf(name, CITED)

const openTools = async () => {
  await renderWithProviders(<ModerationToolsScreen />)
  await screen.findByText('Make.com')
}

beforeEach(() => {
  installCatalogueServer()
  mockSession({ user: { id: catalogueServer.me.id, name: catalogueServer.me.name } })
})

describe('« Laisser hors du catalogue », while it writes and when it fails (U1)', () => {
  it('shows the touched button busy while the write is on its way, and only that one', async () => {
    const held = heldReply()
    catalogueServer.answer('POST', /\/dismiss$/, () => held.reply)
    await openTools()

    await fireEvent.press(card('Suno Studio').getByRole('button', { name: DISMISS }))

    expect(card('Suno Studio').getByRole('button', { name: DISMISS })).toBeBusy()
    // Témoin : la carte voisine n'est pas occupée.
    expect(card('Make.com').getByRole('button', { name: DISMISS })).not.toBeBusy()
    await act(async () => held.release({ status: 204 }))
    await waitFor(() => expect(card('Suno Studio').getByText(DISMISSED)).toBeTruthy())
  })

  it('reads a failure in the card, above its buttons, and nowhere else on the page', async () => {
    catalogueServer.answer('POST', /\/dismiss$/, () => refusal(500, 'internal'))
    await openTools()

    await fireEvent.press(card('Suno Studio').getByRole('button', { name: DISMISS }))

    await waitFor(() => expect(card('Suno Studio').getByText(FAILED)).toBeTruthy())
    // Une seule fois dans la page : dans la carte, pas en tête.
    expect(screen.getAllByText(FAILED)).toHaveLength(1)
    expect(card('Make.com').queryByText(FAILED)).toBeNull()
    // Les boutons restent, pour réessayer ; le bouton n'est plus occupé.
    const again = card('Suno Studio').getByRole('button', { name: DISMISS })
    expect(again).not.toBeBusy()
  })

  it('keeps the failure until the answer of the next try, then shows the result', async () => {
    catalogueServer.answer('POST', /\/dismiss$/, () => refusal(500, 'internal'))
    await openTools()
    await fireEvent.press(card('Suno Studio').getByRole('button', { name: DISMISS }))
    await waitFor(() => expect(card('Suno Studio').getByText(FAILED)).toBeTruthy())

    const held = heldReply()
    catalogueServer.answer('POST', /\/dismiss$/, () => held.reply)
    // Après la garde de double tape du bouton (600 ms).
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 650)))
    await fireEvent.press(card('Suno Studio').getByRole('button', { name: DISMISS }))
    // Pendant la seconde écriture, le message reste (rien ne saute sous le doigt).
    expect(card('Suno Studio').getByText(FAILED)).toBeTruthy()

    await act(async () => held.release({ status: 204 }))
    await waitFor(() => expect(card('Suno Studio').getByText(DISMISSED)).toBeTruthy())
    expect(screen.queryByText(FAILED)).toBeNull()
  })
})

describe('the tabs of the page (U4)', () => {
  it('names the group of tabs by what it chooses, not by the title of the page', async () => {
    await openTools()

    // Témoin : les onglets sont là.
    expect(screen.getByRole('radio', { name: TAB_PENDING })).toBeTruthy()
    // Le groupe n'est pas `accessible` (ses onglets le sont) : RNTL le trouve par son nom.
    const group = screen.getByLabelText(t(($) => $.moderation.list))
    expect(group.props.accessibilityRole).toBe('radiogroup')
    expect(screen.queryByLabelText(TITLE)).toBeNull()
  })
})
