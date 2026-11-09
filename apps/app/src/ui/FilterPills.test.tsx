// Tests de la rangée de pastilles de filtre (tranche R6b, scénarios « La page d'un outil » et « Les
// catégories en filtre » ; relecture du plan, point 15 : elle part de `Choices`). Une seule pastille
// est cochée, en miel ; la première, « Toutes » (`allLabel`), vaut « aucun filtre » (`null`). Les
// lecteurs d'écran l'annoncent comme un groupe de boutons radio nommé (« Catégories des projets
// récents »). Une pastille peut porter une icône (la catégorie) et un nombre (« Cuisine 3 », lu
// « Cuisine, 3 projets » par `spokenLabel`). Au clavier (web), comme `Choices` : un seul arrêt de
// Tab, la barre d'espace coche, les flèches passent à la voisine. Chaque pastille a ses 44 points.
//
// L'API (découpage amendé de R6b, U2) : FilterPills<T>({ label; allLabel; value: T | null;
// options: { value: T; label; icon?; count?; spokenLabel? }[]; groups?; scroll?: boolean;
// onChange(value: T | null) }).
import { layout } from '@ruche/brand'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform, StyleSheet } from 'react-native'
import { categoryName } from '../testing/categories'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { FilterPills } from './FilterPills'
import { iconPaths } from './icons.generated'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LABEL = fr.t(($) => $.explore.categoriesLabel)
const ALL = fr.t(($) => $.explore.allCategories)
const cooking = categoryName('cooking')
const animals = categoryName('animals')
const science = categoryName('science')

/** « Cuisine, 3 projets », tel que l'écran le compose par les traductions. */
const withCount = (name: string, count: number) =>
  fr.t(($) => $.tool.categoryWithCount, {
    name,
    projects: fr.t(($) => $.tools.projects, { count }),
  })

type Code = 'cooking' | 'animals' | 'science'
const options = [
  { value: 'cooking', label: cooking, icon: 'cooking-pot' },
  { value: 'animals', label: animals, icon: 'paw-print' },
  { value: 'science', label: science, icon: 'planet' },
] as const

/** La rangée, avec son filtre gardé comme dans l'écran ; `onChange` voit chaque valeur. */
function Pills({
  start = null,
  onChange,
}: {
  start?: Code | null
  onChange?: (value: Code | null) => void
}) {
  const [value, setValue] = useState<Code | null>(start)
  return (
    <FilterPills
      label={LABEL}
      allLabel={ALL}
      value={value}
      options={[...options]}
      onChange={(next) => {
        onChange?.(next)
        setValue(next)
      }}
    />
  )
}

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Ce qui est dessiné, dans l'ordre : une icône reconnue à son tracé, le texte sinon. */
const drawnOrder = (node: Host | string): string[] => {
  if (typeof node === 'string') return [node]
  const d = node.props.d
  if (typeof d === 'string') {
    const icon = Object.entries(iconPaths).find(([, paths]) => paths[0] === d)?.[0]
    return icon ? [`icône ${icon}`] : []
  }
  return node.children.flatMap(drawnOrder)
}

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

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const key = (name: string) => ({ key: name, repeat: false, preventDefault: () => {} })

