// Correction de la relecture de R6b (ui-C2) : ajouter un outil au catalogue sans choisir sa famille
// dit « Choisis une famille. » sous le groupe des familles, et la phrase part quand on en choisit
// une. Un fichier à part : celui de la page (`ModerationToolsScreen.test.tsx`) est le test d'origine.
import { fireEvent, screen } from '@testing-library/react-native'
import { View } from 'react-native'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { cardOf, catalogueServer, installCatalogueServer } from './ModerationCatalogue.testkit'
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
const FAMILY_REQUIRED = t(($) => $.moderation.catalogue.familyRequired)

beforeEach(() => {
  installCatalogueServer()
  mockSession({ user: { id: catalogueServer.me.id, name: catalogueServer.me.name } })
})

describe('the tool sheet, a missing family', () => {
  it('says « Choisis une famille. » under the families, and takes it away once one is chosen', async () => {
    await renderWithProviders(
      <>
        <View />
        <ModerationToolsScreen />
      </>,
    )
    await screen.findByText('Make.com')
    await fireEvent.press(
      cardOf('Teachable Machine', /^Cité par \d+ projets?$/).getByRole('button', {
        name: t(($) => $.moderation.catalogue.admit),
      }),
    )
    await screen.findByLabelText(t(($) => $.moderation.catalogue.name))
    expect(screen.queryByText(FAMILY_REQUIRED)).toBeNull()

    await fireEvent.press(
      screen.getByRole('button', { name: t(($) => $.moderation.catalogue.save) }),
    )

    expect(screen.getByText(FAMILY_REQUIRED)).toBeTruthy()
    expect(
      screen.getByLabelText(
        t(($) => $.moderation.catalogue.family),
        { exact: true },
      ).props['aria-invalid'],
    ).toBeUndefined() // `aria-invalid` ne se pose que sur le web : ici, la phrase suffit.

    await fireEvent.press(screen.getByLabelText(t(($) => $.tools.family.creation)))
    expect(screen.queryByText(FAMILY_REQUIRED)).toBeNull()
  })
})
