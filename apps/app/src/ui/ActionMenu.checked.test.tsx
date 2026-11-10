// Tests du menu « … » devenu menu de choix (R7a, relecture du plan, interface B1) : dans la feuille
// « Nouvelle mise à jour », la pastille d'une ligne ouvre un menu de trois familles (« Nouveau »,
// « Réparé », « Plus joli »), dont une est choisie. Deux ajouts à ActionMenu, fixés au lancement :
// - `ActionMenuItem.checked?: boolean` : dès qu'un élément le porte, tous deviennent des
//   `menuitemradio`, qui disent s'ils sont choisis (`aria-checked` sur le web,
//   `accessibilityState.checked` sur téléphone) ;
// - `renderTrigger?: ({ onPress, expanded, ref }) => ReactElement` : un déclencheur à soi (la
//   pastille colorée « Famille : Nouveau ») à la place du bouton « … » ; le focus lui revient quand
//   le menu se ferme, comme au bouton « … ».
//
// À part d'ActionMenu.test.tsx : ces tests sont écrits avant le code (U1a) et échouent seuls.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { AccessibilityInfo, Platform, Pressable } from 'react-native'
import { labelOf } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ActionMenu, type ActionMenuItem } from './ActionMenu'
import { focusWithoutScroll } from './focus'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Où le menu pose le focus du clavier (web) : le test lit l'élément reçu.
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
}))

// RNTL 14 ne connaît l'état « coché » que pour `checkbox`, `radio` et `switch` : `toBeChecked`
// lève une erreur sur `menuitemradio`. On lit donc ce que la vue dit aux lecteurs d'écran :
// `accessibilityState.checked` sur téléphone, `aria-checked` sur le web.
type HostProps = { accessibilityState?: { checked?: boolean | 'mixed' }; 'aria-checked'?: boolean }
const isChecked = (element: { props: HostProps }) =>
  element.props.accessibilityState?.checked === true || element.props['aria-checked'] === true

const family = {
  new: fr.t(($) => $.update.family.new),
  fixed: fr.t(($) => $.update.family.fixed),
  polish: fr.t(($) => $.update.family.polish),
}
const choose = jest.fn()

/** Les trois familles d'une ligne, « Réparé » choisie. */
const families: ActionMenuItem[] = [
  { label: family.new, onPress: () => choose('new'), checked: false },
  { label: family.fixed, onPress: () => choose('fixed'), checked: true },
  { label: family.polish, onPress: () => choose('polish') },
]

/** Le nom de la pastille qui ouvre le menu : « Famille : Nouveau ». */
const badgeName = fr.t(($) => $.project.updates.familyButton, { family: family.new })

/** Un menu ouvert par sa propre pastille, au lieu du bouton « … ». */
const BadgeMenu = ({ items = families }: { items?: ActionMenuItem[] }) => (
  <ActionMenu
    items={items}
    // Le nom du menu : sans lui, le menu prendrait celui du bouton « … », qui n'est plus là.
    label="Familles"
    renderTrigger={({ onPress, expanded, ref }) => (
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={badgeName}
        accessibilityState={{ expanded }}
        onPress={onPress}
      />
    )}
  />
)

const dots = fr.t(($) => $.actionMenu.label)
const badge = () => screen.getByRole('button', { name: badgeName })

beforeEach(() => {
  choose.mockReset()
  jest.mocked(focusWithoutScroll).mockClear()
})
afterEach(() => jest.restoreAllMocks())

