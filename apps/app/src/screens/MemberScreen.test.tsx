// Tests de la page d'un membre. L'API (members/api) est remplacée par de faux appels.
import { BLOCKS_PER_DAY, UNBLOCKS_PER_DAY } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import { useBlock, useUnblock } from '../blocks/api'
import { useFollow } from '../follows/api'
import { getMember } from '../members/api'
import { getMe } from '../profile/api'
import { passTapGuard } from '../testing/dialog'
import { adminMe, leaMe } from '../testing/fixtures'
import { indefiniteSuspension, sevenDaySuspension, withParisEnd } from '../testing/moderation'
import { pathOf, reportsOpened, visited } from '../testing/navigation'
import {
  blockedLeaPage,
  draftProject,
  leaPage,
  projectWithPhotos,
  summaryOf,
} from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { blockSentences, containing, fr, missingSentences } from '../testing/text'
import { MemberScreen } from './MemberScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// Suivre : un faux hook, dont le test lit les appels (toggle) et choisit l'erreur.
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
// Bloquer et débloquer (tranche 7b) : de faux hooks, dont le test lit les appels.
jest.mock('../blocks/api', () => ({ useBlock: jest.fn(), useUnblock: jest.fn() }))
jest.mock('../members/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getMember = jest.fn()
  return {
    getMember,
    useMember: (id: string, enabled = true) =>
      useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled }),
  }
})
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
}))

const mockToggle = jest.fn()
const mockBlock = jest.fn()
const mockUnblock = jest.fn()

/** Ouvre le menu « … » de la page (ActionMenu), une fois la page arrivée. */
const openMenu = async () => {
  await fireEvent.press(
    await screen.findByRole('button', { name: fr.t(($) => $.actionMenu.label) }),
  )
}

beforeEach(() => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  mockToggle.mockReset()
  mockBlock.mockReset().mockResolvedValue({ ok: true, data: null })
  mockUnblock.mockReset().mockResolvedValue({ ok: true, data: null })
  jest
    .mocked(useBlock)
    .mockReset()
    .mockReturnValue({ block: mockBlock } as unknown as ReturnType<typeof useBlock>)
  jest
    .mocked(useUnblock)
    .mockReset()
    .mockReturnValue({ unblock: mockUnblock } as unknown as ReturnType<typeof useUnblock>)
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: mockToggle, error: false, expired: false })
  jest.mocked(getMember).mockReset().mockResolvedValue(leaPage)
  mockPush.mockReset()
  mockReplace.mockReset()
})

