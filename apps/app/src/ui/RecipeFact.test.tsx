// Une ligne de « La recette » (R6a, ui/RecipeFact.tsx) : la phrase se lit entière, le dessin
// devant elle (icône ou rond de couleur) est caché aux lecteurs d'écran.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { iconPaths } from './icons.generated'
import { RecipeFact } from './RecipeFact'

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const all = () => hostsOf(screen.root as unknown as Host)

describe('RecipeFact', () => {
  it('reads the whole sentence, with its icon drawn before it', async () => {
    await renderWithProviders(
      <RecipeFact icon="calendar-blank" label="Commencé en septembre 2026" />,
    )

    expect(screen.getByText('Commencé en septembre 2026')).toBeTruthy()
    expect(all().some((node) => node.props.d === iconPaths['calendar-blank'][0])).toBe(true)
  })

  it('hides the colour dot from screen readers, the sentence saying it all', async () => {
    await renderWithProviders(
      <RecipeFact dot="success" label="Facile à refaire : À la portée de tous" />,
    )

    expect(screen.getByText('Facile à refaire : À la portée de tous')).toBeTruthy()
    const hidden = all().filter(
      (node) =>
        node.props['aria-hidden'] === true &&
        node.props.importantForAccessibility === 'no-hide-descendants',
    )
    expect(hidden).toHaveLength(1)
    // Rien d'autre que la phrase n'est lu.
    expect(screen.queryAllByRole('image')).toHaveLength(0)
  })
})
