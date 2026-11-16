// Tests de la garde des règles (tranche R11, « La conformité ») : tant qu'un membre connecté n'a pas
// accepté la version en vigueur (`me.rulesAccepted` faux), l'écran « Accepter » passe au-dessus de
// toute page. Restent ouvertes, comparées exactement (sans `?…`, `#…` ni barre finale) : les quatre
// pages légales, `/unsubscribe`, `/settings/notifications`, `/settings/account/delete`, `/out`, et,
// selon la décision D1 de la relecture du plan, « Mes commentaires » et « Mes retours envoyés »
// (`/settings/data/comments`, `/settings/data/feedback`) ; `/settings/data` elle-même est gardée.
// Un lien reçu reste dessous : une fois les règles acceptées, la page demandée est là.
//
// L'API attendue de `rules/RulesGate` (plan de R11, « API des modules partagés », relecture U-B1 et
// U1) : sans props ; lit la session et `useMe()` ; une couche modale (`Modal`) que ni Échap ni le
// Retour d'Android ne ferment ; rien avant `useHydrated()`. L'écran qu'elle montre est
// `screens/AcceptRulesScreen`, dont le titre est « Les règles de Waiggle ».
import type { Me } from '@ruche/contracts'
import { act, screen, waitFor } from '@testing-library/react-native'
import { getMe } from '../profile/api'
import { meQueryKey } from '../profile/hooks'
import { ProvisionalNameGate } from '../profile/ProvisionalNameGate'
import { leaMe } from '../testing/fixtures'
import { pathOf, visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { useAcceptRules } from './api'
import { RulesGate } from './RulesGate'

jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  downloadMyData: jest.fn(),
  signOut: jest.fn(),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('./api', () => ({ useAcceptRules: jest.fn() }))
// La page est-elle hydratée (web) ? Vrai par défaut, comme sur téléphone ; un test la passe à faux.
let mockHydrated = true
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: () => mockHydrated,
}))
let mockPathname = '/'
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    dismissTo: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

// Les éléments rendus, pour retrouver la couche modale par sa propriété (comme DeleteProjectDialog.test.tsx).
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** Inès, inscrite avant R11 : elle n'a encore accepté aucune version des règles. */
const ines: Me = { ...leaMe, id: 'u7', name: 'Inès', handle: 'ines', rulesAccepted: false }

const title = fr.t(($) => $.legal.pages.rules.title)
const rulesShown = () => screen.queryByRole('header', { name: title }) !== null

/** Affiche la garde sur cette adresse, et attend que le profil soit lu. */
const showAt = async (pathname: string, me: Me = ines) => {
  mockPathname = pathname
  jest.mocked(getMe).mockResolvedValue(me)
  const view = await renderWithProviders(<RulesGate />)
  await waitFor(() => expect(getMe).toHaveBeenCalled())
  return view
}

/** Les adresses ouvertes, chacune vérifiée sur un rendu neuf. */
const expectOpen = async (pathname: string) => {
  const view = await showAt(pathname)
  // Témoin : le profil (non accepté) est arrivé dans le cache.
  await waitFor(() => expect(view.queryClient.getQueryData(meQueryKey)).toBeTruthy())
  expect({ pathname, gated: rulesShown() }).toEqual({ pathname, gated: false })
  // Avec RNTL 14, démonter est asynchrone : sans `await`, le rendu suivant chevauche son `act`.
  await view.unmount()
}
const expectGated = async (pathname: string) => {
  const view = await showAt(pathname)
  expect(await screen.findByRole('header', { name: title })).toBeTruthy()
  await view.unmount()
}

beforeEach(() => {
  mockPathname = '/'
  mockHydrated = true
  mockPush.mockReset()
  mockReplace.mockReset()
  mockNavigate.mockReset()
  mockSession({ user: { id: ines.id, name: ines.name } })
  jest.mocked(getMe).mockReset()
  jest.mocked(useAcceptRules).mockReturnValue({ accept: jest.fn(), busy: false })
})