describe('MemberScreen', () => {
  it('shows the member, her favourite tools and her projects', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('header', { name: 'Léa' })).toBeTruthy()
    expect(screen.getByText('Je bricole des agents pour la maison.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Python' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    // La page d'un autre : pas de bouton pour modifier son profil.
    expect(screen.queryByRole('button', { name: 'Modifier mon profil' })).toBeNull()
  })

  it('shows her handle under her name (slice 6a)', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('header', { name: 'Léa' })).toBeTruthy()
    expect(screen.getByText('@lea')).toBeTruthy()
  })

  it('opens a project, and the page of a favourite tool', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await fireEvent.press(await screen.findByRole('link', { name: 'Mon agent de recettes' }))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/projects/[id]',
      params: { id: projectWithPhotos.id },
    })

    await fireEvent.press(screen.getByRole('link', { name: 'Python' }))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/tags/[slug]', params: { slug: 'python' } })
  })

  it('shows her own private projects to the member, marked as such, and lets her edit her profile', async () => {
    jest.mocked(getMember).mockResolvedValue({
      ...leaPage,
      isMe: true,
      projects: [summaryOf(draftProject), summaryOf(projectWithPhotos)],
    })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('link', { name: 'Mon brouillon' })).toBeTruthy()
    expect(screen.getByText('Privé')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Modifier mon profil' }))
    expect(mockPush).toHaveBeenCalledWith('/profile')
  })

  it('says when there is no project yet', async () => {
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, projects: [] })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByText('Pas encore de projet public.')).toBeTruthy()
  })

  it('says « not found » for an unknown or deleted member', async () => {
    jest.mocked(getMember).mockRejectedValue(new ApiError('notFound'))
    await renderWithProviders(<MemberScreen id="nobody" />)

    expect(await screen.findByRole('header', { name: 'Ce membre est introuvable' })).toBeTruthy()
  })

  it('asks a visitor to sign in, without calling the API', async () => {
    mockSession(null)
    await renderWithProviders(<MemberScreen id="u1" />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Me connecter' }))
    expect(getMember).not.toHaveBeenCalled()
    // Une fois connecté, il reviendra sur cette page.
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { next: '/page/actuelle' },
    })
  })

  it('also offers a visitor to create an account', async () => {
    mockSession(null)
    await renderWithProviders(<MemberScreen id="u1" />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Créer un compte' }))

    expect(mockPush).toHaveBeenCalledWith('/sign-up')
  })

  it('offers to sign in again when the session expired on the way', async () => {
    jest.mocked(getMember).mockRejectedValue(new ApiError('unauthorized'))
    await renderWithProviders(<MemberScreen id="u2" />)

    expect(await screen.findByRole('header', { name: 'Réservé aux membres' })).toBeTruthy()
    expect(screen.getByText('Ta session a expiré. Reconnecte-toi pour continuer.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Me connecter' })).toBeTruthy()
  })

  it('shows that it is trying again until the new answer arrives', async () => {
    jest.mocked(getMember).mockRejectedValueOnce(new Error('réseau coupé'))
    // La deuxième demande reste en attente : on regarde le bouton pendant ce temps.
    jest.mocked(getMember).mockReturnValueOnce(new Promise(() => {}))
    await renderWithProviders(<MemberScreen id="u2" />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Réessayer' }))

    // Sans donnée déjà reçue, la nouvelle tentative remet la page en chargement : le membre voit
    // que sa demande est partie.
    // Depuis Miel 2, le chargement est un squelette : « Chargement… » est son nom, plus un texte.
    expect(await screen.findByRole('progressbar', { name: 'Chargement…' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
  })

  it('offers to try again when the page could not load', async () => {
    jest.mocked(getMember).mockRejectedValueOnce(new Error('réseau coupé'))
    jest.mocked(getMember).mockResolvedValueOnce(leaPage)
    await renderWithProviders(<MemberScreen id="u2" />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Réessayer' }))

    expect(await screen.findByRole('header', { name: leaPage.name })).toBeTruthy()
  })

  it('offers to go back when the page takes long to load', async () => {
    // De fausses horloges : le test avance le temps lui-même, sans attendre 4 vraies secondes.
    jest.useFakeTimers()
    try {
      jest.mocked(getMember).mockReturnValue(new Promise(() => {}))
      await renderWithProviders(<MemberScreen id="u2" />)
      expect(screen.queryByRole('button', { name: 'Revenir' })).toBeNull()

      await act(() => jest.advanceTimersByTime(4000))

      expect(screen.getByRole('button', { name: 'Revenir' })).toBeTruthy()
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('following a member from her page', () => {
  it('offers to follow another member, and says how many follow her', async () => {
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, isFollowed: false, followerCount: 12 })
    await renderWithProviders(<MemberScreen id="u1" />)

    const button = await screen.findByRole('switch', { name: 'Suivre Léa' })
    expect(button).not.toBeChecked()
    expect(screen.getByText('Suivre')).toBeTruthy()
    expect(screen.getByText('12 abonnés')).toBeTruthy()
    expect(useFollow).toHaveBeenCalledWith({ kind: 'member', id: 'u1' })

    await fireEvent.press(button)

    expect(mockToggle).toHaveBeenCalledTimes(1)
  })

  it('shows that she is followed, and touching again stops following her', async () => {
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, isFollowed: true, followerCount: 13 })
    await renderWithProviders(<MemberScreen id="u1" />)

    // Une fois suivie, le nom lu dit « Tu suis Léa » (R3, planches), pour la commande vocale.
    const button = await screen.findByRole('switch', { name: 'Tu suis Léa' })
    expect(button).toBeChecked()
    expect(screen.getByText('Suivi')).toBeTruthy()
    expect(screen.getByText('13 abonnés')).toBeTruthy()

    await fireEvent.press(button)

    expect(mockToggle).toHaveBeenCalledTimes(1)
  })

  it('writes « abonné » in the singular for 0 and 1', async () => {
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, followerCount: 1 })
    const { unmount } = await renderWithProviders(<MemberScreen id="u1" />)
    expect(await screen.findByText('1 abonné')).toBeTruthy()
    await unmount()

    jest.mocked(getMember).mockResolvedValue({ ...leaPage, followerCount: 0 })
    await renderWithProviders(<MemberScreen id="u1" />)
    expect(await screen.findByText('0 abonné')).toBeTruthy()
  })

  it('offers no follow button on one’s own page, but still shows the count', async () => {
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, isMe: true, followerCount: 3 })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByText('3 abonnés')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('says so when the follow could not be saved', async () => {
    jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: true, expired: false })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'L’abonnement n’a pas pu être enregistré. Réessaie.',
    )
  })

  it('says to sign in again, not to retry, when the session expired', async () => {
    jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: true, expired: true })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
  })

  // Tranche 6c : à côté du message, un lien mène à la connexion, qui ramène ensuite sur cette page.
  it('offers a link to sign in again, back to this page, when the session expired', async () => {
    jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: true, expired: true })
    await renderWithProviders(<MemberScreen id="u1" />)

    await fireEvent.press(await screen.findByRole('link', { name: 'Me reconnecter' }))

    expect(visited(mockPush)).toEqual(['/sign-in?next=/page/actuelle'])
  })

  it('offers no sign-in link when the follow failed for another reason', async () => {
    jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: true, expired: false })
    await renderWithProviders(<MemberScreen id="u1" />)

    // Témoin : le message d'erreur est bien là.
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Me reconnecter' })).toBeNull()
  })
})

