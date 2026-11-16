// Tests de la fenêtre « Supprimer ce commentaire ? » (R11), commune au fil d'un projet et à « Mes
// commentaires » : le titre en en-tête, les deux corps (avec ou sans réponses), les deux boutons par
// leur nom, le refus montré sous le corps, et une seule demande sur une double tape. Le focus
// d'ouverture et la garde de 600 ms sont ceux de `Dialog` (testés dans son fichier).
import { fireEvent, screen } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { DeleteCommentDialog } from './DeleteCommentDialog'

const T = {
  title: fr.t(($) => $.project.comments.deleteTitle),
  body: fr.t(($) => $.project.comments.deleteBody),
  bodyReplies: fr.t(($) => $.project.comments.deleteBodyReplies),
  confirm: fr.t(($) => $.project.comments.confirmDelete),
  cancel: fr.t(($) => $.common.cancel),
  error: fr.t(($) => $.project.comments.deleteError),
}

const onConfirm = jest.fn()
const onCancel = jest.fn()

beforeEach(() => {
  onConfirm.mockReset()
  onCancel.mockReset()
})

const open = async (
  props: { hasReplies?: boolean; busy?: boolean; error?: string | null } = {},
) => {
  const view = await renderWithProviders(
    <DeleteCommentDialog
      visible
      hasReplies={props.hasReplies ?? false}
      busy={props.busy ?? false}
      error={props.error ?? null}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  )
  await passTapGuard()
  return view
}

describe('DeleteCommentDialog', () => {
  it('shows its title as a header and the plain body', async () => {
    const view = await open()

    expect(screen.getByRole('header', { name: T.title })).toBeTruthy()
    expect(screen.getByText(T.body)).toBeTruthy()
    expect(screen.queryByText(T.bodyReplies)).toBeNull()
    await view.unmount()
  })

  it('asks with the replies sentence when the comment has replies', async () => {
    const view = await open({ hasReplies: true })

    expect(screen.getByText(T.bodyReplies)).toBeTruthy()
    expect(screen.queryByText(T.body)).toBeNull()
    await view.unmount()
  })

  it('confirms by Supprimer and cancels by Annuler', async () => {
    const view = await open()

    await fireEvent.press(screen.getByRole('button', { name: T.cancel }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()

    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await view.unmount()
  })

  it('sends one request on a double tap', async () => {
    const view = await open()
    const confirm = screen.getByRole('button', { name: T.confirm })

    await fireEvent.press(confirm)
    await fireEvent.press(confirm)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    await view.unmount()
  })

  it('shows the refusal under the body, and nothing before one', async () => {
    const view = await open({ error: T.error })

    expect(screen.getByText(T.error)).toBeTruthy()
    await view.unmount()
  })

  it('shows no refusal by default', async () => {
    const view = await open()

    expect(screen.queryByText(T.error)).toBeNull()
    await view.unmount()
  })

  it('keeps Supprimer busy and Annuler disabled while deleting', async () => {
    const view = await open({ busy: true })

    expect(screen.getByRole('button', { name: T.cancel })).toBeDisabled()
    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))
    expect(onConfirm).not.toHaveBeenCalled()
    await view.unmount()
  })
})
