// Tests de useMemberSession (accounts/session.ts) : les quatre états qu'un écran réservé aux
// membres affiche. La lecture de la session par Better Auth (useSession, accounts/api) est remplacée
// par un faux, dont chaque test choisit la réponse. Le défaut corrigé : `data: null` venait aussi
// d'une lecture en échec (429, panne, réseau), et l'écran disait « Réservé aux membres » à un membre
// connecté.
import { act, renderHook } from '@testing-library/react-native'
import { useSession } from './api'
import { useMemberSession } from './session'

jest.mock('./api', () => ({ useSession: jest.fn() }))

/** Ce que rend useSession, réduit aux champs que lit le hook. */
type SessionRead = {
  data: { user: Record<string, unknown> } | null
  isPending: boolean
  error: unknown
}

/** Fait rendre cette lecture à useSession ; renvoie la fausse fonction `refetch` (relire). */
const readSession = ({ data, isPending, error }: SessionRead) => {
  const refetch = jest.fn().mockResolvedValue(undefined)
  jest
    .mocked(useSession)
    .mockReturnValue({ data, isPending, error, refetch } as unknown as ReturnType<
      typeof useSession
    >)
  return refetch
}

/** Le résultat du hook, rendu dans un faux composant (renderHook est asynchrone dans RNTL 14). */
const memberSession = async () => {
  const { result } = await renderHook(() => useMemberSession())
  return result.current
}

const lea = { user: { id: 'u1', name: 'Léa', email: 'lea@example.com' } }
// Une erreur telle que la rend Better Auth quand le serveur refuse : « trop de demandes ».
const tooManyRequests = { status: 429, statusText: 'Too Many Requests' }

beforeEach(() => {
  jest.mocked(useSession).mockReset()
})

describe('useMemberSession', () => {
  it('waits while the session is being read', async () => {
    readSession({ data: null, isPending: true, error: null })

    const session = await memberSession()

    expect(session.state).toBe('pending')
    expect(session.session).toBeNull()
  })

  it('gives the session of a signed-in member', async () => {
    readSession({ data: lea, isPending: false, error: null })

    const session = await memberSession()

    expect(session.state).toBe('signedIn')
    expect(session.session).toBe(lea)
  })

  it('keeps a session already read when a later read fails', async () => {
    // Une relecture en échec ne déconnecte pas : la session déjà lue reste valable.
    readSession({ data: lea, isPending: false, error: tooManyRequests })

    const session = await memberSession()

    expect(session.state).toBe('signedIn')
    expect(session.session).toBe(lea)
  })

  it('tells a failed read from no session', async () => {
    // Le cœur du défaut : `data: null` avec une erreur n'est pas « personne de connecté ».
    readSession({ data: null, isPending: false, error: tooManyRequests })

    const session = await memberSession()

    expect(session.state).toBe('error')
    expect(session.session).toBeNull()
  })

  it('says nobody is signed in when there is neither a session nor an error', async () => {
    readSession({ data: null, isPending: false, error: null })

    const session = await memberSession()

    expect(session.state).toBe('signedOut')
    expect(session.session).toBeNull()
  })

  it('reads the session again, once, on retry', async () => {
    const refetch = readSession({ data: null, isPending: false, error: tooManyRequests })

    const session = await memberSession()
    session.retry()

    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('offers to sign in, not to retry, when the server says there is no session (401)', async () => {
    // Relecture de l'interface (PR #62) : sur un 401, Better Auth vide `data` et remplit `error` ;
    // « Réessayer » redonnerait le même refus, sans fin.
    readSession({
      data: null,
      isPending: false,
      error: { status: 401, statusText: 'Unauthorized' },
    })

    const session = await memberSession()

    expect(session.state).toBe('signedOut')
  })

  it('keeps the error state while retrying, and reads only once for repeated taps', async () => {
    // Relecture de l'interface (PR #62) : pendant la relecture, Better Auth repasse `isPending` à
    // vrai ; l'écran d'erreur laissait la place au chargement et le focus de « Réessayer » se perdait.
    const refetch = readSession({ data: null, isPending: false, error: tooManyRequests })
    // Une relecture qui ne répond pas encore.
    refetch.mockReturnValue(new Promise(() => {}))
    const { result, rerender } = await renderHook(() => useMemberSession())

    await act(async () => result.current.retry())
    // Better Auth relit : `isPending` à vrai, plus d'erreur, toujours pas de session.
    const refetchAgain = readSession({ data: null, isPending: true, error: null })
    await rerender({})
    await act(async () => result.current.retry())

    expect(result.current.state).toBe('error')
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(refetchAgain).not.toHaveBeenCalled()
  })
})
