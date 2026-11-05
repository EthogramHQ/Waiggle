// Tests de la mesure de ReadMore (R5b, U7) : ce que la façon de mesurer doit garantir. Les tests du
// comportement (bouton, aria-expanded, focus, mesure sur téléphone) sont dans ReadMore.test.tsx.
// - Sur téléphone, un texte replié ne compte que ses lignes montrées : « exactement 10 » ne fait
//   pas disparaître le bouton.
// - Sur le web, deux copies invisibles (le texte entier, une ligne) mesurées par `onLayout`,
//   cachées aux lecteurs d'écran ; la taille de texte agrandie fait apparaître le bouton.
// - L'indice du bouton (`hint`) est lu sur téléphone, et relié par aria-describedby sur le web.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders as render } from '../testing/render'
import { overflowsCount, overflowsLines, ReadMore } from './ReadMore'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LONG = 'Une ligne\n'.repeat(14).trim()
const HINT = 'Hugo Lefèvre : début du texte'

type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/** Les vues mesurées de ReadMore sur le web, dans l'ordre : le texte entier, puis une ligne. */
const measured = () => {
  const views: Node[] = []
  const walk = (node: Node | string) => {
    if (typeof node === 'string') return
    if (typeof node.props.onLayout === 'function') views.push(node)
    for (const child of node.children) walk(child)
  }
  walk(screen.root as unknown as Node)
  return views
}

const layout = async (view: Node, height: number) => {
  await fireEvent(view as never, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height } },
  })
}

/** Le texte natif a compté `count` lignes. */
const reportLines = async (count: number) => {
  const lines = Array.from({ length: count }, () => ({ text: 'ligne' }))
  await fireEvent(screen.getByText(LONG), 'textLayout', { nativeEvent: { lines } })
}

const sample = (hint?: string) => (
  <ReadMore hint={hint}>{(n) => <Text numberOfLines={n}>{LONG}</Text>}</ReadMore>
)

describe('ReadMore measure', () => {
  afterEach(() => jest.restoreAllMocks())

  it('on the web, folds only past the given lines and half a line', () => {
    expect(overflowsLines({ full: 200, line: 20 }, 10)).toBe(false)
    expect(overflowsLines({ full: 209, line: 20 }, 10)).toBe(false)
    expect(overflowsLines({ full: 220, line: 20 }, 10)).toBe(true)
    // Rien tant qu'une mesure manque, ou qu'une ligne vaut 0 (un texte vide).
    expect(overflowsLines({ full: 220, line: null }, 10)).toBe(false)
    expect(overflowsLines({ full: 0, line: 0 }, 10)).toBe(false)
  })

  it('on a phone, exactly the folded lines keeps the previous answer', () => {
    expect(overflowsCount(11, 10, false)).toBe(true)
    expect(overflowsCount(9, 10, true)).toBe(false)
    expect(overflowsCount(10, 10, true)).toBe(true)
    expect(overflowsCount(10, 10, false)).toBe(false)
  })

  it('on a phone, a folded text that reports its 10 shown lines keeps « Lire la suite »', async () => {
    await render(sample())
    await reportLines(14)
    // Replié, le texte natif ne compte plus que ses 10 lignes montrées.
    await reportLines(10)
    expect(screen.getByRole('button', { name: 'Lire la suite' })).toBeTruthy()
  })

  it('on a phone, the hint describes the button', async () => {
    await render(sample(HINT))
    await reportLines(14)
    expect(screen.getByRole('button', { name: 'Lire la suite' }).props.accessibilityHint).toBe(HINT)
  })

  it('on the web, keeps its measured copies away from screen readers', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await render(sample())

    // Le texte n'est trouvé qu'une fois : les deux copies mesurées sont cachées.
    expect(screen.getAllByText(LONG)).toHaveLength(1)
    expect(screen.getAllByText(LONG, { includeHiddenElements: true })).toHaveLength(3)
  })

  it('on the web, shows the button sooner when the text grows larger', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await render(sample(HINT))
    const [full, line] = measured()
    if (!full || !line) throw new Error('deux vues mesurées attendues')
    // À 100 % : 9 lignes de 20 points, le texte tient.
    await layout(full, 180)
    await layout(line, 20)
    expect(screen.queryByRole('button', { name: 'Lire la suite' })).toBeNull()

    // À 200 % : les lignes font 40 points et passent à la ligne plus tôt (14 lignes).
    await layout(full, 560)
    await layout(line, 40)
    const button = screen.getByRole('button', { name: 'Lire la suite' })
    // L'indice passe par aria-describedby, vers un texte caché qui le dit.
    const id = button.props['aria-describedby']
    expect(typeof id).toBe('string')
    const description = screen.getByText(HINT, { includeHiddenElements: true })
    expect(description.props.nativeID).toBe(id)
  })
})
