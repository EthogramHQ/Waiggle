// Test de la couverture d'une carte étirée (R15, « Récents » d'Explorer sur ordinateur). Les
// compactes d'une rangée prennent la hauteur de la plus haute ; celles qui portent une pastille
// (« Suivre Inès ») gardaient une couverture de 274 points dans une carte de 326 : le verre du bas
// descendait sous la photo, sur un fond blanc.
//
// La cause : la couverture recevait une hauteur fixe, mesurée une fois sur le corps de la carte
// (`onLayout`). Sur le web, react-native-web ne remesure une vue que si sa boîte de contenu change
// (un `ResizeObserver`, qui suit le contenu sans les marges intérieures). Or la carte grandit
// justement par sa marge du haut, quand la colonne de la pastille est mesurée : sa boîte de contenu
// garde la même taille, aucune nouvelle mesure n'arrive, et la couverture reste à l'ancienne hauteur.
//
// Jest ne calcule aucune hauteur : on donne au corps la mesure périmée (274 points), comme le
// navigateur, puis on vérifie que la couverture ne la recopie pas et remplit la carte (`flexGrow`).
import { radii } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet, Text, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ProjectCard } from './ProjectCard'
import { GridCardsContext } from './ProjectGrid'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; parent: Node | null; children: (Node | string)[] }

const card = {
  title: 'Arrosage malin',
  pitch: 'Le jardin dit quand il a soif.',
  author: { name: 'Nora Benali', avatar: null },
  when: 'il y a 3 h',
  status: { label: 'En construction', strong: false },
  image: { source: { uri: 'https://api.example/aloe.webp' }, label: 'Un arrosoir au soleil' },
}

const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
const setWindow = (width: number, height: number) => {
  const size = { width, height, scale: 2, fontScale: 1 }
  Dimensions.set({ window: size, screen: size })
}

const styleOf = (node: Node | null) =>
  (StyleSheet.flatten(node?.props.style as ViewStyle) ?? {}) as ViewStyle

/** Le premier ancêtre (lui compris) qui répond à `test`. */
const closest = (node: Node, test: (style: ViewStyle) => boolean): Node | null => {
  for (let current: Node | null = node; current; current = current.parent) {
    if (test(styleOf(current))) return current
  }
  return null
}

/** Tous les descendants de `node` (lui compris) qui répondent à `test`. */
const within = (node: Node, test: (style: ViewStyle) => boolean): Node[] => {
  const found = test(styleOf(node)) ? [node] : []
  for (const child of node.children) {
    if (typeof child !== 'string') found.push(...within(child, test))
  }
  return found
}

afterEach(async () => {
  await act(async () => Dimensions.set({ window: phone, screen: phone }))
})

it('fills the stretched compact card with its cover, whatever height was measured', async () => {
  setWindow(1920, 940)
  await renderWithProviders(
    <GridCardsContext.Provider value="compact">
      <ProjectCard {...card} onPress={() => {}} overlay={<Text>Suivre Nora</Text>} />
    </GridCardsContext.Provider>,
  )
  // Le corps de la carte : la vue qui porte sa hauteur minimale, sous le titre.
  const title = screen.getByText(card.title, { includeHiddenElements: true }) as unknown as Node
  const body = closest(title, (style) => Number(style.minHeight ?? 0) > 0)
  expect(body).not.toBeNull()
  // Témoin : la carte s'étire dans sa rangée.
  expect(styleOf(body).flexGrow).toBe(1)

  // La seule mesure que donne le navigateur : celle d'avant la marge du haut (274 points).
  await fireEvent(body as never, 'layout', { nativeEvent: { layout: { height: 274 } } })

  // La couverture : le cadre arrondi qui rogne la photo (au rayon de la carte).
  const covers = within(
    body as Node,
    (style) => style.overflow === 'hidden' && style.borderRadius === radii.sheet,
  )
  expect(covers).toHaveLength(1)
  const cover = styleOf(covers[0] as Node)
  // Elle ne garde aucune hauteur mesurée : elle grandit jusqu'au bas de la carte.
  expect(cover.height).toBeUndefined()
  expect(cover.flexGrow).toBe(1)
})
