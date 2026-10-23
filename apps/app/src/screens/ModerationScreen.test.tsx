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
import type { ModerationQueuePage, RemovedPage } from '@ruche/contracts'
import { act, fireEvent, screen, within } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import { useDecide, useModerationQueue, useRemovedItems } from '../moderation/api'
import { getMe } from '../profile/api'
import { adminMe, leaMe } from '../testing/fixtures'
import {
  fakeReviewsItem,
  impersonationItem,
  meteoProjectId,
  moderationQueuePageOf,
  ownNoteItem,
  removedCommentItem,
  removedPageOf,
  scamCommentItem,
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
}))
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/moderation',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
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
  await screen.findByText(scamCommentItem.snapshot)
}

describe('who sees the moderation', () => {
  it('shows an administrator the pending reports and the removed contents', async () => {
    await renderWithProviders(<ModerationScreen />)

    expect(await screen.findByRole('header', { name: 'Modération' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'En attente', checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Retirés', checked: false })).toBeTruthy()
    expect(screen.getByText(scamCommentItem.snapshot)).toBeTruthy()
    // Le groupe d'onglets porte un nom à lui, pas celui de la page (relecture de 7a).
    // (Le groupe n'est pas « accessible » : il se cherche par son nom, comme dans components.test.)
    expect(screen.getByLabelText(fr.t('moderation.list')).props.accessibilityRole).toBe(
      'radiogroup',
    )
  })

  it('recalls the content to remove in the « Retirer » window', async () => {
    await openModeration()

    await fireEvent.press(cardOf(scamCommentItem.snapshot).getByRole('button', { name: 'Retirer' }))

    // Le texte paraît deux fois : sur la carte, et rappelé dans la fenêtre.
    expect(screen.getAllByText(scamCommentItem.snapshot)).toHaveLength(2)
  })

  it('says « not found » to a member who is not an administrator, and shows nothing of the queue', async () => {
    jest.mocked(getMe).mockResolvedValue(leaMe)
    await renderWithProviders(<ModerationScreen />)

    expect(await screen.findByRole('button', { name: 'Retour à l’accueil' })).toBeTruthy()
    expect(screen.queryByText(scamCommentItem.snapshot)).toBeNull()
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
    expect(screen.queryByText(scamCommentItem.snapshot)).toBeNull()
  })
})

describe('the pending reports', () => {
  it('keeps the order of the API, from the oldest report to the most recent', async () => {
    await openModeration()

    const snapshots = [scamCommentItem, fakeReviewsItem, impersonationItem, ownNoteItem].map(
      (item) => item.snapshot,
    )
    // Les textes signalés, dans l'ordre où ils apparaissent à l'écran.
    const shown = screen
      .getAllByText(new RegExp(`^(${snapshots.map((s) => containing(s).source).join('|')})$`))
      .map((node) => [node.props.children].flat().join(''))
    expect(shown).toEqual(snapshots)
  })

  it('shows the kind, the text reported, the reasons with their count, the details and the date', async () => {
    await openModeration()

    const card = cardOf(scamCommentItem.snapshot)
    expect(card.getByText('Commentaire')).toBeTruthy()
    expect(card.getByText(containing(fr.t('moderation.count', { count: 3 })))).toBeTruthy()
    // Le format du motif et de son nombre vient des textes (« Arnaque ou spam : 2 » depuis 8e26421).
    const reasonCount = (reason: string, count: number) =>
      containing(fr.t('moderation.reasonCount', { reason, count }))
    expect(card.getByText(reasonCount('Arnaque ou spam', 2))).toBeTruthy()
    expect(card.getByText(reasonCount('Harcèlement ou haine', 1))).toBeTruthy()
    expect(card.getByText('Il a écrit la même chose sous trois projets.')).toBeTruthy()
    expect(card.getByText(/Premier signalement le /)).toBeTruthy()
    expect(card.getByText(containing(fr.t('moderation.snapshot')))).toBeTruthy()
  })

  it('never says who reported', async () => {
    await openModeration()

    // La file n'a aucun champ pour la personne qui signale (contrat strict) : rien à afficher.
    expect(screen.queryByText(/Malik|Inès/)).toBeNull()
  })

  it('leads to the project of a reported comment through « Voir »', async () => {
    await openModeration()

    await fireEvent.press(cardOf(scamCommentItem.snapshot).getByRole('link', { name: 'Voir' }))

    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual([
      `/projects/${meteoProjectId}`,
    ])
  })

  it('leads to the page of a reported member through « Voir »', async () => {
    await openModeration()

    await fireEvent.press(cardOf(impersonationItem.snapshot).getByRole('link', { name: 'Voir' }))

    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual(['/members/u7'])
  })

  it('offers no decision on what concerns the administrator, and says why', async () => {
    await openModeration()

    const card = cardOf(ownNoteItem.snapshot)
    expect(card.getByText(containing(fr.t('moderation.concernsMe')))).toBeTruthy()
    expect(card.queryByRole('button', { name: 'Retirer' })).toBeNull()
    expect(card.queryByRole('button', { name: 'Classer sans suite' })).toBeNull()
    // Témoin : un autre signalement, lui, se décide.
    expect(cardOf(scamCommentItem.snapshot).getByRole('button', { name: 'Retirer' })).toBeTruthy()
  })

  it('offers only « Classer sans suite » for a profile', async () => {
    // L'API refuse de « retirer » un profil (422) : les actions sur un compte viennent plus tard.
    await openModeration()

    const card = cardOf(impersonationItem.snapshot)
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
    await fireEvent.press(cardOf(scamCommentItem.snapshot).getByRole('button', { name: 'Retirer' }))
    return dialogTitled('Retirer ce contenu ?')
  }

  it('asks for the ground, the law or the rules, then an explanation shown to the author', async () => {
    // Règle 21 de la relecture du plan.
    const dialog = await openRemove()

    expect(dialog.getByText(containing(fr.t('moderation.removeMessage')))).toBeTruthy()
    expect(dialog.getByRole('radio', { name: 'La loi' })).toBeTruthy()
    expect(dialog.getByRole('radio', { name: fr.t('moderation.grounds.rules') })).toBeTruthy()
    expect(dialog.getByLabelText('Explication')).toBeTruthy()
    expect(dialog.getByText(containing(fr.t('moderation.explanationHint')))).toBeTruthy()
  })

  it('removes nothing without an explanation', async () => {
    const dialog = await openRemove()

    await fireEvent.press(dialog.getByRole('radio', { name: fr.t('moderation.grounds.rules') }))
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

    await fireEvent.press(dialog.getByRole('radio', { name: fr.t('moderation.grounds.rules') }))
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

    expect(await screen.findByText(containing(fr.t('errors.alreadyDecided')))).toBeTruthy()
    expect(screen.queryByText('Contenu retiré.')).toBeNull()
  })
})

describe('dismissing a report', () => {
  it('dismisses in one gesture, and says so', async () => {
    await openModeration()

    await fireEvent.press(
      cardOf(scamCommentItem.snapshot).getByRole('button', { name: 'Classer sans suite' }),
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
    await screen.findByText(scamCommentItem.snapshot)
    await fireEvent.press(
      cardOf(scamCommentItem.snapshot).getByRole('button', { name: 'Classer sans suite' }),
    )
    mockQueue([moderationQueuePageOf([fakeReviewsItem])])
    await rerender(<ModerationScreen />)
    return cardOf(fakeReviewsItem.snapshot).getByRole('button', { name: 'Classer sans suite' })
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
          `^(${containing(scamCommentItem.snapshot).source}|${containing(fakeReviewsItem.snapshot).source})$`,
        ),
      )
      .map((node) => [node.props.children].flat().join(''))
    expect(shown).toEqual([scamCommentItem.snapshot, fakeReviewsItem.snapshot])
    const decidedCard = cardOf(scamCommentItem.snapshot)
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
