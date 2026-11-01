// Tests des initiales d'Avatar (relecture de design de R3, 11) : elles tiennent toujours dans leur
// rond, quelle que soit la taille du rond (le rond de 20 d'une carte de testeur) et quelle que soit
// la taille de texte (un navigateur réglé en grand texte, que le web ne laisse pas borner).
// Les initiales elles-mêmes (« LM », « PA ») sont testées dans components.test.tsx.
import { act, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Avatar, INITIALS_ROOM, initialsScale } from './Avatar'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 ne cherche que par rôle ou texte).
type Node = {
  props: Record<string, unknown>
  parent: Node | null
  children: (Node | string)[]
}

/** Le premier élément sous `root` qui mesure sa taille (`onLayout`) : la boîte des initiales. */
const measuringBox = (root: Node): Node => {
  const visit = (node: Node | string): Node | null => {
    if (typeof node === 'string') return null
    if (node !== root && typeof node.props.onLayout === 'function') return node
    for (const child of node.children) {
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  const found = visit(root)
  if (!found) throw new Error('aucune boîte mesurée sous le rond')
  return found
}

/** La réduction posée au-dessus de la boîte mesurée (1 : aucune). */
const scaleAbove = (box: Node): number => {
  const style = box.parent?.props.style as { transform?: { scale?: number }[] } | undefined
  return style?.transform?.[0]?.scale ?? 1
}

describe('Avatar, initials that fit their round (R3)', () => {
  it('shrinks initials wider than its round, until they fit', async () => {
    await renderWithProviders(
      <Avatar name="Max Durand" source={null} label="Max Durand" size={20} />,
    )
    const round = screen.getByRole('img', { name: 'Max Durand' }) as unknown as Node
    const box = measuringBox(round)

    // L'appareil mesure « MD » : 41 × 33, comme un navigateur à 200 % dans un rond de 28.
    await act(async () => {
      ;(box.props.onLayout as (event: unknown) => void)({
        nativeEvent: { layout: { x: 0, y: 0, width: 41, height: 33 } },
      })
    })

    const scale = scaleAbove(box)
    expect(41 * scale).toBeLessThanOrEqual(20 * INITIALS_ROOM + 0.001)
    expect(33 * scale).toBeLessThanOrEqual(20)
  })

  it('leaves initials that already fit at their size', async () => {
    await renderWithProviders(
      <Avatar name="Léa Martin" source={null} label="Léa Martin" size={96} />,
    )
    const box = measuringBox(screen.getByRole('img', { name: 'Léa Martin' }) as unknown as Node)

    await act(async () => {
      ;(box.props.onLayout as (event: unknown) => void)({
        nativeEvent: { layout: { x: 0, y: 0, width: 60, height: 48 } },
      })
    })

    expect(scaleAbove(box)).toBe(1)
  })

  it.each([
    [null, 96, 1],
    [{ width: 60, height: 48 }, 96, 1],
    [{ width: 123, height: 95 }, 96, (96 * INITIALS_ROOM) / 123],
    [{ width: 21, height: 16 }, 20, (20 * INITIALS_ROOM) / 21],
    [{ width: 10, height: 40 }, 20, 0.5],
  ])('scales %j in a round of %d by %d', (natural, size, expected) => {
    expect(initialsScale(natural, size)).toBeCloseTo(expected, 5)
  })
})
