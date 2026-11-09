// Tests du choix des catégories d'un projet (R6a, « Catégorie et outils ») : seize pastilles avec
// leur icône ; la première touchée devient la catégorie principale (« 1 », miel), la seconde la
// catégorie seconde (« 2 », miel pâle). Toucher une catégorie choisie la retire ; si c'est la
// principale, la seconde prend sa place ; avec deux catégories, une troisième remplace la seconde
// (choix 2 de Louis).
//
// Pour les lecteurs d'écran (relecture du plan, ui-I6) : un groupe nommé « Catégorie », une case à
// cocher par catégorie, nommée avec son rang (« Sciences et espace, catégorie principale ») ; les
// changements de rang sont annoncés ; les chiffres dessinés sont cachés (le nom dit déjà le rang).
//
// L'interface attendue de `src/ui/CategoryPicker.tsx` (plan R6a, découpage, ligne U2) :
// - `CategoryPicker<T>({ label; hint; options: { value: T; label; icon }[]; primary: T | null;
//   secondary: T | null; onChange({ primary, secondary }); rankLabels: { primary; secondary } })`,
//   où `rankLabels.primary(category)` et `rankLabels.secondary(category)` donnent le nom d'une case
//   choisie (`project.form.categoryRank1`, `categoryRank2`) ;
// - les annonces viennent des traductions (`project.form.categoryPromoted`, `categoryReplaced`) ;
// - `nextCategories(current, value)`, pure et exportée : le choix qui suit un toucher.
import type { ProjectCategory } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { AccessibilityInfo, Platform } from 'react-native'
import { categoryList, categoryName } from '../testing/categories'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CategoryPicker, nextCategories } from './CategoryPicker'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Les blancs de la typographie française (insécables, fines) ramenés à des espaces. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

// R6b : les noms et les icônes des catégories viennent de l'API (GET /v1/categories), plus des
// traductions ; les choix du test sont ceux des seize catégories de départ, dans leur ordre.
const name = (value: ProjectCategory) => categoryName(value)
const options = categoryList('fr').categories.map((category) => ({
  value: category.code,
  label: category.name,
  icon: category.icon,
}))
const rankLabels = {
  primary: (category: string) => fr.t(($) => $.project.form.categoryRank1, { category }),
  secondary: (category: string) => fr.t(($) => $.project.form.categoryRank2, { category }),
}
const label = fr.t(($) => $.project.form.category)
const hint = fr.t(($) => $.project.form.categoryRule)

type Choice = { primary: ProjectCategory | null; secondary: ProjectCategory | null }

/** Le choix, gardé comme dans la vraie feuille ; `onChange` voit chaque changement. */
const Sample = ({
  start = { primary: null, secondary: null },
  onChange,
}: {
  start?: Choice
  onChange?: (choice: Choice) => void
}) => {
  const [choice, setChoice] = useState<Choice>(start)
  return (
    <CategoryPicker
      label={label}
      hint={hint}
      options={options}
      primary={choice.primary}
      secondary={choice.secondary}
      rankLabels={rankLabels}
      onChange={(next) => {
        onChange?.(next)
        setChoice(next)
      }}
    />
  )
}

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

type Node = { props: Record<string, unknown>; parent: Node | null; children: (Node | string)[] }