describe('FilterPills', () => {
  it('is a radiogroup named by its label, « Toutes » checked when the value is null', async () => {
    await renderWithProviders(<Pills />)

    // Le groupe n'est pas « accessible » au sens de React Native (ses choix le sont) : getByRole ne le
    // voit pas ; on le trouve par son nom, puis on lit son rôle.
    const group = screen.getByLabelText(LABEL)
    expect(group.props.accessibilityRole ?? group.props.role).toBe('radiogroup')
    const radios = within(group).getAllByRole('radio')
    // « Toutes » d'abord, puis chaque option dans son ordre.
    expect(radios.map((radio) => radio.props.accessibilityLabel)).toEqual([
      ALL,
      cooking,
      animals,
      science,
    ])
    expect(screen.getByRole('radio', { name: ALL, checked: true })).toBeTruthy()
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
  })

  it('checks the pill of the value, and nothing else', async () => {
    await renderWithProviders(<Pills start="animals" />)

    expect(screen.getByRole('radio', { name: animals, checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: ALL, checked: false })).toBeTruthy()
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
  })

  it('gives the touched value, and null for « Toutes »', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Pills onChange={onChange} />)

    await fireEvent.press(screen.getByRole('radio', { name: cooking }))
    expect(onChange).toHaveBeenLastCalledWith('cooking')
    expect(screen.getByRole('radio', { name: cooking, checked: true })).toBeTruthy()

    await fireEvent.press(screen.getByRole('radio', { name: ALL }))
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(screen.getByRole('radio', { name: ALL, checked: true })).toBeTruthy()
  })

  it('reads the count in the name of a pill: « Cuisine, 3 projets »', async () => {
    expect(withCount(cooking, 3)).toBe('Cuisine, 3 projets') // témoin des traductions
    await renderWithProviders(
      <FilterPills
        label={fr.t(($) => $.tool.categoryLabel)}
        allLabel={fr.t(($) => $.tool.all)}
        value={null}
        options={[
          { value: 'cooking', label: cooking, count: 3, spokenLabel: withCount(cooking, 3) },
          { value: 'animals', label: animals, count: 1, spokenLabel: withCount(animals, 1) },
        ]}
        onChange={() => {}}
      />,
    )

    const pill = screen.getByRole('radio', { name: 'Cuisine, 3 projets' })
    // Le nombre se voit aussi, à côté du nom.
    expect(within(pill).getByText(cooking)).toBeTruthy()
    expect(within(pill).getByText('3')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Animaux, 1 projet' })).toBeTruthy()
  })

  it('draws the icon of a pill before its name, the spoken name unchanged', async () => {
    await renderWithProviders(<Pills />)

    const pill = screen.getByRole('radio', { name: cooking })
    expect(drawnOrder(pill as unknown as Host)).toEqual(['icône cooking-pot', cooking])
    // « Toutes » n'a pas d'icône.
    expect(drawnOrder(screen.getByRole('radio', { name: ALL }) as unknown as Host)).toEqual([ALL])
  })

  it('keeps every pill at least 44 points high', async () => {
    await renderWithProviders(<Pills start="cooking" />)

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(4) // témoin
    for (const radio of radios) {
      expect(touchHeight(radio)).toBeGreaterThanOrEqual(layout.touchTarget)
    }
  })

  it('checks with the space bar, moves with the arrows, and has a single tab stop on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const onChange = jest.fn()
    try {
      await renderWithProviders(<Pills onChange={onChange} />)
      const tabIndexes = () =>
        screen.getAllByRole('radio').map((radio) => radio.props.tabIndex as number | undefined)

      // Un seul arrêt de Tab : la pastille cochée (« Toutes »).
      expect(tabIndexes()).toEqual([0, -1, -1, -1])

      // La barre d'espace coche.
      await fireEvent(screen.getByRole('radio', { name: animals }), 'keyDown', key(' '))
      expect(onChange).toHaveBeenLastCalledWith('animals')
      expect(screen.getByRole('radio', { name: animals, checked: true })).toBeTruthy()
      expect(tabIndexes()).toEqual([-1, -1, 0, -1])

      // Les flèches passent à la voisine en la cochant, et font le tour.
      await fireEvent(screen.getByRole('radio', { name: animals }), 'keyDown', key('ArrowRight'))
      expect(screen.getByRole('radio', { name: science, checked: true })).toBeTruthy()
      await fireEvent(screen.getByRole('radio', { name: science }), 'keyDown', key('ArrowRight'))
      expect(screen.getByRole('radio', { name: ALL, checked: true })).toBeTruthy()
      expect(onChange).toHaveBeenLastCalledWith(null)
      await fireEvent(screen.getByRole('radio', { name: ALL }), 'keyDown', key('ArrowLeft'))
      expect(screen.getByRole('radio', { name: science, checked: true })).toBeTruthy()
      await fireEvent(screen.getByRole('radio', { name: science }), 'keyDown', key('ArrowUp'))
      expect(screen.getByRole('radio', { name: animals, checked: true })).toBeTruthy()
    } finally {
      jest.restoreAllMocks()
    }
  })
})
