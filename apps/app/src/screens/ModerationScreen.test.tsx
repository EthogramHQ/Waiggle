// Tests de la page « Modération » (tranche 7a) : Louis, administrateur, voit les signalements en
// attente, du plus ancien au plus récent, retire un contenu (avec un fondement et une explication)
// ou classe le signalement sans suite, et rétablit un contenu retiré. Pour tout autre membre, la
// page n'existe pas.
//
// L'interface attendue de `src/moderation/api.ts` (écrit par ui-dev) :
// - `useModerationQueue()` : la file (useInfiniteQuery, pages `ModerationQueuePage`) ;
// - `useRemovedItems()` : les contenus retirés (useInfiniteQuery, pages `RemovedPage`) ;
// - `useDecide()` : `{ decide }`, où `decide(input: ModerationDecisionInput)` rend un `ApiResult`
//   (`{ ok: true, data }` ou `{ ok: false, error }`) et met les listes à jour.
// Qui est administrateur : `me.isAdmin` (GET /v1/me, par `useMe`), et l'API, qui répond 404.
import {
  type DecisionHistoryPage,
  MODERATION_DECISIONS_PER_DAY,
  type ModerationQueuePage,
  REMOVALS_BEFORE_PASSWORD,
  type RemovedPage,
  SUSPENSIONS_BEFORE_PASSWORD,
} from '@ruche/contracts'
import { act, fireEvent, screen, within } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import {
  useDecide,
  useDecisionHistory,
  useModerationQueue,
  useRemovedItems,
} from '../moderation/api'
import { getMe } from '../profile/api'
import { passTapGuard } from '../testing/dialog'
import { adminMe, leaMe } from '../testing/fixtures'
import {
  decisionHistoryPageOf,
  fakeReviewsItem,
  firstTextOf,
  goneTargetDecision,
  impersonationItem,
  meteoProjectId,
  moderationQueuePageOf,
  ownNoteItem,
  removeDecision,
  removedCommentItem,
  removedPageOf,
  samDecisions,
  scamCommentItem,
  suspendDecision,
} from '../testing/moderation'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ModerationScreen } from './ModerationScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// Le profil dit si le membre est administrateur (et sert à l'avatar de la barre de navigation).
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// La file, les retirés et les décisions : de faux hooks, choisis par chaque test.
jest.mock('../moderation/api', () => ({
  useModerationQueue: jest.fn(),
  useRemovedItems: jest.fn(),
  useDecide: jest.fn(),
  // Tranche 7c : l'historique des décisions.
  useDecisionHistory: jest.fn(),
}))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockSetParams = jest.fn()
/**
 * Les paramètres de l'adresse (tranche 7c : `?tab=history&member=u5`), choisis par chaque test.
 * `router.setParams` les change, comme le ferait Expo Router.
 */
let mockParams: Record<string, string | undefined> = {}
jest.mock('expo-router', () => ({
  usePathname: () => '/moderation',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    setParams: mockSetParams,
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockParams,
}))

/**
 * Ce que rend un useInfiniteQuery de React Query : les pages déjà reçues, et de quoi lire la suite
 * (fetchNextPage) ou tout relire (refetch). `error` : la lecture a échoué.
 */
const infinite = <Page,>(pages: Page[], { hasNextPage = false, error = null as unknown } = {}) => ({
  data: error ? undefined : { pages, pageParams: pages.map(() => undefined) },
  status: error ? 'error' : 'success',
  isPending: false,
  isLoading: false,
  isSuccess: !error,
  isError: Boolean(error),
  isFetchNextPageError: false,
  error,
  hasNextPage,
  isFetchingNextPage: false,
  isRefetching: false,
  fetchNextPage: jest.fn().mockResolvedValue(undefined),
  refetch: jest.fn().mockResolvedValue(undefined),
})

const mockQueue = (pages: ModerationQueuePage[], options?: Parameters<typeof infinite>[1]) => {
  const result = infinite(pages, options)
  jest
    .mocked(useModerationQueue)
    .mockReturnValue(result as unknown as ReturnType<typeof useModerationQueue>)
  return result
}

const mockRemoved = (pages: RemovedPage[], options?: Parameters<typeof infinite>[1]) => {
  const result = infinite(pages, options)
  jest
    .mocked(useRemovedItems)
    .mockReturnValue(result as unknown as ReturnType<typeof useRemovedItems>)
  return result
}

/**
 * Tranche 7c : `useDecisionHistory(member?: string, enabled = true)`, l'historique (pages
 * `DecisionHistoryPage`), filtré sur un membre si `member` est donné, demandé seulement quand son
 * onglet est ouvert (`enabled`), comme les retirés.
 */
const mockHistory = (pages: DecisionHistoryPage[], options?: Parameters<typeof infinite>[1]) => {
  const result = infinite(pages, options)
  jest
    .mocked(useDecisionHistory)
    .mockReturnValue(result as unknown as ReturnType<typeof useDecisionHistory>)
  return result
}

