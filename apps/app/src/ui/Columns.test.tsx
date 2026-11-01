// Tests des rangées de Columns (R5a) : sur la page d'un projet, l'ordre de la page (lecteurs
// d'écran, touche Tab) suit l'ordre de lecture, rangée par rangée, et un trait sépare les rangées.
// Jest ne calcule aucune position : on vérifie l'ordre des éléments dans l'arbre, celui que suivent
// le lecteur d'écran et la touche Tab. Les places à l'écran se regardent dans les captures.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
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
