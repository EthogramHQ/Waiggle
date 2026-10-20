// Tests de la page de désinscription (tranche 6c), ouverte depuis le lien « Ne plus recevoir… »
// d'un e-mail, sans connexion. Scénario : docs/scenarios/phase-1.md, « Précisions (tranche 6c) ».
// Ouvrir la page ne change rien (un antivirus qui ouvre les liens ne désinscrit personne) : seul
// « Confirmer » envoie la demande. La fonction unsubscribe (email/api) est remplacée par un faux.
import { fireEvent, screen } from '@testing-library/react-native'
import { useLocalSearchParams } from 'expo-router'
import UnsubscribeRoute from '../../app/unsubscribe'
import { unsubscribe } from '../email/api'
import { malformedToken, mentionsToken, recapToken } from '../testing/email'
import { visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { useHydrated } from '../ui/theme/hydration'
import { UnsubscribeScreen } from './UnsubscribeScreen'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../email/api', () => ({ unsubscribe: jest.fn() }))
// La page lit son jeton dans l'adresse, inconnue du pré-rendu : elle attend l'hydratation (voir
// ui/theme/hydration.ts). Chaque test choisit si la page est hydratée (oui, par défaut).
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: jest.fn(),
}))
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/unsubscribe',
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: jest.fn(),
}))

/** Ouvre la page comme depuis un lien d'e-mail : /unsubscribe?token=…[&scope=…]. */
const open = (params: Record<string, string | string[]>) => {
  jest.mocked(useLocalSearchParams).mockReturnValue(params)
  return renderWithProviders(<UnsubscribeScreen />)
}

const confirm = () => fireEvent.press(screen.getByRole('button', { name: 'Confirmer' }))

beforeEach(() => {
  // Personne de connecté : la page sert sans session. (Un test vérifie aussi le cas d'une session.)
  mockSession(null)
  jest.mocked(useHydrated).mockReset().mockReturnValue(true)
  jest.mocked(unsubscribe).mockReset().mockResolvedValue({ ok: true, data: null })
  mockPush.mockReset()
  mockReplace.mockReset()
})

