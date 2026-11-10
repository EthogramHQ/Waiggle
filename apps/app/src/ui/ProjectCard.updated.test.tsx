// Tests de la carte du fil remontée par une mise à jour (R7a, planche R7-MAJ-Fil, relecture du plan,
// interface B1, B4 et A7). Dans Abonnements, un projet qui vient d'être mis à jour remonte avec :
// - la pastille « Mis à jour · v1.2 » à la place de la date de l'auteur ;
// - la première ligne de la mise à jour (sa pastille de famille, puis son texte) à la place de
//   l'accroche, et « et 2 autres changements » dessous, jamais coupé (hors du texte coupé à deux
//   lignes, sinon le nombre tombe dans « … ») ;
// - la date de la mise à jour en bas à droite ;
// - la famille dans la description du lien (« Nouveau : Un compte à rebours… ») : la pastille est un
//   décor, sans elle la famille n'existerait que par l'icône et la couleur (WCAG 1.1.1, 1.3.1).
// Dans Découvrir, seul le repère « Mis à jour » se pose ; l'accroche reste.
//
// L'API fixée au lancement (une union au lieu d'un booléen `badgeOnly`) :
// `updated?: { kind: 'full'; label; line: { family; text }; more: string | null; at: string }
//          | { kind: 'badge'; label }`.
// Les textes viennent tout prêts de `SummaryCard` : la carte ne connaît pas l'API.
import { act, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import { ProjectCard } from './ProjectCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn() }),
}))

/** Les blancs de la typographie française (insécables, fines) ramenés à des espaces. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

const card = {
  title: 'Décollage !',
  pitch: 'Un quiz sur l’espace pour les petits-enfants.',
  author: { name: 'Papi Jean', avatar: null, onPress: () => {} },
  when: 'il y a 3 semaines',
  status: { label: 'Testable', strong: true },
}

const [firstLine] = rocketUpdate.lines
if (!firstLine) throw new Error('the rocket update has a first line')

const LABEL = fr.t(($) => $.feed.updated, { version: 'v1.2' })
const MORE_TWO = fr.t(($) => $.feed.moreChanges, { count: 2 })
const MORE_ONE = fr.t(($) => $.feed.moreChanges, { count: 1 })
/** « Nouveau : Un compte à rebours avant chaque question », la ligne lue avec sa famille. */
const LINE_READ = plain(
  fr.t(($) => $.update.lineRead, {
    family: fr.t(($) => $.update.family.new),
    text: firstLine.text,
  }),
)

/** La mise à jour telle que la carte la reçoit dans Abonnements. */
const full = (more: string | null = MORE_TWO) => ({
  kind: 'full' as const,
  label: LABEL,
  line: firstLine,
  more,
  at: rocketUpdate.createdAt,
})

type TreeNode = {
  props: Record<string, unknown>
  parent: TreeNode | null
  children: (TreeNode | string)[]
}

