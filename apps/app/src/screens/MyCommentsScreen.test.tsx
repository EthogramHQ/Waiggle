// Tests de « Mes commentaires » (tranche R11, planche R11-Mes-Commentaires), ouverte depuis
// Réglages, « Mes données » (/settings/data/comments). Scénario : docs/scenarios/refonte.md,
// « R11 — La conformité », « Mes commentaires » : tous ses commentaires et réponses, du plus récent
// au plus ancien, avec le titre du projet (ou « Projet qui n'est plus visible »), la date et le
// début du texte ; toucher un commentaire d'un projet visible l'ouvre à sa place dans le fil ;
// chacun a « Supprimer », avec la confirmation du fil d'un projet (une racine qui a des réponses le
// dit) ; on supprime aussi un commentaire sur un projet qu'on ne voit plus ; la liste se charge par
// pages ; vide, elle le dit.
//
// Ce que ces tests supposent de l'écran (plan de R11, UI-E ; relecture de l'interface, U5) :
// - `MyCommentsScreen`, sans props (`screens/MyCommentsScreen.tsx`), page par défaut de
//   `app/settings/data/comments.tsx` ;
// - il lit GET /v1/me/comments (puis `?cursor=…`) et supprime par DELETE /v1/me/comments/{id}
//   (`useMyComments`, `useDeleteMyComment` de `comments/api.ts`) : ces tests remplacent seulement le
//   client réseau, et l'écran peut écrire ses hooks comme il veut ;
// - chaque ligne d'un projet visible est un lien (ou un bouton) nommé `myComments.open` (ou
//   `openReply` pour une réponse), qui mène à « /projects/<id>?comment=<id> » ; une ligne d'un projet
//   qu'on ne voit plus n'ouvre rien ;
// - chaque « Supprimer » est nommé `myComments.deleteNamed` (son extrait) ; la fenêtre est celle du
//   fil d'un projet (`project.comments.deleteTitle`, `deleteBody` ou `deleteBodyReplies`, bouton
//   `confirmDelete`), sortie dans `comments/DeleteCommentDialog.tsx` ;
// - après une suppression, le focus va à la ligne suivante, ou au titre de la page s'il n'en reste
//   aucune ; le Retour mène à « Mes données » quand il n'y a pas de page d'avant.
import type { MyComment, MyCommentsPage } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import MyCommentsRoute from '../../app/settings/data/comments'
import { request, requestWithoutBody } from '../api/client'
import type { ApiResult } from '../api/errors'
import { labelOf } from '../testing/arrivedFocus'
import { passTapGuard } from '../testing/dialog'
import { leaMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { MyCommentsScreen } from './MyCommentsScreen'

jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn(() => Promise.resolve(null)) }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// Où l'écran pose le focus : les vraies fonctions, espionnées (comme ProjectUpdatesScreen.test).
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    focusAndReveal: jest.fn(actual.focusAndReveal),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
const mockBack = jest.fn()
let mockCanGoBack = true
jest.mock('expo-router', () => ({
  usePathname: () => '/settings/data/comments',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    back: mockBack,
    dismissTo: mockReplace,
    canGoBack: () => mockCanGoBack,
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}))

// --- Les textes ----------------------------------------------------------------------------------

const T = {
  title: fr.t(($) => $.myComments.title),
  empty: fr.t(($) => $.myComments.empty),
  projectGone: fr.t(($) => $.myComments.projectGone),
  reply: fr.t(($) => $.myComments.reply),
  more: fr.t(($) => $.myComments.more),
  loadError: fr.t(($) => $.myComments.loadError),
  deleteTitle: fr.t(($) => $.project.comments.deleteTitle),
  deleteBody: fr.t(($) => $.project.comments.deleteBody),
  deleteBodyReplies: fr.t(($) => $.project.comments.deleteBodyReplies),
  confirmDelete: fr.t(($) => $.project.comments.confirmDelete),
  deleteError: fr.t(($) => $.project.comments.deleteError),
  hiddenByAuthor: fr.t(($) => $.project.comments.hiddenByAuthor),
  removed: fr.t(($) => $.project.comments.removedPlaceholder),
  back: fr.t(($) => $.common.back),
}
const openName = (title: string, excerpt: string) =>
  fr.t(($) => $.myComments.open, { title, excerpt })
