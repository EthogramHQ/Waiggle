// Test de la place du bouton du haut sur le miel vif (R5a, correcteur C4) : avec `backLabel`
// (la page introuvable d'un projet, barre « Mon compte » connectée), « Retour » passe sous la barre
// au lieu de partager sa rangée (à 768 points, « Publier » sortait de l'écran). Sans `backLabel`, il
// reste sur la rangée de la barre (R3 : il ne change pas de place d'une page du compte à l'autre).
// Jest ne mesure aucune position : on lit l'ordre de lecture et la rangée commune, la position se
// mesure dans le navigateur (introuvable-entete.mjs du design-reviewer).
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Screen } from './Screen'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; parent: Node | null }

/** Le plus proche ancêtre commun de deux éléments : la vue qui les range ensemble. */
const commonParent = (a: Node, b: Node): Node => {
  const above = new Set<Node>()
  for (let node: Node | null = a; node; node = node.parent) above.add(node)
  for (let node: Node | null = b; node; node = node.parent) if (above.has(node)) return node
  throw new Error('aucun ancêtre commun')
}

const flexDirection = (node: Node) =>
  (StyleSheet.flatten(node.props.style as never) as { flexDirection?: string } | undefined)
    ?.flexDirection

const page = (backLabel?: string) => (
  <Screen
    ambiance="brand"
    header={<Text>La barre du haut</Text>}
    onBack={() => {}}
    {...(backLabel ? { backLabel } : null)}
  >
    <Text>Le contenu</Text>
  </Screen>
)

describe('Screen brand back button', () => {
  it('puts the named back button under the bar, not on its row', async () => {
    await renderWithProviders(page('Retour'))

    const bar = screen.getByText('La barre du haut') as unknown as Node
    const back = screen.getByRole('button', { name: 'Retour' }) as unknown as Node
    // Témoin : le contenu est là.
    expect(screen.getByText('Le contenu')).toBeTruthy()
    // La colonne qui les réunit les empile : la barre d'abord, le retour dessous.
    const parent = commonParent(bar, back)
    expect(flexDirection(parent)).not.toBe('row')
  })

  it('keeps the plain back button on the row of the bar, as on the account pages', async () => {
    await renderWithProviders(page())

    const bar = screen.getByText('La barre du haut') as unknown as Node
    const back = screen.getByRole('button', { name: 'Retour' }) as unknown as Node
    expect(flexDirection(commonParent(bar, back))).toBe('row')
  })
})
