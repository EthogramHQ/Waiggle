// Tests de la garde de session dans deux cas de R16 qui n'étaient pas couverts (scénario « Les
// squelettes » : « même attente, même renvoi vers la connexion qu'aujourd'hui, même page quand la
// session ne se vérifie pas ») :
// - une feuille (la mise à jour, les retours, l'appel aux testeurs) montrait avant R16 l'erreur de
//   session dans la feuille ; la garde la laisse faire par sa prop `error`, une fonction qui reçoit
//   « Réessayer » (la relecture de la session), comme `signedOut` pour le visiteur ;
// - quand la garde passe la main à un écran qui attend encore ses données, la page vide reste à
//   l'écran sans disparaître un instant (le second `Loading` continue le premier, ui/Skeleton.tsx).
import { durations } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { getAnimatedStyle } from 'react-native-reanimated'
import { useUnreadCount } from '../notifications/api'
import { LoadingScreen } from '../screens/states'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Button } from '../ui/Button'
import { Text } from '../ui/Text'
import { useSession } from './api'
import { SessionGate } from './SessionGate'

jest.mock('./api', () => ({ useSession: jest.fn() }))
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre du haut des pages d'état lit le profil et les notifications : ils n'arrivent jamais.
jest.mock('../profile/api', () => ({ getMe: jest.fn(() => new Promise(() => {})) }))
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/p1/update',
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useIsFocused: () => true,
  useRoute: () => ({ key: 'gate', name: 'gate' }),
}))

const t = fr.t
const SHEET_RETRY = 'Réessayer dans la feuille'
const ines = { user: { id: 'u5', name: 'Inès' } }

/** La session telle que Better Auth la rend quand sa lecture échoue (statut HTTP). */
const mockSessionError = (status: number) => {
  const refetch = jest.fn().mockResolvedValue(undefined)
  jest.mocked(useSession).mockReturnValue({
    data: null,
    isPending: false,
    error: { status },
    refetch,
  } as unknown as ReturnType<typeof useSession>)
  return { refetch }
}

/** La feuille gardée : son erreur à elle, et son contenu une fois la session lue. */
const sheetGate = () => (
  <SessionGate
    loading={<Text>La feuille vide</Text>}
    signedOut={null}
    error={(retry) => <Button label={SHEET_RETRY} onPress={retry} />}
  >
    {() => <Text>La feuille remplie</Text>}
  </SessionGate>
)

type Node = { parent: Node | null; props: Record<string, unknown> }
const ownOpacity = (node: Node): number => {
  const fixed = StyleSheet.flatten(node.props.style as never) as { opacity?: number } | undefined
  const animated = node.props.jestAnimatedStyle
    ? (getAnimatedStyle(node as never) as { opacity?: number }).opacity
    : undefined
  return Number(animated ?? fixed?.opacity ?? 1)
}
/** L'opacité vue d'un élément : le produit de la sienne et de celles de tous ses ancêtres. */
const seenOpacity = (element: unknown): number => {
  let opacity = 1
  for (let node = element as Node | null; node; node = node.parent) opacity *= ownOpacity(node)
  return opacity
}
const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  jest.mocked(useUnreadCount).mockReturnValue(0)
})

describe('SessionGate, for a sheet whose session cannot be read (R16)', () => {
  it('shows the error the sheet gives, whose retry reads the session again', async () => {
    const { refetch } = mockSessionError(500)
    await renderWithProviders(sheetGate())

    await fireEvent.press(screen.getByRole('button', { name: SHEET_RETRY }))
    expect(refetch).toHaveBeenCalledTimes(1)
    // Pas la page d'erreur de la garde, sur toute la fenêtre.
    expect(screen.queryByRole('header', { name: t(($) => $.states.errorTitle) })).toBeNull()
    expect(screen.queryByRole('button', { name: t(($) => $.common.retry) })).toBeNull()
    expect(screen.queryByText('La feuille remplie')).toBeNull()
  })

  it('treats a refused session (401) as a visitor, not as an error of the sheet', async () => {
    mockSessionError(401)
    await renderWithProviders(sheetGate())

    expect(screen.queryByRole('button', { name: SHEET_RETRY })).toBeNull()
  })

  it('keeps its own error page when the screen gives none', async () => {
    // Témoin : sans `error`, la page « Réessayer » de la garde, comme avant.
    mockSessionError(500)
    await renderWithProviders(
      <SessionGate loading={<Text>La page vide</Text>}>{() => <Text>La page</Text>}</SessionGate>,
    )

    expect(screen.getByRole('header', { name: t(($) => $.states.errorTitle) })).toBeTruthy()
    expect(screen.getByRole('button', { name: t(($) => $.common.retry) })).toBeTruthy()
  })
})

/** Un écran qui attend encore ses données quand la garde lui passe la main (réglages, ruche…). */
function StillLoading() {
  return <LoadingScreen shape="list" width="form" />
}
const pageGate = () => (
  <SessionGate loading={<LoadingScreen shape="list" width="form" />}>
    {() => <StillLoading />}
  </SessionGate>
)

describe('SessionGate, handing over to a screen that still loads (R16)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('keeps the empty page on screen, without hiding it again for 160 ms', async () => {
    mockSession(null, true)
    const view = await renderWithProviders(pageGate())
    await wait(durations.quick + durations.page + 100)
    const name = { name: t(($) => $.common.loading) }
    expect(screen.getByRole('progressbar', name)).toBeTruthy() // témoin : l'attente de la garde

    // La session arrive : l'écran prend la place de la garde, et attend encore ses réglages.
    mockSession(ines)
    await view.rerender(pageGate())

    expect(screen.getByRole('progressbar', name)).toBeTruthy()
    expect(seenOpacity(screen.getByRole('progressbar', name))).toBe(1)
  })
})