const openReplyName = (title: string, excerpt: string) =>
  fr.t(($) => $.myComments.openReply, { title, excerpt })
const deleteName = (excerpt: string) => fr.t(($) => $.myComments.deleteNamed, { excerpt })

/** Une expression qui vaut ce nom en entier (les blancs ramenés, comme le fait RNTL). */
const named = (text: string) => new RegExp(`^${containing(text).source}$`)
/** Un lien, ou un bouton, à ce nom exact. */
const control = (name: string) =>
  screen.queryByRole('link', { name: named(name) }) ??
  screen.getByRole('button', { name: named(name) })

// --- Les données ---------------------------------------------------------------------------------

const tableau = {
  id: '8a1f0c52-3c1e-4c5b-9d43-2f6a1b7e0001',
  title: 'Raconte-moi un tableau',
  cover: null,
  author: { name: 'Sam Petit' },
}
const jardin = {
  id: '8a1f0c52-3c1e-4c5b-9d43-2f6a1b7e0002',
  title: 'Le jardin qui parle',
  cover: null,
  author: { name: 'Hugo Lefèvre' },
}
/** Un projet que Léa ne voit plus (devenu privé) : l'API ne donne que son identifiant. */
const goneProjectId = '8a1f0c52-3c1e-4c5b-9d43-2f6a1b7e0003'

const comment = (over: Partial<MyComment> & Pick<MyComment, 'id' | 'body'>): MyComment => ({
  projectId: tableau.id,
  project: tableau,
  replyTo: null,
  hasReplies: false,
  createdAt: '2026-11-14T18:00:00.000Z',
  editedAt: null,
  hidden: false,
  removed: false,
  ...over,
})

// Le plus récent d'abord, comme l'API les rend.
const onTableau = comment({
  id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000001',
  body: 'Les couleurs du ciel sont superbes, bravo !',
  hasReplies: true,
})
const replyOnJardin = comment({
  id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000002',
  projectId: jardin.id,
  project: jardin,
  replyTo: 'c0a8e7d2-6b1f-4f3e-8a2d-0000000000ff',
  body: 'Merci, ça marche aussi sur mon téléphone.',
  createdAt: '2026-11-13T09:30:00.000Z',
})
const onGoneProject = comment({
  id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000003',
  projectId: goneProjectId,
  project: null,
  body: 'Hâte de voir la suite de ce projet.',
  createdAt: '2026-11-10T20:15:00.000Z',
})
const secondOnTableau = comment({
  id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000004',
  body: 'Le bouton Partager ne répond pas chez moi.',
  createdAt: '2026-11-09T12:00:00.000Z',
})

const cursor = 'eyJhdCI6IjIwMjYifQ'

// --- Le faux serveur -----------------------------------------------------------------------------

/** La première page, la suivante (`?cursor=`), et la réponse choisie pour les DELETE. */
let firstPage: MyCommentsPage
let nextPage: MyCommentsPage
let firstRead: () => Promise<ApiResult<MyCommentsPage>>
let nextDelete: (() => Promise<ApiResult<null>>) | null
const sent: { method: string; path: string }[] = []

const fakeRequest = async (to: string, init: RequestInit = {}) => {
  sent.push({ method: init.method ?? 'GET', path: to })
  if (to === '/v1/me') return { ok: true, data: leaMe } as const
  if (to.startsWith('/v1/me/comments') && (init.method ?? 'GET') === 'GET') {
    return to.includes('cursor=') ? ({ ok: true, data: nextPage } as const) : firstRead()
  }
  return { ok: false, error: 'notFound' } as const
}
const fakeRequestWithoutBody = async (to: string, init: RequestInit = {}) => {
  sent.push({ method: init.method ?? 'GET', path: to })
  if (init.method === 'DELETE' && to.startsWith('/v1/me/comments/')) {
    return nextDelete ? nextDelete() : ({ ok: true, data: null } as const)
  }
  return { ok: false, error: 'notFound' } as const
}
const deletes = () => sent.filter((one) => one.method === 'DELETE').map((one) => one.path)