/** Le texte d'un élément et de ses enfants, mis bout à bout. */
const textOf = (node: TreeNode | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')

/** Tous les éléments de l'arbre rendu, dans l'ordre de lecture (parcours en profondeur). */
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

/** Les ancêtres d'un élément, du plus proche au plus lointain, lui compris. */
const lineage = (node: TreeNode): TreeNode[] => {
  const chain: TreeNode[] = []
  for (let current: TreeNode | null = node; current; current = current.parent) chain.push(current)
  return chain
}

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

const projectLink = () => screen.getByRole('link', { name: card.title })

describe('ProjectCard raised by an update (R7a)', () => {
  beforeEach(() => {
    // Trois heures après la mise à jour : sa date se lit « il y a 3 h ».
    jest.useFakeTimers({ now: new Date('2026-10-19T12:00:00.000Z') })
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('shows « Mis à jour · v1.2 » in place of the date of the author', async () => {
    await renderWithProviders(<ProjectCard {...card} updated={full()} onPress={() => {}} />)

    expect(screen.getByText(LABEL, { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText(card.when, { includeHiddenElements: true })).toBeNull()
  })

  it('shows the first change in place of the pitch', async () => {
    await renderWithProviders(<ProjectCard {...card} updated={full()} onPress={() => {}} />)

    expect(
      screen.getAllByText(containing(firstLine.text), { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(card.pitch, { includeHiddenElements: true })).toBeNull()
  })

  it('describes the card link with the family and the first change', async () => {
    // Sur téléphone : l'indice du lien, lu après son nom.
    const { rerender } = await renderWithProviders(
      <ProjectCard {...card} updated={full()} onPress={() => {}} />,
    )
    expect(plain(String(projectLink().props.accessibilityHint ?? ''))).toContain(LINE_READ)

    // Sur le web : `aria-describedby` désigne un texte qui dit la famille et le changement.
    jest.replaceProperty(Platform, 'OS', 'web')
    await rerender(<ProjectCard {...card} updated={full()} onPress={() => {}} />)
    const ids = String(projectLink().props['aria-describedby'] ?? '').split(/\s+/)
    const described = allNodes()
      .filter(
        (node) => typeof node.props.nativeID === 'string' && ids.includes(node.props.nativeID),
      )
      .map((node) => plain(textOf(node)))
    expect(described.join(' ')).toContain(LINE_READ)
    // Le nom du lien reste le titre seul.
    expect(screen.getByRole('link', { name: card.title })).toBeTruthy()
  })

  it('never truncates « et 2 autres changements »', async () => {
    await renderWithProviders(<ProjectCard {...card} updated={full()} onPress={() => {}} />)

    const more = screen.getByText(MORE_TWO, { includeHiddenElements: true }) as unknown as TreeNode
    // Ni lui ni le texte qui le contiendrait ne sont coupés à un nombre de lignes.
    const cut = lineage(more).filter((node) => Number(node.props.numberOfLines ?? 0) > 0)
    expect(cut).toEqual([])
  })

  it('says « et 1 autre changement » for one more line', async () => {
    await renderWithProviders(<ProjectCard {...card} updated={full(MORE_ONE)} onPress={() => {}} />)

    expect(MORE_ONE).toBe('et 1 autre changement')
    expect(screen.getByText(MORE_ONE, { includeHiddenElements: true })).toBeTruthy()
  })

  it('says nothing more when the update has a single line', async () => {
    await renderWithProviders(<ProjectCard {...card} updated={full(null)} onPress={() => {}} />)

    // Témoin : la ligne est là.
    expect(
      screen.getAllByText(containing(firstLine.text), { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(/autres? changements?/, { includeHiddenElements: true })).toBeNull()
  })

  it('shows the date of the update at the bottom, outside the card link', async () => {
    await renderWithProviders(
      <ProjectCard {...card} updated={full()} reactionTotal={12} onPress={() => {}} />,
    )

    const dates = screen.getAllByText(/il y a 3 h/, { includeHiddenElements: true })
    expect(dates.length).toBeGreaterThan(0)
    const nodes = allNodes()
    const link = projectLink() as unknown as TreeNode
    for (const date of dates as unknown as TreeNode[]) {
      // Hors du lien de la carte (un texte, pas une partie du lien)…
      expect(
        lineage(date).some((node) => ['link', 'button'].includes(String(roleOf(node.props)))),
      ).toBe(false)
      // … et lue après lui, en bas du verre.
      expect(nodes.indexOf(date)).toBeGreaterThan(nodes.indexOf(link))
    }
  })

  it('keeps the pitch and shows only the mark with a badge, as in Discover', async () => {
    await renderWithProviders(
      <ProjectCard
        {...card}
        updated={{ kind: 'badge', label: fr.t(($) => $.feed.updatedPlain) }}
        onPress={() => {}}
      />,
    )

    expect(
      screen.getByText(
        fr.t(($) => $.feed.updatedPlain),
        { includeHiddenElements: true },
      ),
    ).toBeTruthy()
    expect(screen.getByText(card.pitch, { includeHiddenElements: true })).toBeTruthy()
    expect(
      screen.queryByText(containing(firstLine.text), { includeHiddenElements: true }),
    ).toBeNull()
  })

  // Décision du 10/11/2026 : Découvrir est rangé par date de publication, elle reste à côté du repère.
  it('keeps the publication date beside the mark with a badge, as in Discover', async () => {
    await renderWithProviders(
      <ProjectCard
        {...card}
        updated={{ kind: 'badge', label: fr.t(($) => $.feed.updatedPlain) }}
        onPress={() => {}}
      />,
    )

    expect(screen.getByText(card.when, { includeHiddenElements: true })).toBeTruthy()
  })

  it('stays the same card without an update (témoin)', async () => {
    await renderWithProviders(<ProjectCard {...card} onPress={() => {}} />)

    await act(() => jest.advanceTimersByTime(0))
    expect(screen.getByText(card.pitch, { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText(card.when, { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText(/Mis à jour/, { includeHiddenElements: true })).toBeNull()
  })
})
