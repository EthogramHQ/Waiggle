// Tests du gabarit large de Screen (tranche R15, « L'ordinateur en grand », « Le gabarit large ») :
// - `width="wide"` : le contenu garde des marges de 32 points jusqu'à 1 536, puis de 5 % de la
//   fenêtre, sans jamais dépasser 1 920 (1 376 à 1 440, 1 728 à 1 920, 1 920 à 2 560) ; sous 1 280,
//   rien ne change (la largeur d'une page ordinaire) ;
// - la barre du haut suit la largeur de l'écran ouvert ;
// - l'écran dit à son contenu la largeur qu'il lui donne (`useContentWidth()`, relecture du plan,
//   C2) : les grilles y comptent leurs colonnes, sans qu'aucun écran ne lise un jeton ;
// - jusqu'à l'hydratation, la page pré-rendue ne connaît pas la fenêtre : la colonne et la barre
//   gardent la largeur d'une page ordinaire, comme le serveur, et le contenu se range comme sur
//   téléphone (relecture du plan, C1). Sous Jest, la plateforme est iOS, hydratée d'emblée : on
//   simule donc `useHydrated`.
//
// Jest ne calcule aucune position : la largeur d'un élément se lit dans les styles de ses cadres,
// la plus petite des bornes (`width`, `maxWidth`) et de la fenêtre moins les marges de côté.
import { layout } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet, Text, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Screen } from './Screen'
import { useHydrated } from './theme/hydration'
import { useContentWidth } from './theme/layout'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useIsFocused: () => true,
}))
// L'hydratation de la page, qu'un test choisit (vraie sur téléphone, d'emblée).
jest.mock('./theme/hydration', () => ({
  ...jest.requireActual('./theme/hydration'),
  useHydrated: jest.fn(() => true),
}))

// Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'expose pas le type complet).
type Node = { props: Record<string, unknown>; parent: Node | null }

const styleOf = (node: Node): Record<string, unknown> =>
  (StyleSheet.flatten(node.props.style as never) as Record<string, unknown> | undefined) ?? {}

/**
 * La largeur que prend un élément dans une fenêtre de `windowWidth` points : la plus petite borne
 * posée sur lui ou ses cadres (`width` ou `maxWidth` en points), et la fenêtre moins les marges de
 * côté du premier cadre qui en pose (`paddingHorizontal`).
 */
const shownWidth = (text: string, windowWidth: number): number => {
  let widest = windowWidth
  let padded = false
  for (
    let node: Node | null = screen.getByText(text) as unknown as Node;
    node;
    node = node.parent
  ) {
    const style = styleOf(node)
    for (const key of ['width', 'maxWidth'] as const) {
      const value = style[key]
      if (typeof value === 'number') widest = Math.min(widest, value)
    }
    const side = style.paddingHorizontal ?? style.padding
    if (!padded && typeof side === 'number') {
      widest = Math.min(widest, windowWidth - 2 * side)
      padded = true
    }
  }
  return widest
}

// La fenêtre de Jest (un téléphone), rendue après chaque test qui la change.
const initialWindow = Dimensions.get('window')
const setWindow = (width: number) => {
  const size = { ...initialWindow, width, height: 1080 }
  Dimensions.set({ window: size, screen: size })
}
afterEach(() => {
  Dimensions.set({ window: initialWindow, screen: initialWindow })
  jest.mocked(useHydrated).mockReturnValue(true)
})

const BAR = 'Barre du haut'
const CONTENT = 'Le contenu de la page'

/** La largeur que l'écran annonce à son contenu, écrite à l'écran pour être lue par le test. */
function WidthProbe() {
  const width = useContentWidth()
  return <Text>{`Largeur ${width}`}</Text>
}
/** Le nombre écrit par la sonde. */
const announcedWidth = () => {
  const text = screen.getByText(/^Largeur /).props.children as string
  return Number(text.replace('Largeur ', ''))
}

