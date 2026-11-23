// Tests des réglages de la récolte (R19, docs/scenarios/refonte.md, « Le classement de la
// semaine », « Ce qui fait revenir, sans insister », « Les titres » ; planche R19-Reglages, options
// a7, a8 et a9) :
// - Apparence : un groupe « Classements » sous les choix d'apparence, avec l'interrupteur
//   « Apparaître dans les classements » et son aide ;
// - Notifications : un groupe « Ma récolte » en tête, avec son interrupteur et son aide ;
// - Mon profil : « Mon titre » (« Selon mes gestes » et les titres déjà obtenus, aide « Celui des
//   4 dernières semaines : aujourd'hui, Gardienne. ») et « Forme » (féminin ou masculin), absente
//   en anglais, qui n'a qu'une forme.
// Chaque choix part par PATCH /v1/me/game ; l'état affiché vient de GET /v1/me/harvest (`settings`).
//
// Le client réseau est remplacé : le faux serveur du jeu (Game.testkit.ts) répond à ses adresses,
// et les réglages d'e-mail et le catalogue des outils sont rendus tels quels.
import type { Harvest } from '@ruche/contracts'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { createI18n } from '../i18n'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { gamePatches, gameServer, leaHarvest } from './Game.testkit'
import { ProfileScreen } from './ProfileScreen'
import { SettingsScreen } from './SettingsScreen'

jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
  downloadMyData: jest.fn(),
}))
jest.mock('../profile/api', () => ({
  getMe: jest.fn(),
  updateProfile: jest.fn(),
  uploadAvatar: jest.fn(),
  pickAvatar: jest.fn(),
}))
// Le client réseau : le jeu par son faux serveur, les réglages d'e-mail de Léa et un catalogue
// d'outils vide ; toute autre demande reçoit « introuvable », jamais le réseau.
jest.mock('../api/client', () => {
  const { leaEmailPreferences } = jest.requireActual('../testing/email')
  const route = (path: string, init?: RequestInit) => {
    if (path === '/v1/me/email-preferences')
      return Promise.resolve({ ok: true, data: leaEmailPreferences })
    if (path === '/v1/tools') return Promise.resolve({ ok: true, data: { tools: [], others: [] } })
    return require('./Game.testkit')
      .gameServer.route(path, init)
      .then((answer: unknown) => answer ?? { ok: false, error: 'notFound' })
  }
  return { request: jest.fn(route), requestWithoutBody: jest.fn(route) }
})
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/settings',
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => ({}),
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, ...rest }, children),
  }
})

// Les textes attendus, tirés des mêmes traductions que l'écran.
const T = {
  rankings: fr.t(($) => $.game.settings.rankings),
  inRankings: fr.t(($) => $.game.settings.inRankings),
  inRankingsHint: fr.t(($) => $.game.settings.inRankingsHint),
  notices: fr.t(($) => $.game.settings.notices),
  noticesHint: fr.t(($) => $.game.settings.noticesHint),
  title: fr.t(($) => $.game.settings.title),
  titleAuto: fr.t(($) => $.game.settings.titleAuto),
  titleHint: fr.t(($) => $.game.settings.titleHint, {
    title: fr.t(($) => $.game.titles.keeper_f),
  }),
  form: fr.t(($) => $.game.settings.form),
  forager: fr.t(($) => $.game.titles.forager_f),
}
const en = createI18n('en')

/** Le texte, visible ou lu comme le nom d'un élément. */
const shown = (text: string) =>
  screen.queryAllByText(containing(text)).length > 0 ||
  screen.queryAllByLabelText(containing(text)).length > 0

/** L'interrupteur dont le nom lu contient ce texte. */
const switchNamed = (text: string) => screen.findByRole('switch', { name: containing(text) })

const openSection = async (
  section: 'appearance' | 'notifications',
  harvest: Harvest = leaHarvest,
) => {
  gameServer.reset(harvest)
  return renderWithProviders(<SettingsScreen section={section} />)
}

