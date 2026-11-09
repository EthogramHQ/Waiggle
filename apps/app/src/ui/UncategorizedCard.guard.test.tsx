// La garde de double tape de la carte d'un projet à ranger (tranche R6b) : la seconde tape d'une
// double tape n'ouvre pas deux fois le choix, ni deux fois la page du projet.
import { fireEvent, screen } from '@testing-library/react-native'
import { birdhouseProject } from '../testing/catalogue'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { UncategorizedCard } from './UncategorizedCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const show = async () => {
  const handlers = { onFile: jest.fn(), onOpenProject: jest.fn() }
  await renderWithProviders(
    <UncategorizedCard project={birdhouseProject} filedInto={null} {...handlers} />,
  )
  return handlers
}

describe('UncategorizedCard, double tap', () => {
  it('opens « Ranger dans une catégorie » once on a double tap', async () => {
    const handlers = await show()
    const file = screen.getByRole('button', { name: fr.t(($) => $.moderation.categories.sort) })

    await fireEvent.press(file)
    await fireEvent.press(file)

    expect(handlers.onFile).toHaveBeenCalledTimes(1)
  })

  it('opens the project page once on a double tap', async () => {
    const handlers = await show()
    const title = screen.getByRole('link', { name: birdhouseProject.title })

    await fireEvent.press(title)
    await fireEvent.press(title)

    expect(handlers.onOpenProject).toHaveBeenCalledTimes(1)
  })
})