describe('RulesGate (R11)', () => {
  it('opens the rules screen before any other page for a member who has not accepted', async () => {
    await expectGated('/')
    await expectGated('/explore')
    await expectGated('/settings')
  })

  it('shows nothing to a member who has accepted the current rules', async () => {
    const view = await showAt('/', leaMe)

    await waitFor(() => expect(view.queryClient.getQueryData(meQueryKey)).toBeTruthy())
    expect(rulesShown()).toBe(false)
  })

  it('shows nothing to a visitor, and reads no profile', async () => {
    mockSession(null)
    mockPathname = '/'
    // Un profil non accepté attendrait : sans session, il n'est même pas demandé.
    jest.mocked(getMe).mockResolvedValue(ines)
    await renderWithProviders(<RulesGate />)

    expect(rulesShown()).toBe(false)
    expect(getMe).not.toHaveBeenCalled()
  })

  it('leaves the four legal pages open', async () => {
    for (const page of ['/rules', '/privacy', '/legal', '/accessibility']) await expectOpen(page)
  })

  it('leaves the unsubscribe page open to a member who has not accepted the rules', async () => {
    await expectOpen('/unsubscribe')
  })

  it('leaves the e-mail settings, the account deletion and the warning page open', async () => {
    for (const page of ['/settings/notifications', '/settings/account/delete', '/out']) {
      await expectOpen(page)
    }
  })

  // Décision D1 de la relecture du plan : on peut retirer un commentaire ou un retour sans accepter.
  it('leaves my comments and my sent feedback open', async () => {
    await expectOpen('/settings/data/comments')
    await expectOpen('/settings/data/feedback')
  })

  it('leaves /rules/ and /rules?from=sign-up open', async () => {
    await expectOpen('/rules/')
    await expectOpen('/rules?from=sign-up')
  })

  // R12 : les pages légales ont aussi une adresse par langue (`/fr/rules`, `/en/privacy`…).
  it('leaves the four legal pages open at their address in each language', async () => {
    for (const page of ['rules', 'privacy', 'legal', 'accessibility']) {
      await expectOpen(`/fr/${page}`)
      await expectOpen(`/en/${page}`)
    }
  })

  it('gates the other public pages, and a language it does not know', async () => {
    await expectGated('/fr/')
    await expectGated('/en/projects/6f1c2a8e-3b4d-4c5e-9f60-7a8b9c0d1e2f')
    await expectGated('/de/rules')
  })

  it('gates /rulesx and /settings/data', async () => {
    await expectGated('/rulesx')
    await expectGated('/settings/data')
    await expectGated('/settings/data/commentsx')
  })

  it('renders nothing before hydration', async () => {
    mockHydrated = false
    const view = await showAt('/')
    await waitFor(() => expect(view.queryClient.getQueryData(meQueryKey)).toBeTruthy())
    expect(rulesShown()).toBe(false)

    // Témoin : une fois la page hydratée, l'écran paraît.
    mockHydrated = true
    await view.rerender(<RulesGate />)
    expect(await screen.findByRole('header', { name: title })).toBeTruthy()
  })

  it('keeps the rules screen open on Escape', async () => {
    await showAt('/')
    await screen.findByRole('header', { name: title })

    // Échap (web) et le Retour d'Android passent par `onRequestClose` de la couche modale.
    const layer = hostsOf(screen.root as unknown as Host).find(
      (node) => typeof node.props.onRequestClose === 'function',
    )
    if (!layer) throw new Error('no Modal layer')
    const { onRequestClose } = layer.props as Record<string, () => void>
    await act(async () => onRequestClose?.())

    expect(screen.getByRole('header', { name: title })).toBeTruthy()
  })

  it('leaves the requested page underneath, and shows it once the rules are accepted', async () => {
    const view = await showAt('/projects/p1')
    await screen.findByRole('header', { name: title })

    await act(async () =>
      view.queryClient.setQueryData(meQueryKey, { ...ines, rulesAccepted: true }),
    )

    expect(rulesShown()).toBe(false)
    // La garde n'a déplacé personne : le lien reçu est toujours la page ouverte.
    expect(visited(mockPush, mockReplace, mockNavigate).map(pathOf)).toEqual([])
  })

  it('does not open the provisional handle sheet before the rules are accepted', async () => {
    const handleRemoved: Me = {
      ...ines,
      handle: 'membre_4f2a',
      provisional: { name: false, handle: true },
    }
    const handleTitle = fr.t(($) => $.profile.provisional.handleTitle)
    mockPathname = '/'
    jest.mocked(getMe).mockResolvedValue(handleRemoved)
    const view = await renderWithProviders(
      <>
        <RulesGate />
        <ProvisionalNameGate />
      </>,
    )
    await screen.findByRole('header', { name: title })
    expect(screen.queryByRole('header', { name: handleTitle })).toBeNull()

    // Les règles acceptées, la feuille du pseudo provisoire peut s'ouvrir.
    await act(async () =>
      view.queryClient.setQueryData(meQueryKey, { ...handleRemoved, rulesAccepted: true }),
    )
    expect(await screen.findByRole('header', { name: handleTitle })).toBeTruthy()
  })
})
