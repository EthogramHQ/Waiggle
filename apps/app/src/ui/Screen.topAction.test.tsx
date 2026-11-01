// Tests de l'action en haut à droite de Screen (`topAction`, R3) : la roue « Réglages » de sa page
// de membre se pose sur la rangée du « Retour », pas sur une rangée à elle en dessous (relecture de
// design R3, « retour-roue » : Retour à y = 36, roue à y = 100). Jest ne calcule aucune position :
// on vérifie que les deux boutons ont le même parent, une rangée, le retour d'abord (ordre de
// lecture et de Tab). La hauteur se mesure dans le navigateur (`--explore`).
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { IconButton } from './IconButton'
import { Screen } from './Screen'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'expose pas le type complet).
type Node = { props: Record<string, unknown>; parent: Node | null }

/** Le premier ancêtre commun de deux éléments. */
const commonParent = (a: Node, b: Node): Node => {
  const above = new Set<Node>()
  for (let node: Node | null = a; node; node = node.parent) above.add(node)
  for (let node: Node | null = b.parent; node; node = node.parent) if (above.has(node)) return node
  throw new Error('aucun parent commun')
}

const gear = <IconButton icon="gear-six" label="Réglages" onPress={() => {}} />

describe('Screen topAction', () => {
  it('puts the action on the row of « Retour », after it', async () => {
    await renderWithProviders(
      <Screen width="page" onBack={() => {}} topAction={gear}>
        <Text>Le contenu</Text>
      </Screen>,
    )

    const back = screen.getByRole('button', { name: 'Retour' }) as unknown as Node
    const settings = screen.getByRole('button', { name: 'Réglages' }) as unknown as Node
    const row = commonParent(back, settings)
    expect(StyleSheet.flatten(row.props.style as never)).toMatchObject({
      flexDirection: 'row',
      justifyContent: 'space-between',
    })
    // Le contenu ne partage pas cette rangée : il vient dessous.
    const content = screen.getByText('Le contenu') as unknown as Node
    expect(commonParent(content, settings)).not.toBe(row)
    // Le retour d'abord : dans l'ordre de l'arbre, c'est lui que Tab atteint en premier.
    const buttons = screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)
    expect(buttons.indexOf('Retour')).toBeLessThan(buttons.indexOf('Réglages'))
  })

  it('keeps the action on the right when there is no « Retour »', async () => {
    await renderWithProviders(
      <Screen width="page" topAction={gear}>
        <Text>Le contenu</Text>
      </Screen>,
    )

    expect(screen.queryByRole('button', { name: 'Retour' })).toBeNull()
    const settings = screen.getByRole('button', { name: 'Réglages' }) as unknown as Node
    const content = screen.getByText('Le contenu') as unknown as Node
    const row = settings.parent
    let rowStyle: Record<string, unknown> | undefined
    for (let node = row; node && node !== commonParent(settings, content); node = node.parent) {
      const style = StyleSheet.flatten(node.props.style as never) as Record<string, unknown> | null
      if (style?.justifyContent === 'flex-end') rowStyle = style
    }
    expect(rowStyle).toMatchObject({ flexDirection: 'row', justifyContent: 'flex-end' })
  })

  it('draws only « Retour » without an action, as before', async () => {
    await renderWithProviders(
      <Screen width="page" onBack={() => {}}>
        <Text>Le contenu</Text>
      </Screen>,
    )

    // Témoin : le retour est là, et rien d'autre en tête.
    expect(screen.getByRole('button', { name: 'Retour' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Réglages' })).toBeNull()
  })
})
