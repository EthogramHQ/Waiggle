// Test de la relecture de l'interface R7a, C4 : un menu de choix (la pastille de famille d'une ligne
// de mise à jour) dit ses choix aux lecteurs d'écran selon la plateforme.
// - Web : le rôle de l'ARIA, `menuitemradio`, que react-native-web pose tel quel sur la page.
// - Téléphone : React Native ne connaît pas `menuitemradio` (son `role` l'ignore, et le choix
//   perdrait tout rôle) ; le choix est un `menuitem`, et son état « choisi » passe par
//   `accessibilityState.checked`.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ActionMenu, type ActionMenuItem } from './ActionMenu'

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