/** Le texte d'un élément et de ses enfants, mis bout à bout. */
const textOf = (node: Node | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')

/**
 * Vrai si `message` a été annoncé : demandé à VoiceOver, ou écrit dans une région que les lecteurs
 * d'écran lisent d'eux-mêmes (`role="status"` ou `alert`, ou une région vivante d'Android).
 */
const announced = (spy: jest.SpyInstance, message: string): boolean => {
  const said = plain(message)
  if (spy.mock.calls.some(([text]) => plain(String(text)) === said)) return true
  const regions = [
    ...screen.queryAllByRole('status', { includeHiddenElements: true }),
    ...screen.queryAllByRole('alert', { includeHiddenElements: true }),
  ] as unknown as Node[]
  return regions.some((region) => plain(textOf(region)).includes(said))
}

describe('nextCategories', () => {
  const none: Choice = { primary: null, secondary: null }

  it('makes the first category touched the primary one, the next one the second', () => {
    const first = nextCategories(none, 'science')
    expect(first).toEqual({ primary: 'science', secondary: null })
    expect(nextCategories(first, 'learning')).toEqual({ primary: 'science', secondary: 'learning' })
  })

  it('removes a chosen category when it is touched again', () => {
    expect(nextCategories({ primary: 'science', secondary: null }, 'science')).toEqual(none)
    expect(nextCategories({ primary: 'science', secondary: 'learning' }, 'learning')).toEqual({
      primary: 'science',
      secondary: null,
    })
  })

  it('moves the second category up when the primary one is removed', () => {
    expect(nextCategories({ primary: 'science', secondary: 'learning' }, 'science')).toEqual({
      primary: 'learning',
      secondary: null,
    })
  })

  it('replaces the second category with a third one (choice 2)', () => {
    expect(nextCategories({ primary: 'science', secondary: 'learning' }, 'games')).toEqual({
      primary: 'science',
      secondary: 'games',
    })
  })
})

describe('CategoryPicker', () => {
  let announce: jest.SpyInstance
  beforeEach(() => {
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
    announce.mockClear()
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('offers the sixteen categories as checkboxes, none checked at first', async () => {
    await renderWithProviders(<Sample />)

    expect(screen.getAllByRole('checkbox')).toHaveLength(16)
    expect(screen.getByRole('checkbox', { name: name('science'), checked: false })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: name('other'), checked: false })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { checked: true })).toBeNull()
    expect(screen.getByText(hint)).toBeTruthy()
  })

  it('names the group and reads each rank in the name', async () => {
    await renderWithProviders(<Sample />)

    // Le groupe porte le nom de la ligne : on sait de quoi parlent les seize cases.
    expect(roleOf(screen.getByLabelText(label).props)).toBe('group')

    await fireEvent.press(screen.getByRole('checkbox', { name: name('science') }))
    await fireEvent.press(screen.getByRole('checkbox', { name: name('learning') }))

    expect(
      screen.getByRole('checkbox', {
        name: rankLabels.primary(name('science')),
        checked: true,
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('checkbox', {
        name: rankLabels.secondary(name('learning')),
        checked: true,
      }),
    ).toBeTruthy()
    // Les autres gardent leur nom seul, sans rang.
    expect(screen.getByRole('checkbox', { name: name('games'), checked: false })).toBeTruthy()
  })

  it('gives each change to the screen, ranks included', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Sample onChange={onChange} />)

    await fireEvent.press(screen.getByRole('checkbox', { name: name('science') }))
    await fireEvent.press(screen.getByRole('checkbox', { name: name('learning') }))
    await fireEvent.press(screen.getByRole('checkbox', { name: name('games') }))

    expect(onChange.mock.calls.map(([choice]) => choice)).toEqual([
      { primary: 'science', secondary: null },
      { primary: 'science', secondary: 'learning' },
      { primary: 'science', secondary: 'games' },
    ])
  })

  it('needs no text for « Autre »', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Sample onChange={onChange} />)

    await fireEvent.press(screen.getByRole('checkbox', { name: name('other') }))

    expect(onChange).toHaveBeenLastCalledWith({ primary: 'other', secondary: null })
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('toggles a category with the space bar (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const key = { key: ' ', repeat: false, preventDefault: () => {} }
    await renderWithProviders(<Sample />)

    await fireEvent(screen.getByRole('checkbox', { name: name('music') }), 'keyDown', key)
    expect(
      screen.getByRole('checkbox', { name: rankLabels.primary(name('music')), checked: true }),
    ).toBeTruthy()

    await fireEvent(
      screen.getByRole('checkbox', { name: rankLabels.primary(name('music')) }),
      'keyDown',
      key,
    )
    expect(screen.getByRole('checkbox', { name: name('music'), checked: false })).toBeTruthy()
  })

  it('announces the second category moving up when the first is removed', async () => {
    await renderWithProviders(<Sample start={{ primary: 'science', secondary: 'learning' }} />)
    const promoted = fr.t(($) => $.project.form.categoryPromoted, { category: name('learning') })
    expect(announced(announce, promoted)).toBe(false) // témoin : rien n'est dit avant le geste

    await fireEvent.press(
      screen.getByRole('checkbox', { name: rankLabels.primary(name('science')) }),
    )

    expect(
      screen.getByRole('checkbox', { name: rankLabels.primary(name('learning')), checked: true }),
    ).toBeTruthy()
    expect(announced(announce, promoted)).toBe(true)
  })

  it('announces the second category replaced by a third', async () => {
    await renderWithProviders(<Sample start={{ primary: 'science', secondary: 'learning' }} />)
    const replaced = fr.t(($) => $.project.form.categoryReplaced, {
      category: name('games'),
      previous: name('learning'),
    })
    expect(announced(announce, replaced)).toBe(false) // témoin

    await fireEvent.press(screen.getByRole('checkbox', { name: name('games') }))

    expect(
      screen.getByRole('checkbox', { name: rankLabels.secondary(name('games')), checked: true }),
    ).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: name('learning'), checked: false })).toBeTruthy()
    expect(announced(announce, replaced)).toBe(true)
  })

  it('hides the drawn rank numbers from screen readers', async () => {
    await renderWithProviders(<Sample start={{ primary: 'science', secondary: 'learning' }} />)

    // Les chiffres sont dessinés (témoin), mais aucun lecteur d'écran ne les lit : le nom de la
    // case dit déjà le rang.
    expect(screen.getByText('1', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('2', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('1')).toBeNull()
    expect(screen.queryByText('2')).toBeNull()
  })
})
