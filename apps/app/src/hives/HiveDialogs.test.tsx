// Tests des fenêtres de confirmation des ruches (R10, `hives/HiveDialogs`) : ce que « Quitter »
// dit avant (projets, commentaires, qui animera, la suppression du dernier membre), une seule
// écriture sur une double tape, la fenêtre qui ne se ferme pas pendant l'écriture, et le refus lu
// dans la fenêtre. « Supprimer » et « Confier » sont aussi essayés depuis les réglages
// (`screens/HiveSettingsScreen.test.tsx`).
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import {
  animatorPage,
  heldReply,
  hiveId,
  hiveServer,
  memberPage,
  members,
  odile,
  pressEscape,
  quitSuccessor,
  quitTitle,
  refusal,
  removeTitle,
  resetHiveMocks,
  shown,
  T,
} from '../screens/Hives.testkit'
import { passTapGuard } from '../testing/dialog'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { QuitHiveDialog, RemoveMemberDialog } from './HiveDialogs'

const kit = () => require('../screens/Hives.testkit') as typeof import('../screens/Hives.testkit')

jest.mock('expo-router', () => kit().mockExpoRouter())

beforeEach(() => resetHiveMocks(`/hives/${hiveId}`, { id: hiveId }))

const LEAVE = new RegExp(`^/v1/hives/${hiveId}/members/`)
const quitError = fr.t(($) => $.hives.dialogs.quitError)

describe('QuitHiveDialog', () => {
  const openQuit = async (page = memberPage) => {
    const onDone = jest.fn()
    const onClose = jest.fn()
    await renderWithProviders(<QuitHiveDialog hive={page} open onClose={onClose} onDone={onDone} />)
    await screen.findByRole('header', { name: quitTitle('Famille') })
    await passTapGuard()
    return { onDone, onClose }
  }

  it('says that reserved projects become private and comments stay readable', async () => {
    await openQuit()

    expect(shown(T.quitBody)).toBe(true)
    expect(shown(T.quitComments)).toBe(true)
    expect(shown(T.quitLast)).toBe(false)
  })

  it('says who will host the hive when the animator leaves', async () => {
    await openQuit(animatorPage)

    expect(shown(quitSuccessor('Papi Jean'))).toBe(true)
  })

  it('says the hive will be deleted when its last member leaves', async () => {
    await openQuit({ ...memberPage, summary: { ...memberPage.summary, memberCount: 1 } })

    expect(shown(T.quitLast)).toBe(true)
  })

  it('leaves once on a double tap, and refuses to close meanwhile', async () => {
    const held = heldReply()
    hiveServer.answer('DELETE', LEAVE, () => held.reply)
    const { onDone, onClose } = await openQuit()

    await fireEvent.press(screen.getByRole('button', { name: T.quit }))
    await fireEvent.press(screen.getByRole('button', { name: T.quit }))
    await pressEscape(quitTitle('Famille'))
    await fireEvent.press(screen.getByRole('button', { name: T.dialogCancel }))
    await waitFor(() => expect(hiveServer.received('DELETE', LEAVE)).toHaveLength(1))
    expect(onClose).not.toHaveBeenCalled()

    await held.release({ status: 204 })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(hiveServer.received('DELETE', LEAVE)).toHaveLength(1)
  })

  it('keeps the dialog open with its message when leaving fails', async () => {
    hiveServer.answer('DELETE', LEAVE, () => refusal(500, 'internal'))
    const { onDone } = await openQuit()

    await fireEvent.press(screen.getByRole('button', { name: T.quit }))

    await waitFor(() => expect(shown(quitError)).toBe(true))
    expect(onDone).not.toHaveBeenCalled()
    await act(async () => {})
  })
})

describe('RemoveMemberDialog', () => {
  it('names the member, says what happens, and removes that member', async () => {
    const onDone = jest.fn()
    const odileMember = members.find((one) => one.face.id === odile.id)
    await renderWithProviders(
      <RemoveMemberDialog
        hive={animatorPage}
        member={odileMember}
        open
        onClose={jest.fn()}
        onDone={onDone}
      />,
    )
    await screen.findByRole('header', { name: removeTitle(odile.name) })
    await passTapGuard()
    expect(shown(T.removeBody)).toBe(true)

    await fireEvent.press(screen.getByRole('button', { name: T.remove }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(hiveServer.received('DELETE', LEAVE).map((one) => one.path)).toEqual([
      `/v1/hives/${hiveId}/members/${odile.id}`,
    ])
  })
})