beforeEach(() => {
  firstPage = { items: [onTableau, replyOnJardin, onGoneProject], nextCursor: null }
  nextPage = { items: [], nextCursor: null }
  firstRead = async () => ({ ok: true, data: firstPage })
  nextDelete = null
  sent.length = 0
  mockCanGoBack = true
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(fakeRequest as typeof request)
  jest
    .mocked(requestWithoutBody)
    .mockReset()
    .mockImplementation(fakeRequestWithoutBody as typeof requestWithoutBody)
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  for (const mock of [mockPush, mockReplace, mockNavigate, mockBack]) mock.mockReset()
})

/** Toutes les adresses demandées au routeur, dans l'ordre. */
const paths = () =>
  [mockPush, mockReplace, mockNavigate].flatMap((mock) =>
    mock.mock.calls.map(([href]) => pathOf(href)),
  )

/** Les noms de ce qui a reçu le focus, dans l'ordre (les trois façons de le poser). */
const focusedLabels = () =>
  [focusWithoutScroll, focusAndReveal, moveReaderTo]
    .flatMap((fn) =>
      jest.mocked(fn).mock.calls.map((call, i) => ({
        node: call[0],
        order: jest.mocked(fn).mock.invocationCallOrder[i] ?? 0,
      })),
    )
    .sort((a, b) => a.order - b.order)
    .map(({ node }) => labelOf(node) ?? '')

type TreeNode = { children: (TreeNode | string)[] }
/** Le rang de chaque élément dans l'ordre de lecture de la page (de haut en bas). */
const readingOrder = (...elements: unknown[]) => {
  const all: unknown[] = []
  const walk = (node: TreeNode) => {
    all.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as unknown as TreeNode)
  return elements.map((element) => all.indexOf(element))
}

const openPage = async () => {
  await renderWithProviders(<MyCommentsScreen />)
  await screen.findAllByText(containing(onTableau.body))
}

/** Ouvre la fenêtre de suppression d'un commentaire, garde des tapes passée. */
const askToDelete = async (body: string) => {
  await fireEvent.press(screen.getByRole('button', { name: named(deleteName(body)) }))
  await screen.findByRole('header', { name: T.deleteTitle })
  await passTapGuard()
}
/** Le bouton « Supprimer » de la fenêtre (le seul à porter ce nom exact). */
const confirmButton = () => screen.getByRole('button', { name: named(T.confirmDelete) })

// --- La liste ------------------------------------------------------------------------------------

