// Tests de l'emplacement à côté du titre de Screen (`titleAside`, R4) et du défilement transmis
// (`onScroll`). Le Fil passe par le titre de Screen au lieu de son en-tête maison : son bouton des
// nouveautés se pose à côté du titre « Fil », qui reste le seul titre de niveau 1, et l'écart entre
// le titre et le sous-titre reste celui d'Explorer (point des listes « écart titre → sous-titre »).
// Jest ne calcule aucune position : on lit l'arbre (qui partage quelle rangée, dans quel ordre) et
// les styles qui décident de l'écart ; la hauteur réelle se mesure dans le navigateur.
import { space } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { IconButton } from './IconButton'
import { Screen } from './Screen'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'expose pas le type complet).
type Node = {
  type: unknown
  props: Record<string, unknown>
  parent: Node | null
  children: (Node | string)[]
}

/** Le premier ancêtre commun de deux éléments. */
const commonParent = (a: Node, b: Node): Node => {
  const above = new Set<Node>()
  for (let node: Node | null = a; node; node = node.parent) above.add(node)
  for (let node: Node | null = b.parent; node; node = node.parent) if (above.has(node)) return node
  throw new Error('aucun parent commun')
}

/** Tous les éléments de l'arbre, dans l'ordre de lecture (celui des lecteurs d'écran et de Tab). */
const inReadingOrder = (root: Node): Node[] => {
  const all: Node[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    all.push(node)
    for (const child of node.children) visit(child)
  }
  visit(root)
  return all
}

/** Le premier élément natif de ce type (« RCTScrollView »). */
const hostOfType = (type: string): Node => {
  const found = inReadingOrder(screen.root as unknown as Node).find((node) => node.type === type)
  if (!found) throw new Error(`No host element of type ${type}`)
  return found
}

const style = (node: Node) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>

// Ce qui ajouterait de l'air au-dessus ou au-dessous d'un élément, en plus de l'écart (`gap`).
const verticalSpacing = [
  'margin',
  'marginVertical',
  'marginTop',
  'marginBottom',
  'padding',
  'paddingVertical',
  'paddingTop',
  'paddingBottom',
]

/** Les réglages d'air vertical non nuls posés entre un élément et un de ses ancêtres (exclu). */
const spacingBetween = (from: Node, ancestor: Node) => {
  const found: string[] = []
  for (let node: Node | null = from.parent; node && node !== ancestor; node = node.parent) {
    const own = style(node)
    for (const key of verticalSpacing) if (own[key]) found.push(`${key}: ${String(own[key])}`)
  }
  return found
}

// Le bouton des nouveautés, tel que le Fil le passe (un bouton nommé par son texte). Ces tests
// décrivent le haut de la page, titre en vue (ici sur téléphone). RF (ui-5) : sur ordinateur, quand
// le titre passe sous la barre fixe, ce même bouton se pose sous elle (Screen.pinned.test.tsx et
// HomeScreen.news.test.tsx) ; à côté du titre, rien ne change.
const news = <IconButton icon="arrow-left" label="3 nouveautés" onPress={() => {}} />

describe('Screen titleAside', () => {
  it('keeps one h1 and puts the aside after it', async () => {
    await renderWithProviders(
      <Screen width="page" title="Fil" titleAside={news}>
        <Text>Le contenu</Text>
      </Screen>,
    )

    // Un seul titre : celui de la page. Le bouton posé à côté n'en est pas un.
    const headings = screen.getAllByRole('header')
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Fil')
    const title = headings[0] as unknown as Node
    const aside = screen.getByRole('button', { name: '3 nouveautés' }) as unknown as Node
    // À côté du titre : les deux partagent une rangée…
    expect(style(commonParent(title, aside))).toMatchObject({ flexDirection: 'row' })
    // … le titre d'abord, dans l'ordre de lecture et de Tab…
    const order = inReadingOrder(screen.root as unknown as Node)
    expect(order.indexOf(title)).toBeLessThan(order.indexOf(aside))
    // … et le contenu de l'écran n'entre pas dans cette rangée.
    const content = screen.getByText('Le contenu') as unknown as Node
    expect(commonParent(content, aside)).not.toBe(commonParent(title, aside))
  })

  it('keeps the gap from the title to the subtitle that Explorer has', async () => {
    await renderWithProviders(
      <Screen width="page" title="Fil" subtitle="Les projets de tes proches" titleAside={news}>
        <Text>Le contenu</Text>
      </Screen>,
    )

    // Témoin : le bouton est bien là, à côté du titre.
    expect(screen.getByRole('button', { name: '3 nouveautés' })).toBeTruthy()
    const title = screen.getByRole('header') as unknown as Node
    const subtitle = screen.getByText('Les projets de tes proches') as unknown as Node
    // L'écart entre les deux vient du seul `gap` de leur colonne commune, le même qu'Explorer
    // (space.sm) : la rangée du titre n'ajoute ni marge ni remplissage au-dessus ou au-dessous.
    const column = commonParent(title, subtitle)
    expect(style(column).gap).toBe(space.sm)
    expect(spacingBetween(title, column)).toEqual([])
    expect(spacingBetween(subtitle, column)).toEqual([])
  })

  it('keeps the same gap without an aside, as Explorer draws it', async () => {
    // Témoin du test précédent (il passe déjà) : l'écart d'Explorer, sans bouton à côté.
    await renderWithProviders(
      <Screen width="page" title="Explorer" subtitle="Des projets à découvrir">
        <Text>Le contenu</Text>
      </Screen>,
    )

    const title = screen.getByRole('header') as unknown as Node
    const subtitle = screen.getByText('Des projets à découvrir') as unknown as Node
    const column = commonParent(title, subtitle)
    expect(style(column).gap).toBe(space.sm)
    expect(spacingBetween(title, column)).toEqual([])
  })

  it('hands the scroll of the page to onScroll', async () => {
    const onScroll = jest.fn()
    await renderWithProviders(
      <Screen width="page" title="Fil" onScroll={onScroll}>
        <Text>Le contenu</Text>
      </Screen>,
    )

    // Le défilement de la zone qui défile de l'écran (l'élément natif RCTScrollView en test). On
    // appelle le gestionnaire posé sur cet élément même : fireEvent remonterait l'arbre et
    // trouverait la prop `onScroll` de Screen, même si Screen ne la transmettait pas.
    const scroller = hostOfType('RCTScrollView')
    expect(typeof scroller.props.onScroll).toBe('function')
    await act(async () => {
      ;(scroller.props.onScroll as (event: unknown) => void)({
        nativeEvent: {
          contentOffset: { x: 0, y: 120 },
          layoutMeasurement: { width: 390, height: 844 },
          contentSize: { width: 390, height: 2400 },
        },
      })
    })

    expect(onScroll).toHaveBeenCalledTimes(1)
    expect(onScroll.mock.calls[0]?.[0]).toMatchObject({
      nativeEvent: { contentOffset: { y: 120 } },
    })
  })
})
