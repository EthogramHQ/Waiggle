// Tests d'une ligne de « Ce qui a changé » dans la feuille « Nouvelle mise à jour » (R7a, scénario
// « Publier une mise à jour ») : sa pastille de famille, qui est un bouton et ouvre un petit menu
// des trois familles ; le nom de la famille au-dessus du champ ; l'exemple de la famille dans le
// champ vide ; 120 caractères au plus ; « Retirer cette ligne », sauf quand il n'en reste qu'une.
//
// L'interface attendue de `src/ui/UpdateLineField.tsx` (plan R7a, « Appli ») :
// `UpdateLineField({ family, text, onFamilyChange(family), onTextChange(text), onRemove?, placeholder,
// error?, inputRef?, index, total })`.
// - `index` est le rang de la ligne **depuis 0**, comme `onIndexChange` de `PhotoGallery` ; le nom
//   lu dit le rang depuis 1 : la ligne `index={1}` sur `total={3}` est « Changement 2 sur 3,
//   Réparé » (`project.updates.lineLabel`). Choix de TW-1, à confirmer par la session.
// - `onRemove` absent : pas de bouton « Retirer cette ligne » (nom lu « Retirer la ligne 2 »).
// - Le menu des familles est un `ActionMenu` à choix cochés (`menuitemradio`, interface B1, TW-4).
import { layout } from '@ruche/brand'
import type { UpdateFamily } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { Platform, StyleSheet, type TextInput } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { choiceRole, fr } from '../testing/text'
import { UpdateLineField } from './UpdateLineField'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// RNTL 14 ne connaît l'état « coché » que pour `checkbox`, `radio` et `switch` : `toBeChecked`
// lève une erreur sur `menuitemradio`. On lit ce que la vue dit aux lecteurs d'écran.
type HostProps = { accessibilityState?: { checked?: boolean | 'mixed' }; 'aria-checked'?: boolean }
const isChecked = (element: { props: HostProps }) =>
  element.props.accessibilityState?.checked === true || element.props['aria-checked'] === true

const familyName = (family: UpdateFamily) => fr.t(($) => $.update.family[family])
const example = (family: UpdateFamily) => fr.t(($) => $.update.example[family])
/** Le nom lu du champ : « Changement 2 sur 3, Réparé ». */
const lineLabel = (number: number, total: number, family: UpdateFamily) =>
  fr.t(($) => $.project.updates.lineLabel, { number, total, family: familyName(family) })
/** Le nom lu du bouton de la pastille : « Famille : Réparé ». */
const familyButton = (family: UpdateFamily) =>
  fr.t(($) => $.project.updates.familyButton, { family: familyName(family) })
const removeLabel = (number: number) => fr.t(($) => $.project.updates.removeLineLabel, { number })
const required = fr.t(($) => $.project.updates.required)

type Props = Partial<Parameters<typeof UpdateLineField>[0]>

/** La deuxième de trois lignes, de la famille « Réparé », avec son texte. */
const renderLine = (props: Props = {}) =>
  renderWithProviders(
    <UpdateLineField
      family="fixed"
      text="Le score ne repart plus à zéro au niveau 3"
      onFamilyChange={() => {}}
      onTextChange={() => {}}
      onRemove={() => {}}
      placeholder={example('fixed')}
      index={1}
      total={3}
      {...props}
    />,
  )

/**
 * La hauteur de la zone qu'on peut toucher : celle de l'élément touchable (sa hauteur minimale),
 * plus le débord invisible qui l'agrandit sous le doigt (hitSlop, en haut et en bas).
 */
const touchHeight = (node: ReturnType<typeof screen.getByRole>): number => {
  const style = StyleSheet.flatten(node.props.style) as { minHeight?: unknown; height?: unknown }
  const own = Math.max(
    typeof style?.minHeight === 'number' ? style.minHeight : 0,
    typeof style?.height === 'number' ? style.height : 0,
  )
  const slop: unknown = node.props.hitSlop
  const extra =
    typeof slop === 'number'
      ? 2 * slop
      : slop && typeof slop === 'object'
        ? Number((slop as { top?: number }).top ?? 0) +
          Number((slop as { bottom?: number }).bottom ?? 0)
        : 0
  return own + extra
}