describe('MyCommentsScreen, the list', () => {
  it('is the page of the /settings/data/comments address', () => {
    expect(MyCommentsRoute).toBe(MyCommentsScreen)
  })

  it('shows my comments and replies, newest first, each with the title of its project', async () => {
    await openPage()

    expect(screen.getByRole('header', { name: T.title })).toBeTruthy()
    const texts = [onTableau, replyOnJardin, onGoneProject].map(
      (one) => screen.getAllByText(containing(one.body))[0],
    )
    const places = readingOrder(...texts)
    expect(places.every((place) => place >= 0)).toBe(true)
    expect([...places].sort((a, b) => a - b)).toEqual(places)
    expect(screen.getAllByText(containing(tableau.title)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(containing(jardin.title)).length).toBeGreaterThan(0)
    // Une réponse se dit réponse, sans jamais nommer qui a écrit le commentaire d'origine (S-C3).
    expect(screen.getAllByText(T.reply)).toHaveLength(1)
    expect(sent).toContainEqual({ method: 'GET', path: '/v1/me/comments' })
  })

  it('says « Projet qui n’est plus visible » for a project I no longer see, and names nobody', async () => {
    await openPage()

    expect(screen.getAllByText(T.projectGone)).toHaveLength(1)
    // Le texte de Léa reste : c'est le sien. Du projet, rien d'autre : l'API ne donne ni son titre,
    // ni sa couverture, ni son auteur (`project: null`).
    expect(screen.getAllByText(containing(onGoneProject.body))).toBeTruthy()
  })

  it('opens a comment of a visible project at its place in the thread of the project', async () => {
    await openPage()

    await fireEvent.press(control(openName(tableau.title, onTableau.body)))
    await fireEvent.press(control(openReplyName(jardin.title, replyOnJardin.body)))

    expect(paths()).toEqual([
      `/projects/${tableau.id}?comment=${onTableau.id}`,
      `/projects/${jardin.id}?comment=${replyOnJardin.id}`,
    ])
  })

  it('does not open a comment on a project I no longer see', async () => {
    await openPage()

    // Témoin : la ligne d'un projet visible s'ouvre.
    expect(control(openName(tableau.title, onTableau.body))).toBeTruthy()
    for (const role of ['link', 'button'] as const) {
      const opening = screen
        .queryAllByRole(role, { name: containing(onGoneProject.body) })
        .filter((element) => element.props.accessibilityLabel !== deleteName(onGoneProject.body))
      expect(opening).toHaveLength(0)
    }
  })

  it('marks a comment hidden by the author of the project, and one removed by the moderation', async () => {
    firstPage = {
      items: [
        comment({
          id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000005',
          body: 'Un avis tranché.',
          hidden: true,
        }),
        comment({
          id: 'c0a8e7d2-6b1f-4f3e-8a2d-000000000006',
          body: 'Les couleurs du ciel sont superbes, bravo !',
          removed: true,
        }),
      ],
      nextCursor: null,
    }
    await openPage()

    expect(screen.getAllByText(containing(T.hiddenByAuthor)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(containing(T.removed)).length).toBeGreaterThan(0)
    // Son auteur lit encore son texte.
    expect(screen.getAllByText(containing('Un avis tranché.'))).toBeTruthy()
  })

  it('loads the list by pages', async () => {
    firstPage = { items: [onTableau], nextCursor: cursor }
    nextPage = { items: [secondOnTableau], nextCursor: null }
    await openPage()
    expect(screen.queryByText(containing(secondOnTableau.body))).toBeNull()

    await fireEvent.press(control(T.more))

    expect(await screen.findAllByText(containing(secondOnTableau.body))).toBeTruthy()
    expect(sent).toContainEqual({ method: 'GET', path: `/v1/me/comments?cursor=${cursor}` })
    expect(screen.queryByRole('button', { name: named(T.more) })).toBeNull()
  })

  it('says so when I have written no comment', async () => {
    firstPage = { items: [], nextCursor: null }
    await renderWithProviders(<MyCommentsScreen />)

    expect(await screen.findByText(T.empty)).toBeTruthy()
  })

  it('says the list could not be loaded', async () => {
    firstRead = async () => ({ ok: false, error: 'internal' })
    await renderWithProviders(<MyCommentsScreen />)

    expect(await screen.findAllByText(containing(T.loadError))).toBeTruthy()
  })

  it('goes back to Mes données when there is no page before', async () => {
    mockCanGoBack = false
    await openPage()

    await fireEvent.press(control(T.back))

    expect(paths()).toContain('/settings/data')
    expect(mockBack).not.toHaveBeenCalled()
  })
})

// --- Supprimer -----------------------------------------------------------------------------------

describe('MyCommentsScreen, deleting', () => {
  // Relecture de l'interface du plan de R11 (U5), mot pour mot, complété.
  it('asks with the replies sentence before deleting a comment that has replies', async () => {
    await openPage()

    await askToDelete(onTableau.body)

    expect(screen.getAllByText(containing(T.deleteBodyReplies))).toBeTruthy()
    expect(screen.queryByText(T.deleteBody)).toBeNull()
    // La fenêtre demande : rien n'est encore parti.
    expect(deletes()).toEqual([])
  })

  it('asks with the usual sentence before deleting a comment without replies', async () => {
    await openPage()

    await askToDelete(replyOnJardin.body)

    expect(screen.getByText(T.deleteBody)).toBeTruthy()
    expect(screen.queryByText(containing(T.deleteBodyReplies))).toBeNull()
  })

  it('deletes a comment once confirmed, through my own route, and takes it off the list', async () => {
    await openPage()

    await askToDelete(replyOnJardin.body)
    await fireEvent.press(confirmButton())

    await waitFor(() => expect(deletes()).toEqual([`/v1/me/comments/${replyOnJardin.id}`]))
    await waitFor(() => expect(screen.queryByText(containing(replyOnJardin.body))).toBeNull())
    // Les autres restent.
    expect(screen.getAllByText(containing(onTableau.body))).toBeTruthy()
  })

  it('deletes a comment on a project I no longer see', async () => {
    await openPage()

    await askToDelete(onGoneProject.body)
    await fireEvent.press(confirmButton())

    await waitFor(() => expect(deletes()).toEqual([`/v1/me/comments/${onGoneProject.id}`]))
    await waitFor(() => expect(screen.queryByText(containing(onGoneProject.body))).toBeNull())
  })

  it('sends nothing when the window is cancelled', async () => {
    await openPage()

    await askToDelete(onTableau.body)
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.cancel) }))

    expect(deletes()).toEqual([])
    expect(screen.getAllByText(containing(onTableau.body))).toBeTruthy()
  })

  it('sends one request on a double tap on the confirm button', async () => {
    let answer: (result: ApiResult<null>) => void = () => {}
    nextDelete = () =>
      new Promise((resolve) => {
        answer = resolve
      })
    await openPage()

    await askToDelete(onTableau.body)
    await fireEvent.press(confirmButton())
    await fireEvent.press(confirmButton())
    await act(async () => answer({ ok: true, data: null }))

    expect(deletes()).toEqual([`/v1/me/comments/${onTableau.id}`])
  })

  it('keeps the comment, and says so, when it could not be deleted', async () => {
    nextDelete = async () => ({ ok: false, error: 'internal' })
    await openPage()

    await askToDelete(onTableau.body)
    await fireEvent.press(confirmButton())

    expect(await screen.findAllByText(containing(T.deleteError))).toBeTruthy()
    expect(screen.getAllByText(containing(onTableau.body)).length).toBeGreaterThan(0)
  })

  // Relecture de l'interface du plan de R11 (U5), mot pour mot.
  it('describes each Supprimer by its excerpt when two comments share a project', async () => {
    firstPage = { items: [onTableau, secondOnTableau], nextCursor: null }
    await openPage()

    const first = screen.getByRole('button', { name: named(deleteName(onTableau.body)) })
    const second = screen.getByRole('button', { name: named(deleteName(secondOnTableau.body)) })
    expect(first).not.toBe(second)
    // Aucun « Supprimer » nommé par le seul projet : deux lignes porteraient le même nom.
    expect(
      screen
        .queryAllByRole('button', { name: containing(tableau.title) })
        .filter((button) =>
          String(button.props.accessibilityLabel ?? '').startsWith(T.confirmDelete),
        ),
    ).toHaveLength(0)
  })

  // Relecture de l'interface du plan de R11 (U5), mot pour mot, complété.
  it('after deleting, moves the focus to the next comment', async () => {
    await openPage()

    await askToDelete(onTableau.body)
    for (const fn of [focusWithoutScroll, focusAndReveal, moveReaderTo]) jest.mocked(fn).mockClear()
    await fireEvent.press(confirmButton())

    await waitFor(() => expect(screen.queryByText(containing(onTableau.body))).toBeNull())
    await act(async () => {})
    await waitFor(() =>
      expect(focusedLabels().some((label) => label.includes(replyOnJardin.body))).toBe(true),
    )
  })

  it('after deleting the only comment, moves the focus to the title of the page', async () => {
    firstPage = { items: [onTableau], nextCursor: null }
    await openPage()

    await askToDelete(onTableau.body)
    for (const fn of [focusWithoutScroll, focusAndReveal, moveReaderTo]) jest.mocked(fn).mockClear()
    await fireEvent.press(confirmButton())

    expect(await screen.findByText(T.empty)).toBeTruthy()
    await act(async () => {})
    await waitFor(() => expect(focusedLabels().at(-1)).toBe(T.title))
    // Le titre est bien celui de la page (h1), pas une ligne de la liste.
    expect(within(screen.getByRole('header', { name: T.title })).queryByRole('button')).toBeNull()
  })
})
