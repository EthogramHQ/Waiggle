// Tests de la prop `ambiance` de Screen (refonte, tranche R1) : « brand » pose le miel vif, coupe la
// lumière d'ambiance et met le contenu (titre, boutons) sur la feuille claire ; « light », le
// défaut, garde la lumière.
//
// Comme dans BrandAmbiance.test.tsx, la Surface et la lumière sont remplacées par des vues
// repérées (testID) : on vérifie leur présence et ce qu'elles contiennent, sans regarder les
// couleurs.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Screen } from './Screen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// `require` dans les fabriques : Jest les remonte en tête du fichier, avant les imports.
jest.mock('./Surface', () => {
  const { createElement } = require('react')
  const { View } = require('react-native')
  return {
    Surface: ({ children, variant = 'plain' }: { children?: unknown; variant?: string }) =>
      createElement(View, { testID: `surface-${variant}` }, children),
  }
})
jest.mock('./AmbientLight', () => {
  const { createElement } = require('react')
  const { View } = require('react-native')
  return { AmbientLight: () => createElement(View, { testID: 'ambient-light' }) }
})

type Node = { parent: unknown; props: Record<string, unknown> }

/** L'élément est-il posé dans une Surface (la feuille) ? On remonte ses parents. */
const onSheet = (element: Node): boolean => {
  for (let node: Node | null = element; node; node = node.parent as Node | null) {
    const id = node.props.testID
    if (typeof id === 'string' && id.startsWith('surface-')) return true
  }
  return false
}

const page = (ambiance?: 'brand' | 'light') => (
  <Screen title="Te revoilà" ambiance={ambiance}>
    <Button label="Me connecter" onPress={() => {}} />
  </Screen>
)

describe('Screen ambiance', () => {
  it('keeps the ambient light by default', async () => {
    await renderWithProviders(page())

    expect(screen.getByTestId('ambient-light')).toBeTruthy()
  })

  it('turns the ambient light off on the bright honey', async () => {
    await renderWithProviders(page('brand'))

    expect(screen.queryByTestId('ambient-light')).toBeNull()
  })

  it('puts the title and the buttons on the light sheet, on the bright honey', async () => {
    await renderWithProviders(page('brand'))

    expect(onSheet(screen.getByRole('header', { name: 'Te revoilà' }))).toBe(true)
    expect(onSheet(screen.getByRole('button', { name: 'Me connecter' }))).toBe(true)
  })
})
