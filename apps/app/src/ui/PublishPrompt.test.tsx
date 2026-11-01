// Tests de l'encart « Ou publie ton premier projet. » (R4, F-Fil9, planche R4-Fil-Premier) : posé
// sous « Proches à suivre » au premier lancement, il propose « Publier ». Ce qu'un membre et un
// lecteur d'écran en perçoivent : les deux phrases, et « Publier » qui mène à la publication (un
// bouton ou un lien, selon le composant). Masqué pour un membre suspendu : c'est l'écran qui ne le
// pose pas (testé avec HomeScreen).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { PublishPrompt } from './PublishPrompt'
import { TAP_GUARD_MS } from './tapGuard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const title = fr.t(($) => $.publishPrompt.title)
const body = fr.t(($) => $.publishPrompt.body)
const publish = fr.t(($) => $.publishPrompt.action)

/** « Publier » : un lien (il ouvre une page) ou un bouton ; on le cherche par son nom. */
const publishControl = () =>
  screen.queryByRole('link', { name: publish }) ?? screen.getByRole('button', { name: publish })

describe('PublishPrompt', () => {
  it('invites to publish a first project, in two sentences', async () => {
    await renderWithProviders(<PublishPrompt onPublish={jest.fn()} />)

    expect(screen.getByText(title)).toBeTruthy()
    expect(screen.getByText(body)).toBeTruthy()
  })

  it('leads to publishing with « Publier »', async () => {
    const onPublish = jest.fn()
    await renderWithProviders(<PublishPrompt onPublish={onPublish} />)

    await fireEvent.press(publishControl())

    expect(onPublish).toHaveBeenCalledTimes(1)
  })

  // La page de publication s'ouvre sous le doigt : une double tape ne l'ouvre qu'une fois (deux
  // pages empilées, deux « Retour »). Même garde que les cartes (TAP_GUARD_MS).
  it('opens the publishing page once for a double tap', async () => {
    jest.useFakeTimers()
    try {
      const onPublish = jest.fn()
      await renderWithProviders(<PublishPrompt onPublish={onPublish} />)

      await fireEvent.press(publishControl())
      await fireEvent.press(publishControl())
      expect(onPublish).toHaveBeenCalledTimes(1)

      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
      await fireEvent.press(publishControl())
      expect(onPublish).toHaveBeenCalledTimes(2)
    } finally {
      jest.useRealTimers()
    }
  })

  it('speaks the language of the app', async () => {
    await renderWithProviders(<PublishPrompt onPublish={jest.fn()} />, 'en')

    expect(
      screen.queryByRole('link', { name: 'Publish' }) ??
        screen.getByRole('button', { name: 'Publish' }),
    ).toBeTruthy()
  })
})
