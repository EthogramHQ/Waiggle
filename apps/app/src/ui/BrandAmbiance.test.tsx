// Tests de l'ambiance « miel vif » (refonte, tranche R1) : le dégradé de miel en haut des écrans de
// marque (accueil, connexion, inscription…), et la feuille claire qui remonte dessus. Le contenu et
// les boutons sont posés sur la feuille, jamais directement sur le miel (scénario : « jamais un
// bouton encre directement sur le miel »).
//
// Comment savoir qu'un élément est « sur la feuille » sans regarder les couleurs ? La feuille est
// une Surface (plan R1, G1 : « Surface plain »). On remplace ici Surface par une vue qui porte un
// repère de test (testID), puis on vérifie que le bouton et le texte sont bien à l'intérieur.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { BrandAmbiance } from './BrandAmbiance'
import { Button } from './Button'
import { Text } from './Text'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// La Surface remplacée : une simple vue repérée par « surface-<matière> ». `require` dans la
// fabrique, car Jest la remonte en tête du fichier, avant les imports.
jest.mock('./Surface', () => {
  const { createElement } = require('react')
  const { View } = require('react-native')
  return {
    Surface: ({ children, variant = 'plain' }: { children?: unknown; variant?: string }) =>
      createElement(View, { testID: `surface-${variant}` }, children),
  }
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

const Content = ({ onPress = () => {} }: { onPress?: () => void }) => (
  <BrandAmbiance>
    <Text>Bienvenue dans ta ruche</Text>
    <Button label="Se connecter" onPress={onPress} />
  </BrandAmbiance>
)

describe('BrandAmbiance', () => {
  it('shows its content and its buttons to everyone, screen readers included', async () => {
    await renderWithProviders(<Content />)

    // getByRole ignore ce qui est caché des lecteurs d'écran : le bouton n'est pas enfoui dans le
    // décor.
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy()
    expect(screen.getByText('Bienvenue dans ta ruche')).toBeTruthy()
  })

  // it.each : le même test de jour et de nuit.
  it.each(['day', 'night'] as const)(
    'puts the content and the buttons on the light sheet, not on the honey (%s)',
    async (appearance) => {
      await renderWithProviders(<Content />, 'fr', appearance)

      expect(onSheet(screen.getByRole('button', { name: 'Se connecter' }))).toBe(true)
      expect(onSheet(screen.getByText('Bienvenue dans ta ruche'))).toBe(true)
    },
  )

  it('keeps the buttons working on the sheet', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<Content onPress={onPress} />)

    await fireEvent.press(screen.getByRole('button', { name: 'Se connecter' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
