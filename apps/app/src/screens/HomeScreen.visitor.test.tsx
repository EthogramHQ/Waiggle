// Tests de l'écran d'accueil (HomeScreen), côté visiteur : la bienvenue en français ou en
// anglais, le choix de la langue, « Créer un compte », le dessin de R2, et l'accueil quand la
// session ne peut pas se lire.
//
// Avec Testing Library, on affiche l'écran en mémoire, puis on le manipule comme le ferait un
// utilisateur (lire un texte, appuyer sur un bouton) ; on cherche les éléments par leur rôle et leur
// nom, pas par leur code interne. Ce fichier est une part de l'ancien HomeScreen.test.tsx, coupé
// par sections pour que Jest le lance plus vite (il donne un fichier entier à chaque processus) ;
// les fausses données et les aides communes sont dans HomeScreen.testkit.tsx. Les `jest.mock`
// restent écrits ici : Jest les remonte en tête du fichier où ils sont écrits, et ne remplace un
// module que pour ce fichier.
import { appName } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { useSession } from '../accounts/api'
import { useDiscoverFeed, useFollowingFeed, useMarkFeedRead } from '../feed/api'
import { createI18n } from '../i18n'
import { useSuggestions } from '../suggestions/api'
import { mockSession, renderWithI18n, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { HomeScreen } from './HomeScreen'
import { mockPush, mockScreenProps, resetHomeMocks } from './HomeScreen.testkit'

// Le choix de la langue enregistre la langue sur le compte : on remplace aussi ces appels.
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// Les deux fils, la recherche de nouveautés et la date de lecture du fil (R4) : de fausses
// réponses, choisies par chaque test.
jest.mock('../feed/api', () => ({
  useFollowingFeed: jest.fn(),
  useDiscoverFeed: jest.fn(),
  useFeedNews: jest.fn(),
  useMarkFeedRead: jest.fn(),
}))
// R4 : « Proches à suivre » (premier lancement, colonne de droite sur ordinateur) et le bouton
// « Suivre » de chaque ligne.
jest.mock('../suggestions/api', () => ({
  useSuggestions: jest.fn(),
  useDismissSuggestion: jest.fn(),
}))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
// Le cadre de page, tel quel, mais dont le test lit les propriétés : sur ordinateur, le titre
// « Fil » et le bouton des nouveautés à côté (`titleAside`) sont posés par `Screen` (R4).
jest.mock('../ui/Screen', () => {
  const actual = jest.requireActual('../ui/Screen')
  const { createElement } = require('react')
  return {
    ...actual,
    Screen: (props: Record<string, unknown>) => {
      mockScreenProps.push(props)
      return createElement(actual.Screen, props)
    },
  }
})
// Le nombre de la cloche (tranche 6b) : un faux hook, choisi par chaque test.
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}))

beforeEach(resetHomeMocks)

describe('HomeScreen', () => {
  it('welcomes the visitor in French by default', async () => {
    await renderWithI18n(<HomeScreen />)

    // Le logo sert de titre à la page : les lecteurs d'écran l'annoncent avec la phrase d'accueil.
    expect(screen.getByRole('header', { name: `Bienvenue sur ${appName}` })).toBeTruthy()
    expect(screen.getByText('Montre à tes proches ce que tu construis avec l’IA.')).toBeTruthy()
    // R2, décision D2 (jur-B4) : la phrase de confidentialité dit ce qui est vrai aujourd'hui,
    // moteurs de recherche compris ; R12 la remplacera quand le public existera.
    expect(
      screen.getByText('Rien n’est visible sans compte, ni trouvé par un moteur de recherche.'),
    ).toBeTruthy()
    expect(
      screen.queryByText(
        'Les projets et les profils ne sont visibles que par les membres connectés.',
      ),
    ).toBeNull()
  })

  it('welcomes the visitor in English when that is their language', async () => {
    await renderWithI18n(<HomeScreen />, 'en')

    expect(screen.getByRole('header', { name: `Welcome to ${appName}` })).toBeTruthy()
  })

  it('lets the visitor switch language', async () => {
    await renderWithI18n(<HomeScreen />)

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))

    expect(screen.getByRole('header', { name: `Welcome to ${appName}` })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'English', checked: true })).toBeTruthy()
  })

  it('loads no feed for a visitor', async () => {
    await renderWithI18n(<HomeScreen />)

    // Les fils sont réservés aux membres : pas même une demande sans session.
    expect(useFollowingFeed).not.toHaveBeenCalled()
    expect(useDiscoverFeed).not.toHaveBeenCalled()
    // R4 : ni date de lecture du fil, ni proches à suivre.
    expect(useMarkFeedRead).not.toHaveBeenCalled()
    expect(useSuggestions).not.toHaveBeenCalled()
  })

  it('invites a visitor to create an account or sign in', async () => {
    await renderWithI18n(<HomeScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Créer un compte' }))
    await fireEvent.press(screen.getByRole('button', { name: 'J’ai déjà un compte' }))

    expect(mockPush).toHaveBeenNthCalledWith(1, '/sign-up')
    expect(mockPush).toHaveBeenNthCalledWith(2, '/sign-in')
  })

  // R3 (F-Nav6, F-Nav8, F-Nav10) : le salut, la rangée de raccourcis (« Publier », « Mes projets »,
  // « Réglages ») et le choix « Abonnements / Découvrir » ont quitté l'accueil : la barre d'onglets
  // et la barre du haut les remplacent (TabBar.test.tsx, TopNav.test.tsx), Découvrir devient
  // l'onglet Explorer (ExploreScreen.test.tsx). Les anciens tests de ces raccourcis sont retirés.
})