beforeEach(() => {
  gameServer.reset()
  mockSession({ user: { id: 'u1', name: 'Léa', email: 'lea@example.com' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
})

// Option a8 : « Apparaître dans les classements », dans un groupe sous Apparence.
describe('« Apparaître dans les classements » in Appearance', () => {
  it('shows the group « Classements » with its switch on and its help', async () => {
    await openSection('appearance')

    const toggle = await switchNamed(T.inRankings)
    expect(toggle).toBeChecked()
    expect(shown(T.rankings)).toBe(true)
    expect(shown(T.inRankingsHint)).toBe(true)
  })

  it('sends PATCH /v1/me/game when the member leaves the rankings', async () => {
    await openSection('appearance')

    await fireEvent.press(await switchNamed(T.inRankings))

    await waitFor(() => expect(gamePatches()).toEqual([{ inRankings: false }]))
  })

  it('shows the switch off for a member who left the rankings', async () => {
    await openSection('appearance', {
      ...leaHarvest,
      settings: { ...leaHarvest.settings, inRankings: false },
    })

    await waitFor(async () => expect(await switchNamed(T.inRankings)).not.toBeChecked())
  })
})

// Option a9 : « Ma récolte » en tête des Notifications.
describe('« Ma récolte » in Notifications', () => {
  it('puts the switch « Ma récolte » first, before the email settings', async () => {
    await openSection('notifications')

    const toggle = await switchNamed(T.notices)
    expect(toggle).toBeChecked()
    expect(shown(T.noticesHint)).toBe(true)
    // En tête : le premier interrupteur de la rubrique (le récap du dimanche vient après).
    const [first] = screen.getAllByRole('switch')
    expect(first).toBe(toggle)
  })

  it('sends PATCH /v1/me/game when the member turns harvest notices off', async () => {
    await openSection('notifications')

    await fireEvent.press(await switchNamed(T.notices))

    await waitFor(() => expect(gamePatches()).toEqual([{ harvestNotices: false }]))
  })
})

// Option a7 : « Mon titre » et « Forme » dans Mon profil.
describe('the title and its form in « Mon profil »', () => {
  const openProfile = async (language: 'fr' | 'en' = 'fr') => {
    const view = await renderWithProviders(<ProfileScreen />, language)
    await screen.findByDisplayValue('Léa')
    return view
  }

  /** Le groupe « Forme » (féminin ou masculin), un groupe de boutons radio. */
  const formGroup = () => screen.queryByRole('radiogroup', { name: T.form })

  it('offers « Selon mes gestes » and the titles already obtained, with the help', async () => {
    await openProfile()

    await waitFor(() => expect(shown(T.title)).toBe(true))
    expect(screen.getByRole('radio', { name: T.titleAuto })).toBeChecked()
    expect(shown(T.forager)).toBe(true)
    expect(shown(T.titleHint)).toBe(true)
  })

  it('pins an obtained title with PATCH /v1/me/game', async () => {
    await openProfile()
    await waitFor(() => expect(shown(T.title)).toBe(true))

    // Le titre « Butineuse » de « Mon titre » (pas un choix du groupe « Forme »).
    const group = formGroup()
    const [forager] = screen
      .getAllByRole('radio', { name: T.forager })
      .filter((radio) => !group || within(group).queryAllByRole('radio').indexOf(radio) === -1)
    if (!forager) throw new Error('no title « Butineuse » to pin')
    await fireEvent.press(forager)

    await waitFor(() => expect(gamePatches()).toEqual([{ pinnedFamily: 'forager' }]))
  })

  it('switches the form of the title with PATCH /v1/me/game', async () => {
    await openProfile()

    const group = await waitFor(() => {
      const found = formGroup()
      expect(found).toBeTruthy()
      return found as NonNullable<ReturnType<typeof formGroup>>
    })
    // Les deux choix de la forme : le féminin coché (le défaut), le masculin à toucher.
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(2)
    const masculine = radios.find((radio) => radio.props.accessibilityState?.checked !== true)
    if (!masculine) throw new Error('no unchecked form')
    await fireEvent.press(masculine)

    await waitFor(() => expect(gamePatches()).toEqual([{ titleForm: 'm' }]))
  })

  it('has no « Form » in English, which has one form only', async () => {
    await openProfile('en')

    // Témoin : « My title » est bien là en anglais.
    await waitFor(() =>
      expect(
        screen.queryAllByText(containing(en.t(($) => $.game.settings.title))).length,
      ).toBeGreaterThan(0),
    )
    expect(screen.queryByRole('radiogroup', { name: en.t(($) => $.game.settings.form) })).toBeNull()
    expect(screen.queryAllByText(en.t(($) => $.game.settings.form))).toEqual([])
  })
})
