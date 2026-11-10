// Tests de la relecture R7a sur la feuille « Nouvelle mise à jour » (un faux serveur minimal) :
// - C1 (design) : une ligne de plus de 120 caractères n'est pas envoyée ; la feuille la marque
//   invalide (`aria-invalid`), dit `updates.lineTooLong` sur elle et lui donne le focus (avant :
//   l'API répondait 400 et la feuille disait « Réessaie ») ;
// - S3 (interface) : Échap, quand le menu des familles est ouvert, ne ferme que ce menu : la
//   feuille reste ouverte (aucun retour arrière demandé).
import { UPDATE_LINE_MAX } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Platform, TextInput } from 'react-native'
import type { ApiResult } from '../api/errors'
import { labelOf } from '../testing/arrivedFocus'
import { passTapGuard } from '../testing/dialog'
import { leaMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { UpdateSheet } from './UpdateSheet'

type Sent = { method: string; path: string }
const mockServer = {
  sent: [] as Sent[],
  async respond(path: string, init: RequestInit): Promise<ApiResult<unknown>> {
    const method = (init.method ?? 'GET').toUpperCase()
    this.sent.push({ method, path })
    if (method === 'GET' && path === '/v1/me') return { ok: true, data: leaMe }
    if (method === 'GET' && path === `/v1/projects/${recipesProject.id}`) {
      return { ok: true, data: recipesProject }
    }
    return { ok: false, error: 'validation' }
  },
}

const mockNav = {
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    dismiss: jest.fn(),
    dismissTo: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => true),
  },
  navigation: {
    addListener: jest.fn(() => () => {}),
    removeListener: jest.fn(),
    dispatch: jest.fn(),
    isFocused: () => true,
    setOptions: jest.fn(),
    canGoBack: () => true,
    getParent: () => undefined,
  },
  params: { id: recipesProject.id },
  pathname: `/projects/${recipesProject.id}/update`,
}

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({
  request: async (
    path: string,
    init: RequestInit,
    schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  ) => {
    const result = await mockServer.respond(path, init)
    if (!result.ok) return result
    const parsed = schema.safeParse(result.data)
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: 'internal' }
  },
  requestWithoutBody: async (path: string, init: RequestInit) => {
    const result = await mockServer.respond(path, init)
    return result.ok ? { ok: true, data: null } : result
  },
  apiFetch: jest.fn(),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('expo-router', () => ({
  useRouter: () => mockNav.router,
  usePathname: () => mockNav.pathname,
  useNavigation: () => mockNav.navigation,
  useLocalSearchParams: () => mockNav.params,
  useGlobalSearchParams: () => mockNav.params,
  useSegments: () => [],
  useFocusEffect: () => {},
  useIsFocused: () => true,
}))

beforeEach(() => {
  mockServer.sent = []
  for (const fn of Object.values(mockNav.router)) fn.mockClear()
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  // Le web : où `aria-invalid` se pose et où `menuitemradio` est le rôle des choix.
  jest.replaceProperty(Platform, 'OS', 'web')
})
afterEach(() => jest.restoreAllMocks())

const family = (code: 'new' | 'fixed' | 'polish') => fr.t(($) => $.update.family[code])
const lineName = (number: number, total: number) =>
  fr.t(($) => $.project.updates.lineLabel, { number, total, family: family('new') })
const TOO_LONG = fr.t(($) => $.project.updates.lineTooLong, { max: UPDATE_LINE_MAX })
const PUBLISH = fr.t(($) => $.project.updates.publish)
const posts = () => mockServer.sent.filter((one) => one.method === 'POST')

const openSheet = async () => {
  await renderWithProviders(
    <ToastProvider>
      <UpdateSheet id={recipesProject.id} />
    </ToastProvider>,
  )
  await screen.findByLabelText(fr.t(($) => $.project.updates.titleField))
  await passTapGuard()
}

describe('a line over the limit', () => {
  it('is not sent: the line says why, is marked invalid and takes the focus', async () => {
    await openSheet()
    await fireEvent.changeText(screen.getByLabelText(lineName(1, 1)), 'Un compte à rebours')
    await fireEvent.press(
      screen.getByRole('button', { name: fr.t(($) => $.project.updates.addLine) }),
    )
    await fireEvent.changeText(
      screen.getByLabelText(lineName(2, 2)),
      'a'.repeat(UPDATE_LINE_MAX + 10),
    )
    const focus = jest.spyOn(TextInput.prototype, 'focus')

    await fireEvent.press(screen.getByRole('button', { name: PUBLISH }))

    expect(posts()).toHaveLength(0)
    expect(screen.getAllByText(TOO_LONG, { includeHiddenElements: true }).length).toBeGreaterThan(0)
    // Sur la ligne fautive (la deuxième), pas sur la première.
    expect(screen.getByLabelText(lineName(2, 2)).props['aria-invalid']).toBe(true)
    expect(screen.getByLabelText(lineName(1, 2)).props['aria-invalid']).not.toBe(true)
    expect(focus.mock.contexts.map((field) => labelOf(field)).at(-1)).toBe(lineName(2, 2))
  })

  it('goes once the line is shortened', async () => {
    await openSheet()
    await fireEvent.changeText(
      screen.getByLabelText(lineName(1, 1)),
      'a'.repeat(UPDATE_LINE_MAX + 1),
    )
    await fireEvent.press(screen.getByRole('button', { name: PUBLISH }))
    expect(screen.getByLabelText(lineName(1, 1)).props['aria-invalid']).toBe(true)

    await fireEvent.changeText(screen.getByLabelText(lineName(1, 1)), 'a'.repeat(UPDATE_LINE_MAX))

    expect(screen.getByLabelText(lineName(1, 1)).props['aria-invalid']).not.toBe(true)
  })
})

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

describe('Échap with the menu of the families open', () => {
  it('closes only the menu: the sheet stays open', async () => {
    await openSheet()
    await fireEvent.press(screen.getByRole('button', { name: /^Famille\s:\sNouveau$/ }))
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)
    // La couche du menu : celle dont l'arbre porte les trois choix (le Modal de la feuille, lui, les
    // porte aussi dans l'arbre de Jest, mais le menu est la couche la plus profonde).
    const layers = hostsOf(screen.root as unknown as Host).filter(
      (node) =>
        typeof node.props.onRequestClose === 'function' &&
        hostsOf(node).some((inner) => inner.props.accessibilityLabel === family('fixed')),
    )
    const menu = layers.at(-1) as (Host & { props: { onRequestClose: () => void } }) | undefined
    if (!menu) throw new Error('no menu layer')

    await act(() => menu.props.onRequestClose())

    await waitFor(() => expect(screen.queryByRole('menuitemradio')).toBeNull())
    expect(
      screen.getByRole('header', { name: fr.t(($) => $.project.updates.sheetTitle) }),
    ).toBeTruthy()
    expect(screen.getByLabelText(lineName(1, 1))).toBeTruthy()
    // Aucun départ demandé (canGoBack et canDismiss ne sont que des questions).
    const { push, replace, navigate, back, dismiss, dismissTo } = mockNav.router
    for (const fn of [push, replace, navigate, back, dismiss, dismissTo]) {
      expect(fn).not.toHaveBeenCalled()
    }
  })
})
