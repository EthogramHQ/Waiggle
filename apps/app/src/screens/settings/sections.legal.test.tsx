// Tests des liens que la tranche R11 ajoute aux rubriques des réglages (planche R11-Pied ;
// docs/scenarios/refonte.md, « R11 — La conformité », « Les liens vers les pages » et choix 7) :
// - « Mes données » mène à « Mes commentaires » et à « Mes retours envoyés », l'un sous l'autre ;
// - « À propos » montre les quatre pages (Règles, Confidentialité, Mentions légales, Accessibilité)
//   et le code source, en lignes (`ui/LegalLinks variant="rows"`).
//
// Ce que ces tests supposent de l'écran (plan de R11, UI-G) : `SettingsSection section="data"` a
// deux lignes-liens nommées `account.data.comments` et `account.data.feedback`, vers
// /settings/data/comments et /settings/data/feedback ; `section="about"` a les liens nommés
// `legal.links.*`, vers /rules, /privacy, /legal, /accessibility, puis « Le code source » par /out.
import { sourceUrl } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { downloadMyData } from '../../accounts/api'
import { request } from '../../api/client'
import { leaMe } from '../../testing/fixtures'
import { pathOf } from '../../testing/navigation'
import { mockSession, renderWithProviders } from '../../testing/render'
import { fr } from '../../testing/text'
import { SettingsSection } from './sections'

jest.mock('../../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../../accounts/api', () => ({
  useSession: jest.fn(),
  downloadMyData: jest.fn(),
  signOut: jest.fn(),
}))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/settings/data',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

const T = {
  comments: fr.t(($) => $.account.data.comments),
  feedback: fr.t(($) => $.account.data.feedback),
  exportRow: fr.t(($) => $.account.export.button),
  rules: fr.t(($) => $.legal.links.rules),
  privacy: fr.t(($) => $.legal.links.privacy),
  legal: fr.t(($) => $.legal.links.legal),
  accessibility: fr.t(($) => $.legal.links.accessibility),
  sourceCode: fr.t(($) => $.legal.links.sourceCode),
}

/** Une ligne-lien par son nom : un lien (vraie adresse), ou un bouton sur un téléphone. */
const entry = (name: string) =>
  screen.queryByRole('link', { name: new RegExp(`^${name}`) }) ??
  screen.getByRole('button', { name: new RegExp(`^${name}`) })
const paths = () =>
  [mockPush, mockReplace, mockNavigate].flatMap((mock) =>
    mock.mock.calls.map(([href]) => pathOf(href)),
  )

type TreeNode = { children: (TreeNode | string)[] }
const readingOrder = (...elements: unknown[]) => {
  const all: unknown[] = []
  const walk = (node: TreeNode) => {
    all.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as unknown as TreeNode)
  return elements.map((element) => all.indexOf(element))
}
const inOrder = (places: number[]) =>
  places.every((place) => place >= 0) &&
  places.every((place, i) => i === 0 || place > (places[i - 1] as number))

beforeEach(() => {
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async () => ({ ok: true, data: leaMe })) as unknown as typeof request)
  jest.mocked(downloadMyData).mockReset()
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  for (const mock of [mockPush, mockReplace, mockNavigate]) mock.mockReset()
})

describe('« Mes données » (R11)', () => {
  it('offers « Mes commentaires » and « Mes retours envoyés », one under the other', async () => {
    await renderWithProviders(<SettingsSection section="data" email="lea@example.com" />)

    expect(inOrder(readingOrder(entry(T.comments), entry(T.feedback)))).toBe(true)
    // « Télécharger mes données » reste.
    expect(screen.getByRole('button', { name: T.exportRow })).toBeTruthy()
  })

  it('leads to /settings/data/comments and /settings/data/feedback', async () => {
    await renderWithProviders(<SettingsSection section="data" email="lea@example.com" />)

    await fireEvent.press(entry(T.comments))
    await fireEvent.press(entry(T.feedback))

    expect(paths()).toEqual(['/settings/data/comments', '/settings/data/feedback'])
    // Rien n'est téléchargé en passant.
    expect(downloadMyData).not.toHaveBeenCalled()
  })
})

describe('« À propos » (R11)', () => {
  it('shows the four legal pages, then the source code, as rows in this order', async () => {
    await renderWithProviders(<SettingsSection section="about" email="lea@example.com" />)

    const rows = [T.rules, T.privacy, T.legal, T.accessibility, T.sourceCode].map(entry)
    expect(inOrder(readingOrder(...rows))).toBe(true)
  })

  it('opens each legal page at its own address, and the source code through the warning page', async () => {
    await renderWithProviders(<SettingsSection section="about" email="lea@example.com" />)

    for (const name of [T.rules, T.privacy, T.legal, T.accessibility, T.sourceCode]) {
      await fireEvent.press(entry(name))
    }

    const opened = paths()
    expect(opened.slice(0, 4)).toEqual(['/rules', '/privacy', '/legal', '/accessibility'])
    expect(opened[4]?.startsWith('/out')).toBe(true)
    expect(opened[4]).toContain(sourceUrl)
  })
})
