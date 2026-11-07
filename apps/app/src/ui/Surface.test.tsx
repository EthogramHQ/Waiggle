// Tests de la feuille de jour (relecture de R5b, des-C3, décision de Louis du 7/11/2026) : crème et
// opaque partout, pour que les cartes grises posées dessus se voient ; de nuit, inchangée, dense et
// floutée. Le contraste réel à l'écran, en pixels, se mesure dans le navigateur.
import { palettes } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Surface } from './Surface'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./theme/ThemeProvider', () => ({
  ...jest.requireActual('./theme/ThemeProvider'),
  useTheme: jest.fn(),
}))

type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }
const hosts = (node: Node | string = screen.root as unknown as Node): Node[] =>
  typeof node === 'string' ? [] : [node, ...node.children.flatMap(hosts)]
const flat = (node: Node) =>
  (StyleSheet.flatten(node.props.style as object) ?? {}) as Record<string, unknown>

/** Le thème voulu, tel que le vrai `ThemeProvider` le donnerait (ombres comprises). */
const useScheme = (scheme: 'day' | 'night') => {
  jest.mocked(useTheme).mockReturnValue({
    colors: palettes[scheme],
    scheme,
    shadows: { highlight: 'a', soft: 'b', float: 'c', card: 'd' },
  } as unknown as ReturnType<typeof useTheme>)
}

const backgrounds = () =>
  hosts()
    .map((node) => flat(node).backgroundColor)
    .filter((color) => typeof color === 'string')

/** Une couche de flou : celle du web (`backdropFilter`), ou la vue native d'expo-blur. */
const blurLayers = () =>
  hosts().filter(
    (node) =>
      typeof flat(node).backdropFilter === 'string' ||
      'tint' in node.props ||
      'intensity' in node.props,
  )

const sheet = () =>
  renderWithProviders(
    <Surface variant="sheet">
      <Text>Commentaires</Text>
    </Surface>,
  )

describe('Surface sheet', () => {
  afterEach(() => jest.restoreAllMocks())

  it('takes the page colour by day: the sheet token is the opaque cream of the page', () => {
    expect(palettes.day.sheet).toBe(palettes.day.background)
  })

  it('keeps the night token dense and translucent', () => {
    expect(palettes.night.sheet).toBe('rgba(26,23,18,0.94)')
  })

  for (const os of ['web', 'ios', 'android'] as const) {
    it(`is cream by day and draws no blur behind it on ${os}`, async () => {
      jest.replaceProperty(Platform, 'OS', os)
      useScheme('day')
      await sheet()

      expect(backgrounds()).toContain(palettes.day.sheet)
      expect(backgrounds()).not.toContain(palettes.day.surface)
      expect(blurLayers()).toEqual([])
    })
  }

  it('keeps its blur by night (témoin)', async () => {
    useScheme('night')
    await sheet()

    expect(blurLayers().length).toBeGreaterThan(0)
    expect(backgrounds()).toContain(palettes.night.sheet)
  })

  it('still rounds its content at the corners by day (the content cannot leave the sheet)', async () => {
    useScheme('day')
    await sheet()

    expect(hosts().some((node) => flat(node).overflow === 'hidden')).toBe(true)
  })
})
