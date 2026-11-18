// Tests de la carte de projet vide (R16, « Les squelettes ») posée là où vit la vraie carte : dans
// une grille de cartes (`ProjectGrid`), sa lueur passe 150 ms plus tard d'une colonne à la suivante
// (planche R16-Lueur), sans que l'écran ait à compter les colonnes ; dans une grille de compactes
// sur ordinateur (« Récents » d'Explorer), elle prend la hauteur de la compacte, comme la carte
// qu'elle remplace. Les tests de base (sans rôle ni nom, hauteur pleine ou compacte) sont dans
// ProjectCard.test.tsx.
import { durations } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import { Dimensions, Platform, StyleSheet } from 'react-native'
import { drawnSizes, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import {
  PROJECT_CARD_COMPACT_HEIGHT,
  PROJECT_CARD_HEIGHT,
  ProjectCardSkeleton,
} from './ProjectCard'
import { GridCardsContext, ProjectGrid } from './ProjectGrid'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: ReadonlyArray<Node | string> }

/** Le retard de chaque lueur dessinée, dans l'ordre de l'arbre, en millisecondes (web). */
const glowDelays = () => {
  const delays: number[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
    if (style.animationKeyframes !== undefined)
      delays.push(Number.parseFloat(`${style.animationDelay ?? 0}`))
    for (const child of node.children) visit(child)
  }
  visit(screen.getByTestId('empty-piece-host', { includeHiddenElements: true }) as unknown as Node)
  return delays
}

const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }

afterEach(async () => {
  await act(async () => Dimensions.set({ window: phone, screen: phone }))
})

describe('ProjectCardSkeleton in a grid (R16)', () => {
  it('lets its glow pass 150 ms later on each next column of the grid', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(
      <PieceHost>
        <ProjectGrid columns={2}>
          <ProjectCardSkeleton key="a" />
          <ProjectCardSkeleton key="b" />
          <ProjectCardSkeleton key="c" />
          <ProjectCardSkeleton key="d" />
        </ProjectGrid>
      </PieceHost>,
    )

    // Deux rangées de deux : la seconde colonne passe toujours 150 ms après la première.
    const stagger = durations.skeletonStagger
    expect(glowDelays()).toEqual([0, stagger, 0, stagger])
  })

  it('keeps the column it is given, even in a grid', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(
      <PieceHost>
        <ProjectGrid columns={2}>
          <ProjectCardSkeleton key="a" column={3} />
        </ProjectGrid>
      </PieceHost>,
    )

    expect(glowDelays()).toEqual([3 * durations.skeletonStagger])
  })

  it('takes the height of a compact card in a grid of compact cards on a computer', async () => {
    const size = { width: 1920, height: 940, scale: 2, fontScale: 1 }
    Dimensions.set({ window: size, screen: size })
    await renderWithProviders(
      <PieceHost>
        <GridCardsContext.Provider value="compact">
          <ProjectCardSkeleton />
        </GridCardsContext.Provider>
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(PROJECT_CARD_COMPACT_HEIGHT)
    expect(drawnSizes().heights).not.toContain(PROJECT_CARD_HEIGHT)
  })

  it('stays a full card in a grid of compact cards on a phone, like the real card', async () => {
    // Témoin du test précédent : sur téléphone, « Récents » garde ses grandes cartes.
    await renderWithProviders(
      <PieceHost>
        <GridCardsContext.Provider value="compact">
          <ProjectCardSkeleton />
        </GridCardsContext.Provider>
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(PROJECT_CARD_HEIGHT)
  })
})