// --- Tranche 7a : signaler un profil ---

// Tranche 7b (décision de Louis du 24/10/2026, « pas un bouton par entrée ») : « Signaler ce
// profil » passe dans le menu « … » de la page (ActionMenu : un bouton « Plus d'actions » qui ouvre
// une liste d'actions, de rôle menuitem). Ces tests ouvrent donc d'abord le menu.
describe('reporting a member from her page', () => {
  it('offers to report the profile of another member through the « … » menu, and opens « Signaler » for her', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await openMenu()
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Signaler ce profil' }))

    // La page « Signaler » reçoit la sorte et l'identifiant de la cible (app/report.tsx).
    expect(reportsOpened(mockPush)).toEqual([expect.objectContaining({ kind: 'member', id: 'u1' })])
  })

  it('never offers to report one’s own profile, and shows no menu on one’s own page', async () => {
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, isMe: true })
    await renderWithProviders(<MemberScreen id="u1" />)

    // Témoin : la page est affichée.
    expect(await screen.findByRole('header', { name: 'Léa' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Signaler ce profil' })).toBeNull()
    // Ni signaler ni se bloquer soi-même : le menu n'aurait rien à offrir.
    expect(screen.queryByRole('button', { name: fr.t(($) => $.actionMenu.label) })).toBeNull()
  })

  it('no longer shows « Signaler ce profil » as a link of its own on the page', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(
      await screen.findByRole('button', { name: fr.t(($) => $.actionMenu.label) }),
    ).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Signaler ce profil' })).toBeNull()
  })
})

// --- Tranche 7b : bloquer un membre depuis sa page ---
//
// Scénario « Bloquer » : Malik choisit « Bloquer » dans le menu de la page d'Inès, lit ce qui va
// changer, et confirme. Interface attendue de `src/blocks/api.ts` (écrit par ui-dev) :
// `useBlock()` → `{ block(memberId) }` et `useUnblock()` → `{ unblock(memberId) }`, qui rendent un
// ApiResult et relisent la page du membre (['member', id]) une fois faits.

