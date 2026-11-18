// Tests de la carte d'un outil (R16, planches R16-Outils) : un seul lien, nommé comme la ligne
// d'aujourd'hui (« Claude, Assistant IA · 41 projets »), qui mène à la page de l'outil (son adresse,
// et le geste donné par l'écran) ; elle montre le nom et « Assistant IA · 41 projets ». Et la carte
// vide, sans rôle ni nom ; la grille de « Les plus utilisés », cinq par rangée.
import type { CatalogueTool } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { atWindow, linesOf } from '../testing/wideLayout'
import { Screen } from './Screen'
import { ToolCard, ToolCardGrid, ToolCardSkeleton } from './ToolCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const claude: CatalogueTool = {
  slug: 'claude',
  name: 'Claude',
  family: 'assistant',
  aliases: [],
  projectCount: 41,
}

const detailOf = (tool: CatalogueTool) =>
  fr.t(($) => $.tools.detail, {
    family: fr.t(($) => $.tools.family[tool.family]),
    projects:
      tool.projectCount === 0
        ? fr.t(($) => $.tools.noProjects)
        : fr.t(($) => $.tools.projects, { count: tool.projectCount }),
  })
const nameOf = (tool: CatalogueTool) =>
  fr.t(($) => $.tools.withCount, { label: tool.name, projects: detailOf(tool) })

describe('ToolCard', () => {
  it('is one link, named like the row of the tool', async () => {
    await renderWithProviders(<ToolCard tool={claude} href="/tags/claude" onPress={() => {}} />)

    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Claude, Assistant IA · 41 projets' })).toBeTruthy()
    expect(nameOf(claude)).toBe('Claude, Assistant IA · 41 projets')
  })

  it('shows the name, the family and the number of projects', async () => {
    await renderWithProviders(<ToolCard tool={claude} href="/tags/claude" onPress={() => {}} />)

    expect(screen.getByText('Claude')).toBeTruthy()
    expect(screen.getByText(detailOf(claude))).toBeTruthy()
  })

  it('says « Aucun projet pour l’instant » for a tool without project', async () => {
    const unused = { ...claude, slug: 'bolt', name: 'Bolt', family: 'no-code', projectCount: 0 }
    await renderWithProviders(
      <ToolCard tool={unused as CatalogueTool} href="/tags/bolt" onPress={() => {}} />,
    )

    expect(screen.getByRole('link', { name: nameOf(unused as CatalogueTool) })).toBeTruthy()
    expect(nameOf(unused as CatalogueTool)).toContain(fr.t(($) => $.tools.noProjects))
  })

  it('leads to the page of the tool: its address, and the gesture of the screen', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<ToolCard tool={claude} href="/tags/claude" onPress={onPress} />)

    const link = screen.getByRole('link', { name: nameOf(claude) })
    expect(link.props.href).toBe('/tags/claude')
    await fireEvent.press(link)
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('ToolCardSkeleton', () => {
  it('draws an empty card, with no role and no name', async () => {
    await renderWithProviders(
      <PieceHost>
        <ToolCardSkeleton />
      </PieceHost>,
    )

    expect(emptyPiece().drawn).toBeGreaterThan(0)
    expect(emptyPiece().spoken).toEqual([])
  })
})

describe('ToolCardGrid', () => {
  const ten = Array.from({ length: 10 }, (_, i) => ({
    ...claude,
    slug: `tool-${i}`,
    name: `Outil ${i}`,
  }))

  it.each([
    [1920, 1080],
    [1440, 900],
  ])('puts five cards per row in a wide page at %i', (width, height) =>
    atWindow(width, height, async () => {
      await renderWithProviders(
        <Screen title="Outils" width="wide">
          <ToolCardGrid>
            {ten.map((tool) => (
              <ToolCard
                key={tool.slug}
                tool={tool}
                href={`/tags/${tool.slug}`}
                onPress={() => {}}
              />
            ))}
          </ToolCardGrid>
        </Screen>,
      )

      expect(linesOf(screen.getAllByRole('link')).sizes).toEqual([5, 5])
    }),
  )
})
