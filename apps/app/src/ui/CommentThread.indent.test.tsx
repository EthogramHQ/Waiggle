// Tests du retrait des réponses d'un fil (R6b, restes de R5b) : sur un écran étroit et quand le texte
// est très agrandi, le retrait se resserre pour rendre de la place au texte des réponses (à 320 points
// et 200 %, elles ne gardaient que 12 caractères par ligne). Le coude du trait reste entier.
// Jest ne mesure aucune ligne de texte : la place gagnée se mesure dans le navigateur (`--explore`) ;
// ici, on vérifie la règle (plus étroit, plus petit retrait) et que le dessin tient.
import { act, screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { CommentThread } from './CommentThread'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const all = () => hostsOf(screen.root as unknown as Host)
const styleOf = (node: Host) => StyleSheet.flatten(node.props.style as ViewStyle) ?? {}

/** Le retrait de la liste des réponses (le seul élément de rôle « list » du fil). */
const indent = () => {
  const list = all().find((node) => node.props.accessibilityRole === 'list')
  if (!list) throw new Error('aucune liste de réponses')
  return Number(styleOf(list).marginLeft)
}

/** Les coudes du trait : les morceaux arrondis en bas à gauche. */
const elbows = () =>
  all()
    .map(styleOf)
    .filter((style) => typeof style.borderBottomLeftRadius === 'number')

const setWindow = async (width: number, fontScale = 1) => {
  const window = { width, height: 844, scale: 3, fontScale }
  await act(async () => Dimensions.set({ window, screen: window }))
}

const thread = (
  <CommentThread
    root={<Text>Max : Super idée, je teste ce soir.</Text>}
    replies={[
      <Text key="zoe">Zoé : Moi aussi, dis-nous !</Text>,
      <Text key="lea">Léa : Merci à vous deux.</Text>,
    ]}
  />
)

/**
 * Le retrait rendu pour une fenêtre donnée. Un seul rendu par test (un troisième rendu sortait vide) :
 * le fil reste monté, et suit la fenêtre qui change, comme à la rotation d'un téléphone.
 */
const indentAt = async (width: number, fontScale = 1) => {
  await setWindow(width, fontScale)
  const value = indent()
  // Chaque coude garde au moins la place de son arrondi : le trait ne se casse pas.
  expect(elbows()).toHaveLength(2)
  for (const elbow of elbows()) {
    expect(Number(elbow.width)).toBeGreaterThanOrEqual(Number(elbow.borderBottomLeftRadius))
  }
  return value
}

describe('CommentThread, the indent of the replies', () => {
  beforeEach(async () => {
    await renderWithProviders(thread)
  })

  afterEach(async () => {
    await setWindow(390)
  })

  it('narrows the indent under 360 points, keeping a whole elbow', async () => {
    const wide = await indentAt(390)
    const narrow = await indentAt(320)

    expect(narrow).toBeGreaterThan(0)
    expect(narrow).toBeLessThan(wide)
    // 360 points : déjà le retrait normal.
    expect(await indentAt(360)).toBe(wide)
  })

  it('narrows it further when the text is very enlarged, on any width', async () => {
    const narrow = await indentAt(320)
    const largeNarrow = await indentAt(320, 2)
    const largeWide = await indentAt(1440, 2)

    expect(largeNarrow).toBeGreaterThan(0)
    expect(largeNarrow).toBeLessThan(narrow)
    expect(largeWide).toBe(largeNarrow)
  })
})
