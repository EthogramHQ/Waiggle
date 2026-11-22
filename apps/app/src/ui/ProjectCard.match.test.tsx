// Tests de la carte d'un résultat de recherche (R16, planches R16-Recherche-1440 et -1920) : en
// grand, la Recherche montre ses projets en cartes compactes, et chaque carte dit pourquoi elle est
// trouvée. `match` porte les mots cherchés, surlignés de miel dans le titre et l'extrait, et
// l'extrait de la description qui a correspondu, montré à la place de l'accroche, même sur une
// compacte avec photo (qui n'en montre aucune d'ordinaire). L'extrait décrit le lien de la carte
// (`aria-describedby` sur le web), dont le nom reste le titre seul, lu d'un tenant.
import { palettes } from '@ruche/brand'
import { keepPunctuation } from '@ruche/i18n'
import { screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ProjectCard } from './ProjectCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type TreeNode = { props: Record<string, unknown>; children: (TreeNode | string)[] }

const textOf = (node: TreeNode | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')
const allNodes = (): TreeNode[] => {
  const found: TreeNode[] = []
  const visit = (node: TreeNode | string) => {
    if (typeof node === 'string') return
    found.push(node)
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as TreeNode)
  return found
}
const backgroundOf = (node: TreeNode) =>
  ((StyleSheet.flatten(node.props.style as never) ?? {}) as { backgroundColor?: unknown })
    .backgroundColor
/** Les morceaux surlignés de miel, dans l'ordre de lecture. */
const marked = () =>
  allNodes()
    .filter((node) => backgroundOf(node) === palettes.day.highlight)
    .map((node) => textOf(node))

const EXCERPT = '« … Le carnet de balades de Biscotte… »'
const card = {
  title: 'Biscotte au parc',
  pitch: 'Les parcs où les chiens peuvent courir, près de chez moi.',
  author: { name: 'Tante Odile', avatar: null },
  when: 'il y a 5 jours',
  status: { label: 'En construction', strong: false },
  image: { source: { uri: 'https://api.example/biscotte.webp' }, label: 'Biscotte au parc' },
  size: 'compact' as const,
  onPress: () => {},
}

describe('ProjectCard, a search result (R16)', () => {
  it('shows the matching excerpt on a compact card with a photo, with the searched words marked', async () => {
    await renderWithProviders(
      <ProjectCard {...card} match={{ words: ['carn'], excerpt: EXCERPT }} />,
    )

    expect(screen.getByText(EXCERPT)).toBeTruthy()
    expect(marked()).toEqual(['carn'])
    // L'accroche n'y est pas : l'extrait en tient la place.
    expect(screen.queryByText(card.pitch)).toBeNull()
  })

  it('shows no pitch on a compact card with a photo, without a match (witness)', async () => {
    await renderWithProviders(<ProjectCard {...card} />)

    expect(screen.queryByText(card.pitch)).toBeNull()
    expect(marked()).toEqual([])
  })

  it('marks the searched words in the title, and keeps the link named by the whole title', async () => {
    await renderWithProviders(
      <ProjectCard {...card} title="Carnet de cafés" match={{ words: ['carn'], excerpt: null }} />,
    )

    expect(marked()).toEqual(['Carn'])
    expect(screen.getByRole('link', { name: 'Carnet de cafés' })).toBeTruthy()
  })

  it('describes the card link with the excerpt, on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(
      <ProjectCard {...card} match={{ words: ['carn'], excerpt: EXCERPT }} />,
    )

    const link = screen.getByRole('link', { name: card.title })
    const ids = String(link.props['aria-describedby'] ?? '').split(/\s+/)
    const described = allNodes()
      .filter(
        (node) => typeof node.props.nativeID === 'string' && ids.includes(node.props.nativeID),
      )
      .map((node) => textOf(node))
    // R18 : l'extrait affiché garde ses espaces insécables autour des guillemets (keepPunctuation).
    expect(described).toContain(keepPunctuation(EXCERPT))
  })
})
