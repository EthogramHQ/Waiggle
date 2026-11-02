// Tests de l'icône d'un bouton après son libellé (R5a, `iconAfter` : « Ouvrir le site ↗ ») : elle
// passe après le texte, le nom lu du bouton ne change pas, et sans `iconAfter` elle reste avant.
// Les autres états du bouton sont vus dans components.test.tsx.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

/** Le contenu du bouton dans l'ordre où il est dessiné : « icône » pour le dessin, le texte sinon. */
const drawnOrder = (node: Node | string): string[] => {
  if (typeof node === 'string') return [node]
  // Le dessin (react-native-svg) est caché aux lecteurs d'écran : c'est ce qui le distingue.
  if (node.props['aria-hidden'] === true) return ['icône']
  return node.children.flatMap(drawnOrder)
}

describe('Button icon', () => {
  it('draws the icon after the label with iconAfter, the spoken name unchanged', async () => {
    await renderWithProviders(
      <Button label="Ouvrir le site" icon="arrow-up-right" iconAfter onPress={() => {}} />,
    )

    const button = screen.getByRole('button', { name: 'Ouvrir le site' })
    expect(drawnOrder(button as unknown as Node)).toEqual(['Ouvrir le site', 'icône'])
  })

  it('keeps the icon before the label by default', async () => {
    await renderWithProviders(
      <Button label="Ouvrir le site" icon="arrow-up-right" onPress={() => {}} />,
    )

    const button = screen.getByRole('button', { name: 'Ouvrir le site' })
    expect(drawnOrder(button as unknown as Node)).toEqual(['icône', 'Ouvrir le site'])
  })
})
