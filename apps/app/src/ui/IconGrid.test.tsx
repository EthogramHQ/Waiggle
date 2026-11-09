// Tests de la grille d'icônes (tranche R6b, scénario « Ranger les « Autre » », « Nouvelle catégorie » :
// un administrateur choisit l'icône d'une catégorie dans une liste fixe, `CATEGORY_ICON_CHOICES` du
// contrat). Un groupe de boutons radio nommé (« Icône ») : chaque icône est un choix nommé par son
// sens traduit (« Fleur », « Vélo »), jamais par son code (« flower ») ; une seule est cochée. Au
// clavier (web), comme `Choices` : un seul arrêt de Tab, la barre d'espace coche, les flèches passent
// à la voisine. Chaque icône a ses 44 points.
//
// L'API (découpage amendé de R6b, U2b) : IconGrid({ label; icons: { name: IconName; label: string }[];
// value: IconName | null; onChange(name) }).
import { layout } from '@ruche/brand'
import { CATEGORY_ICON_CHOICES, type CategoryIcon } from '@ruche/contracts'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { IconGrid } from './IconGrid'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LABEL = fr.t(($) => $.moderation.categories.icon)
/** Le sens d'une icône, tel que l'écran le tire des traductions (« Fleur »). */
const meaning = (name: CategoryIcon) => fr.t(($) => $.moderation.categories.iconName[name])
const FLOWER = meaning('flower')
const BICYCLE = meaning('bicycle')
const TREE = meaning('tree')

/** Toutes les icônes du contrat, nommées par leur sens. */
const allIcons = CATEGORY_ICON_CHOICES.map((name) => ({ name, label: meaning(name) }))
/** Trois icônes, pour les gestes du clavier. */
const three = (['flower', 'tree', 'bicycle'] as const).map((name) => ({
  name,
  label: meaning(name),
}))

/** La grille, avec son choix gardé comme dans la feuille ; `onChange` voit chaque icône choisie. */
function Grid({
  icons = allIcons,
  start = null,
  onChange,
}: {
  icons?: { name: CategoryIcon; label: string }[]
  start?: CategoryIcon | null
  onChange?: (name: CategoryIcon) => void
}) {
  const [value, setValue] = useState<CategoryIcon | null>(start)
  return (
    <IconGrid
      label={LABEL}
      icons={icons}
      value={value}
      onChange={(next) => {
        onChange?.(next as CategoryIcon)
        setValue(next as CategoryIcon)
      }}
    />
  )
}

/** La zone qu'on peut toucher, en hauteur et en largeur (hauteur ou largeur minimales, débord). */
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
    height: size(style.minHeight, style.height) + extra('top', 'bottom'),
    width: size(style.minWidth, style.width) + extra('left', 'right'),
  }
}

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const key = (name: string) => ({ key: name, repeat: false, preventDefault: () => {} })

describe('IconGrid', () => {
  it('is a radiogroup whose radios are named by the meaning of their icon (« Fleur »)', async () => {
    expect(FLOWER).toBe('Fleur') // témoin des traductions
    await renderWithProviders(<Grid />)

    // Le groupe n'est pas « accessible » au sens de React Native (ses choix le sont) : getByRole ne le
    // voit pas ; on le trouve par son nom, puis on lit son rôle.
    const group = screen.getByLabelText(LABEL)
    expect(group.props.accessibilityRole ?? group.props.role).toBe('radiogroup')
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(CATEGORY_ICON_CHOICES.length)
    expect(screen.getByRole('radio', { name: 'Fleur' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Vélo' })).toBeTruthy()
    // Jamais le code de l'icône.
    expect(screen.queryByRole('radio', { name: 'flower' })).toBeNull()
    expect(screen.queryByText('flower')).toBeNull()
  })

  it('checks nothing while no icon is chosen', async () => {
    await renderWithProviders(<Grid />)

    expect(screen.getAllByRole('radio').length).toBeGreaterThan(0) // témoin
    expect(screen.queryByRole('radio', { checked: true })).toBeNull()
  })

  it('checks the chosen icon, and gives it when touched', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Grid start="tree" onChange={onChange} />)
    expect(screen.getByRole('radio', { name: TREE, checked: true })).toBeTruthy()

    await fireEvent.press(screen.getByRole('radio', { name: BICYCLE }))

    expect(onChange).toHaveBeenLastCalledWith('bicycle')
    expect(screen.getByRole('radio', { name: BICYCLE, checked: true })).toBeTruthy()
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
  })

  it('keeps every icon at least 44 points high and wide', async () => {
    await renderWithProviders(<Grid />)

    for (const radio of screen.getAllByRole('radio')) {
      const size = touchSize(radio)
      expect(size.height).toBeGreaterThanOrEqual(layout.touchTarget)
      expect(size.width).toBeGreaterThanOrEqual(layout.touchTarget)
    }
  })

  it('checks with the space bar, moves with the arrows, and has a single tab stop on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const onChange = jest.fn()
    try {
      await renderWithProviders(<Grid icons={three} onChange={onChange} />)
      const tabIndexes = () =>
        screen.getAllByRole('radio').map((radio) => radio.props.tabIndex as number | undefined)

      // Rien n'est coché : le seul arrêt de Tab est la première icône.
      expect(tabIndexes()).toEqual([0, -1, -1])

      await fireEvent(screen.getByRole('radio', { name: TREE }), 'keyDown', key(' '))
      expect(onChange).toHaveBeenLastCalledWith('tree')
      expect(screen.getByRole('radio', { name: TREE, checked: true })).toBeTruthy()
      expect(tabIndexes()).toEqual([-1, 0, -1])

      await fireEvent(screen.getByRole('radio', { name: TREE }), 'keyDown', key('ArrowRight'))
      expect(screen.getByRole('radio', { name: BICYCLE, checked: true })).toBeTruthy()
      await fireEvent(screen.getByRole('radio', { name: BICYCLE }), 'keyDown', key('ArrowRight'))
      expect(screen.getByRole('radio', { name: FLOWER, checked: true })).toBeTruthy()
      await fireEvent(screen.getByRole('radio', { name: FLOWER }), 'keyDown', key('ArrowLeft'))
      expect(screen.getByRole('radio', { name: BICYCLE, checked: true })).toBeTruthy()
      expect(onChange).toHaveBeenLastCalledWith('bicycle')
    } finally {
      jest.restoreAllMocks()
    }
  })
})
