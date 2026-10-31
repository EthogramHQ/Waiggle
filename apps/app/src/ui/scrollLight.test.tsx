// Tests de la lumière au défilement (R4, « Le mouvement ») : pendant que le membre fait défiler le
// fil, la lumière d'ambiance prend la couleur de la photo de la carte au centre de l'écran.
// `useScrollLight(items)` s'appelle dans un enfant de Screen (relecture ui-B5 : Screen rend le
// fournisseur de la lumière, un hook appelé dans le corps de l'écran parlerait au fournisseur du
// dessus). Il écoute lui-même le défilement de l'écran qui l'entoure, et rend `cardRef(id)`, à poser
// sur chaque carte : il mesure les cartes (`measureInWindow`) et choisit celle dont le centre est
// le plus proche du milieu de la fenêtre.
//
// Jest ne place rien à l'écran : chaque carte reçoit une fausse vue dont `measureInWindow` répond
// la position qu'on choisit (`tops`), et l'on observe les appels à `setSource` de la lumière.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Dimensions, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { Screen } from './Screen'
import { useScrollLight } from './scrollLight'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Reanimated tel que le prépare jest.setup.ts, avec le réglage « Réduire les animations » de
// l'appareil choisi par chaque test (useCalmMotion le lit).
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  // __esModule et default : sans eux, `import Animated from …` ne retrouverait pas Animated.View.
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
  }
})

// La vraie lumière, dont on note chaque changement de source demandé. useMemo garde le même objet
// d'un affichage à l'autre, comme le vrai : sinon les effets qui en dépendent (celui de Screen qui
// pose la source de l'écran) rejoueraient à chaque affichage.
const mockSetSource = jest.fn()
jest.mock('./theme/ambient', () => {
  const actual = jest.requireActual<typeof import('./theme/ambient')>('./theme/ambient')
  const { useMemo } = jest.requireActual<typeof import('react')>('react')
  return {
    ...actual,
    useAmbient: () => {
      const ambient = actual.useAmbient()
      return useMemo(
        () => ({
          ...ambient,
          setSource: (source: Parameters<typeof ambient.setSource>[0]) => {
            mockSetSource(source)
            ambient.setSource(source)
          },
        }),
        [ambient],
      )
    },
  }
})

const reducedMotion = jest.mocked(useReducedMotion)

// Deux résumés flous de photos (des thumbhash : une poignée d'octets en base 64, pas une clé).
const HASH_A = '3OcRJYB4d3h/iIeHeEh3eIhw+j3A' // gitleaks:allow
const HASH_B = 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' // gitleaks:allow

// Les cartes du fil, telles que FeedList les passera : la dernière n'a pas de photo.
const items = [
  { id: 'a', thumbhash: HASH_A },
  { id: 'b', thumbhash: HASH_B },
  { id: 'c', thumbhash: null },
] as const

// La hauteur d'une carte, et le haut de chacune dans la fenêtre, que chaque test choisit.
const CARD_HEIGHT = 300
let tops: Record<string, number> = {}

// Le milieu de la fenêtre des tests (celle d'un téléphone, 844 points de haut : 422).
const middle = () => Dimensions.get('window').height / 2

/** Place les cartes : le centre de `nearest` au milieu de la fenêtre (à 20 points près). */
const center = (nearest: string) => {
  const ids = items.map((item) => item.id)
  const index = ids.indexOf(nearest as (typeof ids)[number])
  tops = Object.fromEntries(
    ids.map((id, at) => [id, middle() + 20 - CARD_HEIGHT / 2 + (at - index) * (CARD_HEIGHT + 100)]),
  )
}

/** La fausse vue d'une carte : sa mesure dans la fenêtre répond la position choisie. */
const cardView = (id: string) => ({
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) =>
    callback(0, tops[id] ?? 0, 390, CARD_HEIGHT),
})

