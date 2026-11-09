// Le focus d'ouverture de la fenêtre « Supprimer « … » ? » (R6a, correction C8, H3) : supprimer ne se
// défait pas, la fenêtre s'ouvre donc sur « Annuler », pas sur « Supprimer » (son premier bouton,
// où Entrée supprimerait).
import { waitFor } from '@testing-library/react-native'
import { watchOpeningFocus } from '../testing/openingFocus'
import { renderWithProviders } from '../testing/render'
import { DeleteProjectDialog } from './DeleteProjectDialog'

jest.mock('./api', () => ({ deleteProject: jest.fn() }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/projects/p1',
}))

afterEach(() => {
  jest.restoreAllMocks()
})

describe('DeleteProjectDialog opening focus', () => {
  it('opens on « Annuler », not on « Supprimer »', async () => {
    const focused = watchOpeningFocus()
    await renderWithProviders(
      <DeleteProjectDialog
        project={{ id: 'p1', title: 'Le ciel de ce soir', cover: null }}
        visible
        onCancel={jest.fn()}
        onDeleted={jest.fn()}
      />,
    )

    await waitFor(() => expect(focused()).toBe('Annuler'))
  })
})