const mockDecide = jest.fn()
const decided = { ok: true, data: { id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' } }

beforeEach(() => {
  mockSession({ user: { id: adminMe.id, name: adminMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(adminMe)
  mockQueue([moderationQueuePageOf()])
  mockRemoved([removedPageOf()])
  mockDecide.mockReset().mockResolvedValue(decided)
  jest
    .mocked(useDecide)
    .mockReset()
    .mockReturnValue({ decide: mockDecide } as unknown as ReturnType<typeof useDecide>)
  mockPush.mockReset()
  mockReplace.mockReset()
  mockParams = {}
  // Expo Router change l'adresse : setParams y mêle les nouveaux paramètres ; push et replace vers
  // /moderation la remplacent. L'écran les relit au rendu suivant.
  mockSetParams.mockReset().mockImplementation((params: Record<string, string | undefined>) => {
    mockParams = { ...mockParams, ...params }
  })
  for (const mock of [mockPush, mockReplace]) {
    mock.mockImplementation((href: unknown) => {
      const path = pathOf(href)
      if (path === '/moderation' || path.startsWith('/moderation?')) {
        mockParams = Object.fromEntries(new URLSearchParams(path.slice('/moderation'.length)))
      }
    })
  }
  mockHistory([decisionHistoryPageOf()])
})

afterEach(() => {
  jest.useRealTimers()
})

/** La carte d'un signalement : on remonte depuis son texte jusqu'à l'ensemble qui porte « Voir ». */
const cardOf = (text: string) => {
  let node = screen.getByText(text).parent
  while (node && within(node).queryAllByRole('link').length === 0) node = node.parent
  if (!node) throw new Error(`no card around ${text}`)
  return within(node)
}

/** Le contenu de la fenêtre qui porte ce titre (comme dans ProjectScreen.test.tsx). */
const dialogTitled = (title: string) => {
  let node = screen.getByRole('header', { name: title }).parent
  while (node && within(node).queryAllByRole('button').length === 0) node = node.parent
  if (!node) throw new Error(`no dialog titled ${title}`)
  return within(node)
}

/** Ouvre la page, en attendant le profil (qui dit si le membre est administrateur). */
const openModeration = async () => {
  await renderWithProviders(<ModerationScreen />)
  await screen.findByText(firstTextOf(scamCommentItem))
}

describe('who sees the moderation', () => {
  it('shows an administrator the pending reports and the removed contents', async () => {
    await renderWithProviders(<ModerationScreen />)

    expect(await screen.findByRole('header', { name: 'Modération' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'En attente', checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Retirés', checked: false })).toBeTruthy()
    expect(screen.getByText(firstTextOf(scamCommentItem))).toBeTruthy()
    // Le groupe d'onglets porte un nom à lui, pas celui de la page (relecture de 7a).
    // (Le groupe n'est pas « accessible » : il se cherche par son nom, comme dans components.test.)
    expect(screen.getByLabelText(fr.t(($) => $.moderation.list)).props.accessibilityRole).toBe(
      'radiogroup',
    )
  })

  it('recalls the content to remove in the « Retirer » window', async () => {
    await openModeration()

    await fireEvent.press(
      cardOf(firstTextOf(scamCommentItem)).getByRole('button', { name: 'Retirer' }),
    )

    // Le texte paraît deux fois : sur la carte, et rappelé dans la fenêtre.
    expect(screen.getAllByText(firstTextOf(scamCommentItem))).toHaveLength(2)
  })

  it('says « not found » to a member who is not an administrator, and shows nothing of the queue', async () => {
    jest.mocked(getMe).mockResolvedValue(leaMe)
    await renderWithProviders(<ModerationScreen />)

    expect(await screen.findByRole('button', { name: 'Retour à l’accueil' })).toBeTruthy()
    expect(screen.queryByText(firstTextOf(scamCommentItem))).toBeNull()
    expect(screen.queryByRole('radio', { name: 'En attente' })).toBeNull()
  })

  it('says « not found » when the API does not know the page (a revoked administrator)', async () => {
    // L'API refait la vérification à chaque requête : 404, comme une route qui n'existe pas.
    mockQueue([], { error: new ApiError('notFound') })
    await renderWithProviders(<ModerationScreen />)

    expect(await screen.findByRole('button', { name: 'Retour à l’accueil' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
  })

  it('shows nothing of the queue to a visitor', async () => {
    mockSession(null)
    await renderWithProviders(<ModerationScreen />)

    // Témoin : la page dit quelque chose (se connecter, ou introuvable)…
    expect(
      await screen.findByRole('button', { name: /^(Me connecter|Retour à l’accueil)$/ }),
    ).toBeTruthy()
    // … mais rien de la file.
    expect(screen.queryByText(firstTextOf(scamCommentItem))).toBeNull()
  })
})

describe('the pending reports', () => {
  it('keeps the order of the API, from the oldest report to the most recent', async () => {
    await openModeration()

    const snapshots = [scamCommentItem, fakeReviewsItem, impersonationItem, ownNoteItem].map(
      (item) => firstTextOf(item),
    )
    // Les textes signalés, dans l'ordre où ils apparaissent à l'écran.
    const shown = screen
      .getAllByText(new RegExp(`^(${snapshots.map((s) => containing(s).source).join('|')})$`))
      .map((node) => [node.props.children].flat().join(''))
    expect(shown).toEqual(snapshots)
  })

  it('shows the kind, the text reported, the reasons with their count, the details and the date', async () => {
    await openModeration()

    const card = cardOf(firstTextOf(scamCommentItem))
    expect(card.getByText('Commentaire')).toBeTruthy()
    expect(card.getByText(containing(fr.t(($) => $.moderation.count, { count: 3 })))).toBeTruthy()
    // Le format du motif et de son nombre vient des textes (« Arnaque ou spam : 2 » depuis 8e26421).
    const reasonCount = (reason: string, count: number) =>
      containing(fr.t(($) => $.moderation.reasonCount, { reason, count }))
    expect(card.getByText(reasonCount('Arnaque ou spam', 2))).toBeTruthy()
    expect(card.getByText(reasonCount('Harcèlement ou haine', 1))).toBeTruthy()
    expect(card.getByText('Il a écrit la même chose sous trois projets.')).toBeTruthy()
    expect(card.getByText(/Premier signalement le /)).toBeTruthy()
    expect(card.getByText(containing(fr.t(($) => $.moderation.snapshot)))).toBeTruthy()
  })

  it('never says who reported', async () => {
    await openModeration()

    // La file n'a aucun champ pour la personne qui signale (contrat strict) : rien à afficher.
    expect(screen.queryByText(/Malik|Inès/)).toBeNull()
  })

  it('leads to the project of a reported comment through « Voir »', async () => {
    await openModeration()

    await fireEvent.press(cardOf(firstTextOf(scamCommentItem)).getByRole('link', { name: 'Voir' }))

    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual([
      `/projects/${meteoProjectId}`,
    ])
  })

  it('leads to the page of a reported member through « Voir »', async () => {
    await openModeration()

    await fireEvent.press(
      cardOf(firstTextOf(impersonationItem)).getByRole('link', { name: 'Voir' }),
    )

    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual(['/members/u7'])
  })

  it('offers no decision on what concerns the administrator, and says why', async () => {
    await openModeration()

    const card = cardOf(firstTextOf(ownNoteItem))
    expect(card.getByText(containing(fr.t(($) => $.moderation.concernsMe)))).toBeTruthy()
    expect(card.queryByRole('button', { name: 'Retirer' })).toBeNull()
    expect(card.queryByRole('button', { name: 'Classer sans suite' })).toBeNull()
    // Témoin : un autre signalement, lui, se décide.
    expect(
      cardOf(firstTextOf(scamCommentItem)).getByRole('button', { name: 'Retirer' }),
    ).toBeTruthy()
  })

  it('offers only « Classer sans suite » for a profile', async () => {
    // L'API refuse de « retirer » un profil (422) : les actions sur un compte viennent plus tard.
    await openModeration()

    const card = cardOf(firstTextOf(impersonationItem))
    expect(card.getByRole('button', { name: 'Classer sans suite' })).toBeTruthy()
    expect(card.queryByRole('button', { name: 'Retirer' })).toBeNull()
  })

  it('says when there is no report waiting', async () => {
    mockQueue([moderationQueuePageOf([])])
    await renderWithProviders(<ModerationScreen />)

    expect(await screen.findByText('Aucun signalement en attente.')).toBeTruthy()
  })

  it('loads the next ones on request', async () => {
    const queue = mockQueue([moderationQueuePageOf(undefined, 'suite')], { hasNextPage: true })
    await openModeration()

    await fireEvent.press(screen.getByRole('button', { name: 'Afficher la suite' }))

    expect(queue.fetchNextPage).toHaveBeenCalledTimes(1)
  })

  it('offers to try again when the queue could not load', async () => {
    const queue = mockQueue([], { error: new ApiError('internal') })
    await renderWithProviders(<ModerationScreen />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Réessayer' }))

    expect(queue.refetch).toHaveBeenCalled()
  })
})

describe('removing a content', () => {
  /** Ouvre « Retirer » sur le commentaire de Sam. */
  const openRemove = async () => {
    await openModeration()
    await fireEvent.press(
      cardOf(firstTextOf(scamCommentItem)).getByRole('button', { name: 'Retirer' }),
    )
    // Tranche 7c : la fenêtre garde ses boutons des tapes juste après l'ouverture (`guardTaps`) ;
    // on attend la fin de cette garde avant de la toucher (test adapté à la décision du plan 7c).
    await passTapGuard()
    return dialogTitled('Retirer ce contenu ?')
  }

  it('asks for the ground, the law or the rules, then an explanation shown to the author', async () => {
    // Règle 21 de la relecture du plan.
    const dialog = await openRemove()

    expect(dialog.getByText(containing(fr.t(($) => $.moderation.removeMessage)))).toBeTruthy()
    expect(dialog.getByRole('radio', { name: 'La loi' })).toBeTruthy()
    expect(
      dialog.getByRole('radio', { name: fr.t(($) => $.moderation.grounds.rules) }),
    ).toBeTruthy()
    expect(dialog.getByLabelText('Explication')).toBeTruthy()
    expect(dialog.getByText(containing(fr.t(($) => $.moderation.explanationHint)))).toBeTruthy()
  })

  it('removes nothing without an explanation', async () => {
    const dialog = await openRemove()

    await fireEvent.press(
      dialog.getByRole('radio', { name: fr.t(($) => $.moderation.grounds.rules) }),
    )
    await fireEvent.press(dialog.getByRole('button', { name: 'Retirer' }))

    expect(mockDecide).not.toHaveBeenCalled()
  })

  it('removes nothing without a ground', async () => {
    const dialog = await openRemove()

    await fireEvent.changeText(dialog.getByLabelText('Explication'), 'Arnaque à la carte bancaire.')
    await fireEvent.press(dialog.getByRole('button', { name: 'Retirer' }))

    expect(mockDecide).not.toHaveBeenCalled()
  })

  it('removes the content with its ground and explanation, and says so', async () => {
    const dialog = await openRemove()

    await fireEvent.press(
      dialog.getByRole('radio', { name: fr.t(($) => $.moderation.grounds.rules) }),
    )
    await fireEvent.changeText(dialog.getByLabelText('Explication'), 'Arnaque à la carte bancaire.')
    await fireEvent.press(dialog.getByRole('button', { name: 'Retirer' }))

    expect(mockDecide).toHaveBeenCalledTimes(1)
    expect(mockDecide).toHaveBeenCalledWith({
      action: 'remove',
      target: scamCommentItem.target,
      ground: 'rules',
      explanation: 'Arnaque à la carte bancaire.',
    })
    expect(await screen.findByText('Contenu retiré.')).toBeTruthy()
  })

  it('decides nothing when cancelled', async () => {
    const dialog = await openRemove()

    await fireEvent.press(dialog.getByRole('button', { name: 'Annuler' }))

    expect(mockDecide).not.toHaveBeenCalled()
    expect(screen.queryByRole('header', { name: 'Retirer ce contenu ?' })).toBeNull()
  })

  it('says when a decision was taken meanwhile', async () => {
    mockDecide.mockResolvedValue({ ok: false, error: 'alreadyDecided' })
    const dialog = await openRemove()

    await fireEvent.press(dialog.getByRole('radio', { name: 'La loi' }))
    await fireEvent.changeText(dialog.getByLabelText('Explication'), 'Photos sans accord.')
    await fireEvent.press(dialog.getByRole('button', { name: 'Retirer' }))

    expect(await screen.findByText(containing(fr.t(($) => $.errors.alreadyDecided)))).toBeTruthy()
    expect(screen.queryByText('Contenu retiré.')).toBeNull()
  })
})

describe('dismissing a report', () => {
  it('dismisses in one gesture, and says so', async () => {
    await openModeration()

    await fireEvent.press(
      cardOf(firstTextOf(scamCommentItem)).getByRole('button', { name: 'Classer sans suite' }),
    )

    expect(mockDecide).toHaveBeenCalledWith({ action: 'dismiss', target: scamCommentItem.target })
    expect(await screen.findByText('Signalement classé sans suite.')).toBeTruthy()
  })

  /**
   * Classe le commentaire de Sam ; la file se met à jour, et le projet de Nora prend sa place sous
   * le doigt. Rend le bouton « Classer sans suite » de ce projet.
   */
  const dismissFirst = async () => {
    const { rerender } = await renderWithProviders(<ModerationScreen />)
    await screen.findByText(firstTextOf(scamCommentItem))
    await fireEvent.press(
      cardOf(firstTextOf(scamCommentItem)).getByRole('button', { name: 'Classer sans suite' }),
    )
    mockQueue([moderationQueuePageOf([fakeReviewsItem])])
    await rerender(<ModerationScreen />)
    return cardOf(firstTextOf(fakeReviewsItem)).getByRole('button', { name: 'Classer sans suite' })
  }

  it('ignores the next « Classer sans suite » touched right after, as the second tap of a double tap', async () => {
    // La garde de 600 ms de la charte du design : la carte suivante remonte sous le doigt.
    jest.useFakeTimers()
    const next = await dismissFirst()

    await act(() => jest.advanceTimersByTime(200))
    await fireEvent.press(next)

    expect(mockDecide).toHaveBeenCalledTimes(1)
  })

  it('keeps the decided card in its place, the outcome instead of its buttons', async () => {
    // Relecture de 7a : la carte retirée de la liste faisait remonter le « Classer » suivant sous
    // le doigt. La file mise à jour n'a plus le commentaire de Sam ; l'écran le garde, premier.
    await dismissFirst()

    const shown = screen
      .getAllByText(
        new RegExp(
          `^(${containing(firstTextOf(scamCommentItem)).source}|${containing(firstTextOf(fakeReviewsItem)).source})$`,
        ),
      )
      .map((node) => [node.props.children].flat().join(''))
    expect(shown).toEqual([firstTextOf(scamCommentItem), firstTextOf(fakeReviewsItem)])
    const decidedCard = cardOf(firstTextOf(scamCommentItem))
    expect(decidedCard.getByRole('status', { name: 'Signalement classé sans suite.' })).toBeTruthy()
    expect(decidedCard.queryByRole('button')).toBeNull()
  })

  it('dismisses the next one touched once the first has had time to be read', async () => {
    jest.useFakeTimers()
    const next = await dismissFirst()

    // Témoin : le même appui, 700 ms plus tard, part bien.
    await act(() => jest.advanceTimersByTime(700))
    await fireEvent.press(next)

    expect(mockDecide).toHaveBeenCalledTimes(2)
    expect(mockDecide).toHaveBeenLastCalledWith({
      action: 'dismiss',
      target: fakeReviewsItem.target,
    })
  })
})

describe('the removed contents', () => {
  /** Passe à l'onglet « Retirés ». */
  const openRemoved = async () => {
    await openModeration()
    await fireEvent.press(screen.getByRole('radio', { name: 'Retirés' }))
  }

  it('lists the removed contents, with their ground and explanation', async () => {
    await openRemoved()

    expect(await screen.findByText(containing(removedCommentItem.text))).toBeTruthy()
    expect(screen.getAllByText(containing(removedCommentItem.explanation)).length).toBeGreaterThan(
      0,
    )
    expect(screen.getAllByText(/Retiré le /).length).toBeGreaterThan(0)
  })

  it('restores a removed content, and says so', async () => {
    await openRemoved()

    const card = cardOf(removedCommentItem.text)
    await fireEvent.press(card.getByRole('button', { name: 'Rétablir' }))

    expect(mockDecide).toHaveBeenCalledWith({
      action: 'restore',
      target: removedCommentItem.target,
    })
    expect(await screen.findByText('Contenu rétabli.')).toBeTruthy()
  })

  it('leads to the project of a removed comment, and nowhere for a removed project', async () => {
    // Relecture de 7a : un projet retiré n'a plus de page, même pour l'administrateur.
    await openRemoved()

    await fireEvent.press(
      cardOf(removedCommentItem.text).getByRole('link', { name: 'Voir le projet' }),
    )

    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual([
      `/projects/${meteoProjectId}`,
    ])
    expect(screen.getAllByRole('link', { name: /^Voir/ })).toHaveLength(1)
  })

  it('says when nothing has been removed', async () => {
    mockRemoved([removedPageOf([])])
    await openRemoved()

    expect(await screen.findByText('Aucun contenu retiré.')).toBeTruthy()
  })
})

// --- Tranche 7b : la copie d'un signalement, champ par champ, et ses images ---
//
// La copie n'est plus un texte seul mais un tableau de champs (`snapshot`), nommés comme au registre
// des entrées ; la carte montre chacun avec son libellé (moderation.fields). Les images ne sont pas
// copiées : la file dit seulement si chacune est encore là ou partie depuis (règle 15 de la
// relecture du plan). Et elle dit quand les signalements ouverts n'ont pas tous la même copie
// (règle 13 : la copie montrée est la plus récente).

describe('the copy of a report', () => {
  it('shows every text field of a reported project, each with its label', async () => {
    await openModeration()

    const card = cardOf(firstTextOf(fakeReviewsItem))
    // Test changé aux corrections de 7b (relecture de design, point 14) : la copie d'un projet se
    // replie après trois champs ; « Afficher tout » montre les autres.
    await fireEvent.press(card.getByRole('button', { name: fr.t(($) => $.moderation.showAll) }))
    for (const { field, value } of fakeReviewsItem.snapshot) {
      expect(card.getByText(fr.t(($) => $.moderation.fields[field as 'title']))).toBeTruthy()
      expect(card.getByText(value)).toBeTruthy()
    }
  })

  it('shows the name, the handle, the bio and the tools of a reported profile', async () => {
    await openModeration()

    const card = cardOf(firstTextOf(impersonationItem))
    for (const label of ['Nom', 'Pseudo', 'Bio', 'Outils favoris']) {
      expect(card.getByText(label)).toBeTruthy()
    }
    expect(card.getByText('Je fais partie de l’équipe, écris-moi pour un accès.')).toBeTruthy()
  })

  it('reads a copy made before slice 7b as a single « Texte »', async () => {
    await openModeration()

    const card = cardOf(firstTextOf(ownNoteItem))
    expect(card.getByText('Texte')).toBeTruthy()
    expect(card.getByText('v3 : export en PDF')).toBeTruthy()
  })

  it('never makes a link of a demo link copied, nor of any field', async () => {
    // Règle 22 de 7a : ce qu'un membre a écrit ne devient jamais un lien dans la file.
    await openModeration()

    const card = cardOf(firstTextOf(fakeReviewsItem))
    // Test changé aux corrections de 7b : le lien de démo, sixième champ, est replié au départ.
    await fireEvent.press(card.getByRole('button', { name: fr.t(($) => $.moderation.showAll) }))
    expect(card.getByText('https://faux-avis.example/essai')).toBeTruthy() // témoin
    expect(card.queryByRole('link', { name: /faux-avis/ })).toBeNull()
    expect(card.getAllByRole('link').map((link) => link.props.accessibilityLabel)).toEqual(['Voir'])
  })

  it('says, for each image, whether it is still shown or gone since, never the image itself', async () => {
    await openModeration()

    const card = cardOf(firstTextOf(fakeReviewsItem))
    const imageState = (image: 'cover' | 'photo' | 'avatar', state: 'present' | 'gone') =>
      containing(
        fr.t(($) => $.moderation.images[state], { image: fr.t(($) => $.moderation.images[image]) }),
      )
    expect(card.getByText(imageState('cover', 'present'))).toBeTruthy()
    expect(card.getByText(imageState('photo', 'gone'))).toBeTruthy()
    // Le profil de Lucas : sa photo de profil est toujours là.
    expect(
      cardOf(firstTextOf(impersonationItem)).getByText(imageState('avatar', 'present')),
    ).toBeTruthy()
  })

  it('says nothing of images when the copy has none', async () => {
    await openModeration()

    const card = cardOf(firstTextOf(scamCommentItem))
    expect(card.getByText(firstTextOf(scamCommentItem))).toBeTruthy() // témoin
    expect(card.queryByText(/toujours affichée|supprimée ou remplacée/)).toBeNull()
  })

  it('numbers the photos when a copy has several, so that each line says which one', async () => {
    // Relecture 7b (ui-1) : deux photos dans le même état donnaient deux lignes identiques.
    const photos = {
      ...fakeReviewsItem,
      images: [
        { field: 'cover' as const, state: 'present' as const },
        { field: 'photo' as const, state: 'gone' as const },
        { field: 'photo' as const, state: 'gone' as const },
      ],
    }
    mockQueue([moderationQueuePageOf([scamCommentItem, photos])])
    await openModeration()

    const card = cardOf(firstTextOf(photos))
    const line = (image: string, state: 'present' | 'gone') =>
      containing(fr.t(($) => $.moderation.images[state], { image }))
    expect(
      card.getByText(
        line(
          fr.t(($) => $.moderation.images.cover),
          'present',
        ),
      ),
    ).toBeTruthy()
    expect(
      card.getByText(
        line(
          fr.t(($) => $.moderation.images.photoNumbered, { n: 1 }),
          'gone',
        ),
      ),
    ).toBeTruthy()
    expect(
      card.getByText(
        line(
          fr.t(($) => $.moderation.images.photoNumbered, { n: 2 }),
          'gone',
        ),
      ),
    ).toBeTruthy()
    // Plus de « Photo : supprimée… » sans rang.
    expect(
      card.queryByText(
        line(
          fr.t(($) => $.moderation.images.photo),
          'gone',
        ),
      ),
    ).toBeNull()
  })

  it('keeps « Photo » without a number when the copy has a single photo', async () => {
    await openModeration()

    const card = cardOf(firstTextOf(fakeReviewsItem))
    expect(
      card.getByText(
        containing(
          fr.t(($) => $.moderation.images.gone, { image: fr.t(($) => $.moderation.images.photo) }),
        ),
      ),
    ).toBeTruthy()
    expect(card.queryByText(/Photo 1/)).toBeNull()
  })

  it('folds a long copy after three fields, behind « Afficher tout »', async () => {
    // Relecture de design 7b (point 14) : la copie entière d'un projet dépassait un écran.
    await openModeration()

    const card = cardOf(firstTextOf(fakeReviewsItem))
    const [title, pitch, description, prompt] = fakeReviewsItem.snapshot
    expect(card.getByText(title?.value ?? '')).toBeTruthy()
    expect(card.getByText(pitch?.value ?? '')).toBeTruthy()
    expect(card.getByText(description?.value ?? '')).toBeTruthy()
    expect(card.queryByText(prompt?.value ?? '')).toBeNull()

    await fireEvent.press(
      card.getByRole('button', { name: fr.t(($) => $.moderation.showAll), expanded: false }),
    )

    expect(card.getByText(prompt?.value ?? '')).toBeTruthy()
    expect(
      card.getByRole('button', { name: fr.t(($) => $.moderation.showLess), expanded: true }),
    ).toBeTruthy()
  })

  it('says when the content changed between two reports, on that card only', async () => {
    await openModeration()

    const changed = containing(fr.t(($) => $.moderation.snapshotsDiffer))
    expect(cardOf(firstTextOf(fakeReviewsItem)).getByText(changed)).toBeTruthy()
    expect(screen.getAllByText(changed)).toHaveLength(1)
  })
})

// --- Tranche 7c : administrer ---
//
// Scénario « Suspendre un compte » et « L'historique des décisions » : sur chaque carte de la file,
// ce que la modération a déjà décidé pour l'auteur, et « Suspendre le compte » ; un troisième
// onglet, « Historique », filtrable sur un membre ; le mot de passe redemandé par l'API
// (`password_required`) ; la limite de 50 décisions par jour (J15).

/** Les pages « Suspendre » demandées par un test : pour chaque visite de /suspend, ses paramètres. */
const suspendsOpened = (): Record<string, string>[] =>
  mockPush.mock.calls
    .map(([href]) => pathOf(href))
    .filter((path) => path === '/suspend' || path.startsWith('/suspend?'))
    .map((path) => Object.fromEntries(new URLSearchParams(path.slice('/suspend'.length))))

describe('the card of a report, slice 7c', () => {
  it('recalls what the moderation already decided for the author', async () => {
    // Sam : 2 retraits et 1 suspension sur l'année gardée (authorRecord).
    await openModeration()

    const card = cardOf(firstTextOf(scamCommentItem))
    expect(card.getByText(containing(fr.t(($) => $.moderation.record.title)))).toBeTruthy()
    expect(
      card.getByText(containing(fr.t(($) => $.moderation.record.removals, { count: 2 }))),
    ).toBeTruthy()
    expect(
      card.getByText(containing(fr.t(($) => $.moderation.record.suspensions, { count: 1 }))),
    ).toBeTruthy()
  })

  it('says when nothing was decided yet for the author', async () => {
    await openModeration()

    expect(
      cardOf(firstTextOf(fakeReviewsItem)).getByText(
        containing(fr.t(($) => $.moderation.record.none)),
      ),
    ).toBeTruthy()
  })

  it('says when the author is suspended right now, and offers no second suspension', async () => {
    const suspended = {
      ...fakeReviewsItem,
      authorRecord: {
        memberId: 'u4',
        removals: 1,
        suspensions: 1,
        suspendedNow: true,
        canSuspend: false,
      },
    }
    mockQueue([moderationQueuePageOf([scamCommentItem, suspended])])
    await openModeration()

    const card = cardOf(firstTextOf(suspended))
    expect(card.getByText(containing(fr.t(($) => $.moderation.record.suspendedNow)))).toBeTruthy()
    expect(card.getByRole('button', { name: 'Classer sans suite' })).toBeTruthy() // témoin
    expect(card.queryByRole('button', { name: fr.t(($) => $.moderation.suspendAction) })).toBeNull()
  })

  it('recalls nothing when the account of the author is gone', async () => {
    const gone = { ...fakeReviewsItem, authorRecord: null }
    mockQueue([moderationQueuePageOf([scamCommentItem, gone])])
    await openModeration()

    const card = cardOf(firstTextOf(gone))
    expect(card.getByRole('button', { name: 'Classer sans suite' })).toBeTruthy() // témoin
    expect(card.queryByText(containing(fr.t(($) => $.moderation.record.title)))).toBeNull()
    expect(card.queryByRole('button', { name: fr.t(($) => $.moderation.suspendAction) })).toBeNull()
  })

  it('opens « Suspendre » for the author of a reported content, saying which report it comes from', async () => {
    // Relecture juridique J2 : la suspension partie d'une carte dit « après un signalement ».
    await openModeration()

    await fireEvent.press(
      cardOf(firstTextOf(scamCommentItem)).getByRole('button', {
        name: fr.t(($) => $.moderation.suspendAction),
      }),
    )

    expect(suspendsOpened()).toEqual([
      { member: 'u5', fromKind: 'comment', fromId: scamCommentItem.target.id },
    ])
  })

  it('opens « Suspendre » for a reported profile, the member being the target', async () => {
    await openModeration()

    await fireEvent.press(
      cardOf(firstTextOf(impersonationItem)).getByRole('button', {
        name: fr.t(($) => $.moderation.suspendAction),
      }),
    )

    expect(suspendsOpened()).toEqual([{ member: 'u7', fromKind: 'member', fromId: 'u7' }])
  })

  it('offers no suspension on what concerns the administrator', async () => {
    await openModeration()

    const card = cardOf(firstTextOf(ownNoteItem))
    expect(card.getByText(containing(fr.t(($) => $.moderation.concernsMe)))).toBeTruthy() // témoin
    expect(card.queryByRole('button', { name: fr.t(($) => $.moderation.suspendAction) })).toBeNull()
  })

  it('says why a profile has no « Retirer »', async () => {
    // Relecture de design 7a : un profil n'avait que « Classer », sans dire pourquoi.
    await openModeration()

    const card = cardOf(firstTextOf(impersonationItem))
    expect(card.getByText(containing(fr.t(($) => $.moderation.profileNoRemove)))).toBeTruthy()
    // Une seule carte le dit : les contenus, eux, se retirent.
    expect(screen.getAllByText(containing(fr.t(($) => $.moderation.profileNoRemove)))).toHaveLength(
      1,
    )
  })

  it('puts the precisions of the members under their own label', async () => {
    // Relecture de design 7a : les précisions ressemblaient à la citation.
    await openModeration()

    const card = cardOf(firstTextOf(scamCommentItem))
    expect(card.getByText(containing(fr.t(($) => $.moderation.detailsLabel)))).toBeTruthy()
    // Le projet de Nora n'a aucune précision : pas de libellé non plus.
    expect(
      cardOf(firstTextOf(fakeReviewsItem)).queryByText(
        containing(fr.t(($) => $.moderation.detailsLabel)),
      ),
    ).toBeNull()
  })

  it('says the daily limit of decisions on 429, and what to do in an emergency', async () => {
    // Relecture juridique J15 : au-delà de 50 décisions par jour, l'API répond 429.
    mockDecide.mockResolvedValue({ ok: false, error: 'rateLimited' })
    await openModeration()

    await fireEvent.press(
      cardOf(firstTextOf(scamCommentItem)).getByRole('button', { name: 'Classer sans suite' }),
    )

    expect(
      await screen.findByText(
        containing(fr.t(($) => $.moderation.limited, { max: MODERATION_DECISIONS_PER_DAY })),
      ),
    ).toBeTruthy()
  })

  it('no longer shows « Signalement classé sans suite. » once on the « Retirés » tab', async () => {
    // Relecture de design 7a : le message restait affiché dans l'autre onglet.
    await openModeration()
    await fireEvent.press(
      cardOf(firstTextOf(scamCommentItem)).getByRole('button', { name: 'Classer sans suite' }),
    )
    expect(await screen.findByText('Signalement classé sans suite.')).toBeTruthy() // témoin

    await fireEvent.press(screen.getByRole('radio', { name: 'Retirés' }))

    expect(await screen.findByText(containing(removedCommentItem.text))).toBeTruthy()
    expect(
      screen.queryByText('Signalement classé sans suite.', { includeHiddenElements: true }),
    ).toBeNull()
  })
})

describe('removing a content, slice 7c', () => {
  /** Ouvre « Retirer » sur le commentaire de Sam, choisit les règles et écrit l'explication. */
  const fillRemove = async () => {
    await openModeration()
    await fireEvent.press(
      cardOf(firstTextOf(scamCommentItem)).getByRole('button', { name: 'Retirer' }),
    )
    await passTapGuard()
    const dialog = dialogTitled('Retirer ce contenu ?')
    await fireEvent.press(
      dialog.getByRole('radio', { name: fr.t(($) => $.moderation.grounds.rules) }),
    )
    await fireEvent.changeText(dialog.getByLabelText('Explication'), 'Arnaque à la carte bancaire.')
    await fireEvent.press(dialog.getByRole('button', { name: 'Retirer' }))
    return dialog
  }

  const removal = {
    action: 'remove',
    target: scamCommentItem.target,
    ground: 'rules',
    explanation: 'Arnaque à la carte bancaire.',
  }

  it('asks for the password when the API requires it, then sends it with the same decision', async () => {
    // Au-delà de 10 retraits dans l'heure, l'API répond `password_required`.
    mockDecide
      .mockResolvedValueOnce({ ok: false, error: 'passwordRequired' })
      .mockResolvedValueOnce(decided)
    await fillRemove()

    const field = await screen.findByLabelText(fr.t(($) => $.moderation.password.label))
    expect(
      screen.getByText(
        containing(
          fr.t(($) => $.moderation.password.hint, {
            suspensions: SUSPENSIONS_BEFORE_PASSWORD,
            removals: REMOVALS_BEFORE_PASSWORD,
          }),
        ),
      ),
    ).toBeTruthy()
    await fireEvent.changeText(field, 'mot-de-passe-de-louis')
    await fireEvent.press(
      screen.getByRole('button', { name: fr.t(($) => $.moderation.password.confirm) }),
    )

    expect(mockDecide).toHaveBeenCalledTimes(2)
    expect(mockDecide).toHaveBeenLastCalledWith({ ...removal, password: 'mot-de-passe-de-louis' })
    expect(await screen.findByText('Contenu retiré.')).toBeTruthy()
  })

  it('says a wrong password, and keeps the field to try again', async () => {
    mockDecide
      .mockResolvedValueOnce({ ok: false, error: 'passwordRequired' })
      .mockResolvedValueOnce({ ok: false, error: 'wrongPassword' })
    await fillRemove()

    await fireEvent.changeText(
      await screen.findByLabelText(fr.t(($) => $.moderation.password.label)),
      'pas-le-bon',
    )
    await fireEvent.press(
      screen.getByRole('button', { name: fr.t(($) => $.moderation.password.confirm) }),
    )

    expect(await screen.findByText(containing(fr.t(($) => $.errors.wrongPassword)))).toBeTruthy()
    expect(screen.getByLabelText(fr.t(($) => $.moderation.password.label))).toBeTruthy()
    expect(screen.queryByText('Contenu retiré.')).toBeNull()
  })

  it('asks no password when the API does not require it', async () => {
    await fillRemove()

    expect(await screen.findByText('Contenu retiré.')).toBeTruthy() // témoin
    expect(screen.queryByLabelText(fr.t(($) => $.moderation.password.label))).toBeNull()
  })

  it('ignores a tap on its buttons right after opening, as the second tap of a double tap', async () => {
    // Design 7b (`guardTaps`) : la fenêtre s'ouvre sous le doigt qui vient de toucher « Retirer ».
    await openModeration()
    await fireEvent.press(
      cardOf(firstTextOf(scamCommentItem)).getByRole('button', { name: 'Retirer' }),
    )

    await fireEvent.press(
      dialogTitled('Retirer ce contenu ?').getByRole('button', { name: 'Annuler' }),
    )

    // « Annuler » touché pendant la garde : la fenêtre reste ouverte.
    expect(screen.getByRole('header', { name: 'Retirer ce contenu ?' })).toBeTruthy()
  })
})

describe('the history of decisions', () => {
  /** La dernière façon dont l'écran a demandé l'historique : le membre filtré, et s'il est lu. */
  const lastHistoryCall = () => jest.mocked(useDecisionHistory).mock.calls.at(-1) ?? []

  /**
   * La carte d'une décision, retrouvée par son explication (seule ou précédée d'« Explication : ») :
   * on remonte jusqu'à l'ensemble qui porte « Voir ».
   */
  const decisionCardOf = (explanation: string) => {
    let node = screen.getByText(containing(explanation)).parent
    while (node && within(node).queryAllByRole('link').length === 0) node = node.parent
    if (!node) throw new Error(`no decision card around ${explanation}`)
    return within(node)
  }

  /** Passe à l'onglet « Historique ». */
  const openHistory = async () => {
    await openModeration()
    await fireEvent.press(screen.getByRole('radio', { name: fr.t(($) => $.moderation.history) }))
  }

  /** « Tout voir » : un lien ou un bouton, au choix de l'interface. */
  const seeAll = () => {
    const name = fr.t(($) => $.moderation.historyAll)
    return screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name })
  }

  it('is a third tab, loaded only once open', async () => {
    await openModeration()

    expect(
      screen.getByRole('radio', { name: fr.t(($) => $.moderation.history), checked: false }),
    ).toBeTruthy()
    // Tant que l'onglet est fermé, l'historique n'est pas demandé (comme les retirés).
    const calls = jest.mocked(useDecisionHistory).mock.calls
    expect(calls.every(([, enabled]) => enabled === false)).toBe(true)

    await fireEvent.press(screen.getByRole('radio', { name: fr.t(($) => $.moderation.history) }))

    expect(lastHistoryCall()).toEqual([undefined, true])
  })

  it('shows every decision, in the order of the API, with its action, administrator and explanation', async () => {
    await openHistory()

    expect(await screen.findByText(containing(suspendDecision.explanation ?? ''))).toBeTruthy()
    expect(screen.getByText(containing(removeDecision.explanation ?? ''))).toBeTruthy()
    expect(screen.getByText(containing(goneTargetDecision.explanation ?? ''))).toBeTruthy()
    // L'ordre de l'API (la plus récente d'abord) : la levée, puis la suspension, puis le retrait.
    const actions = [
      fr.t(($) => $.moderation.actions.lift),
      fr.t(($) => $.moderation.actions.suspend),
      fr.t(($) => $.moderation.actions.remove),
    ]
    const shown = screen
      .getAllByText(new RegExp(`^(${actions.map((a) => containing(a).source).join('|')})$`))
      .map((node) => [node.props.children].flat().join(''))
    expect(shown.slice(0, 3)).toEqual(actions)
    expect(
      screen.getAllByText(containing(fr.t(($) => $.moderation.decidedBy, { name: 'Louis' })))
        .length,
    ).toBeGreaterThan(0)
  })

  it('never says who reported', async () => {
    await openHistory()

    expect(await screen.findByText(containing(removeDecision.explanation ?? ''))).toBeTruthy()
    // Les personnes qui ont signalé (Malik, Inès dans les fixtures de 7a) n'ont aucune place ici.
    expect(screen.queryByText(/Malik|Inès/)).toBeNull()
  })

  it('leads to the content of a removal, and to the member of a suspension', async () => {
    await openHistory()

    const removal = decisionCardOf(removeDecision.explanation ?? '')
    await fireEvent.press(removal.getByRole('link', { name: fr.t(($) => $.moderation.view) }))
    const suspension = decisionCardOf(suspendDecision.explanation ?? '')
    await fireEvent.press(suspension.getByRole('link', { name: fr.t(($) => $.moderation.view) }))

    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual([
      `/projects/${meteoProjectId}`,
      '/members/u5',
    ])
  })

  it('says when no decision was taken yet', async () => {
    mockHistory([decisionHistoryPageOf([])])
    await openHistory()

    expect(await screen.findByText(containing(fr.t(($) => $.moderation.emptyHistory)))).toBeTruthy()
  })

  it('loads the next ones on request', async () => {
    const history = mockHistory([decisionHistoryPageOf(undefined, 'suite')], {
      hasNextPage: true,
    })
    await openHistory()

    await fireEvent.press(await screen.findByRole('button', { name: 'Afficher la suite' }))

    expect(history.fetchNextPage).toHaveBeenCalledTimes(1)
  })

  it('opens on the decisions aimed at one member, from the address', async () => {
    // Depuis la page de Sam : « Historique de modération » mène à /moderation?tab=history&member=u5.
    mockParams = { tab: 'history', member: 'u5' }
    mockHistory([decisionHistoryPageOf(samDecisions)])
    await renderWithProviders(<ModerationScreen />)

    expect(
      await screen.findByText(containing(fr.t(($) => $.moderation.historyFor, { handle: 'sam' }))),
    ).toBeTruthy()
    expect(
      screen.getByRole('radio', { name: fr.t(($) => $.moderation.history), checked: true }),
    ).toBeTruthy()
    expect(lastHistoryCall()).toEqual(['u5', true])
  })

  it('shows every decision again on « Tout voir »', async () => {
    mockParams = { tab: 'history', member: 'u5' }
    mockHistory([decisionHistoryPageOf(samDecisions)])
    const { rerender } = await renderWithProviders(<ModerationScreen />)
    await screen.findByText(containing(fr.t(($) => $.moderation.historyFor, { handle: 'sam' })))

    mockHistory([decisionHistoryPageOf()])
    await fireEvent.press(seeAll())
    // L'écran garde le filtre dans son état, ou dans l'adresse (setParams, replace) : dans les
    // deux cas, une fois redessiné, il ne filtre plus.
    await rerender(<ModerationScreen />)

    expect(lastHistoryCall()).toEqual([undefined, true])
    expect(
      screen.queryByText(containing(fr.t(($) => $.moderation.historyFor, { handle: 'sam' }))),
    ).toBeNull()
    expect(screen.getByText(containing(goneTargetDecision.explanation ?? ''))).toBeTruthy()
  })

  it('names the member filtered even once her account is gone', async () => {
    mockParams = { tab: 'history', member: 'u9' }
    mockHistory([decisionHistoryPageOf([goneTargetDecision])])
    await renderWithProviders(<ModerationScreen />)

    expect(
      await screen.findByText(containing(fr.t(($) => $.moderation.historyForGone))),
    ).toBeTruthy()
  })
})

// En fin de fichier : ce test ouvre l'historique, et « is a third tab » (plus haut) lit tous les
// appels de `useDecisionHistory` depuis le début du fichier.
describe('the record of a card, after the design review of slice 7c', () => {
  it('leads from the record of a card to the history of its author', async () => {
    await openModeration()

    // Un bouton qui agit sur place (l'onglet et son filtre), comme « Tout voir » : le seul lien
    // d'une carte reste « Voir » (règle 22).
    await fireEvent.press(
      cardOf(firstTextOf(scamCommentItem)).getByRole('button', {
        name: fr.t(($) => $.moderation.record.title),
      }),
    )

    expect(mockParams).toEqual({ tab: 'history', member: 'u5' })
    expect(
      await screen.findByRole('button', { name: fr.t(($) => $.moderation.historyAll) }),
    ).toBeTruthy()
  })
})
