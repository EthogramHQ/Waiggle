// Tests des rangées de Columns (R5a) : sur la page d'un projet, l'ordre de la page (lecteurs
// d'écran, touche Tab) suit l'ordre de lecture, rangée par rangée, et un trait sépare les rangées.
// Jest ne calcule aucune position : on vérifie l'ordre des éléments dans l'arbre, celui que suivent
// le lecteur d'écran et la touche Tab. Les places à l'écran se regardent dans les captures.
import { layout } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { Dimensions, type StyleProp, StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { Button } from './Button'
import { Columns } from './Columns'
import { Text } from './Text'

const noop = () => {}

describe('Columns', () => {
  it('keeps the main column before the side column', async () => {
    await renderWithProviders(
      <Columns
        main={<Button label="Principale" onPress={noop} />}
        side={<Button label="Latérale" onPress={noop} />}
      />,
    )

    const names = screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)
    expect(names).toEqual(['Principale', 'Latérale'])
    // Une seule paire : aucun trait.
    expect(screen.queryByTestId('columns-divider')).toBeNull()
  })

  it('orders rows in reading order: row 1 left, row 1 right, row 2 left, row 2 right', async () => {
    await renderWithProviders(
      <Columns
        divided
        rows={[
          {
            main: <Button label="Galerie" onPress={noop} />,
            side: <Button label="Suivre" onPress={noop} />,
          },
          {
            main: <Button label="Copier le prompt" onPress={noop} />,
            side: <Button label="Envoyer" onPress={noop} />,
          },
        ]}
      />,
    )

    const names = screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)
    expect(names).toEqual(['Galerie', 'Suivre', 'Copier le prompt', 'Envoyer'])
  })

  it('draws one line between two rows, after the first row and before the second', async () => {
    await renderWithProviders(
      <Columns
        divided
        rows={[
          { main: <Text>Rangée 1 gauche</Text>, side: <Text>Rangée 1 droite</Text> },
          { main: <Text>Rangée 2 gauche</Text>, side: <Text>Rangée 2 droite</Text> },
        ]}
      />,
    )

    const divider = screen.getByTestId('columns-divider', { includeHiddenElements: true })
    // L'ordre de l'arbre : on aplatit le rendu en une suite de textes et de traits.
    const order: string[] = []
    type Node = { props: Record<string, unknown>; children: (Node | string)[] }
    const walk = (node: Node | string) => {
      if (typeof node === 'string') {
        order.push(node)
        return
      }
      if (node.props.testID === 'columns-divider') order.push('—')
      for (const child of node.children) walk(child)
    }
    walk(screen.root as unknown as Node)
    expect(order).toEqual([
      'Rangée 1 gauche',
      'Rangée 1 droite',
      '—',
      'Rangée 2 gauche',
      'Rangée 2 droite',
    ])
    // Le trait est un décor : caché aux lecteurs d'écran.
    expect(divider.props['aria-hidden']).toBe(true)
  })

  // Correction C3 de R5a : le pied de la page d'un projet (« Signaler ce projet ») est une rangée
  // qui prolonge la précédente, lue après elle, sans trait entre les deux.
  it('draws no line before a row that continues the previous one', async () => {
    await renderWithProviders(
      <Columns
        divided
        rows={[
          { main: <Text>Galerie</Text>, side: <Text>En-tête</Text> },
          { main: <Text>Description</Text>, side: <Text>Commentaires</Text> },
          { main: <Text>Signaler</Text>, side: null, continues: true },
        ]}
      />,
    )

    expect(screen.getByText('Signaler')).toBeTruthy()
    // Un seul trait : sous la première rangée.
    expect(screen.getAllByTestId('columns-divider', { includeHiddenElements: true })).toHaveLength(
      1,
    )
  })

  // Correction C3 de R5a (décision de Louis du 2/11/2026) : la page d'un projet élargit sa colonne
  // de droite (titre, actions, commentaires) jusqu'à `sideColumnWide`, sans passer en pile plus tôt.
  describe('with a wide side column', () => {
    type Node = { props: Record<string, unknown>; parent: Node | null }
    /** Le style de la colonne qui contient ce texte : le premier ancêtre qui a une base. */
    const columnOf = (text: string) => {
      let node: Node | null = screen.getByText(text) as unknown as Node
      while (node) {
        const style = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)
        if (style?.flexBasis !== undefined) return style
        node = node.parent
      }
      throw new Error(`no column around ${text}`)
    }

    it('lets the side column grow up to sideColumnWide, from the same base', async () => {
      await renderWithProviders(
        <Columns
          sideWidth="wide"
          rows={[{ main: <Text>Galerie</Text>, side: <Text>En-tête</Text> }]}
        />,
      )

      const side = columnOf('En-tête')
      const main = columnOf('Galerie')
      // La même base qu'avant : les colonnes ne passent pas en pile plus tôt.
      expect(side.flexBasis).toBe(layout.sideColumn)
      expect(side.maxWidth).toBe(layout.sideColumnWide)
      expect(layout.sideColumnWide).toBeGreaterThan(layout.sideColumn)
      // La place gagnée se partage : la colonne de droite grandit autant que la principale.
      expect(side.flexGrow).toBe(main.flexGrow)
    })

    it('keeps the narrow side column by default', async () => {
      await renderWithProviders(
        <Columns rows={[{ main: <Text>Galerie</Text>, side: <Text>En-tête</Text> }]} />,
      )

      expect(columnOf('En-tête').maxWidth).toBeUndefined()
      expect(columnOf('Galerie').flexGrow).toBeGreaterThan(columnOf('En-tête').flexGrow ?? 0)
    })
  })

  // R9 (la modération sur ordinateur, planche R9-Moderation-Desktop) : une troisième colonne,
  // `aside` (l'historique récent), à droite de la principale. API fixée au plan :
  // `{ side, main, aside, sideFirst }` ; trois colonnes seulement quand `useLayout().sizeClass`
  // vaut `wide` (1 100 points et plus), sinon comme aujourd'hui (deux colonnes, ou la pile).
  // L'écran choisit seul sa mise en page : sur téléphone, il ne passe pas `aside`.
  describe('with a third column, aside (R9)', () => {
    type Host = { type: unknown; props: Record<string, unknown>; parent: Host | null }
    type Tree = { props: Record<string, unknown>; children: (Tree | string)[] }
    const hasBasis = (node: Host | Tree) =>
      StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)?.flexBasis !== undefined
    /** La colonne qui contient ce texte : le premier ancêtre qui a une base. */
    const columnNode = (text: string): Host => {
      let node: Host | null = screen.getByText(text) as unknown as Host
      while (node) {
        if (hasBasis(node)) return node
        node = node.parent
      }
      throw new Error(`no column around ${text}`)
    }
    /** Les colonnes posées côte à côte dans la rangée de ce texte : les enfants qui ont une base. */
    const columnsBeside = (text: string) => {
      const row = columnNode(text).parent as unknown as Tree | null
      if (!row) throw new Error(`no row around ${text}`)
      return row.children.filter(
        (child): child is Tree => typeof child !== 'string' && hasBasis(child),
      )
    }
    /** Les textes dans l'ordre de l'arbre, celui du lecteur d'écran et de la touche Tab. */
    const readingOrder = () => {
      const order: string[] = []
      const walk = (node: Tree | string) => {
        if (typeof node === 'string') order.push(node)
        else for (const child of node.children) walk(child)
      }
      walk(screen.root as unknown as Tree)
      return order
    }

    let restoreWindow: (() => void) | null = null
    afterEach(() => {
      restoreWindow?.()
      restoreWindow = null
    })
    /** Une fenêtre de 900 points : une tablette, ou une petite fenêtre d'ordinateur (`medium`). */
    const setMediumWindow = () => {
      const medium = { width: 900, height: 900, scale: 2, fontScale: 1 }
      const phoneWindow = { width: 390, height: 844, scale: 3, fontScale: 1 }
      Dimensions.set({ window: medium, screen: medium })
      restoreWindow = () => Dimensions.set({ window: phoneWindow, screen: phoneWindow })
    }

    const threeColumns = (
      <Columns
        sideFirst
        side={<Text>La file</Text>}
        main={<Text>Le détail</Text>}
        aside={<Text>L’historique</Text>}
      />
    )

    it('sets three columns side by side on a wide screen: the queue, the detail, the history', async () => {
      restoreWindow = setDesktopWindow()
      await renderWithProviders(threeColumns)

      // Trois colonnes distinctes, dans la même rangée.
      expect(columnsBeside('Le détail')).toHaveLength(3)
      const columns = new Set(['La file', 'Le détail', 'L’historique'].map(columnNode))
      expect(columns.size).toBe(3)
      expect(columnNode('L’historique').parent).toBe(columnNode('Le détail').parent)
    })

    it('reads the queue, then the detail, then the history', async () => {
      restoreWindow = setDesktopWindow()
      await renderWithProviders(threeColumns)

      expect(readingOrder()).toEqual(['La file', 'Le détail', 'L’historique'])
    })

    it('keeps two columns below a wide screen, without losing the aside', async () => {
      setMediumWindow()
      await renderWithProviders(threeColumns)

      expect(columnsBeside('Le détail')).toHaveLength(2)
      // Rien n'est perdu : ce que l'écran a donné reste lu, après le détail.
      const order = readingOrder()
      expect(order).toContain('L’historique')
      expect(order.indexOf('L’historique')).toBeGreaterThan(order.indexOf('Le détail'))
    })

    it('keeps two columns on a phone too', async () => {
      await renderWithProviders(threeColumns)

      expect(screen.getByText('Le détail')).toBeTruthy() // témoin
      expect(columnsBeside('Le détail').length).toBeLessThanOrEqual(2)
    })

    it('adds no empty third column without an aside, even on a wide screen', async () => {
      restoreWindow = setDesktopWindow()
      await renderWithProviders(
        <Columns sideFirst side={<Text>La file</Text>} main={<Text>Le détail</Text>} />,
      )

      expect(columnsBeside('Le détail')).toHaveLength(2)
      expect(readingOrder()).toEqual(['La file', 'Le détail'])
    })

    it('still puts the side column first only with sideFirst', async () => {
      restoreWindow = setDesktopWindow()
      await renderWithProviders(
        <Columns
          side={<Text>La file</Text>}
          main={<Text>Le détail</Text>}
          aside={<Text>L’historique</Text>}
        />,
      )

      const order = readingOrder()
      expect(order.indexOf('Le détail')).toBeLessThan(order.indexOf('La file'))
      expect(order).toContain('L’historique')
    })
  })

  it('draws no line without `divided`, nor before the first row', async () => {
    await renderWithProviders(
      <Columns
        rows={[
          { main: <Text>Haut</Text>, side: <Text>Côté</Text> },
          { main: <Text>Bas</Text>, side: <Text>Fin</Text> },
        ]}
      />,
    )

    expect(screen.getByText('Bas')).toBeTruthy()
    expect(screen.queryByTestId('columns-divider', { includeHiddenElements: true })).toBeNull()
  })
})
