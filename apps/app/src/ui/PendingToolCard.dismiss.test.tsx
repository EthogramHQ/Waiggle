// Tests de la carte d'un « Autre » pendant « Laisser hors du catalogue » (correction U1 d'après la
// relecture du design de R6b, des-B1) : le geste écrit sans fenêtre de confirmation ; pendant
// l'écriture, le bouton touché est occupé (`dismissing`, lu « occupé » et gardant le focus), et une
// panne se lit dans la carte, au-dessus de ses boutons, qui restent pour réessayer (`error`).
import { fireEvent, screen } from '@testing-library/react-native'
import { makeComPending } from '../testing/catalogue'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { PendingToolCard } from './PendingToolCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const ADMIT = fr.t(($) => $.moderation.catalogue.admit)
const DISMISS = fr.t(($) => $.moderation.catalogue.dismiss)
const DISMISSED = fr.t(($) => $.moderation.catalogue.dismissed)
const FAILED = 'Une erreur inattendue est survenue.'

const handlers = () => ({
  onAdmit: jest.fn(),
  onMerge: jest.fn(),
  onDismiss: jest.fn(),
  onOpenProject: jest.fn(),
})

describe('PendingToolCard, « Laisser hors du catalogue »', () => {
  it('shows « Laisser hors » busy while it writes, and ignores a second press', async () => {
    const on = handlers()
    await renderWithProviders(
      <PendingToolCard tool={makeComPending} outcome={null} dismissing {...on} />,
    )

    const dismiss = screen.getByRole('button', { name: DISMISS })
    expect(dismiss).toBeBusy()
    // Témoin : les autres décisions ne sont pas occupées.
    expect(screen.getByRole('button', { name: ADMIT })).not.toBeBusy()
    await fireEvent.press(dismiss)
    expect(on.onDismiss).not.toHaveBeenCalled()
  })

  it('is not busy by default (witness)', async () => {
    await renderWithProviders(
      <PendingToolCard tool={makeComPending} outcome={null} {...handlers()} />,
    )

    expect(screen.getByRole('button', { name: DISMISS })).not.toBeBusy()
  })

  it('reads a failure in the card as an alert, its buttons kept to try again', async () => {
    await renderWithProviders(
      <PendingToolCard tool={makeComPending} outcome={null} error={FAILED} {...handlers()} />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(FAILED)
    expect(screen.getByRole('button', { name: DISMISS })).toBeEnabled()
  })

  it('shows no failure once decided: the result replaces the buttons and the message', async () => {
    await renderWithProviders(
      <PendingToolCard
        tool={makeComPending}
        outcome={{ kind: 'dismissed' }}
        error={FAILED}
        {...handlers()}
      />,
    )

    expect(screen.getByText(DISMISSED)).toBeTruthy()
    expect(screen.queryByText(FAILED)).toBeNull()
  })
})
