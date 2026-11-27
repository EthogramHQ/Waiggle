// Le bouton « N nouveaux commentaires » posé au-dessus de la capsule des réactions, sur téléphone
// (`over`, relecture de l'interface de R21). Empilé dans la place flottante, il en grandissait la
// hauteur réservée : la Goutte des Éclaireuses, posée au-dessus de cette réserve, montait de 52 points
// à l'arrivée d'un commentaire, sans geste du membre. Posé `over`, il flotte au-dessus de ce qu'il
// surmonte, hors de la hauteur mesurée ; et s'il y a une Goutte dans le coin, il monte au-dessus
// d'elle (`FloatingClearanceContext`) plutôt que de la couvrir.
//
// Jest ne calcule aucune position : on lit le style de la place du bouton.
import { space } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { FloatingClearanceContext } from './floatingSpace'
import { NewCommentsButton } from './NewCommentsButton'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; parent: Node | null }

/** La place du bouton : son premier ancêtre posé hors du flux (`position: absolute`). */
const placeOf = (name: string) => {
  for (
    let node = (screen.getByRole('button', { name }) as unknown as Node).parent;
    node;
    node = node.parent
  ) {
    const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as ViewStyle
    if (style.position === 'absolute') return { style, props: node.props }
  }
  return null
}

describe('NewCommentsButton over what it is stacked on', () => {
  it('stays in the flow by default', async () => {
    await renderWithProviders(<NewCommentsButton count={1} onPress={() => {}} />)

    expect(placeOf('1 nouveau commentaire')).toBeNull()
  })

  it('floats just above, out of the height of the floating place', async () => {
    await renderWithProviders(<NewCommentsButton count={1} onPress={() => {}} over />)

    const place = placeOf('1 nouveau commentaire')
    expect(place?.style).toMatchObject({ bottom: '100%', marginBottom: space.sm })
    // Toute la largeur, pour se centrer ; les touchers à côté du bouton passent à la page.
    expect(place?.props.pointerEvents).toBe('box-none')
  })

  it('rises above the scouts drop standing in the corner, instead of covering it', async () => {
    await renderWithProviders(
      <FloatingClearanceContext.Provider value={64}>
        <NewCommentsButton count={1} onPress={() => {}} over />
      </FloatingClearanceContext.Provider>,
    )

    expect(placeOf('1 nouveau commentaire')?.style.marginBottom).toBe(space.sm + 64)
  })
})
