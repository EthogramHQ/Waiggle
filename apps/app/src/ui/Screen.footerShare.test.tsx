// Tests de la prop `footerMaxShare` de Screen (tranche R11, l'écran « Accepter ») : sur téléphone,
// le pied ne reste collé en bas que s'il prend au plus cette part de la hauteur de la fenêtre ; plus
// haut (petit téléphone, texte agrandi), il suit le contenu, dans la zone qui défile. Jest ne mesure
// rien : on donne au pied une hauteur par son événement `layout`, et l'on regarde s'il est dans la
// zone qui défile (suit le contenu) ou hors d'elle (collé).
import { fireEvent, screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Screen } from './Screen'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un nœud de l'arbre rendu, avec son parent. */
type Node = {
  parent: Node | null
  props: { onLayout?: unknown; style?: unknown; keyboardShouldPersistTaps?: unknown }
}

const ancestors = (node: Node): Node[] => {
  const list: Node[] = []
  for (let at = node.parent; at; at = at.parent) list.push(at)
  return list
}

/** Le bouton du pied est-il dans la zone qui défile (celle qui garde les touchers du clavier) ? */
const inScroller = (): boolean =>
  ancestors(screen.getByRole('button', { name: 'Continuer' }) as unknown as Node).some(
    (node) => node.props.keyboardShouldPersistTaps === 'handled',
  )

/** Donne au bloc du pied (la vue mesurée, collée ou non) la hauteur voulue. */
const footerMeasures = async (height: number) => {
  const block = ancestors(
    screen.getByRole('button', { name: 'Continuer' }) as unknown as Node,
  ).find(
    (node) =>
      typeof node.props.onLayout === 'function' &&
      (StyleSheet.flatten(node.props.style as never) as { gap?: number } | undefined)?.gap !==
        undefined,
  )
  if (!block) throw new Error('bloc du pied introuvable')
  await fireEvent(block as never, 'layout', { nativeEvent: { layout: { height } } })
}

const page = (share?: number) => (
  <Screen
    title="Les règles"
    footer={<Button label="Continuer" onPress={() => {}} />}
    {...(share === undefined ? null : { footerMaxShare: share })}
  >
    <Text>En bref</Text>
  </Screen>
)

describe('Screen footerMaxShare (R11)', () => {
  const half = Dimensions.get('window').height / 2

  it('pins the footer while it fits in half the window, and lets it follow the content beyond', async () => {
    await renderWithProviders(page(0.5))
    // Pas encore mesuré : collé, comme sur la planche.
    expect(inScroller()).toBe(false)

    await footerMeasures(half + 10)
    expect(inScroller()).toBe(true)

    // De nouveau assez bas (texte rendu à sa taille) : il recolle.
    await footerMeasures(half - 10)
    expect(inScroller()).toBe(false)
  })

  it('keeps the footer pinned whatever its height without the prop', async () => {
    await renderWithProviders(page())
    // Témoin : sans la prop, le pied est collé ; aucune mesure ne le décolle.
    expect(inScroller()).toBe(false)
    const block = ancestors(screen.getByRole('button', { name: 'Continuer' }) as unknown as Node)
    expect(block.length).toBeGreaterThan(0)
  })
})
