// Tests de la catégorie « en attente » d'une carte de projet (R16, « Les squelettes », scénario :
// « La page ne bouge plus en arrivant »). Tant que la liste des catégories charge, l'écran passe
// `category="pending"` pour un projet qui en a une : la carte garde la place exacte de l'étiquette,
// au même endroit (au-dessus du titre sans photo, en haut de la photo sinon), sans texte, sans rôle
// ni nom, et sans rien dire dans la description de son lien. À l'arrivée, l'étiquette s'y pose et
// rien ne bouge ; sur une carte compacte, qui ne montre pas la catégorie, rien n'est gardé.
import { layout } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { categoryName } from '../testing/categories'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { FollowButton } from './FollowButton'
import { ProjectCard } from './ProjectCard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type TreeNode = {
  props: Record<string, unknown>
  parent: TreeNode | null
  children: (TreeNode | string)[]
}

const HIDDEN_TOO = { includeHiddenElements: true }
const PENDING = 'category-pending'

const card = {
  title: 'Carnet de cafés',
  pitch: 'Note chaque café goûté, et retrouve ceux qui t’ont plu.',
  author: { name: 'Nora Benali', avatar: null },
  when: 'il y a 2 jours',
  status: { label: 'En test', strong: true },
}
const science = { label: categoryName('science'), icon: 'planet' as const }
const photo = {
  source: { uri: 'https://api.example/cafes.webp' },
  label: 'Une tasse de café sur un carnet',
}
const follow = fr.t(($) => $.follow.member, { name: 'Nora' })

const styleOf = (node: TreeNode) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>

/** Les ancêtres d'un élément, du plus proche au plus lointain, lui compris. */
const lineage = (node: TreeNode): TreeNode[] => {
  const chain: TreeNode[] = []
  for (let current: TreeNode | null = node; current; current = current.parent) chain.push(current)
  return chain
}

/** L'élément et tous ceux qu'il contient. */
const under = (node: TreeNode): TreeNode[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : under(child))),
]

/** La plus grande hauteur minimale posée sous un élément : la hauteur que garde une pièce. */
const keptHeight = (node: TreeNode): number =>
  Math.max(
    0,
    ...under(node).map((one) => {
      const style = styleOf(one)
      return Math.max(Number(style.minHeight ?? 0), Number(style.height ?? 0))
    }),
  )

const pending = () => screen.getByTestId(PENDING, HIDDEN_TOO) as unknown as TreeNode
const title = () => screen.getByText(card.title, HIDDEN_TOO) as unknown as TreeNode

/** La vue qui porte l'étiquette dessinée (celle que le doigt traverse, `pointerEvents="none"`). */
const realTag = () => {
  const label = screen.getByText(science.label, HIDDEN_TOO) as unknown as TreeNode
  const holder = lineage(label).find((node) => node.props.pointerEvents === 'none')
  if (!holder) throw new Error('étiquette sans porteur')
  return holder
}

describe('ProjectCard, a category still loading (R16)', () => {
  it('keeps the exact height of the category tag above the title, without a photo', async () => {
    const view = await renderWithProviders(
      <ProjectCard {...card} category={science} onPress={() => {}} />,
    )
    const tagHeight = keptHeight(realTag())
    // Témoin : l'étiquette dessinée tient une zone à toucher.
    expect(tagHeight).toBe(layout.touchTarget)
    await view.unmount()

    await renderWithProviders(<ProjectCard {...card} category="pending" onPress={() => {}} />)
    expect(keptHeight(pending())).toBe(tagHeight)
    // Au même endroit que l'étiquette : dans le bloc du titre, avant lui.
    const block = pending().parent
    expect(block && under(block)).toContain(title())
  })

  it('says nothing: no text, no role, no name, nothing in the description of the link', async () => {
    await renderWithProviders(<ProjectCard {...card} category="pending" onPress={() => {}} />)

    const kept = pending()
    expect(kept.children).toHaveLength(0)
    expect(lineage(kept).some((node) => node.props['aria-hidden'] === true)).toBe(true)
    for (const node of under(kept)) {
      expect(node.props.accessibilityRole ?? node.props.role).toBeUndefined()
      expect(node.props.accessibilityLabel ?? node.props['aria-label']).toBeUndefined()
    }
    const link = screen.getByRole('link', { name: card.title })
    expect(link.props.accessibilityHint).toBeUndefined()
    const categorySaid = fr.t(($) => $.card.category, { category: '' }).trim()
    expect(screen.queryByText(new RegExp(categorySaid), HIDDEN_TOO)).toBeNull()
  })

  it('keeps the place in the column at the top of the photo, the follow chip below it', async () => {
    await renderWithProviders(
      <ProjectCard
        {...card}
        image={photo}
        category="pending"
        onPress={() => {}}
        overlay={
          <FollowButton
            variant="chip"
            followed={false}
            label={follow}
            text={follow}
            onPress={() => {}}
          />
        }
      />,
    )

    const kept = pending()
    expect(keptHeight(kept)).toBe(layout.touchTarget)
    // Hors du bloc du titre : sur la photo, dans la même colonne que « Suivre », avant lui.
    const column = kept.parent
    expect(column && under(column)).not.toContain(title())
    const chip = screen.getByRole('switch', { name: follow }) as unknown as TreeNode
    expect(lineage(chip)).toContain(column)
  })

  it('lets the tag take the kept place once the category arrives', async () => {
    const { rerender } = await renderWithProviders(
      <ProjectCard {...card} category="pending" onPress={() => {}} />,
    )
    expect(pending()).toBeTruthy()

    await rerender(<ProjectCard {...card} category={science} onPress={() => {}} />)
    expect(screen.queryByTestId(PENDING, HIDDEN_TOO)).toBeNull()
    expect(screen.getByText(science.label, HIDDEN_TOO)).toBeTruthy()
  })

  it('keeps nothing without a category, nor on a compact card', async () => {
    const view = await renderWithProviders(<ProjectCard {...card} onPress={() => {}} />)
    expect(screen.queryByTestId(PENDING, HIDDEN_TOO)).toBeNull()
    await view.unmount()

    await renderWithProviders(
      <ProjectCard {...card} size="compact" category="pending" onPress={() => {}} />,
    )
    // Témoin : la compacte est là.
    expect(screen.getByText(card.title)).toBeTruthy()
    expect(screen.queryByTestId(PENDING, HIDDEN_TOO)).toBeNull()
  })
})
