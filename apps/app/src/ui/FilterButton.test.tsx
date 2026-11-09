// Tests du bouton de filtre (tranche R6b, scénarios « La page d'un outil » sur téléphone et « La
// recherche » ; relecture du plan ui-B1 et point 15). « Toutes les catégories » ouvre la feuille des
// catégories ; une catégorie choisie, le bouton montre son nom (« Cuisine ») et un lecteur d'écran
// lit « Catégorie : Cuisine » (`spokenLabel`) : le nom seul ne dirait pas ce qu'il filtre. Un bouton,
// de 44 points de haut au moins, avec son icône.
//
// L'API (découpage amendé de R6b, U2b) : FilterButton({ label; spokenLabel; icon; onPress }).
import { layout } from '@ruche/brand'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { categoryName } from '../testing/categories'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { FilterButton } from './FilterButton'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const ALL = fr.t(($) => $.tool.allCategories)
const cooking = categoryName('cooking')
const CHOSEN = fr.t(($) => $.tool.categoryChosen, { name: cooking })

/**
 * La hauteur de la zone qu'on peut toucher : la hauteur minimale de l'élément touchable, plus le
 * débord invisible qui l'agrandit sous le doigt (hitSlop), comme dans components.test.tsx.
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

describe('FilterButton', () => {
  it('composes the spoken name from the translations (witness)', () => {
    expect(ALL).toBe('Toutes les catégories')
    expect(CHOSEN).toMatch(/^Catégorie\s?: Cuisine$/)
  })

  it('is a button named « Toutes les catégories » before any choice', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <FilterButton label={ALL} spokenLabel={ALL} icon="shapes" onPress={onPress} />,
    )

    await fireEvent.press(screen.getByRole('button', { name: ALL }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('reads « Catégorie : Cuisine » once a category is chosen', async () => {
    await renderWithProviders(
      <FilterButton label={cooking} spokenLabel={CHOSEN} icon="cooking-pot" onPress={() => {}} />,
    )

    const button = screen.getByRole('button', { name: CHOSEN })
    // Le nom de la catégorie se voit sur le bouton.
    expect(within(button).getByText(cooking)).toBeTruthy()
    // Le nom lu n'est pas le seul libellé affiché.
    expect(screen.queryByRole('button', { name: cooking })).toBeNull()
  })

  it('keeps at least 44 points of height', async () => {
    await renderWithProviders(
      <FilterButton label={ALL} spokenLabel={ALL} icon="shapes" onPress={() => {}} />,
    )

    expect(touchHeight(screen.getByRole('button', { name: ALL }))).toBeGreaterThanOrEqual(
      layout.touchTarget,
    )
  })
})