describe('blocking a member from her page', () => {
  const blockTitle = fr.t(($) => $.block.title, { handle: 'lea' })

  /**
   * Ouvre le menu, choisit « Bloquer » : la fenêtre de confirmation s'ouvre, et l'on attend la fin
   * de sa garde des tapes (Dialog `guardTaps`, corrections 7b) avant de la toucher.
   */
  const askToBlock = async () => {
    await openMenu()
    await fireEvent.press(screen.getByRole('menuitem', { name: fr.t(($) => $.block.action) }))
    await passTapGuard()
  }

  it('offers « Signaler ce profil » and « Bloquer » in the menu of another member’s page', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await openMenu()

    expect(screen.getByRole('menuitem', { name: 'Signaler ce profil' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Bloquer' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Débloquer' })).toBeNull()
  })

  it('asks first, saying what changes in both directions, the follows, and that she is not told', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToBlock()

    expect(screen.getByRole('header', { name: blockTitle })).toBeTruthy()
    // Règle 20 de la relecture du plan (J9) : tout ce que dit la fenêtre, phrase par phrase.
    expect(missingSentences(blockSentences('lea'), screen)).toEqual([])
    expect(mockBlock).not.toHaveBeenCalled()
  })

  it('blocks her once confirmed', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToBlock()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.block.confirm) }))

    expect(mockBlock).toHaveBeenCalledTimes(1)
    expect(mockBlock).toHaveBeenCalledWith('u1')
  })

  it('blocks nothing when the window is cancelled', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToBlock()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.block.cancel) }))

    expect(mockBlock).not.toHaveBeenCalled()
    expect(screen.queryByRole('header', { name: blockTitle })).toBeNull()
  })

  it('blocks only once for a double tap on « Bloquer »', async () => {
    let answer: (value: unknown) => void = () => {}
    mockBlock.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      }),
    )
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToBlock()
    const confirm = screen.getByRole('button', { name: fr.t(($) => $.block.confirm) })
    await fireEvent.press(confirm)
    await fireEvent.press(confirm)

    expect(mockBlock).toHaveBeenCalledTimes(1)
    await act(async () => answer({ ok: true, data: null }))
  })

  it('says so when the block could not be saved', async () => {
    mockBlock.mockResolvedValue({ ok: false, error: 'internal' })
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToBlock()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.block.confirm) }))

    expect(await screen.findByText(containing(fr.t(($) => $.block.error)))).toBeTruthy()
  })

  it('says when the daily limit of blocks is reached', async () => {
    mockBlock.mockResolvedValue({ ok: false, error: 'rateLimited' })
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToBlock()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.block.confirm) }))

    expect(
      await screen.findByText(containing(fr.t(($) => $.block.limited, { max: BLOCKS_PER_DAY }))),
    ).toBeTruthy()
  })

  it('shows the blocked page at once, with the same notice as once read again, read politely', async () => {
    // Relecture de l'interface 7b (ui-3) : un seul texte, avant et après la relecture de la page,
    // lu sans interrompre (role « status », pas « alert »).
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToBlock()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.block.confirm) }))

    const notice = await screen.findByText(
      containing(fr.t(($) => $.block.notice, { handle: 'lea' })),
    )
    expect(notice).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Débloquer @lea' })).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Suivre Léa' })).toBeNull()
  })
})

