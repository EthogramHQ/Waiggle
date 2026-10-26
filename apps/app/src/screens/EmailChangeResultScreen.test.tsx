// Tests des pages où mènent les deux liens d'un changement d'adresse (tranche « adresse ») :
// /email-change/confirmed (après le lien envoyé à l'ancienne adresse) et /email-change/done (après
// celui envoyé à la nouvelle). Une seule page, EmailChangeResultScreen, avec `step`.
// Scénario : docs/scenarios/phase-1.md, dernière section. Le second lien ne connecte personne : la
// page « done » parle à un membre connecté ou non. Un lien refusé arrive avec `?error=…`.
import type { Translation } from '@ruche/i18n'
import { fireEvent, screen } from '@testing-library/react-native'
import { useLocalSearchParams } from 'expo-router'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { pathOf, visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { useHydrated } from '../ui/theme/hydration'
import { EmailChangeResultScreen } from './EmailChangeResultScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// La barre du haut et les états partagés lisent le profil : on le remplace aussi.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// La page lit `error` dans l'adresse, inconnue du pré-rendu web : elle attend l'hydratation (voir
// ui/theme/hydration.ts). Chaque test choisit si la page est hydratée (oui, par défaut).
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: jest.fn(),
}))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
const mockDismissTo = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/email-change/done',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    dismissTo: mockDismissTo,
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: jest.fn(),
}))

// Les textes des deux pages, tirés des traductions françaises (les mêmes que l'écran).
const text = (key: keyof Translation['account']['emailChange'], params?: Record<string, string>) =>
  fr.t(($) => $.account.emailChange[key], params)
/** Combien de fois ce texte se lit à l'écran (où qu'il soit, découpé ou non). */
const seen = (sentence: string) => screen.queryAllByText(containing(sentence)).length

const newEmail = 'lea.moreau@exemple.fr' // la nouvelle adresse, celle que donne la session
/** Toutes les adresses demandées aux faux routeurs, en chemins (« /sign-in?next=… »). */
const destinations = () =>
  [mockPush, mockReplace, mockNavigate, mockDismissTo].flatMap((mock) =>
    mock.mock.calls.map(([href]) => pathOf(href)),
  )

/** Ouvre la page d'une étape, avec ces paramètres d'adresse (aucun par défaut). */
const open = (step: 'confirmed' | 'done', params: Record<string, string | string[]> = {}) => {
  jest.mocked(useLocalSearchParams).mockReturnValue(params)
  return renderWithProviders(<EmailChangeResultScreen step={step} />)
}

beforeEach(() => {
  // Le lien est souvent ouvert ailleurs (la boîte mail d'un ordinateur) : personne de connecté par
  // défaut. Les tests « connecté » posent la session de Léa, déjà à sa nouvelle adresse.
  mockSession(null)
  jest
    .mocked(getMe)
    .mockReset()
    .mockResolvedValue({ ...leaMe, email: newEmail })
  jest.mocked(useHydrated).mockReset().mockReturnValue(true)
  for (const mock of [mockPush, mockReplace, mockNavigate, mockDismissTo]) mock.mockReset()
})

describe('after the first link (confirmed)', () => {
  it('says a second link left for the new address, if it can be used', async () => {
    await open('confirmed')

    expect(screen.getByRole('header', { name: text('confirmedTitle') })).toBeTruthy()
    expect(seen(text('confirmedBody'))).toBeGreaterThan(0)
    // « Aucun lien ne part si l'adresse est déjà celle d'un autre compte » : la même page pour tous.
    expect(seen(text('confirmedNone'))).toBeGreaterThan(0)
  })

  it('says the same to a member signed in on this device', async () => {
    mockSession({ user: { name: 'Léa', email: 'lea@example.com' } })
    await open('confirmed')

    expect(screen.getByRole('header', { name: text('confirmedTitle') })).toBeTruthy()
    expect(seen(text('confirmedBody'))).toBeGreaterThan(0)
  })
})

