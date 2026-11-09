// Tests de la fenêtre « Abandonner les changements ? » des feuilles d'administration (correction
// U3, ui-C1) : un texte qui ne parle que de ce qui est écrit (aucune photo), le focus de l'ouverture
// sur « Continuer », et la garde contre la double tape sur ses boutons.
import { fireEvent, screen } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { watchOpeningFocus } from '../testing/openingFocus'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { DiscardDialog } from './DiscardDialog'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const TITLE = fr.t(($) => $.common.discardTitle)
const BODY = fr.t(($) => $.common.discardBody)
const KEEP = fr.t(($) => $.common.keepEditing)
const DISCARD = fr.t(($) => $.common.discard)

const show = async () => {
  const onKeep = jest.fn()
  const onDiscard = jest.fn()
  await renderWithProviders(<DiscardDialog visible onKeep={onKeep} onDiscard={onDiscard} />)
  return { onKeep, onDiscard }
}

afterEach(() => jest.restoreAllMocks())

describe('DiscardDialog', () => {
  it('says what is lost, and nothing about photos', async () => {
    await show()

    expect(screen.getByText(TITLE)).toBeTruthy()
    expect(screen.getByText(BODY)).toBeTruthy()
    expect(BODY).not.toMatch(/photo/i)
    expect(fr.t(($) => $.common.discardBody, { lng: 'en' })).not.toMatch(/photo/i)
  })

  it('gives the opening focus to « Continuer », the gesture that loses nothing', async () => {
    const focused = watchOpeningFocus()
    await show()

    expect(focused()).toBe(KEEP)
  })

  it('keeps or discards from its buttons, after the double-tap guard', async () => {
    const { onKeep, onDiscard } = await show()

    // Juste après l'ouverture : la seconde tape d'une double tape n'abandonne rien.
    await fireEvent.press(screen.getByRole('button', { name: DISCARD }))
    expect(onDiscard).not.toHaveBeenCalled()

    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: KEEP }))
    expect(onKeep).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: DISCARD }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})
