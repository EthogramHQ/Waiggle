// Tests du choix de l'icône d'une ruche (tranche R10, planches R10-Creer et R10-Reglages-Ruche) :
// douze icônes (`HIVE_ICONS` du contrat, option 4 des planches), dans la feuille « Créer une ruche »
// et dans la feuille « Choisir une icône » des réglages. Sur le modèle de la grille d'icônes des
// catégories (`ui/IconGrid`) : un groupe de boutons radio nommé « Icône de la ruche » ; chaque icône
// est un choix nommé par son sens (« Maison »), jamais par son code (« house-line ») ; une seule est
// cochée. Au clavier (web) : un seul arrêt de Tab, les flèches passent à la voisine. Chaque icône a
// ses 44 points. Pendant un envoi (`disabled`), aucun choix ne change.
//
// L'API (plan R10, « API au contrat ») :
//   HiveIconPicker({ value: HiveIcon; onChange: (icon: HiveIcon) => void; disabled?: boolean }).
import { layout } from '@ruche/brand'
import { HIVE_ICONS, type HiveIcon } from '@ruche/contracts'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { HiveIconPicker } from './HiveIconPicker'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LABEL = fr.t(($) => $.hives.createSheet.icon)
/** Le sens d'une icône, tel que le composant le tire des traductions (« Maison »). */
const meaning = (icon: HiveIcon) => fr.t(($) => $.hives.icons[icon])
const HOUSE = meaning('house-line')
const HEART = meaning('heart')
const CODE = meaning('code')

/** Le choix, gardé comme dans la feuille ; `onChange` voit chaque icône choisie. */
function Picker({
  start = 'house-line',
  onChange,
  disabled,
}: {
  start?: HiveIcon
  onChange?: (icon: HiveIcon) => void
  disabled?: boolean
}) {
  const [value, setValue] = useState<HiveIcon>(start)
  return (
    <HiveIconPicker
      value={value}
      disabled={disabled}
      onChange={(next) => {
        onChange?.(next)
        setValue(next)
      }}
    />
  )
}

/** La zone qu'on peut toucher, en hauteur et en largeur (tailles minimales ou fixes, débord). */
const touchSize = (node: ReturnType<typeof screen.getByRole>) => {
  const style = StyleSheet.flatten(node.props.style) as Record<string, unknown>
  const size = (min: unknown, fixed: unknown) =>
    Math.max(typeof min === 'number' ? min : 0, typeof fixed === 'number' ? fixed : 0)
  const slop: unknown = node.props.hitSlop
  const extra = (a: 'top' | 'left', b: 'bottom' | 'right') =>
    typeof slop === 'number'
      ? 2 * slop
      : slop && typeof slop === 'object'
        ? Number((slop as Record<string, number>)[a] ?? 0) +
          Number((slop as Record<string, number>)[b] ?? 0)
        : 0
  return {
    height: size(style?.minHeight, style?.height) + extra('top', 'bottom'),
    width: size(style?.minWidth, style?.width) + extra('left', 'right'),
  }
}

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const key = (name: string) => ({ key: name, repeat: false, preventDefault: () => {} })

describe('HiveIconPicker', () => {
  it('names each hive icon by its meaning, never by its code', async () => {
    expect(LABEL).toBe('Icône de la ruche') // témoin des traductions
    expect(HOUSE).toBe('Maison')
    await renderWithProviders(<Picker />)

    // Le groupe n'est pas « accessible » au sens de React Native (ses choix le sont) : getByRole ne
    // le voit pas ; on le trouve par son nom, puis on lit son rôle.
    const group = screen.getByLabelText(LABEL)
    expect(group.props.accessibilityRole ?? group.props.role).toBe('radiogroup')
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(HIVE_ICONS.length)
    // Les douze, dans l'ordre du contrat, chacune par son sens.
    expect(
      radios.map((radio) => radio.props.accessibilityLabel ?? radio.props['aria-label']),
    ).toEqual(HIVE_ICONS.map(meaning))
    // Jamais le code de l'icône, ni comme nom, ni comme texte.
    for (const icon of HIVE_ICONS) {
      expect(screen.queryByRole('radio', { name: icon })).toBeNull()
      expect(screen.queryByText(icon)).toBeNull()
    }
  })

  it('checks the chosen icon, and only it', async () => {
    await renderWithProviders(<Picker start="heart" />)

    expect(screen.getByRole('radio', { name: HEART, checked: true })).toBeTruthy()
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
  })

  it('gives the icon touched, which becomes the checked one', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Picker onChange={onChange} />)

    await fireEvent.press(screen.getByRole('radio', { name: meaning('rocket-launch') }))

    expect(onChange).toHaveBeenLastCalledWith('rocket-launch')
    expect(
      screen.getByRole('radio', { name: meaning('rocket-launch'), checked: true }),
    ).toBeTruthy()
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
  })

  it('keeps every icon at least 44 points high and wide', async () => {
    await renderWithProviders(<Picker />)

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(12) // témoin
    for (const radio of radios) {
      const size = touchSize(radio)
      expect(size.height).toBeGreaterThanOrEqual(layout.touchTarget)
      expect(size.width).toBeGreaterThanOrEqual(layout.touchTarget)
    }
  })

  it('changes nothing while disabled', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Picker onChange={onChange} disabled />)

    const leaf = screen.getByRole('radio', { name: meaning('leaf') })
    expect(leaf).toBeDisabled()
    await fireEvent.press(leaf)

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: HOUSE, checked: true })).toBeTruthy()
  })

  describe('on the web, with the keyboard', () => {
    beforeEach(() => jest.replaceProperty(Platform, 'OS', 'web'))
    afterEach(() => jest.restoreAllMocks())

    const tabIndexes = () =>
      screen.getAllByRole('radio').map((radio) => radio.props.tabIndex as number | undefined)

    it('has a single Tab stop: the checked icon', async () => {
      await renderWithProviders(<Picker start="heart" />)

      // Seule l'icône cochée (la deuxième) s'atteint par Tab ; les onze autres, par les flèches.
      expect(tabIndexes()).toEqual(HIVE_ICONS.map((icon) => (icon === 'heart' ? 0 : -1)))
    })

    it('moves to the next or previous icon with the arrows, going round', async () => {
      const onChange = jest.fn()
      await renderWithProviders(<Picker onChange={onChange} />)

      await fireEvent(screen.getByRole('radio', { name: HOUSE }), 'keyDown', key('ArrowRight'))
      expect(onChange).toHaveBeenLastCalledWith('heart')
      expect(screen.getByRole('radio', { name: HEART, checked: true })).toBeTruthy()
      expect(tabIndexes()).toEqual(HIVE_ICONS.map((icon) => (icon === 'heart' ? 0 : -1)))

      await fireEvent(screen.getByRole('radio', { name: HEART }), 'keyDown', key('ArrowLeft'))
      expect(screen.getByRole('radio', { name: HOUSE, checked: true })).toBeTruthy()

      // Avant la première, la flèche revient à la dernière (comme IconGrid).
      await fireEvent(screen.getByRole('radio', { name: HOUSE }), 'keyDown', key('ArrowLeft'))
      expect(screen.getByRole('radio', { name: CODE, checked: true })).toBeTruthy()
      expect(onChange).toHaveBeenLastCalledWith('code')
    })
  })
})