describe('the page of a member I blocked', () => {
  beforeEach(() => {
    jest.mocked(getMember).mockResolvedValue(blockedLeaPage)
  })

  /** Touche « Débloquer » sur la page, puis attend la fin de la garde des tapes de la fenêtre. */
  const askToUnblock = async () => {
    await fireEvent.press(await screen.findByRole('button', { name: 'Débloquer @lea' }))
    await passTapGuard()
  }

  it('shows her header only, and says she is blocked', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('header', { name: 'Léa' })).toBeTruthy()
    // L'en-tête reste : nom et pseudo.
    expect(screen.getByText('@lea')).toBeTruthy()
    expect(
      screen.getAllByText(containing(fr.t(($) => $.block.notice, { handle: 'lea' }))).length,
    ).toBeGreaterThan(0)
  })

  it('shows neither her projects, nor « no project yet », nor a follow button, nor her followers', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await screen.findByRole('header', { name: 'Léa' })
    expect(screen.queryByRole('link', { name: 'Mon agent de recettes' })).toBeNull()
    expect(screen.queryByText(containing(fr.t(($) => $.member.empty)))).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Suivre Léa' })).toBeNull()
    expect(screen.queryByText(/abonnés?$/)).toBeNull()
  })

  it('offers « Débloquer » as a button of the page, and « Signaler ce profil » in the menu, not « Bloquer »', async () => {
    // Corrections 7b (design-4) : « Débloquer » se voit sous « Tu as bloqué @lea. », au lieu d'être
    // caché dans le menu ; son nom lu dit qui.
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('button', { name: 'Débloquer @lea' })).toBeTruthy()
    await openMenu()

    expect(screen.getByRole('menuitem', { name: 'Signaler ce profil' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Débloquer' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Bloquer' })).toBeNull()
  })

  it('lets her profile be reported after the block', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await openMenu()
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Signaler ce profil' }))

    expect(reportsOpened(mockPush)).toEqual([expect.objectContaining({ kind: 'member', id: 'u1' })])
  })

  it('asks before unblocking, saying the follows do not come back, then unblocks her', async () => {
    // Règle 21 de la relecture du plan (J10) : « Débloquer » passe par une fenêtre.
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToUnblock()

    expect(
      screen.getByRole('header', { name: fr.t(($) => $.block.unblockTitle, { handle: 'lea' }) }),
    ).toBeTruthy()
    // Relecture juridique R7 : le texte dit aussi que les anciennes notifications peuvent revenir.
    expect(
      screen.getAllByText(containing(fr.t(($) => $.block.unblockMessage))).length,
    ).toBeGreaterThan(0)
    expect(mockUnblock).not.toHaveBeenCalled()

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.block.unblockConfirm) }))

    expect(mockUnblock).toHaveBeenCalledTimes(1)
    expect(mockUnblock).toHaveBeenCalledWith('u1')
    expect(
      await screen.findByText(containing(fr.t(($) => $.block.unblocked, { handle: 'lea' }))),
    ).toBeTruthy()
  })

  it('unblocks nothing when the window is cancelled', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToUnblock()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.block.cancel) }))

    expect(mockUnblock).not.toHaveBeenCalled()
  })

  it('says when the daily limit of unblocks is reached, with its own number', async () => {
    // Corrections 7b (ui-2) : le quota des déblocages a son message, comme dans la liste.
    mockUnblock.mockResolvedValue({ ok: false, error: 'rateLimited' })
    await renderWithProviders(<MemberScreen id="u1" />)

    await askToUnblock()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.block.unblockConfirm) }))

    expect(
      await screen.findByText(
        containing(fr.t(($) => $.block.unblockLimited, { max: UNBLOCKS_PER_DAY })),
      ),
    ).toBeTruthy()
  })
})

describe('the page of a member who blocked me', () => {
  it('says « not found », as for an unknown member, without a word on the block', async () => {
    // L'API répond 404, la même réponse qu'un membre inconnu (règle 6 de la relecture du plan).
    // Ce cas passe déjà avant la tranche (NotFoundState) : le témoin est qu'aucun texte ne trahit
    // le blocage et qu'aucun menu n'est offert.
    jest.mocked(getMember).mockRejectedValue(new ApiError('notFound'))
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('header', { name: 'Ce membre est introuvable' })).toBeTruthy()
    expect(screen.queryByText(/bloqu/i)).toBeNull()
    expect(screen.queryByRole('button', { name: fr.t(($) => $.actionMenu.label) })).toBeNull()
  })
})

