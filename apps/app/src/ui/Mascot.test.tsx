// Tests de la mascotte (R1) : l'abeille dans l'une de ses quatre poses. Seule, elle est une image
// nommée d'après sa pose ; à côté d'un texte qui dit déjà tout, elle devient un décor muet (J10).
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Mascot } from './Mascot'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('Mascot', () => {
  it.each([
    ['search', fr.t(($) => $.mascot.search)],
    ['wave', fr.t(($) => $.mascot.wave)],
    ['fly', fr.t(($) => $.mascot.fly)],
    ['sleep', fr.t(($) => $.mascot.sleep)],
  ] as const)('is an image named after its pose (%s)', async (pose, name) => {
    await renderWithProviders(<Mascot pose={pose} />)

    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('img', { name })).toBeTruthy()
  })

  it('is named in the language of the app', async () => {
    const { i18n } = await renderWithProviders(<Mascot pose="sleep" />, 'en')

    expect(screen.getByRole('img', { name: i18n.t(($) => $.mascot.sleep) })).toBeTruthy()
    expect(screen.queryByRole('img', { name: fr.t(($) => $.mascot.sleep) })).toBeNull()
  })

  it('is hidden from screen readers when decorative, but still drawn', async () => {
    const name = fr.t(($) => $.mascot.sleep)
    await renderWithProviders(<Mascot pose="sleep" decorative />)

    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByLabelText(name)).toBeNull()
    // Témoin : l'abeille est bien là, seulement cachée aux lecteurs d'écran.
    expect(screen.getByRole('img', { name, includeHiddenElements: true })).toBeTruthy()
  })
})
