// Tests de la mise en page et de la recette partagées par la page d'un membre et celle d'un visiteur
// (tranche R12, plan, décision 12 ; `projects/ProjectPage.tsx`). La page d'un membre est couverte par
// les tests de `ProjectScreen` ; ici, ce qu'un visiteur en attend : des outils sans lien, et chaque
// emplacement à sa place, téléphone et ordinateur.
import { fireEvent, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { hasRecipe, ProjectPageLayout, ProjectPageSkeleton, ProjectRecipe } from './ProjectPage'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/fr/projects/x',
  useNavigation: () => ({ addListener: () => () => {}, isFocused: () => true }),
  useFocusEffect: () => {},
  useIsFocused: () => true,
}))

const tools = [
  { label: 'ChatGPT', slug: 'chatgpt', inCatalogue: true },
  { label: 'Lovable', slug: 'lovable', inCatalogue: true },
]

describe('ProjectRecipe', () => {
  it('shows the tools as plain chips, without a link, when nothing opens them (a visitor)', async () => {
    await renderWithProviders(<ProjectRecipe startedOn="2026-03" difficulty="easy" tools={tools} />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.project.page.recipe) })).toBeTruthy()
    expect(screen.getByText('ChatGPT')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /ChatGPT/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /ChatGPT/ })).toBeNull()
    expect(screen.getByText(/mars 2026/)).toBeTruthy()
  })

  it('opens the page of a tool for a member', async () => {
    const onOpenTool = jest.fn()
    await renderWithProviders(
      <ProjectRecipe startedOn={null} difficulty={null} tools={tools} onOpenTool={onOpenTool} />,
    )

    const chip =
      screen.queryByRole('link', { name: /Lovable/ }) ??
      screen.getByRole('button', { name: /Lovable/ })
    await fireEvent.press(chip)
    expect(onOpenTool).toHaveBeenCalledWith('lovable')
  })

  it('has nothing to show without a month, a difficulty or a tool', () => {
    expect(hasRecipe({ startedOn: null, difficulty: null, tools: [] })).toBe(false)
    // Un mois mal écrit ne compte pas : la recette n'aurait que son titre.
    expect(hasRecipe({ startedOn: 'mars', difficulty: null, tools: [] })).toBe(false)
    expect(hasRecipe({ startedOn: '2026-03', difficulty: null, tools: [] })).toBe(true)
    expect(hasRecipe({ startedOn: null, difficulty: 'easy', tools: [] })).toBe(true)
    expect(hasRecipe({ startedOn: null, difficulty: null, tools })).toBe(true)
  })
})

/** Un emplacement repérable : son nom, écrit tel quel. */
const slot = (name: string) => <Text>{name}</Text>

/** Les textes de la page, dans l'ordre où ils viennent (l'ordre de lecture). */
const shownOrder = () =>
  screen
    .getAllByText(/^slot:/)
    .map((node) => String(node.props.children))
    .filter((text, index, all) => all.indexOf(text) === index)

const renderLayout = () =>
  renderWithProviders(
    <ProjectPageLayout
      topBar={null}
      onBack={() => {}}
      pageTitle="Décollage !"
      thumbhash={null}
      fade={false}
      bleed
      gallery={slot('slot:gallery')}
      header={slot('slot:header')}
      actions={slot('slot:actions')}
      actionNotes={slot('slot:reactionSummary')}
      recipe={slot('slot:recipe')}
      description={slot('slot:description')}
      journal={slot('slot:journal')}
      conversation={slot('slot:membersOnly')}
      report={slot('slot:report')}
    />,
  )

describe('ProjectPageLayout', () => {
  it('reads every part on a phone in the order of the page', async () => {
    await renderLayout()

    expect(shownOrder()).toEqual([
      'slot:gallery',
      'slot:header',
      'slot:actions',
      'slot:reactionSummary',
      'slot:recipe',
      'slot:description',
      'slot:journal',
      'slot:membersOnly',
      'slot:report',
    ])
  })

  it('reads the actions and what follows them before the description on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      await renderLayout()

      // La recette est dans la seconde rangée, à droite, au-dessus de la conversation (planche
      // R12-Visiteur-Projet-Desktop ; relecture de design R12, point 4) : lue après ce qui se lit
      // longtemps, à gauche, et avant la conversation.
      expect(shownOrder()).toEqual([
        'slot:gallery',
        'slot:header',
        'slot:actions',
        'slot:reactionSummary',
        'slot:description',
        'slot:journal',
        'slot:recipe',
        'slot:membersOnly',
        'slot:report',
      ])
      expect(screen.getByRole('button', { name: fr.t(($) => $.project.page.back) })).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('keeps the recipe next to the photo on a computer when reactions fill the space under it', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(
        <ProjectPageLayout
          topBar={null}
          onBack={() => {}}
          pageTitle="Décollage !"
          thumbhash={null}
          fade={false}
          bleed
          gallery={slot('slot:gallery')}
          reactions={slot('slot:reactions')}
          header={slot('slot:header')}
          actions={slot('slot:actions')}
          recipe={slot('slot:recipe')}
          description={slot('slot:description')}
          conversation={slot('slot:comments')}
        />,
      )

      // La page d'un membre : ses réactions, sous la photo, comblent la colonne de gauche ; la
      // recette reste dans la première rangée, lue avant la description.
      expect(shownOrder()).toEqual([
        'slot:gallery',
        'slot:reactions',
        'slot:header',
        'slot:actions',
        'slot:recipe',
        'slot:description',
        'slot:comments',
      ])
    } finally {
      restore()
    }
  })
})

// R16 (scénario : depuis une carte, « le squelette ne couvre que la description, la recette et les
// commentaires ») : le bas vide de la page d'un projet, assemblé de pièces, sans rôle ni nom à lui.
describe('ProjectPageSkeleton (R16)', () => {
  it('draws its empty piece without any role or name of its own', async () => {
    await renderWithProviders(
      <PieceHost>
        <ProjectPageSkeleton />
      </PieceHost>,
    )

    const { drawn, spoken } = emptyPiece()
    // Des formes, d'abord : une pièce qui ne dessine rien ne garde aucune place.
    expect(drawn).toBeGreaterThan(0)
    expect(spoken).toEqual([])
  })
})
