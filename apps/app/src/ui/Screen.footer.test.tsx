// Tests de la prop `footer` de Screen (refonte, tranche R2) : les boutons principaux d'un formulaire
// (« Se connecter », « Créer mon compte ») viennent après le contenu, dans un pied. Sur téléphone, ce
// pied est collé en bas, dans la zone du pouce, et remonte au-dessus du clavier ; sur ordinateur, il
// suit le contenu. Jest ne calcule aucune position : collé en bas ou pas, au-dessus du clavier ou
// pas, c'est l'affaire des captures et d'un essai --explore. Ici : le pied existe, ses boutons se
// trouvent par leur rôle et leur nom, et il vient après le contenu dans l'ordre de lecture.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Screen } from './Screen'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Un nœud de l'arbre rendu : on en parcourt les enfants pour connaître l'ordre de lecture.
type Node = { children: (Node | string)[] }

/** La position d'un élément dans l'ordre de lecture (un parcours de l'arbre, en profondeur). */
const readingOrder = (element: unknown): number => {
  let index = 0
  let found = -1
  const visit = (node: Node | string) => {
    if (typeof node === 'string' || found >= 0) return
    if (node === element) found = index
    index += 1
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  return found
}

const page = (footer?: React.ReactNode) => (
  <Screen title="Te revoilà" footer={footer}>
    <Text>Adresse e-mail</Text>
  </Screen>
)

describe('Screen footer', () => {
  it('shows the footer buttons, found by role and name', async () => {
    const onPress = jest.fn()
    await renderWithProviders(page(<Button label="Me connecter" onPress={onPress} />))

    await fireEvent.press(screen.getByRole('button', { name: 'Me connecter' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('reads the footer after the content', async () => {
    await renderWithProviders(page(<Button label="Me connecter" onPress={() => {}} />))

    const content = readingOrder(screen.getByText('Adresse e-mail'))
    const footer = readingOrder(screen.getByRole('button', { name: 'Me connecter' }))
    expect(content).toBeGreaterThanOrEqual(0)
    expect(footer).toBeGreaterThan(content)
  })

  it('keeps the title before the content', async () => {
    await renderWithProviders(page(<Button label="Me connecter" onPress={() => {}} />))

    const title = readingOrder(screen.getByRole('header', { name: 'Te revoilà' }))
    const content = readingOrder(screen.getByText('Adresse e-mail'))
    expect(title).toBeGreaterThanOrEqual(0)
    expect(content).toBeGreaterThan(title)
  })

  it('shows no footer when none is given', async () => {
    await renderWithProviders(page())

    expect(screen.getByText('Adresse e-mail')).toBeTruthy() // témoin
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps the footer on the bright honey too', async () => {
    await renderWithProviders(
      <Screen
        title="Te revoilà"
        ambiance="brand"
        footer={<Button label="Me connecter" onPress={() => {}} />}
      >
        <Text>Adresse e-mail</Text>
      </Screen>,
    )

    expect(screen.getByRole('button', { name: 'Me connecter' })).toBeTruthy()
  })
})
