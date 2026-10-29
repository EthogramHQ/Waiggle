// « Tu es à jour » quand le texte passe sur deux lignes (texte agrandi à 200 %, 390 points ;
// relecture design de R1) : le verre en pilule rognait le « j » (son rayon vaut la moitié de sa
// hauteur), et le texte restait à gauche sous l'icône centrée.
import { radii } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { StyleSheet, type TextStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { FeedEnd } from './FeedEnd'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { parent: Node | null; props: Record<string, unknown> }
const flat = (node: Node) => (StyleSheet.flatten(node.props.style as TextStyle) ?? {}) as TextStyle

const renderEnd = () =>
  renderWithProviders(
    <FeedEnd
      state="end"
      ambiance="brand"
      moreLabel="Afficher la suite"
      endLabel="Tu es à jour"
      onMore={jest.fn()}
    />,
  )

describe('FeedEnd on bright honey, when the text wraps', () => {
  it('does not wrap the message in a pill, whose rounding would cut its letters', async () => {
    await renderEnd()

    // Le premier cadre arrondi autour du message : le verre.
    let node = (screen.getByText('Tu es à jour') as unknown as Node).parent
    while (node && typeof flat(node).borderRadius !== 'number') node = node.parent
    expect(node).not.toBeNull()
    expect(flat(node as Node).borderRadius).toBeLessThan(radii.pill)
  })

  it('centres the message under the centred icon', async () => {
    await renderEnd()

    expect(flat(screen.getByText('Tu es à jour') as unknown as Node).textAlign).toBe('center')
  })
})
