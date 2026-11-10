// Tests de la fenêtre « Supprimer cette mise à jour ? » (R7a, relecture ui-C2), réunie en un seul
// composant pour la section de la page projet et la frise : le texte d'une mise à jour retirée, « Supprimer »
// qui envoie une seule fois, « Annuler » qui ne supprime rien, le refus gardé dans la fenêtre, et
// `onGone` rendu sur téléphone dès la fermeture (Android n'appelle pas `onClosed` : le focus doit
// quand même revenir). Le focus d'ouverture sur « Annuler » et la garde de double tape sont ceux de
// `Dialog` (testés dans son fichier) ; les deux écrans testent le parcours entier.
import type { ProjectUpdate } from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { passTapGuard } from '../testing/dialog'
import { removalAfterReport } from '../testing/moderation'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import { useDeleteUpdate } from '../updates/api'
import { DeleteUpdateDialog } from './DeleteUpdateDialog'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../updates/api', () => ({ useDeleteUpdate: jest.fn() }))

const T = {
  confirm: fr.t(($) => $.project.updates.confirmDelete),
  cancel: fr.t(($) => $.common.cancel),
  body: fr.t(($) => $.project.updates.deleteBody),
  bodyRemoved: fr.t(($) => $.project.updates.deleteBodyRemoved),
  error: fr.t(($) => $.project.updates.deleteError),
}

const calls = {
  attempt: jest.fn(),
  deleted: jest.fn(),
  cancelled: jest.fn(),
  gone: jest.fn(),
}

/** L'écran qui ouvre la fenêtre : il remet `update` à null à sa fermeture, comme les deux vrais. */
function Harness({ update }: { update: ProjectUpdate }) {
  const [open, setOpen] = useState<ProjectUpdate | null>(update)
  return (
    <DeleteUpdateDialog
      projectId="p1"
      update={open}
      onAttempt={calls.attempt}
      onDeleted={calls.deleted}
      onCancelled={calls.cancelled}
      onClose={() => setOpen(null)}
      onGone={calls.gone}
    />
  )
}

const remove = jest.fn()
const open = async (update: ProjectUpdate = rocketUpdate) => {
  await renderWithProviders(<Harness update={update} />)
  await passTapGuard()
}

beforeEach(() => {
  for (const fn of [...Object.values(calls), remove]) fn.mockReset()
  remove.mockResolvedValue(true)
  jest
    .mocked(useDeleteUpdate)
    .mockReturnValue({ remove, error: false, reason: undefined } as unknown as ReturnType<
      typeof useDeleteUpdate
    >)
})

describe('DeleteUpdateDialog', () => {
  it('says what stays kept when the moderation removed the update', async () => {
    await open({ ...rocketUpdate, removal: removalAfterReport })

    expect(screen.getByText(T.bodyRemoved)).toBeTruthy()
    expect(screen.queryByText(T.body)).toBeNull()
  })

  it('asks the plain question for an update that is not removed', async () => {
    await open()

    expect(screen.getByText(T.body)).toBeTruthy()
  })

  it('deletes once, tells its screen, closes and reports it is gone', async () => {
    // Une réponse en attente : la deuxième tape arrive pendant l'envoi.
    let answer: (ok: boolean) => void = () => {}
    remove.mockReturnValue(new Promise<boolean>((resolve) => (answer = resolve)))
    await open()

    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))
    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))
    await act(async () => answer(true))

    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith(rocketUpdate.id)
    expect(calls.attempt).toHaveBeenCalledWith(rocketUpdate)
    expect(calls.deleted).toHaveBeenCalledWith(rocketUpdate)
    expect(calls.cancelled).not.toHaveBeenCalled()
    // Téléphone : `onClosed` de `Dialog` n'est pas appelé, la fermeture suffit à rendre le focus.
    expect(calls.gone).toHaveBeenCalledTimes(1)
  })

  it('deletes nothing when cancelled, and still reports it is gone', async () => {
    await open()

    await fireEvent.press(screen.getByRole('button', { name: T.cancel }))
    await act(async () => {})

    expect(remove).not.toHaveBeenCalled()
    expect(calls.cancelled).toHaveBeenCalledTimes(1)
    expect(calls.gone).toHaveBeenCalledTimes(1)
  })

  it('stays open with its message when the API refuses', async () => {
    remove.mockResolvedValue(false)
    jest
      .mocked(useDeleteUpdate)
      .mockReturnValue({ remove, error: true, reason: undefined } as unknown as ReturnType<
        typeof useDeleteUpdate
      >)
    await open()

    // Témoin : l'erreur de la dernière demande n'est pas montrée avant un envoi.
    expect(screen.queryByText(T.error)).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))
    await act(async () => {})

    expect(screen.getByText(T.error)).toBeTruthy()
    expect(calls.deleted).not.toHaveBeenCalled()
    expect(calls.gone).not.toHaveBeenCalled()
  })
})
