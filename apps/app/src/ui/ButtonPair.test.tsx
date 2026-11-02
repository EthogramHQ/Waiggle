// Tests de la paire de boutons (ButtonPair, R5a, relecture de l'interface du plan ui-2 et point des
// listes « Tester la démo de 720 px ») : deux actions d'égale importance côte à côte, comme
// « Tester la démo » et « Suivre ce projet » sur la page projet de 768 points à la largeur des
// colonnes. Chaque bouton fait 360 points au plus (plus de bouton étiré sur toute la page) ; quand
// ils ne tiennent pas côte à côte (téléphone étroit, texte à 200 %), ils passent l'un sous l'autre
// au lieu de sortir de l'écran ou de couper leur libellé. L'écran ne pose ni largeur ni position :
// tout est ici.
//
// Jest ne calcule aucune position. On lit donc les règles posées : la rangée, son passage à la
// ligne (ou la colonne), la largeur maximale de chaque bouton, l'ordre de l'arbre. Le rendu réel à
// 320 points et 200 % se vérifie dans le navigateur (texte-200.mjs, captures).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { ButtonPair } from './ButtonPair'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'expose pas le type complet).
type Node = { props: Record<string, unknown>; parent: Node | null; children: (Node | string)[] }

const styleOf = (node: Node): Record<string, unknown> =>
  (StyleSheet.flatten(node.props.style as never) as Record<string, unknown> | undefined) ?? {}

/** Le premier ancêtre commun de deux éléments : la rangée qui porte les deux boutons. */
const commonParent = (a: Node, b: Node): Node => {
  const above = new Set<Node>()
  for (let node: Node | null = a; node; node = node.parent) above.add(node)
  for (let node: Node | null = b.parent; node; node = node.parent) if (above.has(node)) return node
  throw new Error('aucun parent commun')
}

/**
 * La largeur maximale d'un bouton : la plus petite `maxWidth` (ou `width`) en points posée entre le
 * bouton (compris) et la rangée (exclue). undefined si rien ne le borne.
 */
const capOf = (button: Node, row: Node): number | undefined => {
  let cap: number | undefined
  for (let node: Node | null = button; node && node !== row; node = node.parent) {
    const { maxWidth, width } = styleOf(node)
    for (const value of [maxWidth, width]) {
      if (typeof value === 'number') cap = cap === undefined ? value : Math.min(cap, value)
    }
  }
  return cap
}

/** La position d'un élément dans l'ordre de l'arbre : l'ordre de lecture et de Tab. */
const readingOrder = (element: unknown): number => {
  let index = 0
  let found = -1
  const visit = (node: Node | string) => {
    if (typeof node === 'string' || found >= 0) return
    if (node === element) found = index
    index += 1
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  return found
}

/** La fenêtre de l'appareil : largeur en points et taille du texte (1 = normale, 2 = 200 %). */
const setWindow = async (width: number, fontScale = 1) => {
  const window = { width, height: 1024, scale: 2, fontScale }
  await act(async () => Dimensions.set({ window, screen: window }))
}

afterEach(async () => {
  // Le téléphone de jest.setup.ts, pour les fichiers suivants.
  const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
  await act(async () => Dimensions.set({ window: phone, screen: phone }))
})

const TEST = 'Tester la démo'
const FOLLOW = 'Suivre ce projet'

const pair = (onTest = () => {}, onFollow = () => {}) => (
  <ButtonPair>
    <Button label={TEST} icon="arrow-square-out" onPress={onTest} />
    <Button label={FOLLOW} variant="secondary" onPress={onFollow} />
  </ButtonPair>
)

const buttons = () => ({
  first: screen.getByRole('button', { name: TEST }) as unknown as Node,
  second: screen.getByRole('button', { name: FOLLOW }) as unknown as Node,
})

describe('ButtonPair', () => {
  it('shows both buttons, each with its own action', async () => {
    const onTest = jest.fn()
    const onFollow = jest.fn()
    await renderWithProviders(pair(onTest, onFollow))

    await fireEvent.press(screen.getByRole('button', { name: TEST }))
    await fireEvent.press(screen.getByRole('button', { name: FOLLOW }))

    expect(onTest).toHaveBeenCalledTimes(1)
    expect(onFollow).toHaveBeenCalledTimes(1)
  })

  it('puts them side by side on a tablet', async () => {
    await setWindow(800)
    await renderWithProviders(pair())

    const { first, second } = buttons()
    const row = commonParent(first, second)
    expect(styleOf(row).flexDirection).toBe('row')
  })

  it('never makes a button wider than 360 points', async () => {
    await setWindow(800)
    await renderWithProviders(pair())

    const { first, second } = buttons()
    const row = commonParent(first, second)
    // Le point des listes : à 768 points, « Tester la démo » faisait 720 points de large.
    const caps = [capOf(first, row), capOf(second, row)]
    for (const cap of caps) {
      expect(cap).toBeDefined()
      expect(cap).toBeLessThanOrEqual(360)
    }
  })

  it('keeps the 360-point limit on a wide window too', async () => {
    await setWindow(1440)
    await renderWithProviders(pair())

    const { first, second } = buttons()
    const row = commonParent(first, second)
    expect(capOf(first, row)).toBeLessThanOrEqual(360)
    expect(capOf(second, row)).toBeLessThanOrEqual(360)
  })

  it('lets them stack on a narrow phone instead of overflowing', async () => {
    await setWindow(320)
    await renderWithProviders(pair())

    const { first, second } = buttons()
    const style = styleOf(commonParent(first, second))
    // Deux façons de passer l'un sous l'autre : une colonne décidée par la paire, ou une rangée qui
    // passe à la ligne quand les deux ne tiennent pas (le navigateur en décide à la mesure).
    const stacks = style.flexDirection === 'column' || style.flexWrap === 'wrap'
    expect(stacks).toBe(true)
  })

  it('lets them stack with text at 200 %, even on a tablet', async () => {
    await setWindow(800, 2)
    await renderWithProviders(pair())

    const { first, second } = buttons()
    const style = styleOf(commonParent(first, second))
    const stacks = style.flexDirection === 'column' || style.flexWrap === 'wrap'
    expect(stacks).toBe(true)
  })

  it('keeps the reading order when stacked: the first button stays first', async () => {
    await setWindow(320, 2)
    await renderWithProviders(pair())

    const { first, second } = buttons()
    const style = styleOf(commonParent(first, second))
    // Ni `row-reverse` ni `column-reverse` : l'ordre affiché reste celui de la lecture et de Tab.
    expect(String(style.flexDirection ?? 'column')).not.toMatch(/reverse/)
    expect(readingOrder(first)).toBeGreaterThanOrEqual(0)
    expect(readingOrder(second)).toBeGreaterThan(readingOrder(first))
  })

  it('keeps the reading order side by side too', async () => {
    await setWindow(800)
    await renderWithProviders(pair())

    const { first, second } = buttons()
    expect(String(styleOf(commonParent(first, second)).flexDirection)).not.toMatch(/reverse/)
    expect(readingOrder(second)).toBeGreaterThan(readingOrder(first))
  })
})