describe('after the second link (done), signed in', () => {
  beforeEach(() => {
    mockSession({ user: { name: 'Léa', email: newEmail } })
  })

  it('says the address changed, gives it from the session, and keeps the other devices', async () => {
    await open('done')

    expect(screen.getByRole('header', { name: text('doneTitle') })).toBeTruthy()
    expect(seen(text('doneBody', { email: newEmail }))).toBeGreaterThan(0)
    expect(seen(text('doneDevices'))).toBeGreaterThan(0)
    // Une personne connectée n'a pas à se reconnecter.
    expect(seen(text('doneSignedOut'))).toBe(0)
  })

  it('leads to my account', async () => {
    await open('done')

    await fireEvent.press(screen.getByRole('button', { name: text('toAccount') }))
    expect(destinations()).toContain('/account')
  })

  it('never shows an address slipped into the link', async () => {
    // « Aucune adresse n'est écrite dans l'adresse (URL) d'une page » : celle de la session seule.
    await open('done', { email: 'pirate@exemple.com' })

    expect(screen.queryByText(/pirate@exemple\.com/)).toBeNull()
    expect(seen(text('doneBody', { email: newEmail }))).toBeGreaterThan(0)
  })
})

describe('after the second link (done), signed out', () => {
  it('invites to sign in with the new address, and keeps the other devices', async () => {
    // Le second lien ne connecte personne (scénario) : la page invite à se connecter.
    await open('done')

    expect(screen.getByRole('header', { name: text('doneTitle') })).toBeTruthy()
    expect(seen(text('doneSignedOut'))).toBeGreaterThan(0)
    expect(seen(text('doneDevices'))).toBeGreaterThan(0)
    // Sans session, la page ne connaît pas la nouvelle adresse, et ne la montre pas.
    expect(screen.queryByText(containing(newEmail))).toBeNull()
  })

  it('leads to the sign-in page', async () => {
    await open('done')

    await fireEvent.press(screen.getByRole('button', { name: text('signIn') }))
    expect(destinations().some((path) => path.startsWith('/sign-in'))).toBe(true)
  })

  it('waits for the session before saying whether to sign in', async () => {
    // Session en cours de lecture : ni « Connecte-toi… », ni l'adresse, le temps de savoir.
    mockSession(null, true)
    await open('done')

    expect(seen(text('doneSignedOut'))).toBe(0)
    expect(screen.queryByRole('button', { name: text('signIn') })).toBeNull()
  })

  it('shows the loading state while the session is read, not half a page', async () => {
    // Relecture de design (des-7) : le titre puis l'adresse et le bouton arrivaient en deux fois,
    // et la page bougeait de 70 pt sous le doigt.
    mockSession(null, true)
    await open('done')

    expect(seen(text('doneTitle'))).toBe(0)
    expect(seen(text('doneDevices'))).toBe(0)
    expect(screen.getAllByText(fr.t(($) => $.common.loading)).length).toBeGreaterThan(0)
  })
})

describe('a link that no longer works (?error=…)', () => {
  it.each(['confirmed', 'done'] as const)(
    'says so on the %s page, whatever the code',
    async (step) => {
      await open(step, { error: 'INVALID_TOKEN' })

      expect(screen.getByRole('header', { name: text('errorTitle') })).toBeTruthy()
      expect(seen(text('errorBody'))).toBeGreaterThan(0)
      // Rien de la réussite : ni « Plus qu'une étape », ni « Adresse changée ».
      expect(seen(text('confirmedTitle'))).toBe(0)
      expect(seen(text('doneTitle'))).toBe(0)
    },
  )

  it('says so for a code it does not know, even repeated in the address', async () => {
    mockSession({ user: { name: 'Léa', email: newEmail } })
    await open('done', { error: ['n_importe_quoi', 'autre'] })

    expect(screen.getByRole('header', { name: text('errorTitle') })).toBeTruthy()
    // Le code n'est jamais montré tel quel.
    expect(screen.queryByText(/n_importe_quoi/)).toBeNull()
    expect(seen(text('doneTitle'))).toBe(0)
  })

  it('offers to start again from my account', async () => {
    await open('confirmed', { error: 'TOKEN_EXPIRED' })

    await fireEvent.press(screen.getByRole('button', { name: text('restart') }))
    expect(destinations()).toContain('/account')
  })

  it('reads the error only once the page is hydrated', async () => {
    // Le pré-rendu web ne connaît pas l'adresse : avant l'hydratation, la page ne peut pas encore
    // dire que le lien est refusé (règle Web de CONTRIBUTING.md). Le test suivant est son témoin.
    jest.mocked(useHydrated).mockReturnValue(false)
    await open('done', { error: 'INVALID_TOKEN' })

    expect(seen(text('errorTitle'))).toBe(0)
  })

  it('shows the error once hydrated (witness of the previous test)', async () => {
    await open('done', { error: 'INVALID_TOKEN' })

    expect(seen(text('errorTitle'))).toBeGreaterThan(0)
    expect(visited(mockPush, mockReplace)).toEqual([])
  })
})
