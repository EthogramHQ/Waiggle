// Tests de Choices ajoutés après la tranche 7c (les premiers sont dans components.test.tsx). Un
// fichier par composant pour ce qui s'ajoute (décision du 25/10/2026).
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Choices } from './Choices'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('Choices', () => {
  // Relecture de design 7c : à 320 px et texte à 200 %, la pastille « Les règles de Waiggle »
  // sortait de l'écran (343 px). Sur le web, react-native-web donne `flexShrink: 0` à toute vue :
  // une pastille ne se replie dans sa rangée qu'avec `maxWidth: '100%'` et `flexShrink: 1` (PR #29).
  // On teste la règle (« elle peut rétrécir »), pas une valeur de design.
  it('lets a long choice shrink within its row instead of overflowing it', async () => {
    await renderWithProviders(
      <Choices
        label="Fondement"
        options={[
          { value: 'illegal', label: 'Un contenu illégal' },
          { value: 'rules', label: 'Les règles du réseau, au sens le plus large' },
        ]}
        value={null}
        onChange={jest.fn()}
      />,
    )

    const style = StyleSheet.flatten(
      screen.getByRole('radio', { name: 'Les règles du réseau, au sens le plus large' }).props
        .style,
    )
    expect(style.maxWidth).toBe('100%')
    expect(style.flexShrink).toBe(1)
  })
})