describe('a choice menu (R7a)', () => {
  it('marks the chosen item of a choice menu as checked', async () => {
    await renderWithProviders(<ActionMenu items={families} />)

    await fireEvent.press(screen.getByRole('button', { name: dots }))

    expect(isChecked(screen.getByRole('menuitemradio', { name: family.fixed }))).toBe(true)
    expect(isChecked(screen.getByRole('menuitemradio', { name: family.new }))).toBe(false)
    expect(isChecked(screen.getByRole('menuitemradio', { name: family.polish }))).toBe(false)
    // Tous les choix sont des radios, même celui qui ne dit rien de `checked`.
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('says « checked » on the web too', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(<ActionMenu items={families} />)

    await fireEvent.press(screen.getByRole('button', { name: dots }))

    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)
    expect(isChecked(screen.getByRole('menuitemradio', { name: family.fixed }))).toBe(true)
  })

  it('keeps plain menu items when no item says checked (témoin)', async () => {
    await renderWithProviders(
      <ActionMenu items={[{ label: 'Signaler cette mise à jour', onPress: jest.fn() }]} />,
    )

    await fireEvent.press(screen.getByRole('button', { name: dots }))

    expect(screen.getByRole('menuitem', { name: 'Signaler cette mise à jour' })).toBeTruthy()
    expect(screen.queryByRole('menuitemradio')).toBeNull()
  })

  it('chooses a family once and closes', async () => {
    await renderWithProviders(<ActionMenu items={families} />)

    await fireEvent.press(screen.getByRole('button', { name: dots }))
    await fireEvent.press(screen.getByRole('menuitemradio', { name: family.polish }))

    await waitFor(() => expect(choose).toHaveBeenCalledWith('polish'))
    expect(choose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menuitemradio')).toBeNull()
  })
})

describe('a menu opened by its own trigger (R7a)', () => {
  it('shows the trigger it is given instead of « … »', async () => {
    await renderWithProviders(<BadgeMenu />)

    expect(badge()).toBeTruthy()
    expect(screen.queryByRole('button', { name: dots })).toBeNull()
  })

  it('opens from the custom trigger and tells it the menu is open', async () => {
    await renderWithProviders(<BadgeMenu />)
    expect(screen.getByRole('button', { name: badgeName, expanded: false })).toBeTruthy()

    await fireEvent.press(badge())

    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)
    expect(screen.getByRole('button', { name: badgeName, expanded: true })).toBeTruthy()
  })

  // Téléphone : le lecteur d'écran revient sur la pastille, par `sendAccessibilityEvent(vue,
  // 'focus')`, comme il revient sur « … » (R5b).
  it('gives the screen reader focus back to the custom trigger on close', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    const sent = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
    await renderWithProviders(<BadgeMenu />)
    await fireEvent.press(badge())
    sent.mockClear()

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.actionMenu.close) }))

    await waitFor(() =>
      expect(
        sent.mock.calls.some(([node, kind]) => kind === 'focus' && labelOf(node) === badgeName),
      ).toBe(true),
    )
  })

  // Web : Échap ferme le menu (le Modal reçoit onRequestClose), puis la couche quitte la page
  // (onDismiss) et le focus du clavier revient à la pastille. Le Modal simulé de Jest n'appelle pas
  // onDismiss : le test l'appelle lui-même, comme le ferait react-native-web.
  it('opens from a custom trigger and gives focus back to it on close', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(<BadgeMenu />)
    await fireEvent.press(badge())
    const layer = modalLayer()
    jest.mocked(focusWithoutScroll).mockClear()

    await act(() => layer.onRequestClose())
    await act(() => layer.onDismiss?.())

    const focused = jest.mocked(focusWithoutScroll).mock.calls.map(([node]) => labelOf(node))
    expect(focused.at(-1)).toBe(badgeName)
    expect(screen.queryByRole('menuitemradio')).toBeNull()
  })
})

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Tous les éléments de l'arbre rendu, en profondeur. */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** La couche du menu ouvert : ce qui reçoit Échap (onRequestClose) et sa sortie (onDismiss). */
const modalLayer = () => {
  const found = hostsOf(screen.root as unknown as Host).find(
    (node) => typeof node.props.onRequestClose === 'function',
  )
  if (!found) throw new Error('no Modal layer')
  return found.props as { onRequestClose: () => void; onDismiss?: () => void }
}
