// Tests de la place déclarée sous condition (R16, plan, choix 3 : « la réserve vaut partout ») : une
// barre qui ne rend sa capsule qu'à un membre (`TopNav`) déclare sa place avec une condition
// (`declareTopBarReserve(Bar, () => …)`). La bande ne la pose qu'une fois la page hydratée, sur
// écran large, et si la condition tient : la page pré-rendue ne connaît pas la condition (un cookie),
// et sur téléphone la capsule n'existe pas. Screen, lui, ne la voit jamais au premier rendu
// (`declaresTopBarReserve` reste faux), sinon la page hydratée différerait du HTML préparé.
import { layout } from '@ruche/brand'
import { View } from 'react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import {
  declaresTopBarReserve,
  declareTopBarReserve,
  forgetTopBarSpace,
  ScreenTopBar,
} from './ScreenTopBar'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// La page est-elle hydratée ? Le préfixe `mock` permet à Jest de lire la variable dans le faux module.
let mockHydrated = true
jest.mock('./theme/hydration', () => ({
  ...jest.requireActual('./theme/hydration'),
  useHydrated: () => mockHydrated,
}))

// La condition de la barre du test : un membre probable, ou non.
let likelyMember = true
function MemberBar() {
  return <View />
}
declareTopBarReserve(MemberBar, () => likelyMember)
function PlainBar() {
  return <View />
}

const stage = (bar: React.ReactNode, onSpace: jest.Mock) => (
  <ScreenTopBar onSpace={onSpace}>{bar}</ScreenTopBar>
)

let restoreWindow: () => void = () => {}
beforeEach(() => {
  forgetTopBarSpace()
  mockHydrated = true
  likelyMember = true
  restoreWindow = setDesktopWindow()
})
afterEach(() => restoreWindow())

describe('a top bar that declares its place under a condition (R16)', () => {
  it('reserves the place of the bar before any measure once the page has hydrated, on a wide screen', async () => {
    const onSpace = jest.fn()
    await renderWithProviders(stage(<MemberBar />, onSpace))

    expect(onSpace.mock.calls[0]?.[0]).toMatchObject({ height: layout.topBarHeight.regular })
  })

  it('reserves nothing when the condition does not hold', async () => {
    likelyMember = false
    const onSpace = jest.fn()
    await renderWithProviders(stage(<MemberBar />, onSpace))

    expect(onSpace.mock.calls[0]?.[0]).toMatchObject({ height: 0 })
  })

  it('reserves nothing before the page hydrates, like the prerendered page', async () => {
    mockHydrated = false
    const onSpace = jest.fn()
    await renderWithProviders(stage(<MemberBar />, onSpace))

    expect(onSpace.mock.calls.every(([space]) => space.height === 0)).toBe(true)
  })

  it('reserves nothing on a phone, where the capsule never shows', async () => {
    restoreWindow()
    restoreWindow = () => {}
    const onSpace = jest.fn()
    await renderWithProviders(stage(<MemberBar />, onSpace))

    expect(onSpace.mock.calls[0]?.[0]).toMatchObject({ height: 0 })
  })

  it('reserves nothing for a bar that declared nothing (témoin)', async () => {
    const onSpace = jest.fn()
    await renderWithProviders(stage(<PlainBar />, onSpace))

    expect(onSpace.mock.calls[0]?.[0]).toMatchObject({ height: 0 })
  })

  it('leaves the screen unaware of a condition at its first render', () => {
    // Screen lit `declaresTopBarReserve` dès le pré-rendu : une condition ne doit pas y entrer.
    expect(declaresTopBarReserve(<MemberBar />)).toBe(false)
  })
})