describe('UnsubscribeScreen', () => {
  it('is the page of the /unsubscribe address', () => {
    expect(UnsubscribeRoute).toBe(UnsubscribeScreen)
  })

  it('asks before stopping the weekly recap, and sends nothing when the page opens', async () => {
    await open({ token: recapToken })

    expect(screen.getByText('Ne plus recevoir le récap de la semaine ?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Garder mes e-mails' })).toBeTruthy()
    // Le cœur de la règle : ouvrir le lien ne désinscrit personne.
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('names the mention e-mails when the link came from one of them', async () => {
    await open({ token: mentionsToken })

    expect(
      screen.getByText('Ne plus recevoir les e-mails de mentions et de réponses ?'),
    ).toBeTruthy()
    expect(screen.queryByText('Ne plus recevoir le récap de la semaine ?')).toBeNull()
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('keeps the e-mails and goes home with « Garder mes e-mails »', async () => {
    await open({ token: recapToken })

    await fireEvent.press(screen.getByRole('link', { name: 'Garder mes e-mails' }))

    expect(visited(mockPush, mockReplace)).toEqual(['/'])
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('stops the recap once « Confirmer » is touched, and says so', async () => {
    await open({ token: recapToken })

    await confirm()

    // Le jeton seul : la sorte d'e-mail à couper est écrite dedans.
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(jest.mocked(unsubscribe).mock.calls[0]?.[0]).toBe(recapToken)
    expect(jest.mocked(unsubscribe).mock.calls[0]?.[1]).toBeUndefined()
    expect(
      await screen.findByText('C’est fait : tu ne recevras plus le récap de la semaine.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirmer' })).toBeNull()
    // Ensuite : tout couper, ou aller aux réglages.
    expect(screen.getByRole('button', { name: 'Tout couper' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Gérer mes e-mails' })).toBeTruthy()
  })

  it('says which e-mails stopped when the link came from a mention e-mail', async () => {
    await open({ token: mentionsToken })

    await confirm()

    expect(
      await screen.findByText(
        'C’est fait : tu ne recevras plus d’e-mail quand on te mentionne ou te répond.',
      ),
    ).toBeTruthy()
  })

  it('sends a single request when « Confirmer » is touched twice, and shows it is on its way', async () => {
    // La réponse reste en attente : le second toucher arrive pendant l'envoi.
    let answer: (value: { ok: true; data: null }) => void = () => {}
    jest.mocked(unsubscribe).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    await open({ token: recapToken })

    await confirm()
    await confirm()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    // L'état « en cours » : le bouton l'annonce (aria-busy) et ne réagit plus.
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeBusy()

    answer({ ok: true, data: null })
    expect(
      await screen.findByText('C’est fait : tu ne recevras plus le récap de la semaine.'),
    ).toBeTruthy()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('turns every notification e-mail off with « Tout couper », after the confirmation', async () => {
    await open({ token: recapToken })
    await confirm()

    await fireEvent.press(await screen.findByRole('button', { name: 'Tout couper' }))

    expect(unsubscribe).toHaveBeenCalledTimes(2)
    expect(jest.mocked(unsubscribe).mock.calls[1]).toEqual([recapToken, 'all'])
    expect(
      await screen.findByText('C’est fait : tu ne recevras plus aucun e-mail de notification.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tout couper' })).toBeNull()
    // R6 : « Tout couper » ne touche pas aux e-mails du compte, et la page le dit.
    expect(
      screen.getByText(
        'Les e-mails liés à ton compte, comme la vérification de ton adresse, continuent.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Gérer mes e-mails' })).toBeTruthy()
  })

  it('sends « Tout couper » only once, even touched twice', async () => {
    await open({ token: recapToken })
    await confirm()
    const allOff = await screen.findByRole('button', { name: 'Tout couper' })
    jest.mocked(unsubscribe).mockImplementation(() => new Promise(() => {}))

    await fireEvent.press(allOff)
    await fireEvent.press(screen.getByRole('button', { name: 'Tout couper' }))

    expect(unsubscribe).toHaveBeenCalledTimes(2) // « Confirmer », puis un seul « Tout couper »
    expect(screen.getByRole('button', { name: 'Tout couper' })).toBeBusy()
  })

  it('leads to the e-mail settings in « Mon profil »', async () => {
    await open({ token: recapToken })
    await confirm()

    await fireEvent.press(await screen.findByRole('link', { name: 'Gérer mes e-mails' }))

    expect(visited(mockPush, mockReplace)).toEqual(['/profile'])
  })

  it('says the link is invalid at once when its token is damaged, without calling the API', async () => {
    await open({ token: malformedToken })

    expect(screen.getByText('Lien invalide')).toBeTruthy()
    expect(
      screen.getByText(
        'Ce lien ne permet pas de te désinscrire. Connecte-toi pour gérer tes e-mails dans Mon profil.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirmer' })).toBeNull()
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('says the link is invalid when it has no token', async () => {
    await open({})

    expect(screen.getByText('Lien invalide')).toBeTruthy()
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('says the link is invalid when its token is far too long', async () => {
    await open({ token: `${recapToken}${'A'.repeat(300)}` })

    expect(screen.getByText('Lien invalide')).toBeTruthy()
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('reads only the first token when the address repeats it', async () => {
    await open({ token: [recapToken, malformedToken] })

    await confirm()

    expect(jest.mocked(unsubscribe).mock.calls[0]?.[0]).toBe(recapToken)
  })

  it('says the link is invalid when the API refuses it', async () => {
    // 400 unsubscribe_invalid : jeton faux, compte supprimé (l'API ne dit pas lequel).
    jest.mocked(unsubscribe).mockResolvedValue({ ok: false, error: 'validation' })
    await open({ token: recapToken })

    await confirm()

    expect(await screen.findByText('Lien invalide')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirmer' })).toBeNull()
    expect(screen.queryByText(/C’est fait/)).toBeNull()
  })

  it('says what went wrong and lets the member try again when the network fails', async () => {
    jest.mocked(unsubscribe).mockResolvedValueOnce({ ok: false, error: 'network' })
    await open({ token: recapToken })

    await confirm()

    expect(await screen.findByRole('alert')).toHaveTextContent(/Vérifie ta connexion et réessaie\./)
    // Le lien n'est pas invalide : « Confirmer » reste là, et un second essai part.
    expect(screen.queryByText('Lien invalide')).toBeNull()
    await confirm()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
    expect(
      await screen.findByText('C’est fait : tu ne recevras plus le récap de la semaine.'),
    ).toBeTruthy()
  })

  it('shows nothing that depends on the link before the page is hydrated, and sends nothing', async () => {
    // Pré-rendu web : la page ne connaît pas encore son adresse.
    jest.mocked(useHydrated).mockReturnValue(false)
    const { rerender } = await open({ token: recapToken })

    expect(screen.queryByRole('button', { name: 'Confirmer' })).toBeNull()
    expect(screen.queryByText('Ne plus recevoir le récap de la semaine ?')).toBeNull()
    expect(screen.queryByText('Lien invalide')).toBeNull()
    expect(unsubscribe).not.toHaveBeenCalled()

    // Témoin : une fois hydratée, la même page pose sa question.
    jest.mocked(useHydrated).mockReturnValue(true)
    await rerender(<UnsubscribeScreen />)
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeTruthy()
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('shows neither the name nor the address of the member, even signed in (R6)', async () => {
    mockSession({ user: { id: 'u1', name: 'Léa', email: 'lea@example.com' } })
    await open({ token: recapToken })
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeTruthy()
    expect(screen.queryByText(/Léa|lea@example\.com/)).toBeNull()

    await confirm()
    await fireEvent.press(await screen.findByRole('button', { name: 'Tout couper' }))

    await screen.findByText('C’est fait : tu ne recevras plus aucun e-mail de notification.')
    expect(screen.queryByText(/Léa|lea@example\.com/)).toBeNull()
  })
})
