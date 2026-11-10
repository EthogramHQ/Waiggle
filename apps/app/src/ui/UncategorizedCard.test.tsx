// Tests de la carte d'un projet à ranger (tranche R6b, page « Catégories » de la Modération, onglet
// « À ranger ») : le titre du projet (qui s'ouvre), son auteur, son accroche, et le bouton
// « Ranger dans une catégorie ». Une fois rangé, la carte garde sa place et dit dans quelle
// catégorie, à la place du bouton (règle de la tranche 7a, relecture du plan ui-A).
//
// L'interface attendue de `src/ui/UncategorizedCard.tsx` (fixée au lancement de R6b) : UncategorizedCard({ project: UncategorizedProject; filedInto: string | null; onFile():
// void; onOpenProject(): void }). `filedInto` : le nom de la catégorie où le projet vient d'être
// rangé (« Animaux »), ou null tant qu'il ne l'est pas.
import { fireEvent, screen } from '@testing-library/react-native'
import { birdhouseProject } from '../testing/catalogue'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { UncategorizedCard } from './UncategorizedCard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const FILE = fr.t(($) => $.moderation.categories.sort)

/** Le titre du projet, qu'on touche pour l'ouvrir : lien ou bouton, au choix de la carte. */
const titleLink = () => {
  const name = containing(birdhouseProject.title)
  return screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name })
}

const show = (filedInto: string | null = null) => {
  const handlers = { onFile: jest.fn(), onOpenProject: jest.fn() }
  return renderWithProviders(
    <UncategorizedCard project={birdhouseProject} filedInto={filedInto} {...handlers} />,
  ).then(() => handlers)
}

describe('UncategorizedCard', () => {
  it('shows the title, the author and the pitch of the project', async () => {
    await show()

    expect(titleLink()).toBeTruthy()
    expect(screen.getByText(containing('Inès Moreau'))).toBeTruthy()
    expect(screen.getByText(containing(birdhouseProject.pitch))).toBeTruthy()
  })

  it('opens the project from its title', async () => {
    const handlers = await show()

    await fireEvent.press(titleLink())

    expect(handlers.onOpenProject).toHaveBeenCalledTimes(1)
    expect(handlers.onFile).not.toHaveBeenCalled()
  })

  it('offers « Ranger dans une catégorie » while the project is not filed', async () => {
    const handlers = await show()

    await fireEvent.press(screen.getByRole('button', { name: FILE }))

    expect(handlers.onFile).toHaveBeenCalledTimes(1)
  })

  it('says where the project was filed, instead of the button', async () => {
    await show('Animaux')

    // Témoin : la carte est toujours là, à son titre.
    expect(titleLink()).toBeTruthy()
    expect(
      screen.getByText(fr.t(($) => $.moderation.categories.sorted, { category: 'Animaux' })),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: FILE })).toBeNull()
  })
})