// --- Tranche 7c : la modération depuis la page d'un membre ---
//
// Scénario « Suspendre un compte » et « L'historique des décisions » : sur la page de Léa, un
// administrateur trouve dans le menu « … » « Suspendre le compte » (ou « Lever la suspension »)
// et « Historique de modération » ; il lit « Compte suspendu jusqu'au … » quand elle l'est. Rien de
// tout cela pour un autre membre : l'API ne lui envoie pas `Member.moderation` (null). Et un
// membre suspendu n'a plus « Suivre » (`Me.suspension`, lu par `useSuspension()`, qui lit
// `useMe`, donc `getMe` ici).

describe('the moderation from the page of a member', () => {
  const menuItem = (name: string) => screen.getByRole('menuitem', { name })
  const suspendItem = fr.t(($) => $.moderation.memberMenu.suspend)
  const liftItem = fr.t(($) => $.moderation.memberMenu.lift)
  const historyItem = fr.t(($) => $.moderation.memberMenu.history)

  /** Léa, vue par un administrateur : pas suspendue, et elle peut l'être. */
  const leaForAdmin = {
    ...leaPage,
    moderation: { isAdmin: false, suspension: null, decisions: 2, canSuspend: true },
  }
  /** Léa suspendue 7 jours : fin le 3 novembre à 0 h 30, heure de Paris. */
  const suspendedLea = {
    ...leaPage,
    moderation: {
      isAdmin: false,
      suspension: sevenDaySuspension,
      decisions: 3,
      canSuspend: false,
    },
  }

  beforeEach(() => {
    mockSession({ user: { id: adminMe.id, name: adminMe.name } })
    jest.mocked(getMe).mockReset().mockResolvedValue(adminMe)
  })

  it('offers an administrator to suspend the account, and leads to « Suspendre »', async () => {
    jest.mocked(getMember).mockResolvedValue(leaForAdmin)
    await renderWithProviders(<MemberScreen id="u1" />)

    await openMenu()
    await fireEvent.press(menuItem(suspendItem))

    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual(['/suspend?member=u1'])
    expect(screen.queryByRole('menuitem', { name: liftItem })).toBeNull()
  })

  it('offers an administrator the history of the decisions aimed at the member', async () => {
    jest.mocked(getMember).mockResolvedValue(leaForAdmin)
    await renderWithProviders(<MemberScreen id="u1" />)

    await openMenu()
    await fireEvent.press(menuItem(historyItem))

    const [path] = mockPush.mock.calls.map(([href]) => pathOf(href))
    expect(path?.split('?')[0]).toBe('/moderation')
    expect(Object.fromEntries(new URLSearchParams(path?.split('?')[1]))).toEqual({
      tab: 'history',
      member: 'u1',
    })
  })

  it('offers « Lever la suspension » instead for a suspended member, on the same page', async () => {
    jest.mocked(getMember).mockResolvedValue(suspendedLea)
    await renderWithProviders(<MemberScreen id="u1" />)

    await openMenu()
    expect(screen.queryByRole('menuitem', { name: suspendItem })).toBeNull()
    await fireEvent.press(menuItem(liftItem))

    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual(['/suspend?member=u1'])
  })

  it('offers no suspension of another administrator, but still the history', async () => {
    jest.mocked(getMember).mockResolvedValue({
      ...leaPage,
      moderation: { isAdmin: true, suspension: null, decisions: 0, canSuspend: false },
    })
    await renderWithProviders(<MemberScreen id="u1" />)

    await openMenu()

    expect(menuItem(historyItem)).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: suspendItem })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: liftItem })).toBeNull()
  })

  it('tells an administrator until when the member is suspended, at the hour of Paris (J4)', async () => {
    // La fin, 23 h 30 UTC le 2 novembre, s'écrit le 3 novembre à 0 h 30. Sur ce PC (Europe/Paris),
    // une heure de l'appareil passerait aussi ; la CI, en UTC, la refuse.
    jest.mocked(getMember).mockResolvedValue(suspendedLea)
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(
      await screen.findByText(
        withParisEnd(fr.t(($) => $.moderation.memberSuspended, { date: 'DATE', time: 'TIME' })),
      ),
    ).toBeTruthy()
  })

  it('tells an administrator when the suspension has no end', async () => {
    jest.mocked(getMember).mockResolvedValue({
      ...suspendedLea,
      moderation: {
        isAdmin: false,
        suspension: indefiniteSuspension,
        decisions: 1,
        canSuspend: false,
      },
    })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(
      await screen.findByText(containing(fr.t(($) => $.moderation.memberSuspendedIndefinite))),
    ).toBeTruthy()
  })

  it('shows nothing of the moderation to another member', async () => {
    // L'API n'envoie `moderation` qu'aux administrateurs : null pour Max.
    mockSession({ user: { id: 'u2', name: 'Max' } })
    jest.mocked(getMe).mockResolvedValue({ ...leaMe, id: 'u2', name: 'Max', handle: 'max' })
    jest.mocked(getMember).mockResolvedValue(leaPage)
    await renderWithProviders(<MemberScreen id="u1" />)

    await openMenu()

    expect(screen.getByRole('menuitem', { name: 'Signaler ce profil' })).toBeTruthy() // témoin
    for (const name of [suspendItem, liftItem, historyItem]) {
      expect(screen.queryByRole('menuitem', { name })).toBeNull()
    }
    expect(screen.queryByText(/Compte suspendu/)).toBeNull()
  })
})

