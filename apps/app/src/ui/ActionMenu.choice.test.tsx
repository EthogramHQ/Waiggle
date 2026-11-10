// Tests de l'état « choisi » d'un menu de choix (R7a, U1a), lu directement sur les choix.
//
// Pourquoi un fichier de plus qu'ActionMenu.checked.test.tsx : la bibliothèque de test (RNTL 14)
// ne sait dire « coché » (`toBeChecked`, l'option `checked` de `getByRole`) que d'un `checkbox`,
// d'un `radio` ou d'un `switch`, et refuse un `menuitemradio`, bien que l'ARIA lui donne
// `aria-checked`. Ici, on lit donc ce que reçoivent le web (`aria-checked`) et le téléphone
// (`accessibilityState.checked`), et la coche qui montre le choix aux yeux.
import { fireEvent, screen, within } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { choiceRole, fr } from '../testing/text'
import { ActionMenu, type ActionMenuItem } from './ActionMenu'
import { iconPaths } from './icons.generated'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

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

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
/** Les tracés SVG dessinés sous `node` (l'icône de la coche en est un). */
const pathsUnder = (node: Host): string[] => [
  ...(typeof node.props.d === 'string' ? [node.props.d] : []),
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : pathsUnder(child))),
]
const check = iconPaths.check

afterEach(() => jest.restoreAllMocks())

describe('the state of a choice menu (R7a)', () => {
  it.each(['ios', 'web'] as const)(
    'tells the chosen family, and only it, as checked (%s)',
    async (os) => {
      jest.replaceProperty(Platform, 'OS', os)
      await renderWithProviders(<ActionMenu items={families} />)
      await fireEvent.press(screen.getByRole('button', { name: dots }))

      // Pressable range `aria-checked` dans l'état d'accessibilité de la vue qu'il dessine : c'est
      // lui que lisent VoiceOver et TalkBack (react-native-web, lui, pose `aria-checked` sur la page).
      const checkedOf = (name: string) =>
        (
          screen.getByRole(choiceRole(), { name }).props as {
            accessibilityState?: { checked?: boolean }
            'aria-checked'?: boolean
          }
        ).accessibilityState?.checked
      expect(checkedOf(family.fixed)).toBe(true)
      expect(checkedOf(family.new)).toBe(false)
      expect(checkedOf(family.polish)).toBe(false)
    },
  )

  it('draws a check mark on the chosen family only', async () => {
    await renderWithProviders(<ActionMenu items={families} />)
    await fireEvent.press(screen.getByRole('button', { name: dots }))

    const drawn = (name: string) =>
      pathsUnder(screen.getByRole(choiceRole(), { name }) as unknown as Host)
    expect(drawn(family.fixed)).toEqual(expect.arrayContaining(check))
    expect(drawn(family.new)).toEqual([])
    expect(drawn(family.polish)).toEqual([])
    // Le libellé reste lisible à côté de la coche.
    expect(
      within(screen.getByRole(choiceRole(), { name: family.fixed })).getByText(family.fixed),
    ).toBeTruthy()
  })
})