/** Le fil vu par le hook : une vue par carte, mesurée par `cardRef`. */
function Cards() {
  const { cardRef } = useScrollLight(items)
  return (
    <>
      {items.map((item) => (
        <View key={item.id} ref={(view) => cardRef(item.id)(view ? cardView(item.id) : null)} />
      ))}
    </>
  )
}

const renderFeed = () =>
  renderWithProviders(
    <Screen width="page" title="Fil">
      <Text>Le fil</Text>
      <Cards />
    </Screen>,
  )

/** Le membre fait défiler l'écran (la zone qui défile : l'élément natif RCTScrollView). */
const scroll = async (y: number) => {
  type Node = { type: unknown; children: (Node | string)[] }
  let found: Node | undefined
  const visit = (node: Node | string) => {
    if (typeof node === 'string' || found) return
    if (node.type === 'RCTScrollView') found = node
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  if (!found) throw new Error('No scrolling view')
  await act(async () => {
    fireEvent.scroll(found as never, {
      nativeEvent: {
        contentOffset: { x: 0, y },
        layoutMeasurement: { width: 390, height: 844 },
        contentSize: { width: 390, height: 3000 },
      },
    })
  })
}

/** Laisse passer un moment (un défilement peut n'être lu qu'à l'image suivante). */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 200)))

/** Les sources demandées depuis le dernier `mockClear`. */
const lit = () => mockSetSource.mock.calls.map(([source]) => source)

beforeEach(() => {
  reducedMotion.mockReturnValue(false)
  tops = {}
})

describe('useScrollLight', () => {
  it('lights the screen with the card nearest the middle, once per card', async () => {
    await renderFeed()
    // Ce que Screen pose de lui-même à l'affichage (la lumière miel) ne compte pas.
    mockSetSource.mockClear()

    center('b')
    await scroll(200)
    await waitFor(() => expect(lit()).toEqual([expect.objectContaining({ thumbhash: HASH_B })]))

    // Le membre défile encore un peu : la même carte reste au milieu, la lumière ne repart pas.
    await scroll(220)
    await settle()
    expect(lit()).toHaveLength(1)

    // La carte du dessus arrive au milieu : sa couleur, une fois.
    center('a')
    await scroll(0)
    await waitFor(() =>
      expect(lit()).toEqual([
        expect.objectContaining({ thumbhash: HASH_B }),
        expect.objectContaining({ thumbhash: HASH_A }),
      ]),
    )
  })

  it('leaves the light alone when the card in the middle has no photo', async () => {
    await renderFeed()
    mockSetSource.mockClear()

    center('c')
    await scroll(600)
    await settle()
    expect(lit()).toEqual([])

    // Témoin : une carte avec photo au milieu, et la lumière change.
    center('b')
    await scroll(300)
    await waitFor(() => expect(lit()).toEqual([expect.objectContaining({ thumbhash: HASH_B })]))
  })

  it('still changes the colour with reduce motion', async () => {
    // « Réduire les animations » : la lumière ne bouge plus, mais sa couleur suit toujours la
    // carte du milieu (scénario R4, « La lumière au défilement »).
    reducedMotion.mockReturnValue(true)
    await renderFeed()
    mockSetSource.mockClear()

    center('b')
    await scroll(200)
    await waitFor(() => expect(lit()).toEqual([expect.objectContaining({ thumbhash: HASH_B })]))
  })

  it('keeps the light of the feed when the screen draws again', async () => {
    // Relecture ui-B5 : la source posée par Screen (sans `thumbhash`, la lumière miel) ne
    // reprend pas la main tant que le fil tient la lumière.
    const { rerender } = await renderFeed()
    mockSetSource.mockClear()
    center('b')
    await scroll(200)
    await waitFor(() => expect(lit()).toEqual([expect.objectContaining({ thumbhash: HASH_B })]))

    await rerender(
      <Screen width="page" title="Fil">
        <Text>Le fil</Text>
        <Cards />
      </Screen>,
    )
    await settle()

    expect(lit()).toEqual([expect.objectContaining({ thumbhash: HASH_B })])
  })
})
