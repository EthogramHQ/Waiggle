// Tests de la fenêtre « Abandonner ? » quand la feuille lui donne ses mots (R7a, relecture du plan,
// interface B1). La feuille « Nouvelle mise à jour » demande « Abandonner cette mise à jour ? » et
// dit que les photos ajoutées seront perdues : DiscardDialog prend `title?` et `message?`, et garde
// ses textes communs (`common.discardTitle`, `discardBody`) quand on ne lui donne rien. Le reste ne
// change pas : focus sur « Continuer », garde contre la double tape.
import { fireEvent, screen } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { watchOpeningFocus } from '../testing/openingFocus'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { DiscardDialog } from './DiscardDialog'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const UPDATE_TITLE = fr.t(($) => $.project.updates.discardTitle)
const UPDATE_BODY = fr.t(($) => $.project.updates.discardBody)
const KEEP = fr.t(($) => $.common.keepEditing)
const DISCARD = fr.t(($) => $.common.discard)

/** La fenêtre de la feuille « Nouvelle mise à jour », avec ses deux textes. */
const showForUpdate = async () => {
  const onKeep = jest.fn()
  const onDiscard = jest.fn()
  await renderWithProviders(
    <DiscardDialog
      visible
      title={UPDATE_TITLE}
      message={UPDATE_BODY}
      onKeep={onKeep}
      onDiscard={onDiscard}
    />,
  )
  return { onKeep, onDiscard }
}

afterEach(() => jest.restoreAllMocks())

describe('DiscardDialog with its own words (R7a)', () => {
  it('shows the title and message it is given', async () => {
    await showForUpdate()

    expect(screen.getByRole('header', { name: 'Abandonner cette mise à jour ?' })).toBeTruthy()
    expect(screen.getByText(UPDATE_BODY)).toBeTruthy()
    // Les textes communs laissent leur place.
    expect(screen.queryByText(fr.t(($) => $.common.discardTitle))).toBeNull()
    expect(screen.queryByText(fr.t(($) => $.common.discardBody))).toBeNull()
  })

  it('keeps the common words when given none (témoin)', async () => {
    await renderWithProviders(<DiscardDialog visible onKeep={jest.fn()} onDiscard={jest.fn()} />)

    expect(screen.getByText(fr.t(($) => $.common.discardTitle))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.common.discardBody))).toBeTruthy()
  })

  it('still gives the opening focus to « Continuer » and guards its buttons', async () => {
    const focused = watchOpeningFocus()
    const { onKeep, onDiscard } = await showForUpdate()

    expect(focused()).toBe(KEEP)
    await fireEvent.press(screen.getByRole('button', { name: DISCARD }))
    expect(onDiscard).not.toHaveBeenCalled()

    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: DISCARD }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onKeep).not.toHaveBeenCalled()
  })
})
