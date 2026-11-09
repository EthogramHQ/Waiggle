// Test de la couche `overlay` de Screen (R6a, correction C5-E3) : elle se pose par-dessus tout
// l'écran, mais ne doit prendre aucun toucher elle-même. Screen l'enveloppe donc dans une vue
// `pointerEvents="box-none"` (seuls ses enfants dessinés reçoivent le toucher), au lieu de compter
// sur l'enfant pour laisser passer.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Screen } from './Screen'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; parent: Node | null }

describe('Screen overlay', () => {
  it('wraps the overlay in a layer that lets touches through', async () => {
    await renderWithProviders(
      <Screen title="Page" overlay={<Text>Couche du dessus</Text>}>
        <Text>Contenu</Text>
      </Screen>,
    )
    const mark = screen.getByText('Couche du dessus') as unknown as Node
    // Le premier ancêtre qui dit quelque chose du toucher doit être `box-none`.
    let found: unknown
    for (let node: Node | null = mark.parent; node; node = node.parent) {
      if (node.props.pointerEvents !== undefined) {
        found = node.props.pointerEvents
        break
      }
    }
    expect(found).toBe('box-none')
  })

  it('draws nothing without an overlay', async () => {
    await renderWithProviders(
      <Screen title="Page">
        <Text>Contenu</Text>
      </Screen>,
    )
    expect(screen.queryByText('Couche du dessus')).toBeNull()
  })
})