const page = (width: 'wide' | 'page' | 'form', probe = false) => (
  <Screen
    width={width}
    title="Fil"
    header={
      <View>
        <Text>{BAR}</Text>
      </View>
    }
  >
    <Text>{CONTENT}</Text>
    {probe ? <WidthProbe /> : null}
  </Screen>
)

describe('Screen width="wide"', () => {
  it.each([
    [1440, 1376],
    [1920, 1728],
    [2560, 1920],
  ])(
    'lays the content of a wide screen at a %i-point window over %i points',
    async (window, content) => {
      setWindow(window)
      await renderWithProviders(page('wide'))

      expect(shownWidth(CONTENT, window)).toBe(content)
    },
  )

  it('stays as wide as an ordinary page below 1 280', async () => {
    setWindow(1100)
    await renderWithProviders(page('wide'))

    // 1 100 − 2 × 32 : la page ordinaire, bornée par ses seules marges.
    expect(shownWidth(CONTENT, 1100)).toBe(1036)
  })

  it('tells its content how wide it is', async () => {
    setWindow(1920)
    await renderWithProviders(page('wide', true))

    expect(announcedWidth()).toBe(1728)
  })

  it('gives the top bar the width of the wide screen', async () => {
    setWindow(1920)
    await renderWithProviders(page('wide'))

    expect(shownWidth(BAR, 1920)).toBe(1728)
    expect(shownWidth(BAR, 1920)).toBe(shownWidth(CONTENT, 1920))
  })

  // Relecture du plan, C1 : la page pré-rendue est dessinée sans fenêtre ; à l'hydratation, React
  // vérifie que le premier dessin est celui du serveur. La colonne et la barre gardent donc la
  // largeur d'une page ordinaire (1 280) tant que la page n'est pas hydratée, même à 1 920.
  it('Screen width wide keeps the page width until the page is hydrated', async () => {
    setWindow(1920)
    jest.mocked(useHydrated).mockReturnValue(false)
    await renderWithProviders(page('wide'))

    expect(shownWidth(CONTENT, 1920)).toBe(layout.maxContentWidth)
    expect(shownWidth(BAR, 1920)).toBe(layout.maxContentWidth)
  })

  // Et le contenu se range comme sur téléphone : moins de place que deux cartes du Fil, une grille
  // y compte une seule colonne (la page pré-rendue est en largeur de téléphone).
  it('tells its content the width of a phone until the page is hydrated', async () => {
    setWindow(1920)
    jest.mocked(useHydrated).mockReturnValue(false)
    await renderWithProviders(page('wide', true))

    expect(announcedWidth()).toBeGreaterThanOrEqual(0)
    expect(announcedWidth()).toBeLessThan(2 * layout.cardMin.feed)
  })
})

describe('Screen widths other than wide, unchanged', () => {
  // Témoins : les écrans `page` et `form` gardent leur largeur à 1 920 (ils passent déjà ; ils
  // prouvent aussi que la lecture des largeurs, `shownWidth`, voit les bornes de Screen).
  it('keeps an ordinary page and its top bar at 1 280 points', async () => {
    setWindow(1920)
    await renderWithProviders(page('page'))

    expect(shownWidth(CONTENT, 1920)).toBe(layout.maxContentWidth)
    expect(shownWidth(BAR, 1920)).toBe(layout.maxContentWidth)
  })

  it('keeps a form at the width of a form', async () => {
    setWindow(1920)
    await renderWithProviders(page('form'))

    expect(shownWidth(CONTENT, 1920)).toBe(layout.formWidth)
  })

  it('tells the content of an ordinary page its width', async () => {
    setWindow(1920)
    await renderWithProviders(page('page', true))

    expect(announcedWidth()).toBe(layout.maxContentWidth)
  })

  it('tells the content of a form its width', async () => {
    setWindow(1920)
    await renderWithProviders(page('form', true))

    expect(announcedWidth()).toBe(layout.formWidth)
  })
})