describe('the page of a member, seen by a suspended member', () => {
  it('offers no « Suivre », but still shows how many follow her', async () => {
    // Scénario « Un compte suspendu » : Max ne peut plus suivre ; la page reste lisible.
    jest.mocked(getMe).mockResolvedValue({
      ...leaMe,
      id: 'u2',
      name: 'Max',
      handle: 'max',
      suspension: sevenDaySuspension,
    })
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, isFollowed: false, followerCount: 12 })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByText('12 abonnés')).toBeTruthy() // témoin
    await waitFor(() => expect(screen.queryByRole('switch', { name: 'Suivre Léa' })).toBeNull())
    expect(screen.queryByText('Suivre')).toBeNull()
  })

  it('still offers « Suivre » to a member who is not suspended', async () => {
    // Témoin du précédent : le même visiteur, sans suspension, a son bouton.
    jest.mocked(getMe).mockResolvedValue({ ...leaMe, id: 'u2', name: 'Max', handle: 'max' })
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, isFollowed: false, followerCount: 12 })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('switch', { name: 'Suivre Léa' })).toBeTruthy()
  })
})

// Décision de Louis (26/10/2026, choix a) : un membre suspendu peut retirer ce qu'il a déjà donné,
// jamais ajouter (scénario : « retirer ses réactions et ses abonnements »). S'il suit déjà ce
// membre, « Suivi » reste pour ne plus le suivre ; le suivi retiré, le bouton reste à sa place
// (le focus avec lui), mais inactif : il ne suit pas de nouveau.
describe('the page of a member a suspended member already follows', () => {
  const suspendedMax = {
    ...leaMe,
    id: 'u2',
    name: 'Max',
    handle: 'max',
    suspension: sevenDaySuspension,
  }

  it('keeps « Suivi » so that he can stop following her', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMax)
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, isFollowed: true, followerCount: 13 })
    await renderWithProviders(<MemberScreen id="u1" />)

    // Le profil arrivé (la suspension est connue), le bouton est toujours là.
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await act(async () => {})
    const button = await screen.findByRole('switch', { name: 'Tu suis Léa' })
    await fireEvent.press(button)

    expect(mockToggle).toHaveBeenCalledTimes(1)
  })

  it('keeps the button in place, but inactive, once he no longer follows her', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMax)
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, isFollowed: true, followerCount: 13 })
    const { queryClient } = await renderWithProviders(<MemberScreen id="u1" />)
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await screen.findByRole('switch', { name: 'Tu suis Léa' })

    // Le suivi retiré (ce que fait la mise à jour optimiste de useFollow) : la page le dit aussitôt.
    await act(async () => {
      queryClient.setQueryData(['member', 'u1'], {
        ...leaPage,
        isFollowed: false,
        followerCount: 12,
      })
    })

    expect(await screen.findByRole('switch', { name: 'Suivre Léa' })).toBeDisabled()
  })
})
