// Suppression d'un projet déjà supprimé (R6a, correction C4, D3) : l'API répond 404 (`notFound`)
// quand le projet a disparu entre-temps (supprimé depuis un autre appareil, ou par un second envoi).
// Le membre voulait qu'il n'existe plus : c'est fait, la fenêtre suit donc la même suite qu'un
// succès (cache rangé, `onDeleted`), au lieu de rester ouverte sur une erreur sans issue.
import { fireEvent, screen } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { deleteProject } from './api'
import { DeleteProjectDialog } from './DeleteProjectDialog'

jest.mock('./api', () => ({ deleteProject: jest.fn() }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/projects/p1',
}))

const project = { id: 'p1', title: 'Le ciel de ce soir', cover: null }

const open = async () => {
  const onCancel = jest.fn()
  const onDeleted = jest.fn()
  const view = await renderWithProviders(
    <DeleteProjectDialog project={project} visible onCancel={onCancel} onDeleted={onDeleted} />,
  )
  await passTapGuard()
  return { onCancel, onDeleted, ...view }
}

beforeEach(() => {
  jest.mocked(deleteProject).mockReset()
})

describe('DeleteProjectDialog, a project already deleted', () => {
  it('takes a 404 as done: the same follow-up as a success, no error left in the window', async () => {
    jest.mocked(deleteProject).mockResolvedValue({ ok: false, error: 'notFound' })
    const { onDeleted, queryClient } = await open()
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries')

    await fireEvent.press(screen.getByRole('button', { name: 'Supprimer' }))

    expect(onDeleted).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['feed'] })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(fr.t(($) => $.project.form.deleteError))).toBeNull()
  })

  it('keeps a real failure in the window (witness: the 404 rule is not "any error")', async () => {
    jest.mocked(deleteProject).mockResolvedValue({ ok: false, error: 'unavailable' })
    const { onDeleted } = await open()

    await fireEvent.press(screen.getByRole('button', { name: 'Supprimer' }))

    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(fr.t(($) => $.project.form.deleteError))
  })
})
