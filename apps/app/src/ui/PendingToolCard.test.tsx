// Tests de la carte d'un « Autre » à vérifier (tranche R6b, page « Outils » de la Modération,
// onglet « À vérifier ») : le nom tapé par les membres, « Cité par 3 projets », jusqu'à cinq de ces
// projets (titre et auteur, chacun s'ouvre), et trois décisions : « Ajouter au catalogue »,
// « Rattacher à un outil », « Laisser hors du catalogue ». Une carte décidée garde sa place et
// montre son résultat à la place de ses boutons (règle de la tranche 7a, relecture du plan ui-A).
//
// L'interface attendue de `src/ui/PendingToolCard.tsx` (fixée au lancement de R6b) :
// PendingToolCard({ tool: PendingTool; outcome: { kind: 'admitted' } | { kind: 'merged'; target:
// string } | { kind: 'dismissed' } | null; onAdmit(): void; onMerge(): void; onDismiss(): void;
// onOpenProject(id: ProjectId): void }). La carte écrit ses textes elle-même
// (`moderation.catalogue.*`).
import { PENDING_TOOL_PROJECTS_SHOWN, type PendingTool } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { makeComPending, sunoPending, teachablePending } from '../testing/catalogue'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { PendingToolCard } from './PendingToolCard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Outcome = Parameters<typeof PendingToolCard>[0]['outcome']

const ADMIT = fr.t(($) => $.moderation.catalogue.admit)
const MERGE = fr.t(($) => $.moderation.catalogue.merge)
const DISMISS = fr.t(($) => $.moderation.catalogue.dismiss)
const DECISIONS = [ADMIT, MERGE, DISMISS]

/** « Le tri des factures, par Hugo Lefèvre » : un projet de la carte, tel qu'il se lit. */
const projectLine = ({ title, author }: PendingTool['projects'][number]) =>
  fr.t(($) => $.moderation.catalogue.projectBy, { title, author: author.name })

/** Un élément qu'on touche, lien ou bouton : la carte choisit le rôle qui convient. */
const pressable = (name: string) =>
  screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name })

const actions = () => ({
  onAdmit: jest.fn(),
  onMerge: jest.fn(),
  onDismiss: jest.fn(),
  onOpenProject: jest.fn(),
})

const show = (tool: PendingTool, outcome: Outcome = null, handlers = actions()) =>
  renderWithProviders(<PendingToolCard tool={tool} outcome={outcome} {...handlers} />).then(
    () => handlers,
  )

describe('PendingToolCard', () => {
  it('shows the typed name, how many projects cite it, and each project with its author', async () => {
    await show(makeComPending)

    expect(screen.getByText('Make.com')).toBeTruthy()
    expect(
      screen.getByText(fr.t(($) => $.moderation.catalogue.pendingProjects, { count: 3 })),
    ).toBeTruthy()
    for (const project of makeComPending.projects) {
      expect(pressable(projectLine(project))).toBeTruthy()
    }
    // « par » ne s'élide pas : « par Inès », jamais « d’Inès » ni « de Inès ».
    expect(pressable('Mes rappels de plantes, par Inès Moreau')).toBeTruthy()
  })

  it('says « Cité par 1 projet » in the singular', async () => {
    await show(teachablePending)

    expect(screen.getByText('Cité par 1 projet')).toBeTruthy()
  })

  it('shows five projects at most, and counts all of them', async () => {
    // Le contrat borne la liste à 5 : la carte les montre tous, et le nombre dit qu'il y en a 7.
    expect(sunoPending.projects).toHaveLength(PENDING_TOOL_PROJECTS_SHOWN)
    await show(sunoPending)

    expect(screen.getByText('Cité par 7 projets')).toBeTruthy()
    for (const project of sunoPending.projects) {
      expect(pressable(projectLine(project))).toBeTruthy()
    }
  })

  it('opens a project with its id', async () => {
    const handlers = await show(makeComPending)
    const second = makeComPending.projects[1]
    if (!second) throw new Error('fixture without a second project')

    await fireEvent.press(pressable(projectLine(second)))

    expect(handlers.onOpenProject).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenProject).toHaveBeenCalledWith(second.id)
  })

  it('offers three decisions, each calling its own action once', async () => {
    const handlers = await show(makeComPending)

    await fireEvent.press(screen.getByRole('button', { name: ADMIT }))
    await fireEvent.press(screen.getByRole('button', { name: MERGE }))
    await fireEvent.press(screen.getByRole('button', { name: DISMISS }))

    expect(handlers.onAdmit).toHaveBeenCalledTimes(1)
    expect(handlers.onMerge).toHaveBeenCalledTimes(1)
    expect(handlers.onDismiss).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenProject).not.toHaveBeenCalled()
  })

  // Une carte par issue, un rendu par test (charte : trois rendus dans un test vident le dernier).
  it.each<[string, NonNullable<Outcome>, string]>([
    ['admitted', { kind: 'admitted' }, fr.t(($) => $.moderation.catalogue.admitted)],
    [
      'merged',
      { kind: 'merged', target: 'Make' },
      fr.t(($) => $.moderation.catalogue.merged, { target: 'Make' }),
    ],
    ['dismissed', { kind: 'dismissed' }, fr.t(($) => $.moderation.catalogue.dismissed)],
  ])('shows its result instead of its buttons once %s', async (_kind, outcome, result) => {
    await show(makeComPending, outcome)

    // Témoin : la carte est toujours là, à son nom, avec ses projets.
    expect(screen.getByText('Make.com')).toBeTruthy()
    expect(screen.getByText(result)).toBeTruthy()
    for (const decision of DECISIONS) {
      expect(screen.queryByRole('button', { name: decision })).toBeNull()
    }
  })

  it('shows its three buttons and no result while undecided (witness)', async () => {
    await show(makeComPending)

    for (const decision of DECISIONS) {
      expect(screen.getByRole('button', { name: decision })).toBeTruthy()
    }
    expect(screen.queryByText(fr.t(($) => $.moderation.catalogue.admitted))).toBeNull()
    expect(screen.queryByText(fr.t(($) => $.moderation.catalogue.dismissed))).toBeNull()
  })
})
