// Tests de la bande qui défile des onglets (`Tabs scroll`, tranche R10, sous ui/HivePills.tsx) :
// quand les onglets changent de taille sans geste du membre (le texte agrandi dans les réglages),
// l'onglet choisi, élargi, est ramené en entier dans la bande ; un onglet n'est jamais plus large
// que la bande (un nom long, à 200 %, passe à la ligne dans sa pastille). Constaté dans le
// navigateur à 320 px et texte à 200 % : « Randonnée » restait hors de la bande.
import { act, screen } from '@testing-library/react-native'
import { ScrollView, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Tabs } from './Tabs'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

const inside = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : inside(child))),
]

const scrollTo = () =>
  (ScrollView.prototype as unknown as { scrollTo: jest.Mock }).scrollTo as jest.Mock

const KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const tabs = KEYS.map((key) => ({ key, label: `Ruche ${key}` }))
const BAND = 320

/** Mesure la bande (320 points) et chaque onglet (`pill` points, bord à bord). */
const layOut = async (pill: number) => {
  const all = screen.getAllByRole('tab') as unknown as Node[]
  for (const node of inside(screen.root as unknown as Node)) {
    const onLayout = node.props.onLayout
    if (typeof onLayout !== 'function') continue
    const held = inside(node).filter((one) => all.includes(one))
    let layout: { x: number; y: number; width: number; height: number } | null = null
    if (node.type === 'RCTScrollView') layout = { x: 0, y: 0, width: BAND, height: 52 }
    else if (held.length === 1 && held[0])
      layout = { x: all.indexOf(held[0]) * pill, y: 0, width: pill, height: 44 }
    else if (held.length > 1) layout = { x: 0, y: 0, width: all.length * pill, height: 44 }
    if (layout) await act(() => onLayout({ nativeEvent: { layout } }))
  }
}

const lastX = () => {
  const calls = scrollTo().mock.calls
  const last = calls.at(-1)?.[0] as { x?: number } | undefined
  return last?.x
}

describe('Tabs scroll', () => {
  beforeEach(() => scrollTo().mockClear())

  it('brings the chosen tab back into view when the tabs grow (larger text)', async () => {
    await renderWithProviders(
      <Tabs label="Ruches" tabs={tabs} selected="h" onSelect={() => {}} panelId="panel" scroll />,
    )
    await layOut(100)
    // Témoin : « h », de 700 à 800, est montré.
    const first = lastX() ?? 0
    expect(first + BAND).toBeGreaterThanOrEqual(800)
    scrollTo().mockClear()

    // Texte à 200 % : chaque onglet fait 200 points, « h » va de 1 400 à 1 600.
    await layOut(200)
    const x = lastX()
    expect(x).toBeDefined()
    expect(x ?? 0).toBeLessThanOrEqual(1400)
    expect((x ?? 0) + BAND).toBeGreaterThanOrEqual(1600)
  })

  it('never makes a tab wider than the strip', async () => {
    await renderWithProviders(
      <Tabs label="Ruches" tabs={tabs} selected="a" onSelect={() => {}} panelId="panel" scroll />,
    )
    await layOut(100)

    for (const tab of screen.getAllByRole('tab')) {
      expect(StyleSheet.flatten(tab.props.style).maxWidth).toBe(BAND)
    }
  })
})