describe('UpdateLineField', () => {
  // Relecture du plan, interface A1 : `it('names each line field with its rank and family')`.
  it('names its field with its rank and family', async () => {
    await renderLine()

    expect(screen.getByLabelText(lineLabel(2, 3, 'fixed'))).toBeTruthy()
  })

  it('counts the first line as « Changement 1 »', async () => {
    await renderLine({ index: 0, total: 1, family: 'new', text: '' })

    expect(screen.getByLabelText(lineLabel(1, 1, 'new'))).toBeTruthy()
  })

  // Scénario : « chaque ligne porte sa famille […] et son nom au-dessus du texte ».
  it('writes the name of its family above the field', async () => {
    await renderLine()

    expect(screen.getByText(familyName('fixed'))).toBeTruthy()
  })

  // Scénario : « chaque famille a son exemple dans le champ vide ».
  it('shows the example of its family in the empty field', async () => {
    await renderLine({ family: 'polish', text: '', placeholder: example('polish') })

    expect(screen.getByPlaceholderText(example('polish'))).toBeTruthy()
  })

  it('shows its text, and tells each change of it', async () => {
    const onTextChange = jest.fn()
    await renderLine({ onTextChange })

    const field = screen.getByLabelText(lineLabel(2, 3, 'fixed'))
    expect(field.props.value).toBe('Le score ne repart plus à zéro au niveau 3')
    await fireEvent.changeText(field, 'Le score ne repart plus à zéro')

    expect(onTextChange).toHaveBeenCalledWith('Le score ne repart plus à zéro')
  })

  // Scénario : « une ligne fait 120 caractères au plus » ; la limite se voit quand on la dépasse.
  it('tells when the line goes beyond 120 characters', async () => {
    await renderLine({ text: 'a'.repeat(130) })

    expect(screen.queryAllByText(/\b120\b/).length).toBeGreaterThan(0)
  })

  // Scénario : « quand il touche la pastille d'une ligne, un petit menu propose les trois familles ».
  it('makes its badge a button named after the family, with a 44-point touch zone', async () => {
    await renderLine()

    const button = screen.getByRole('button', { name: familyButton('fixed') })
    expect(touchHeight(button)).toBeGreaterThanOrEqual(layout.touchTarget)
  })

  it('opens a menu of the three families from its badge, the current one checked', async () => {
    await renderLine()

    await fireEvent.press(screen.getByRole('button', { name: familyButton('fixed') }))

    const choices = screen.getAllByRole(choiceRole())
    expect(choices).toHaveLength(3)
    expect(isChecked(screen.getByRole(choiceRole(), { name: familyName('new') }))).toBe(false)
    expect(isChecked(screen.getByRole(choiceRole(), { name: familyName('fixed') }))).toBe(true)
    expect(isChecked(screen.getByRole(choiceRole(), { name: familyName('polish') }))).toBe(false)
  })

  it('gives the line the family chosen in the menu', async () => {
    const onFamilyChange = jest.fn()
    await renderLine({ onFamilyChange })

    await fireEvent.press(screen.getByRole('button', { name: familyButton('fixed') }))
    await fireEvent.press(screen.getByRole(choiceRole(), { name: familyName('polish') }))

    expect(onFamilyChange).toHaveBeenCalledTimes(1)
    expect(onFamilyChange).toHaveBeenCalledWith('polish')
    expect(screen.queryByRole(choiceRole())).toBeNull() // le menu se ferme
  })

  // Relecture du plan, interface A1 : `it('names each remove button with its rank')`.
  it('names its remove button with its rank, and removes the line once', async () => {
    const onRemove = jest.fn()
    await renderLine({ onRemove })

    await fireEvent.press(screen.getByRole('button', { name: removeLabel(2) }))

    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  // Scénario : « chaque ligne a un bouton « Retirer cette ligne », sauf quand il n'en reste qu'une ».
  it('has no remove button without onRemove', async () => {
    await renderLine({ onRemove: undefined, index: 0, total: 1 })

    expect(screen.getByLabelText(lineLabel(1, 1, 'fixed'))).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: removeLabel(1) })).toBeNull()
    expect(screen.queryByText(removeLabel(1))).toBeNull()
  })

  // Scénario : « la première ligne dit « Écris au moins un changement avant de publier. » ».
  it('shows the error it is given', async () => {
    await renderLine({ text: '', error: required })

    expect(screen.getByText(required)).toBeTruthy()
  })

  it('marks its field invalid on the web when in error', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderLine({ text: '', error: required })

      expect(screen.getByLabelText(lineLabel(2, 3, 'fixed')).props['aria-invalid']).toBe(true)
    } finally {
      restore.restore()
    }
  })

  // La feuille donne le focus à la ligne ajoutée ou en erreur (UpdateLinesField) : par cette référence.
  it('hands its text field to the inputRef it is given', async () => {
    const inputRef = createRef<TextInput>()
    await renderLine({ inputRef })

    expect(inputRef.current).not.toBeNull()
    expect(typeof inputRef.current?.focus).toBe('function')
  })
})
