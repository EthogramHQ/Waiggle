// Test du bouton « Suivre » posé dans une rangée (tranche R15) : sur la page d'un membre, « Suivre »
// et le menu « … » sont côte à côte. À texte très agrandi sur un téléphone étroit (320 points,
// 200 %), le bouton sortait de l'écran des deux côtés : sa couche extérieure ne rétrécissait pas
// (sur le web, une vue a `flexShrink: 0` par défaut) et gardait la largeur de son libellé sur une
// ligne. Jest ne place rien à l'écran : on vérifie que cette couche est bornée par la rangée
// (`maxWidth: '100%'`) et prête à rétrécir (`flexShrink: 1`), ce qui laisse son libellé passer à la
// ligne. La mesure dans le navigateur (320 points, texte × 2) : de −20..340 à 16..304.
import { screen } from '@testing-library/react-native'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { FollowButton } from './FollowButton'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Host = { props: { style?: unknown }; children: (Host | string)[] }

describe('FollowButton in a row (R15)', () => {
  it('never grows wider than the row that holds it, so its label can wrap', async () => {
    await renderWithProviders(
      <View testID="row" style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <FollowButton
          followed
          onPress={() => {}}
          label="Tu suis Tante Odile"
          text="Tu suis Tante Odile"
        />
      </View>,
    )

    // Témoin : le bouton est là, avec son nom.
    expect(screen.getByLabelText('Tu suis Tante Odile')).toBeTruthy()
    // La couche extérieure du bouton, l'enfant direct de la rangée.
    const row = screen.getByTestId('row') as unknown as Host
    const outer = row.children[0]
    if (outer === undefined || typeof outer === 'string') throw new Error('Aucun bouton')
    const style = StyleSheet.flatten(outer.props.style as ViewStyle)
    expect(style.maxWidth).toBe('100%')
    expect(style.flexShrink).toBe(1)
  })
})
