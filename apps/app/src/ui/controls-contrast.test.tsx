// Tests de la relecture de R1 (lot « contrôles et contraste ») : la forme d'un contrôle dit son
// état, elle doit donc se voir. Le bord d'une case ou d'un rond, la piste d'un interrupteur éteint,
// le rond choisi tiennent 3:1 contre la carte (WCAG 1.4.11) ; un squelette se voit à 1,5:1 ; une
// ligne inactive pâlit ; l'anneau de focus suit le rayon de ce qu'il entoure. On mesure les couleurs
// réellement posées par les composants (la règle), pas une valeur de jeton.
import { contrastRatio, palettes, radii } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { StyleSheet, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Checkbox } from './Checkbox'
import { ListGroup, ListRow } from './ListGroup'
import { Pressed } from './Pressed'
import { RadioMark } from './Radio'
import { SkeletonCard } from './Skeleton'
import { Switch } from './Switch'
import { Text } from './Text'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Les tests rendent l'appli de jour.
const day = palettes.day
const noop = () => {}

/** Un élément rendu, tel que le donnent les requêtes de la bibliothèque de test. */
type Node = ReturnType<typeof screen.getByRole>

type Style = ViewStyle & { opacity?: number }
type ViewStyle = { borderColor?: string; backgroundColor?: string; borderRadius?: number }

/** Le style aplati d'un élément (une liste de styles devient un seul objet). */
const styleOf = (node: Node): Style => (StyleSheet.flatten(node.props.style) ?? {}) as Style

/** Les éléments dessinés sous `root`, lui compris, en descendant de parent en enfant. */
const hosts = (root: Node): Node[] => [
  root,
  ...root.children.flatMap((child) => (typeof child === 'string' ? [] : hosts(child))),
]

/** Les couleurs de bord posées sous `root`. */
const borderColors = (root: Node): string[] =>
  hosts(root)
    .map((node) => styleOf(node).borderColor)
    .filter((color): color is string => typeof color === 'string')

/** Les couleurs de fond posées sous `root`. */
const fills = (root: Node): string[] =>
  hosts(root)
    .map((node) => styleOf(node).backgroundColor)
    .filter((color): color is string => typeof color === 'string' && color !== 'transparent')

/** Le plus fort contraste, contre la carte, parmi ces couleurs : la forme la plus visible. */
const bestOnSurface = (colors: string[]): number =>
  Math.max(0, ...colors.map((color) => contrastRatio(color, day.surface)))

describe('the outline of a control', () => {
  it.each([true, false])(
    'draws the radio mark (selected: %s) at 3:1 against the card',
    async (selected) => {
      // Avant : un point miel sur du blanc (1,6:1) et un rond vide en lineStrong (1,5:1).
      await renderWithProviders(
        <View testID="row">
          <RadioMark selected={selected} />
        </View>,
      )
      const colors = borderColors(screen.getByTestId('row'))
      expect(colors.length).toBeGreaterThan(0) // témoin : le rond a bien un bord
      for (const color of colors) {
        expect(contrastRatio(color, day.surface)).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(color, day.background)).toBeGreaterThanOrEqual(3)
      }
    },
  )

  it('fills the selected radio mark with honey and a light dot in its centre', async () => {
    await renderWithProviders(
      <View testID="row">
        <RadioMark selected />
      </View>,
    )
    expect(fills(screen.getByTestId('row'))).toEqual([day.honey, day.knob])
  })

  it.each([true, false])(
    'draws the box of a checkbox (checked: %s) at 3:1 against the card',
    async (value) => {
      await renderWithProviders(<Checkbox label="J’accepte" value={value} onValueChange={noop} />)
      const colors = borderColors(screen.getByRole('checkbox', { name: 'J’accepte' }))
      expect(colors.length).toBeGreaterThan(0)
      for (const color of colors) {
        expect(contrastRatio(color, day.surface)).toBeGreaterThanOrEqual(3)
      }
    },
  )

  it('shows a switch turned off at 3:1 against the card', async () => {
    // Éteint, la pastille est blanche comme la carte : seule la piste montre l'interrupteur.
    await renderWithProviders(<Switch label="Me prévenir" value={false} onValueChange={noop} />)
    const off = screen.getByRole('switch', { name: 'Me prévenir', checked: false })
    expect(bestOnSurface(fills(off))).toBeGreaterThanOrEqual(3)
  })
})

describe('the focus ring', () => {
  it('rounds the row of a checkbox, like the choices of a radio group', async () => {
    await renderWithProviders(<Checkbox label="J’accepte" value={false} onValueChange={noop} />)
    expect(styleOf(screen.getByRole('checkbox')).borderRadius).toBeGreaterThan(0)
  })

  it('follows the radius written in the style of the card it wraps', async () => {
    await renderWithProviders(
      <Pressed label="La note de Léa" role="link" onPress={noop}>
        <View style={{ borderRadius: radii.tile }}>
          <Text>Une note</Text>
        </View>
      </Pressed>,
    )
    expect(styleOf(screen.getByRole('link', { name: 'La note de Léa' })).borderRadius).toBe(
      radii.tile,
    )
  })

  it('follows the radius it is given', async () => {
    await renderWithProviders(
      <Pressed label="Le projet de Léa" role="link" radius="sheet" onPress={noop}>
        <Text>Un projet</Text>
      </Pressed>,
    )
    expect(styleOf(screen.getByRole('link', { name: 'Le projet de Léa' })).borderRadius).toBe(
      radii.sheet,
    )
  })
})

describe('a disabled row of a list', () => {
  it('looks paler than an active one', async () => {
    await renderWithProviders(
      <ListGroup title="Langue" radio>
        <ListRow label="Français" selected disabled onPress={noop} />
        <ListRow label="English" selected={false} onPress={noop} />
      </ListGroup>,
    )
    const faded = (name: string) =>
      hosts(screen.getByRole('radio', { name })).some((node) => (styleOf(node).opacity ?? 1) < 1)
    expect(faded('Français')).toBe(true)
    expect(faded('English')).toBe(false) // témoin : une ligne active ne pâlit pas
  })
})

describe('the skeleton shapes', () => {
  it('can be seen on the page and on a card, at 1.5:1 at least', async () => {
    // Avant : le fond groupé, 1,1:1 sur la page comme sur la carte.
    await renderWithProviders(<SkeletonCard />)
    const shapes = fills(screen.getByRole('progressbar'))
    expect(shapes.length).toBeGreaterThan(0)
    for (const color of shapes) {
      expect(contrastRatio(color, day.surface)).toBeGreaterThanOrEqual(1.5)
      expect(contrastRatio(color, day.background, day.background)).toBeGreaterThanOrEqual(1.5)
    }
  })
})