// --- Tranche R2 : l'accueil d'un visiteur, redessiné ---
// Ce que Jest ne mesure pas : la feuille claire (430 de large sur ordinateur) et le second bouton
// en verre sont des styles, l'affaire des captures et de la relecture de design.

describe('the visitor home after the redesign (R2)', () => {
  it('offers « Créer un compte » first, then « J’ai déjà un compte », in that order', async () => {
    await renderWithI18n(<HomeScreen />)

    const buttons = screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)
    const create = buttons.indexOf(fr.t(($) => $.home.signUp))
    const signIn = buttons.indexOf(fr.t(($) => $.home.haveAccount))
    expect(create).toBeGreaterThanOrEqual(0)
    expect(signIn).toBe(create + 1)
  })

  it('says the privacy sentence of decision D2, in English too', async () => {
    await renderWithI18n(<HomeScreen />, 'en')

    expect(screen.getByText(createI18n('en').t(($) => $.home.membersOnly))).toBeTruthy()
  })

  it('announces « Voir le code » as a link to an external site', async () => {
    await renderWithI18n(<HomeScreen />)

    const link = screen.getByRole('link', { name: containing(fr.t(($) => $.home.seeCode)) })
    const external = fr.t(($) => $.common.externalSite)
    const props = link.props as Record<string, unknown>
    expect(
      [props.accessibilityHint, props['aria-description'], props.accessibilityLabel].some(
        (value) => typeof value === 'string' && value.includes(external),
      ),
    ).toBe(true)
  })

  it('shows the same welcome, both buttons and the language choice on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithI18n(<HomeScreen />)

      expect(screen.getByRole('header', { name: `Bienvenue sur ${appName}` })).toBeTruthy()
      expect(screen.getByRole('button', { name: fr.t(($) => $.home.signUp) })).toBeTruthy()
      expect(screen.getByRole('button', { name: fr.t(($) => $.home.haveAccount) })).toBeTruthy()
      expect(screen.getByRole('radio', { name: 'English' })).toBeTruthy()
      expect(screen.getByText(fr.t(($) => $.home.membersOnly))).toBeTruthy()
    } finally {
      restore()
    }
  })
})

describe('the home screen when the session cannot be read', () => {
  // Relecture de l'interface (PR #62) : un 429 ou une panne de la lecture de session montrait
  // l'accueil des visiteurs (« Créer un compte », « J'ai déjà un compte ») à un membre connecté.
  const failSessionRead = () => {
    const refetch = jest.fn().mockResolvedValue(undefined)
    jest.mocked(useSession).mockReturnValue({
      data: null,
      isPending: false,
      error: { status: 429, statusText: 'Too Many Requests' },
      refetch,
    } as unknown as ReturnType<typeof useSession>)
    return refetch
  }

  it('offers to retry, not to sign in or sign up', async () => {
    const refetch = failSessionRead()
    await renderWithI18n(<HomeScreen />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.states.errorTitle) })).toBeTruthy()
    expect(screen.queryByRole('button', { name: fr.t(($) => $.home.haveAccount) })).toBeNull()
    expect(screen.queryByRole('button', { name: fr.t(($) => $.home.signUp) })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.retry) }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('has no « Retour » button, which would lead back to this same page', async () => {
    failSessionRead()
    await renderWithI18n(<HomeScreen />)

    expect(screen.queryByRole('button', { name: fr.t(($) => $.states.back) })).toBeNull()
  })

  it('still shows the visitor home while the session is being read (the pre-rendered page)', async () => {
    mockSession(null, true)
    await renderWithI18n(<HomeScreen />)

    expect(screen.getByRole('button', { name: fr.t(($) => $.home.signUp) })).toBeTruthy()
  })
})
