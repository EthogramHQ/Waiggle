// Tests du « Retour » de la page d'attente (R16, « Toujours une issue ») : la page d'un projet
// ouverte par son adresse, sur téléphone, n'a ni barre du haut ni onglets ; pendant son attente,
// seul « Revenir » apparaissait, au bout de 4 s. Avec `backLabel`, `LoadingScreen` pose dès le
// début le « Retour » du haut de la page qui arrive, qui mène à la page d'avant, ou à `fallback`
// sans page d'avant (un lien direct). « Revenir » ne vient pas s'y ajouter : une issue suffit.
// Sans `backLabel`, rien ne change : « Revenir » au bout de 4 s (témoin).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { LoadingScreen } from './states'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// La barre du haut lit le profil : on remplace l'appel, qui n'arrive jamais.
jest.mock('../profile/api', () => ({ getMe: jest.fn().mockReturnValue(new Promise(() => {})) }))
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
const mockReplace = jest.fn()
const mockBack = jest.fn()
// Un lien direct : aucune page d'avant dans l'historique.
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/abc',
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => false,
  }),
}))

const back = fr.t(($) => $.project.page.back)
const slowBack = fr.t(($) => $.states.back)

beforeEach(() => {
  jest.useFakeTimers()
  mockSession(null)
  mockReplace.mockReset()
  mockBack.mockReset()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('LoadingScreen, its way back (R16)', () => {
  it('offers « Retour » from the start of the wait, leading to the fallback without a page before', async () => {
    await renderWithProviders(<LoadingScreen shape="project" fade={false} backLabel={back} />)

    await fireEvent.press(screen.getByRole('button', { name: back }))

    expect(mockReplace).toHaveBeenCalledWith('/feed')
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('adds no « Revenir » after 4 s when « Retour » is already there', async () => {
    await renderWithProviders(<LoadingScreen shape="project" fade={false} backLabel={back} />)

    await act(async () => {
      jest.advanceTimersByTime(4100)
    })

    expect(screen.getByRole('button', { name: back })).toBeTruthy()
    expect(screen.queryByRole('button', { name: slowBack })).toBeNull()
  })

  it('keeps « Revenir » after 4 s, and no « Retour » before, without backLabel', async () => {
    await renderWithProviders(<LoadingScreen shape="project" fade={false} />)
    expect(screen.queryByRole('button', { name: back })).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(4100)
    })

    expect(screen.getByRole('button', { name: slowBack })).toBeTruthy()
  })
})
