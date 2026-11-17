// La couverture sans photo (la lumière miel) est un dégradé SVG nommé, que son rectangle cite par
// `url(#nom)`. Deux couvertures dans la même page (la carte du fil, cachée sous la page du projet
// ouverte depuis elle) doivent avoir des noms différents : avec un nom commun, le navigateur prenait
// le dégradé de la page cachée, et la couverture du projet ne se dessinait pas (relecture R4, A4).

import { layout } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { drawnSizes, emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { ProjectCover, ProjectCoverSkeleton } from './ProjectCover'

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null }

/** Tous les nœuds natifs rendus, dans l'ordre de l'arbre. */
const nodes = (): Node[] => {
  const found: Node[] = []
  const walk = (node: Node | string | null) => {
    if (!node || typeof node === 'string') return
    found.push(node)
    for (const child of node.children ?? []) walk(child)
  }
  const tree = screen.toJSON() as Node | Node[] | null
  for (const node of Array.isArray(tree) ? tree : [tree]) walk(node)
  return found
}

describe('ProjectCover', () => {
  it('names the honey gradient of each cover differently, each fill citing its own', async () => {
    await renderWithProviders(
      <>
        <ProjectCover height={200} image={null} />
        <ProjectCover height={200} image={null} />
      </>,
    )

    // Sur téléphone, react-native-svg rend le dégradé nommé (`name`) et le rectangle qui le cite
    // (`fill.brushRef`).
    const all = nodes()
    const gradients = all
      .filter((node) => node.type === 'RNSVGRadialGradient')
      .map((node) => node.props.name)
    const fills = all
      .filter((node) => node.type === 'RNSVGRect')
      .map((node) => (node.props.fill as { brushRef?: string } | undefined)?.brushRef)
    // Témoin : deux couvertures miel, deux dégradés.
    expect(gradients).toHaveLength(2)
    expect(new Set(gradients).size).toBe(2)
    // Chaque rectangle cite le dégradé de sa couverture.
    expect(fills).toEqual(gradients)
  })
})

// R16 (scénario, « Le squelette a la forme de sa page ») : la galerie vide d'un projet, à la hauteur
// de la galerie qui arrive (520 points en grand, la planche R16-Projet-1440).
describe('ProjectCoverSkeleton (R16)', () => {
  it('draws its empty piece without any role or name of its own', async () => {
    await renderWithProviders(
      <PieceHost>
        <ProjectCoverSkeleton shape="hero" />
      </PieceHost>,
    )

    const { drawn, spoken } = emptyPiece()
    // Des formes, d'abord : une pièce qui ne dessine rien ne garde aucune place.
    expect(drawn).toBeGreaterThan(0)
    expect(spoken).toEqual([])
  })

  it('takes the height of the gallery it stands for', async () => {
    await renderWithProviders(
      <PieceHost>
        <ProjectCoverSkeleton shape="hero" />
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(layout.cover.hero)
  })
})
