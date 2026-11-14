// Tests de la place collée de Screen (`sticky`, tranche R10 : les pastilles des ruches du Fil). Sur
// téléphone, elle reste collée en haut de l'écran pendant le défilement : sur iOS et Android par
// `stickyHeaderIndices` de la zone qui défile, sur le web par le CSS `position: sticky`. Sur
// ordinateur, elle est posée en tête du contenu, sans coller. Dans tous les cas, elle n'existe
// qu'une fois, après le titre et avant le contenu (ordre de lecture et de Tab). Jest ne fait rien
// défiler : ce qui colle vraiment se regarde dans le navigateur (catalogue, `--explore`).
import { act, screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { Screen } from './Screen'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = {
  type: unknown
  props: Record<string, unknown>
  parent: Node | null
  children: (Node | string)[]
}

/** Tous les éléments de l'arbre, dans l'ordre de lecture. */
const everyNode = (): Node[] => {
  const all: Node[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    all.push(node)
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  return all
}

/** La zone qui défile de l'écran (la seule, verticale). */
const scroller = (): Node => {
  const found = everyNode().find((node) => node.type === 'RCTScrollView')
  if (!found) throw new Error('No scrolling page')
  return found
}

/** Le rang, dans l'ordre de lecture, du texte donné. */
const rankOf = (text: string) => everyNode().indexOf(screen.getByText(text) as unknown as Node)

/** La vue de la place collée : le premier ancêtre du texte qui est enfant du contenu défilant. */
const placeOf = (text: string): Node => {
  const content = scroller().children[0] as Node
  for (let node = screen.getByText(text) as unknown as Node | null; node; node = node.parent) {
    if (node.parent === content) return node
  }
  throw new Error('La place n’est pas un enfant direct du contenu qui défile')
}

const page = (title?: string) => (
  <Screen width="page" {...(title ? { title } : null)} sticky={<Text>Les pastilles</Text>}>
    <Text>Le fil</Text>
  </Screen>
)

describe('Screen sticky', () => {
  it('shows the place once, after the title and before the content', async () => {
    await renderWithProviders(page('Fil'))

    expect(screen.getAllByText('Les pastilles')).toHaveLength(1)
    expect(rankOf('Fil')).toBeLessThan(rankOf('Les pastilles'))
    expect(rankOf('Les pastilles')).toBeLessThan(rankOf('Le fil'))
  })

  it('sticks the place on a phone, after the title', async () => {
    await renderWithProviders(page('Fil'))

    // La tête (le titre), puis la place : le second enfant de la zone qui défile.
    expect(scroller().props.stickyHeaderIndices).toEqual([1])
    expect(placeOf('Les pastilles')).toBeTruthy()
  })

  it('sticks the place first when the screen has no title', async () => {
    await renderWithProviders(page())

    expect(scroller().props.stickyHeaderIndices).toEqual([0])
  })

  it('sticks the place by CSS on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(page('Fil'))

      const style = StyleSheet.flatten(placeOf('Les pastilles').props.style as never) as Record<
        string,
        unknown
      >
      expect(style.position).toBe('sticky')
      expect(style.top).toBe(0)
      // Le navigateur colle ; la zone qui défile ne reçoit pas d'indices.
      expect(scroller().props.stickyHeaderIndices).toBeUndefined()
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('leaves the place at the head of the content on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(page('Fil'))

      expect(screen.getAllByText('Les pastilles')).toHaveLength(1)
      expect(rankOf('Les pastilles')).toBeLessThan(rankOf('Le fil'))
      expect(scroller().props.stickyHeaderIndices).toBeUndefined()
    } finally {
      await act(async () => restore())
    }
  })

  it('does not stick a place taller than a quarter of the screen', async () => {
    await renderWithProviders(page('Fil'))
    expect(scroller().props.stickyHeaderIndices).toEqual([1]) // témoin

    // Texte agrandi : la place mesure 300 points sur un téléphone de 844 (plus d'un quart).
    const onLayout = placeOf('Les pastilles').props.onLayout as (event: unknown) => void
    await act(async () =>
      onLayout({ nativeEvent: { layout: { x: 0, y: 80, width: 358, height: 300 } } }),
    )
    expect(scroller().props.stickyHeaderIndices).toBeUndefined()
  })

  it('changes nothing for a screen without a place (témoin)', async () => {
    await renderWithProviders(
      <Screen width="page" title="Fil">
        <Text>Le fil</Text>
      </Screen>,
    )

    expect(scroller().props.stickyHeaderIndices).toBeUndefined()
  })
})
