// Tests des passages de page sur iOS et Android (R17, scénario « La carte qui devient la page » et
// « Réduire les animations » ; plan, option E) : la pile native glisse comme le veut le système pour
// avancer, mais les quatre onglets (Fil, Explorer, Ruches, Moi) se fondent l'un dans l'autre en
// 180 ms ; sous « Réduire les animations », toutes les pages se fondent ; les feuilles (Publier,
// Signaler…) gardent leur fenêtre transparente sans animation de la pile.
// (Chargé comme Jest, sur iOS ; mêmes faux que RootLayout.phone.test.tsx, et une pile qui garde les
// options de chacune de ses pages.)
import { durations } from '@ruche/brand'
import RootLayout from '../../app/_layout'
import { renderWithProviders } from '../testing/render'
import * as motion from '../ui/theme/motion'
import { sheetRoutes } from './sheetRoutes'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Ce que la pile et chacune de ses pages ont reçu.
const mockStack = jest.fn()
const mockScreen = jest.fn()
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  return {
    DefaultTheme: { dark: false, colors: {} },
    ThemeProvider: ({ children }: { children: unknown }) => children,
    Stack: Object.assign(
      (props: { children?: unknown }) => {
        mockStack(props)
        return createElement('Stack', null, props.children)
      },
      {
        Screen: (props: unknown) => {
          mockScreen(props)
          return null
        },
      },
    ),
  }
})
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))
jest.mock('../navigation/AppTabBar', () => ({ AppTabBar: () => null }))
jest.mock('../profile/LanguageSync', () => ({ LanguageSync: () => null }))
jest.mock('../profile/ProvisionalNameGate', () => ({ ProvisionalNameGate: () => null }))
jest.mock('../rules/RulesGate', () => ({ RulesGate: () => null }))
jest.mock('../accounts/memberMarker', () => ({ useMemberMarkerSync: () => {} }))
jest.mock('../navigation/chunks/preload', () => ({ EditorPreload: () => null }))
jest.mock('../ui/AmbientLight', () => ({ AmbientLight: () => null }))
// R20 : la Goutte des Éclaireuses a ses propres tests (scout/ScoutDrop.test.tsx).
jest.mock('../scout/ScoutDrop', () => ({ ScoutDrop: () => null }))
// R21 : le flux du temps réel a ses propres tests (live/connection.test.tsx).
jest.mock('../live/connection', () => ({ LiveConnection: () => null }))

type Options = Record<string, unknown>

/** Les options données à la page de ce nom (objet, ou fonction de la route). */
const optionsOf = (name: string): Options | undefined => {
  const call = [...mockScreen.mock.calls]
    .reverse()
    .find(([props]) => (props as { name?: string }).name === name)
  const options = (call?.[0] as { options?: unknown } | undefined)?.options
  return typeof options === 'function'
    ? (options as (route: object) => Options)({})
    : (options as Options)
}

/** Les options communes à toutes les pages de la pile (`screenOptions`). */
const stackOptions = (): Options => {
  const props = mockStack.mock.calls.at(-1)?.[0] as { screenOptions?: unknown } | undefined
  const options = props?.screenOptions
  return typeof options === 'function'
    ? (options as (route: object) => Options)({})
    : ((options ?? {}) as Options)
}

beforeEach(() => {
  mockStack.mockClear()
  mockScreen.mockClear()
})

afterEach(() => jest.restoreAllMocks())

describe('the page passages of the root stack on a phone', () => {
  it('cross-fades the four tabs in 180 ms', async () => {
    await renderWithProviders(<RootLayout />)

    for (const tab of ['feed', 'explore', 'hives', 'me']) {
      expect(optionsOf(tab)).toEqual(
        expect.objectContaining({ animation: 'fade', animationDuration: durations.page }),
      )
    }
  })

  it('keeps the native slide for the other pages (témoin)', async () => {
    await renderWithProviders(<RootLayout />)

    expect(stackOptions().animation).toBeUndefined()
  })

  it('cross-fades every page with reduced motion', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(true)
    await renderWithProviders(<RootLayout />)

    expect(stackOptions().animation).toBe('fade')
  })

  it('keeps the sheets as they are, with reduced motion too', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(true)
    await renderWithProviders(<RootLayout />)

    for (const sheet of sheetRoutes) {
      expect(optionsOf(sheet)).toEqual(
        expect.objectContaining({ presentation: 'transparentModal', animation: 'none' }),
      )
    }
  })
})
