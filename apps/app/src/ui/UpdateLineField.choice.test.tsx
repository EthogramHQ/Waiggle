// Tests ajoutés en R7a (U1c) pour une ligne de « Ce qui a changé » : ce que
// `UpdateLineField.test.tsx` ne couvre pas, ou ne peut pas lire.
// - L'état « choisi » du menu des familles : RNTL 14 ne sait dire « coché » (`toBeChecked`) que
//   d'un `checkbox`, d'un `radio` ou d'un `switch`, pas d'un `menuitemradio` ; on lit donc ce que
//   reçoivent le téléphone (`accessibilityState.checked`) et le web (`aria-checked`), comme
//   `ActionMenu.checked.test.tsx`.
// - Le texte reste une seule ligne : Entrée n'y coupe rien (web), un texte collé avec des retours
//   est remis sur une ligne.
// - Rechoisir la famille en cours ne change rien.
import type { UpdateFamily } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { choiceRole, fr } from '../testing/text'
import { oneLine, UpdateLineField } from './UpdateLineField'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const familyName = (family: UpdateFamily) => fr.t(($) => $.update.family[family])
const lineLabel = (number: number, total: number, family: UpdateFamily) =>
  fr.t(($) => $.project.updates.lineLabel, { number, total, family: familyName(family) })
const familyButton = (family: UpdateFamily) =>
  fr.t(($) => $.project.updates.familyButton, { family: familyName(family) })

type HostProps = { accessibilityState?: { checked?: boolean | 'mixed' }; 'aria-checked'?: boolean }
/** « Coché », tel que le téléphone ou le web le reçoit. */
const isChecked = (element: { props: HostProps }) =>
  element.props.accessibilityState?.checked === true || element.props['aria-checked'] === true

type Props = Partial<Parameters<typeof UpdateLineField>[0]>

const renderLine = (props: Props = {}) =>
  renderWithProviders(
    <UpdateLineField
      family="fixed"
      text="Le score ne repart plus à zéro au niveau 3"
      onFamilyChange={() => {}}
      onTextChange={() => {}}
      placeholder={fr.t(($) => $.update.example.fixed)}
      index={0}
      total={1}
      {...props}
    />,
  )

describe('UpdateLineField, its families menu (U1c)', () => {
  it('checks the family of the line, and only it', async () => {
    await renderLine()

    await fireEvent.press(screen.getByRole('button', { name: familyButton('fixed') }))

    expect(isChecked(screen.getByRole(choiceRole(), { name: familyName('fixed') }))).toBe(true)
    expect(isChecked(screen.getByRole(choiceRole(), { name: familyName('new') }))).toBe(false)
    expect(isChecked(screen.getByRole(choiceRole(), { name: familyName('polish') }))).toBe(false)
  })

  it('tells nothing when the family already chosen is chosen again', async () => {
    const onFamilyChange = jest.fn()
    await renderLine({ onFamilyChange })

    await fireEvent.press(screen.getByRole('button', { name: familyButton('fixed') }))
    await fireEvent.press(screen.getByRole(choiceRole(), { name: familyName('fixed') }))

    expect(screen.queryByRole(choiceRole())).toBeNull() // le menu s'est fermé (témoin)
    expect(onFamilyChange).not.toHaveBeenCalled()
  })

  it('says whether its menu is open', async () => {
    await renderLine()
    const badge = screen.getByRole('button', { name: familyButton('fixed') })
    expect(badge).toBeCollapsed()

    await fireEvent.press(badge)

    expect(screen.getByRole('button', { name: familyButton('fixed') })).toBeExpanded()
  })
})

describe('UpdateLineField, a single line of text (U1c)', () => {
  it('puts a pasted text with line breaks back on one line', async () => {
    const onTextChange = jest.fn()
    await renderLine({ onTextChange })

    await fireEvent.changeText(
      screen.getByLabelText(lineLabel(1, 1, 'fixed')),
      'Le score tient\n  au niveau 3\r\net au 4',
    )

    expect(onTextChange).toHaveBeenCalledWith('Le score tient au niveau 3 et au 4')
  })

  it('drops the line break that Enter adds at the end', () => {
    expect(oneLine('Un mode nuit\n')).toBe('Un mode nuit')
    expect(oneLine(`Un mode nuit${String.fromCodePoint(0x2028)}et clair`)).toBe(
      'Un mode nuit et clair',
    )
    expect(oneLine('Un mode nuit')).toBe('Un mode nuit') // témoin : rien à changer
  })

  it('keeps Enter from breaking the line on the web', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderLine()
      const preventDefault = jest.fn()
      const field = screen.getByLabelText(lineLabel(1, 1, 'fixed'))

      await fireEvent(field, 'keyPress', { nativeEvent: { key: 'a' }, preventDefault })
      expect(preventDefault).not.toHaveBeenCalled() // témoin : une lettre passe
      await fireEvent(field, 'keyPress', { nativeEvent: { key: 'Enter' }, preventDefault })

      expect(preventDefault).toHaveBeenCalledTimes(1)
    } finally {
      restore.restore()
    }
  })

  it('has its text read-only and its badge inactive while sending', async () => {
    await renderLine({ editable: false, onRemove: () => {} })

    expect(screen.getByLabelText(lineLabel(1, 1, 'fixed')).props.editable).toBe(false)
    expect(screen.getByRole('button', { name: familyButton('fixed') })).toBeDisabled()
    expect(
      screen.getByRole('button', {
        name: fr.t(($) => $.project.updates.removeLineLabel, { number: 1 }),
      }),
    ).toBeDisabled()
  })
})
