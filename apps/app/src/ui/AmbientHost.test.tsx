// Tests de l'hôte de la lumière (tranche RF, « La lumière continue d'une page à l'autre ») : sur le
// web, une seule lumière est posée derrière toute la pile de pages (`AmbientHost`, dans
// app/_layout.tsx), au lieu d'une par écran. Chaque écran (`Screen`) s'y inscrit avec sa source ;
// la lumière prend celle de l'écran affiché, le dernier devenu affiché (ui-11), et glisse vers elle.
// Un écran caché ne peut ni changer la lumière ni la raviver (S3) ; le miel vif et `ambient={false}`
// ne veulent pas de lumière : la lumière s'éteint (`off`), s'efface en fondu puis rend son canvas
// (S2, testé dans AmbientLight.web.test.tsx). Une source `null` n'éteint rien : c'est la lumière
// miel.
//
// La lumière est remplacée par une vue repérée (testID « ambient-light ») qui montre ce qu'elle
// reçoit : sa source (la prop `source` de l'hôte, sinon celle du contexte, comme la vraie) et sa
// prop `off`, et qui note
// les impulsions reçues. La route de chaque écran (`useScreenFocused`, `useScreenShownCount` de
// ui/screenFocus.ts) vient d'un faux module piloté par un contexte (MockRoute), un par écran.
import { palettes } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import type { ComponentType, ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { AmbientHost, hostedNavigationTheme, hostedStackStyle } from './AmbientHost'
import { Screen } from './Screen'
import { Text } from './Text'
import { type AmbientPalette, type AmbientSource, useAmbient } from './theme/ambient'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Les impulsions reçues par la lumière (le préfixe « mock » permet à la fabrique de s'en servir).
const mockPulses = jest.fn()

// `require` dans les fabriques : Jest les remonte en tête du fichier, avant les imports.
jest.mock('./AmbientLight', () => {
  const { createElement, useEffect } = require('react')
  const { View } = require('react-native')
  const { useAmbientSource } = require('./theme/ambient')
  return {
    AmbientLight: ({ source: given, off = false }: { source?: unknown; off?: boolean }) => {
      // La source donnée par l'hôte (`source`), sinon celle du contexte, comme la vraie lumière.
      const { source: shared, onPulse } = useAmbientSource()
      useEffect(() => onPulse(mockPulses), [onPulse])
      const source = given !== undefined ? given : shared
      return createElement(View, { testID: 'ambient-light', source, off })
    },
  }
})

jest.mock('./screenFocus', () => {
  const { createContext, useContext } = require('react')
  const Route = createContext({ focused: true, shown: 1 })
  return {
    MockRoute: Route.Provider,
    useScreenFocused: () => useContext(Route).focused,
    useScreenShownCount: () => useContext(Route).shown,
  }
})
/** La route d'un écran : affichée ou non, et combien de fois elle l'est devenue. */
type RouteState = { focused: boolean; shown: number }
const { MockRoute } = jest.requireMock<{
  MockRoute: ComponentType<{ value: RouteState; children: ReactNode }>
}>('./screenFocus')

/** Les gestes de lumière d'un composant posé dans chaque écran, par nom d'écran. */
const remotes: Record<string, ReturnType<typeof useAmbient>> = {}
function Remote({ name }: { name: string }) {
  remotes[name] = useAmbient()
  return null
}

type ScreenOptions = { ambiance?: 'brand' | 'light'; ambient?: boolean }

/** Un écran nommé, coloré par son résumé flou, dans sa route. */
const page = (name: string, route: RouteState, options: ScreenOptions = {}) => (
  <MockRoute key={name} value={route}>
    {/* La vue de la route, comme celle que la pile pose autour de chaque page. */}
    <View testID={`route-${name}`} style={StyleSheet.flatten(hostedStackStyle)}>
      <Screen title={name} thumbhash={`hash-${name}`} {...options}>
        <Text>{`Contenu ${name}`}</Text>
        <Remote name={name} />
      </Screen>
    </View>
  </MockRoute>
)

/** Ce que la lumière reçoit : la source, et si elle est éteinte (aucun écran affiché n'en veut). */
const light = () => {
  const lights = screen.getAllByTestId('ambient-light')
  expect(lights).toHaveLength(1)
  const props = (lights[0] as unknown as { props: { source: AmbientSource; off: boolean } }).props
  return { source: props.source, off: props.off }
}

const sunset: AmbientPalette = ['#d9480f', '#ffa94d', '#862e9c']

beforeEach(() => {
  mockPulses.mockClear()
})

describe('AmbientHost', () => {
  it('draws a single light behind two screens', async () => {
    await renderWithProviders(
      <AmbientHost>
        {page('Fil', { focused: false, shown: 1 })}
        {page('Projet', { focused: true, shown: 1 })}
      </AmbientHost>,
    )

    expect(screen.getByText('Contenu Fil')).toBeTruthy() // témoin : les deux écrans sont là
    expect(screen.getByText('Contenu Projet')).toBeTruthy()
    expect(screen.getAllByTestId('ambient-light')).toHaveLength(1)
  })

  it('takes the source of the screen displayed', async () => {
    await renderWithProviders(
      <AmbientHost>
        {page('Fil', { focused: false, shown: 1 })}
        {page('Projet', { focused: true, shown: 1 })}
      </AmbientHost>,
    )

    expect(light()).toEqual({ source: { thumbhash: 'hash-Projet' }, off: false })
  })

  it('goes back to the source of the screen found again', async () => {
    const view = await renderWithProviders(
      <AmbientHost>
        {page('Fil', { focused: false, shown: 1 })}
        {page('Projet', { focused: true, shown: 1 })}
      </AmbientHost>,
    )

    await view.rerender(
      <AmbientHost>
        {page('Fil', { focused: true, shown: 2 })}
        {page('Projet', { focused: false, shown: 1 })}
      </AmbientHost>,
    )

    expect(light().source).toEqual({ thumbhash: 'hash-Fil' })
  })

  // ui-11 : l'écran affiché est le dernier devenu affiché. Pendant un passage, deux écrans peuvent
  // se dire affichés à la fois : c'est l'arrivée (un événement) qui décide, pas un booléen.
  it('follows the screen that became displayed last, when two say they are displayed', async () => {
    const view = await renderWithProviders(
      <AmbientHost>{page('Fil', { focused: true, shown: 1 })}</AmbientHost>,
    )
    expect(light().source).toEqual({ thumbhash: 'hash-Fil' })

    await view.rerender(
      <AmbientHost>
        {page('Fil', { focused: true, shown: 1 })}
        {page('Projet', { focused: true, shown: 1 })}
      </AmbientHost>,
    )
    expect(light().source).toEqual({ thumbhash: 'hash-Projet' })

    await view.rerender(
      <AmbientHost>
        {page('Fil', { focused: true, shown: 2 })}
        {page('Projet', { focused: true, shown: 1 })}
      </AmbientHost>,
    )
    expect(light().source).toEqual({ thumbhash: 'hash-Fil' })
  })
})

// S3 : les gestes d'un écran sont liés à son inscription ; un écran caché ne touche pas à la
// lumière de celui qui est affiché.
describe('AmbientHost, the gestures of each screen (S3)', () => {
  const twoScreens = (
    <AmbientHost>
      {page('Fil', { focused: false, shown: 1 })}
      {page('Projet', { focused: true, shown: 1 })}
    </AmbientHost>
  )

  it('ignores a new source from a hidden screen, and takes one from the displayed screen', async () => {
    await renderWithProviders(twoScreens)

    await act(async () => remotes.Fil?.setSource({ palette: sunset }))
    expect(light().source).toEqual({ thumbhash: 'hash-Projet' })

    // Témoin : le même geste, depuis l'écran affiché, change la lumière.
    await act(async () => remotes.Projet?.setSource({ palette: sunset }))
    expect(light().source).toEqual({ palette: sunset })
  })

  it('ignores a pulse from a hidden screen, and passes one from the displayed screen', async () => {
    await renderWithProviders(twoScreens)

    await act(async () => remotes.Fil?.pulse(1))
    expect(mockPulses).not.toHaveBeenCalled()

    // Témoin : l'impulsion de l'écran affiché arrive à la lumière commune.
    await act(async () => remotes.Projet?.pulse(1))
    expect(mockPulses).toHaveBeenCalledTimes(1)
  })

  it('forgets a screen when it unmounts: no screen displayed, the light goes off', async () => {
    const view = await renderWithProviders(twoScreens)
    expect(light()).toEqual({ source: { thumbhash: 'hash-Projet' }, off: false }) // témoin

    await view.rerender(<AmbientHost>{page('Fil', { focused: false, shown: 1 })}</AmbientHost>)

    expect(light().off).toBe(true)
  })
})

// Le miel vif remplace la lumière (connexion, inscription), comme `ambient={false}` : la lumière
// s'éteint (`off`) ; elle revient quand on retrouve un écran qui la veut.
describe('AmbientHost on a screen without light', () => {
  it.each([
    ['the bright honey', { ambiance: 'brand' as const }],
    ['ambient={false}', { ambient: false }],
  ])('turns the light off on %s', async (_case, options) => {
    await renderWithProviders(
      <AmbientHost>
        {page('Fil', { focused: false, shown: 1 })}
        {page('Connexion', { focused: true, shown: 1 }, options)}
      </AmbientHost>,
    )

    expect(light().off).toBe(true)
  })

  it('lights up again when the member comes back from the bright honey', async () => {
    const view = await renderWithProviders(
      <AmbientHost>
        {page('Fil', { focused: false, shown: 1 })}
        {page('Connexion', { focused: true, shown: 1 }, { ambiance: 'brand' })}
      </AmbientHost>,
    )
    expect(light().off).toBe(true) // témoin : sur le miel, éteinte

    await view.rerender(
      <AmbientHost>
        {page('Fil', { focused: true, shown: 2 })}
        {page('Connexion', { focused: false, shown: 1 }, { ambiance: 'brand' })}
      </AmbientHost>,
    )

    expect(light()).toEqual({ source: { thumbhash: 'hash-Fil' }, off: false })
  })
})

/** Un nœud de l'arbre rendu, le peu qu'on en lit. */
type Node = { parent: Node | null; props: Record<string, unknown> }

/** Un nœud et ses enfants, pour parcourir tout l'arbre. */
type TreeNode = Node & { children: (TreeNode | string)[] }

/** L'élément et tous ses ancêtres, du plus proche au plus lointain. */
const lineage = (element: unknown): Node[] => {
  const nodes: Node[] = []
  for (let node = element as Node | null; node; node = node.parent) nodes.push(node)
  return nodes
}

/** Les couleurs de fond qu'un nœud pose (son style, et le cadre de contenu d'un ScrollView). */
const backgrounds = (node: Node): unknown[] =>
  [node.props.style, node.props.contentContainerStyle]
    .map(
      (style) =>
        (StyleSheet.flatten(style as never) as { backgroundColor?: unknown })?.backgroundColor,
    )
    .filter((color) => color !== undefined && color !== 'transparent')

// Le fond : dans l'hôte, les écrans et la pile sont transparents ; l'hôte pose le fond de la page
// une fois, sous la lumière. Sinon chaque écran cacherait la lumière commune (ui-15 : le style de
// la pile est exporté par l'hôte, app/_layout.tsx ne l'écrit pas).
describe('AmbientHost, the background', () => {
  it('gives the stack a transparent background', () => {
    expect(StyleSheet.flatten(hostedStackStyle).backgroundColor).toBe('transparent')
  })

  it('leaves nothing opaque between the light and the content of a screen', async () => {
    await renderWithProviders(
      <AmbientHost>{page('Explorer', { focused: true, shown: 1 })}</AmbientHost>,
    )

    const fromContent = lineage(screen.getByText('Contenu Explorer'))
    const fromLight = lineage(screen.getByTestId('ambient-light'))
    // La lumière est celle de l'hôte, hors de la page (la vue de la route, comme dans la pile).
    expect(fromLight).not.toContain(screen.getByTestId('route-Explorer'))
    // Le premier cadre commun à la lumière et au contenu : celui de l'hôte. Entre lui et le
    // contenu (la page, l'écran, sa zone qui défile), aucun fond.
    const common = fromContent.findIndex((node) => fromLight.includes(node))
    expect(common).toBeGreaterThan(0)
    const between = fromContent.slice(0, common)
    expect(between.flatMap(backgrounds)).toEqual([])
  })

  it('paints the page background once, under the light', async () => {
    await renderWithProviders(
      <AmbientHost>{page('Explorer', { focused: true, shown: 1 })}</AmbientHost>,
    )

    // Tout l'arbre est parcouru : le fond peut être un cadre autour de la lumière ou une couche
    // posée sous elle. Hors de l'hôte, chaque écran peint le sien ; dans l'hôte, seul l'hôte.
    const pageColors: unknown[] = [palettes.day.background, palettes.night.background]
    const painters: Node[] = []
    const visit = (node: TreeNode | string) => {
      if (typeof node === 'string') return
      if (backgrounds(node).some((color) => pageColors.includes(color))) painters.push(node)
      for (const child of node.children) visit(child)
    }
    visit(screen.root as unknown as TreeNode)
    expect(painters).toHaveLength(1)
    // Peint par l'hôte, hors de la page.
    expect(lineage(painters[0])).not.toContain(screen.getByTestId('route-Explorer'))
  })
})

// Hors de l'hôte (le catalogue, les tests d'un écran seul, l'appli de téléphone), chaque écran
// garde sa propre lumière, comme avant.
describe('Screen outside the host', () => {
  it('draws one light per screen, as before', async () => {
    await renderWithProviders(
      <>
        {page('Fil', { focused: false, shown: 1 })}
        {page('Projet', { focused: true, shown: 1 })}
      </>,
    )

    expect(screen.getAllByTestId('ambient-light')).toHaveLength(2)
  })
})

// RF, U4 : le thème de la navigation. La pile peint ses cadres du `background` de ce thème (un gris
// clair par défaut) : il couvrait la lumière et le fond de l'hôte. `hostedNavigationTheme` le rend
// transparent ; que `app/_layout.tsx` le donne bien à la navigation est vérifié par
// `navigation/RootLayout.test.tsx`.
describe('hostedNavigationTheme', () => {
  const base = {
    dark: false,
    colors: { background: 'rgb(242, 242, 242)', card: 'rgb(255, 255, 255)' },
  }

  it('turns the grey background of the navigation theme transparent', () => {
    expect(hostedNavigationTheme(base).colors.background).toBe('transparent')
  })

  it('keeps the rest of the theme, and does not change the one it was given', () => {
    const theme = hostedNavigationTheme(base)
    expect(theme.colors.card).toBe('rgb(255, 255, 255)')
    expect(theme.dark).toBe(false)
    expect(base.colors.background).toBe('rgb(242, 242, 242)')
  })
})
