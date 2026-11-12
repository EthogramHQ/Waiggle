// Ce que montre « Ton retour » (corrections après les relectures de R7b, correction 5 et design) :
// les icônes de « Ça a marché ? » ont la couleur de leur issue, comme la planche R7b-Feuille-Retour
// (la coche verte, le demi-cercle ambre, la croix rouge), et la capture est « facultative », au
// féminin.
import { palettes } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import Svg from 'react-native-svg'
import { clearAllDrafts } from '../testers/drafts'
import { passTapGuard } from '../testing/dialog'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { FeedbackSheet } from './FeedbackSheet'
import {
  cornerPath,
  id,
  ines,
  mockServer,
  outcomeName,
  project,
  resetCornerMocks,
  T,
  testerCorner,
} from './TestersCorner.testkit'

const kit = () => require('./TestersCorner.testkit') as typeof import('./TestersCorner.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({
  request: (...args: unknown[]) =>
    (kit().mockClient.request as (...a: unknown[]) => unknown)(...args),
  requestWithoutBody: (...args: unknown[]) =>
    (kit().mockClient.requestWithoutBody as (...a: unknown[]) => unknown)(...args),
  apiFetch: jest.fn(),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../media/pick', () => kit().mockMediaPick())
jest.mock('expo-router', () => kit().mockExpoRouter())

beforeEach(() => {
  resetCornerMocks(`${cornerPath}/new-feedback`)
  clearAllDrafts()
  mockSession({ user: { id: ines.id, name: ines.name } })
  mockServer.corner = testerCorner
  mockServer.project = { ...project, isMine: false, isTester: true, testerCount: null }
  mockServer.setThread(ines.id, [])
})

type Node = {
  type: unknown
  props: Record<string, unknown>
  children: ReadonlyArray<Node | string>
}
const allNodes = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : allNodes(child))),
]
const fillsUnder = (root: unknown): string[] =>
  allNodes(root as Node)
    .filter((node) => typeof node.type === 'string' && /^RNSVGSvg/.test(node.type))
    .map((svg) => JSON.stringify(svg.props.fill ?? null))

/** Le remplissage, tel que l'élément natif le reçoit, d'un dessin témoin de cette couleur. */
const witness = async (color: string) => {
  const view = await renderWithProviders(<Svg width={1} height={1} fill={color} />)
  const [fill] = fillsUnder(screen.root)
  await view.unmount()
  return fill
}

const openSheet = async () => {
  await renderWithProviders(
    <ToastProvider>
      <FeedbackSheet id={id} />
    </ToastProvider>,
  )
  await screen.findByLabelText(T.outcome)
  await passTapGuard()
}

describe('the look of « Ton retour »', () => {
  it('colours the icons of « Oui », « En partie » and « Non » by their outcome', async () => {
    const colours = {
      yes: await witness(palettes.day.outcomeYesIcon),
      partly: await witness(palettes.day.outcomePartlyIcon),
      no: await witness(palettes.day.outcomeNoIcon),
    }
    await openSheet()

    for (const outcome of ['yes', 'partly', 'no'] as const)
      expect(fillsUnder(screen.getByRole('radio', { name: outcomeName(outcome) }))).toEqual([
        colours[outcome],
      ])
  })

  it('says the capture is « facultative », in the feminine', async () => {
    await openSheet()

    expect(screen.getByText(fr.t(($) => $.project.testers.feedback.capture))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.project.testers.calls.optional))).toBeTruthy()
    expect(fr.t(($) => $.project.testers.calls.optional)).toBe('facultative')
  })
})
