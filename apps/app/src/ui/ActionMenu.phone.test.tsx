// Test de la relecture de l'interface R7a, C4 : un menu de choix (la pastille de famille d'une ligne
// de mise à jour) dit ses choix aux lecteurs d'écran selon la plateforme.
// - Web : le rôle de l'ARIA, `menuitemradio`, que react-native-web pose tel quel sur la page.
// - Téléphone : React Native ne connaît pas `menuitemradio` (son `role` l'ignore, et le choix
//   perdrait tout rôle) ; le choix est un `menuitem`, et son état « choisi » passe par
//   `accessibilityState.checked`.
//
// R9 (7d, « À reprendre » de 7b, scénario refonte, « Accessibilité ») : sur téléphone, quand le menu
// se ferme (un choix, un toucher à côté, Retour d'Android), le lecteur d'écran revient sur « … »,
// au lieu de repartir du haut de l'écran. Il y revient par `moveReaderTo` de `ui/focus`, l'outil du
// projet pour le focus du lecteur d'écran sur téléphone (`focusWithoutScroll` n'y fait rien), avant
// que l'action choisie parte : une action qui pose le focus ailleurs garde le dernier mot.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { labelOf } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ActionMenu, type ActionMenuItem } from './ActionMenu'
import { focusAndReveal, focusWithoutScroll, moveReaderTo } from './focus'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Le focus posé par le menu passe par les outils de `ui/focus` : on les écoute, sans rien changer à
// ce qu'ils font.
jest.mock('./focus', () => {
  const actual = jest.requireActual('./focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    focusAndReveal: jest.fn(actual.focusAndReveal),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})

const family = {
  new: fr.t(($) => $.update.family.new),
  fixed: fr.t(($) => $.update.family.fixed),
  polish: fr.t(($) => $.update.family.polish),
}
const families: ActionMenuItem[] = [
  { label: family.new, onPress: jest.fn(), checked: false },
  { label: family.fixed, onPress: jest.fn(), checked: true },
  { label: family.polish, onPress: jest.fn() },
]
const dots = fr.t(($) => $.actionMenu.label)

type ChoiceProps = {
  role?: string
  accessibilityRole?: string
  accessibilityState?: { checked?: boolean }
}

afterEach(() => jest.restoreAllMocks())

describe('the role of the choices of a choice menu', () => {
  it('gives each choice the role « menuitem » and its checked state on a phone', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    await renderWithProviders(<ActionMenu items={families} />)
    await fireEvent.press(screen.getByRole('button', { name: dots }))

    const choices = screen.getAllByRole('menuitem')
    expect(choices).toHaveLength(3)
    for (const choice of choices) {
      const props = choice.props as ChoiceProps
      // Aucun `role` que React Native ne connaît pas : il effacerait le rôle du choix.
      expect(props.role).toBeUndefined()
      expect(props.accessibilityRole).toBe('menuitem')
    }
    const checked = (name: string) =>
      (screen.getByRole('menuitem', { name }).props as ChoiceProps).accessibilityState?.checked
    expect(checked(family.fixed)).toBe(true)
    expect(checked(family.new)).toBe(false)
    expect(checked(family.polish)).toBe(false)
    expect(screen.queryByRole('menuitemradio')).toBeNull()
  })

  it('keeps « menuitemradio » on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(<ActionMenu items={families} />)
    await fireEvent.press(screen.getByRole('button', { name: dots }))

    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)
    expect(screen.queryByRole('menuitem')).toBeNull()
  })
})

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Tous les éléments de l'arbre rendu, en profondeur. */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** La couche du menu ouvert : ce qui reçoit Retour sur Android (`onRequestClose`). */
const modalLayer = () => {
  const found = hostsOf(screen.root as unknown as Host).find(
    (node) => typeof node.props.onRequestClose === 'function',
  )
  if (!found) throw new Error('no Modal layer')
  return found.props as { onRequestClose: () => void }
}

/** Le nom des vues où le lecteur d'écran a été amené (`moveReaderTo`), dans l'ordre. */
const readerMovedTo = (): string[] =>
  jest.mocked(moveReaderTo).mock.calls.map(([node]) => labelOf(node) ?? '')

/** L'ordre d'appel du dernier `moveReaderTo` vers « … » ; -1 s'il n'y en a pas. */
const lastReaderMoveToDots = (): number => {
  const { calls, invocationCallOrder } = jest.mocked(moveReaderTo).mock
  let order = -1
  calls.forEach(([node], index) => {
    if (labelOf(node) === dots) order = invocationCallOrder[index] ?? -1
  })
  return order
}

describe.each(['ios', 'android'] as const)(
  'the screen reader on %s, when the menu closes',
  (os) => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', os)
      for (const fn of [focusWithoutScroll, focusAndReveal, moveReaderTo])
        jest.mocked(fn).mockClear()
    })

    /** Ouvre le menu par « … », puis oublie ce que l'ouverture a pu poser. */
    const open = async (items: ActionMenuItem[]) => {
      await renderWithProviders(<ActionMenu items={items} />)
      await fireEvent.press(screen.getByRole('button', { name: dots }))
      expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0)
      jest.mocked(moveReaderTo).mockClear()
    }

    it('goes back to « … » when a touch outside closes the menu', async () => {
      await open([{ label: 'Signaler', onPress: jest.fn() }])

      await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.actionMenu.close) }))

      expect(screen.queryByRole('menuitem')).toBeNull()
      expect(readerMovedTo()).toContain(dots)
    })

    it('goes back to « … » when Back closes the menu', async () => {
      await open([{ label: 'Signaler', onPress: jest.fn() }])

      await act(() => modalLayer().onRequestClose())

      expect(screen.queryByRole('menuitem')).toBeNull()
      expect(readerMovedTo()).toContain(dots)
    })

    it('goes back to « … » before the chosen action runs', async () => {
      const report = jest.fn()
      await open([{ label: 'Signaler', onPress: report }])

      await fireEvent.press(screen.getByRole('menuitem', { name: 'Signaler' }))

      expect(report).toHaveBeenCalledTimes(1)
      const reportOrder = report.mock.invocationCallOrder[0] ?? -1
      // « … » d'abord : l'action peut ensuite amener le lecteur ailleurs (« Modifier » dans le champ).
      expect(lastReaderMoveToDots()).toBeGreaterThan(-1)
      expect(lastReaderMoveToDots()).toBeLessThan(reportOrder)
    })

    it('does not move the reader before the menu was ever opened', async () => {
      await renderWithProviders(<ActionMenu items={families} />)

      // Témoin : « … » est là.
      expect(screen.getByRole('button', { name: dots })).toBeTruthy()
      expect(readerMovedTo()).toEqual([])
    })
  },
)
