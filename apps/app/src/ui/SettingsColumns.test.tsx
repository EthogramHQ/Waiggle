// Tests de la mise en page des réglages sur ordinateur (SettingsColumns, R2, relecture de
// l'interface C7 et C8) : la colonne des rubriques, le titre de la rubrique ouverte (un titre de
// section, h2) et son contenu ; et le focus du clavier, posé sur ce titre quand on vient de choisir
// la rubrique dans la colonne (sinon il retomberait tout en haut de la nouvelle page).
import { layout, space } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { focusWithoutScroll } from './focus'
import { noteSectionChosen, SettingsColumns } from './SettingsColumns'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
}))

const Sample = ({ current = 'language' }: { current?: string }) => (
  <SettingsColumns nav={<Text>La colonne des rubriques</Text>} title="Langue" current={current}>
    <Text>Français ou anglais</Text>
  </SettingsColumns>
)

describe('SettingsColumns', () => {
  beforeEach(() => jest.mocked(focusWithoutScroll).mockClear())
  afterEach(() => jest.restoreAllMocks())

  it('shows the column, the title of the open section as a level 2 heading, and its content', async () => {
    await renderWithProviders(<Sample />)

    expect(screen.getByText('La colonne des rubriques')).toBeTruthy()
    // Un titre (le niveau 2 se relève dans le navigateur, pas par Jest : charte de design).
    expect(screen.getByRole('header', { name: 'Langue' })).toBeTruthy()
    expect(screen.getByText('Français ou anglais')).toBeTruthy()
  })

  it('puts the keyboard focus on the title when the section was just chosen in the column (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    noteSectionChosen('language')

    await renderWithProviders(<Sample />)

    expect(focusWithoutScroll).toHaveBeenCalledTimes(1)
  })

  it('leaves the focus alone when the page was opened otherwise (a link, a reload)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')

    await renderWithProviders(<Sample />)

    expect(focusWithoutScroll).not.toHaveBeenCalled()
  })

  it('does not take the focus for a section other than the one chosen', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    noteSectionChosen('profile')

    await renderWithProviders(<Sample current="security" />)

    expect(focusWithoutScroll).not.toHaveBeenCalled()
  })
})

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; parent: Node | null; children: (Node | string)[] }

/** Les ancêtres d'un élément, du plus proche au plus lointain. */
const ancestorsOf = (element: unknown): Node[] => {
  const found: Node[] = []
  let node = (element as Node).parent
  while (node) {
    found.push(node)
    node = node.parent
  }
  return found
}

/** Vrai si le texte se trouve quelque part sous ce nœud. */
const contains = (node: Node | string, text: string): boolean =>
  typeof node === 'string'
    ? node.includes(text)
    : node.children.some((child) => contains(child, text))

const maxWidthOf = (node: Node) =>
  (StyleSheet.flatten(node.props.style as never) as { maxWidth?: unknown } | undefined)?.maxWidth

// R3, « Venus des listes » (choix de Louis du 30/10/2026) : sur un grand écran, la rubrique ouverte
// prenait toute la largeur restante, et un interrupteur ou une radio s'éloignait de son libellé.
// Sa colonne est bornée à la largeur d'un formulaire, le jeton layout.formWidth (jamais un nombre
// écrit ici : changer le jeton change la colonne).
describe('SettingsColumns, on a wide screen (R3)', () => {
  it('bounds the open section to the width of a form', async () => {
    await renderWithProviders(<Sample />)

    // Le cadre borné porte le titre et le contenu de la rubrique, mais pas la colonne des rubriques.
    const bounded = ancestorsOf(screen.getByText('Français ou anglais')).find(
      (node) => maxWidthOf(node) === layout.formWidth,
    )
    expect(bounded).toBeDefined()
    if (!bounded) return
    expect(contains(bounded, 'Langue')).toBe(true)
    expect(contains(bounded, 'La colonne des rubriques')).toBe(false)
  })

  // Témoin : la colonne des rubriques garde sa largeur, et rien d'autre n'est borné plus étroit.
  it('keeps the column of sections at its own width', async () => {
    await renderWithProviders(<Sample />)

    const widths = ancestorsOf(screen.getByText('La colonne des rubriques')).map(
      (node) =>
        (StyleSheet.flatten(node.props.style as never) as { width?: unknown } | undefined)?.width,
    )
    expect(widths).toContain(layout.settingsNavWidth)
  })
})

// R15 (« Ce qui reste étroit ») : les Réglages gardent leur largeur (la colonne des rubriques et
// une rubrique de la largeur d'un formulaire), mais leur bloc est centré dans la page au lieu d'être
// calé à gauche. Le bloc : le premier cadre qui porte la colonne des rubriques et la rubrique.
// Centré : `alignSelf: 'center'`, ou des marges automatiques ; borné : une largeur maximale qui
// ne dépasse pas les deux colonnes et leur écart.
describe('SettingsColumns, centred in a wide page (R15)', () => {
  const isCentred = (node: Node) => {
    const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
    return (
      style.alignSelf === 'center' ||
      style.marginHorizontal === 'auto' ||
      (style.marginLeft === 'auto' && style.marginRight === 'auto')
    )
  }

  it('centres its block in the page, at the same width as before', async () => {
    await renderWithProviders(<Sample />)

    const block = ancestorsOf(screen.getByText('Français ou anglais')).find((node) =>
      contains(node, 'La colonne des rubriques'),
    )
    expect(block).toBeDefined()
    if (!block) return
    expect(isCentred(block)).toBe(true)
    const bound = maxWidthOf(block)
    expect(typeof bound).toBe('number')
    expect(bound as number).toBeLessThanOrEqual(
      layout.settingsNavWidth + space.xxl + layout.formWidth,
    )
    expect(bound as number).toBeGreaterThan(layout.settingsNavWidth)
  })
})
