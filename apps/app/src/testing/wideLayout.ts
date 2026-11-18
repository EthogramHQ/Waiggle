// Outils des tests de mise en page sur grand écran (R15, puis R16 : Ruches, Recherche et Outils en
// grand). Jest ne calcule aucune position : on ne lit jamais un style. On lit l'arbre rendu, qui
// suffit à dire ce qui est à côté de quoi :
// - la fenêtre simulée (`atWindow`) donne la largeur, que l'appli lit par `useWindowDimensions` ;
// - une grille de cartes est faite de rangées (comme `ui/ProjectGrid`) : des cartes qui partagent
//   une rangée sont côte à côte ; une liste « sur cinq colonnes » est faite de colonnes ;
// - `linesOf` range des éléments selon l'enfant de leur plus proche parent commun qui les porte :
//   dans une grille, une rangée par groupe ; dans une liste en colonnes, une colonne par groupe ; en
//   une seule colonne (la page d'aujourd'hui), un élément par groupe ;
// - l'ordre de l'arbre est l'ordre de lecture (de haut en bas pour un lecteur d'écran).
import { screen } from '@testing-library/react-native'
import { Dimensions } from 'react-native'

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
export type Host = {
  props: Record<string, unknown>
  parent: Host | null
  children: (Host | string)[]
}

/** Le temps d'un test, une fenêtre de cette taille ; le téléphone de jest.setup.ts est remis à la fin. */
export const atWindow = async (width: number, height: number, run: () => Promise<void>) => {
  const window = { width, height, scale: 2, fontScale: 1 }
  const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
  Dimensions.set({ window, screen: window })
  try {
    await run()
  } finally {
    Dimensions.set({ window: phone, screen: phone })
  }
}

/** Les hauteurs des fenêtres simulées, pour chaque largeur des planches. */
export const heightOf = (width: number) => ({ 1920: 1080, 1440: 900, 1100: 800 })[width] ?? 844

const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** Tous les éléments de l'arbre rendu, dans l'ordre de lecture. */
export const inOrder = () => hostsOf(screen.root as unknown as Host)

/** Vrai si `first` est lu avant `second` (les deux doivent être dans la page). */
export const readBefore = (first: unknown, second: unknown) => {
  const nodes = inOrder()
  const a = nodes.indexOf(first as Host)
  const b = nodes.indexOf(second as Host)
  expect(a).toBeGreaterThanOrEqual(0)
  expect(b).toBeGreaterThanOrEqual(0)
  return a < b
}

/** Les parents d'un élément, de lui-même jusqu'à la racine. */
const lineage = (node: Host): Host[] => {
  const all: Host[] = []
  for (let at: Host | null = node; at; at = at.parent) all.push(at)
  return all
}

/** Le plus proche parent commun de plusieurs éléments. */
export const commonAncestor = (nodes: readonly unknown[]): Host => {
  const [first, ...rest] = nodes as Host[]
  if (!first) throw new Error('aucun élément')
  const found = lineage(first).find((candidate) =>
    rest.every((node) => lineage(node).includes(candidate)),
  )
  if (!found) throw new Error('aucun parent commun')
  return found
}

/**
 * Les éléments rangés par l'enfant de leur plus proche parent commun qui les porte, dans l'ordre :
 * cinq ruches sur quatre colonnes donnent `[4, 1]` (deux rangées) ; vingt outils en cinq colonnes,
 * `[4, 4, 4, 4, 4]` ; une seule colonne, `[1, 1, 1, 1, 1]`. `members` donne les éléments eux-mêmes.
 */
export const linesOf = (nodes: readonly unknown[]) => {
  const top = commonAncestor(nodes)
  const groups: { line: Host; members: Host[] }[] = []
  for (const node of nodes as Host[]) {
    const line = lineage(node).find((candidate) => candidate.parent === top) ?? node
    const group = groups.find((one) => one.line === line)
    if (group) group.members.push(node)
    else groups.push({ line, members: [node] })
  }
  return { sizes: groups.map((group) => group.members.length), groups }
}

/** Les régions `complementary` de la page (un panneau à droite), trouvées dans l'arbre. */
export const panels = () => inOrder().filter((node) => node.props.role === 'complementary')

/** Le seul panneau de la page, pour y chercher avec `within`. */
export const panel = () => {
  const found = panels()
  expect(found).toHaveLength(1)
  return found[0] as unknown as ReturnType<typeof screen.getByRole>
}

/** Vrai si l'élément est dans une zone « Chargement » (un `progressbar`), lue d'un seul nom. */
export const insideProgressbar = (element: unknown) => {
  for (let node = (element as Host).parent; node; node = node.parent)
    if (node.props.role === 'progressbar' || node.props.accessibilityRole === 'progressbar')
      return true
  return false
}

/** Vrai si l'élément est dans ce nœud (le panneau, une section). */
export const inside = (element: unknown, container: unknown) =>
  lineage(element as Host).includes(container as Host)

/** Les pièces vides marquées de ce nom par le faux module de leur composant (lues même cachées). */
export const piecesNamed = (testID: string) =>
  screen.queryAllByTestId(testID, { includeHiddenElements: true })

/** Une expression qui trouve un nom qui commence par ce texte (« Carnet de cafés, Testable »). */
export const startingWith = (text: string) =>
  new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
