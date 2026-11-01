// Tests du nombre de colonnes de ProjectGrid (R4) : la grille suit la largeur (une colonne sur
// téléphone, trois sur ordinateur), sauf quand l'écran l'impose (`columns`, le Fil : deux colonnes
// sur ordinateur, à côté de sa colonne latérale). Jest ne place rien : on compte les cases de la
// rangée qui porte la première carte.
import { screen } from '@testing-library/react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { ProjectGrid } from './ProjectGrid'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; parent: Node | null; children: (Node | string)[] }

/** Le nombre de cases de la rangée de la grille qui porte cette carte. */
const cellsInRowOf = (text: string) => {
  // La carte → sa case → sa rangée : la rangée est la première vue en `flexDirection: 'row'`.
  let node = (screen.getByText(text) as unknown as Node).parent
  while (
    node &&
    (node.props.style as { flexDirection?: string } | undefined)?.flexDirection !== 'row'
  )
    node = node.parent
  if (!node) throw new Error('No grid row')
  return node.children.length
}

const cards = ['Un', 'Deux', 'Trois', 'Quatre'].map((title) => <Text key={title}>{title}</Text>)

describe('ProjectGrid columns', () => {
  it('follows the width when the screen imposes nothing', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(<ProjectGrid empty="Rien">{cards}</ProjectGrid>)
      // Témoin : trois colonnes sur ordinateur.
      expect(cellsInRowOf('Un')).toBe(3)
    } finally {
      restore()
    }
  })

  it('draws the number of columns the screen imposes on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(
        <ProjectGrid empty="Rien" columns={2}>
          {cards}
        </ProjectGrid>,
      )
      expect(cellsInRowOf('Un')).toBe(2)
      expect(cellsInRowOf('Trois')).toBe(2)
    } finally {
      restore()
    }
  })

  it('draws one column when the screen asks for one', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(
        <ProjectGrid empty="Rien" columns={1}>
          {cards}
        </ProjectGrid>,
      )
      expect(cellsInRowOf('Un')).toBe(1)
      expect(screen.getByText('Quatre')).toBeTruthy()
    } finally {
      restore()
    }
  })
})
