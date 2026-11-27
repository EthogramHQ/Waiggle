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

  // Posé au-dessus de la Goutte, à 320 px, il passait sur « Rejoindre les testeurs » : en verre (sans
  // flou sur le web), les deux libellés se lisaient l'un dans l'autre (R21, 27/11/2026). Au-dessus
  // de la page, il prend donc le fond plein de la feuille, et non le verre de la place flottante.
  it('is solid like on a sheet, not glass, when it floats over the page', async () => {
    await renderWithProviders(
      <>
        <NewCommentsButton count={1} onPress={() => {}} announce={false} />
        <NewCommentsButton count={2} onPress={() => {}} announce={false} on="sheet" />
        <NewCommentsButton count={3} onPress={() => {}} announce={false} over />
      </>,
    )

    const glass = backgroundOf('1 nouveau commentaire')
    const solid = backgroundOf('2 nouveaux commentaires')
    expect(solid).not.toBe(glass)
    expect(backgroundOf('3 nouveaux commentaires')).toBe(solid)
  })
})

/** Le fond du bouton : le premier `backgroundColor` de sa vue ou de ce qu'elle contient. */
function backgroundOf(name: string) {
  type Host = { props: Record<string, unknown>; children?: (Host | string)[] }
  const queue = [screen.getByRole('button', { name }) as unknown as Host]
  for (let node = queue.shift(); node; node = queue.shift()) {
    const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as ViewStyle
    if (style.backgroundColor !== undefined) return style.backgroundColor
    for (const child of node.children ?? []) if (typeof child !== 'string') queue.push(child)
  }
  return undefined
}
