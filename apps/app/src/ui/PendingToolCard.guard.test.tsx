// La garde de double tape de la carte d'un « Autre » (tranche R6b) : la seconde tape d'une double
// tape (vers 150 à 250 ms) ne refait pas le geste. Une garde par bouton : deux boutons différents
// touchés à la suite agissent chacun (le fichier PendingToolCard.test.tsx le vérifie).
import { fireEvent, screen } from '@testing-library/react-native'
import { makeComPending } from '../testing/catalogue'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { PendingToolCard } from './PendingToolCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const show = async () => {
  const handlers = {
    onAdmit: jest.fn(),
    onMerge: jest.fn(),
    onDismiss: jest.fn(),
    onOpenProject: jest.fn(),
  }
  await renderWithProviders(<PendingToolCard tool={makeComPending} outcome={null} {...handlers} />)
  return handlers
}

describe('PendingToolCard, double tap', () => {
  it('writes « Laisser hors du catalogue » once on a double tap', async () => {
    const handlers = await show()
    const dismiss = screen.getByRole('button', {
      name: fr.t(($) => $.moderation.catalogue.dismiss),
    })

    await fireEvent.press(dismiss)
    await fireEvent.press(dismiss)

    expect(handlers.onDismiss).toHaveBeenCalledTimes(1)
  })

  it('opens « Ajouter au catalogue » once on a double tap', async () => {
    const handlers = await show()
    const admit = screen.getByRole('button', { name: fr.t(($) => $.moderation.catalogue.admit) })

    await fireEvent.press(admit)
    await fireEvent.press(admit)

    expect(handlers.onAdmit).toHaveBeenCalledTimes(1)
  })

  it('opens a single project page when two project links are tapped in a row', async () => {
    const handlers = await show()
    const [first, second] = screen.getAllByRole('link')
    if (!first || !second) throw new Error('two project links expected')

    await fireEvent.press(first)
    await fireEvent.press(second)

    expect(handlers.onOpenProject).toHaveBeenCalledTimes(1)
  })
})
