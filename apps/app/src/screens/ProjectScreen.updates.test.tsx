// Tests de la page d'un projet : la section « Les mises à jour » (R7a, docs/scenarios/refonte.md,
// « Les mises à jour sur la page projet », « Supprimer une mise à jour », « Quand le statut
// change »). Elle remplace le Journal (tranche 4b) et ses tests (`ProjectScreen.journal.test.tsx`,
// `ProjectScreen.deleteFocus.notes.test.tsx`).
//
// Ce que ces tests supposent de l'écran (plan R7a, U4a ; à corriger si le code en décide
// autrement) :
// - la section montre `project.latestUpdate` en entier (`UpdateEntry`), puis « Voir les N mises à
//   jour », qui mène à la frise (`/projects/<id>/updates`) ;
// - « Publier une mise à jour » (section et menu « … ») mène à la feuille, qui a sa propre adresse
//   (`/projects/<id>/update`) ; `?announce=<statut>` venu du formulaire y est transmis ;
// - la corbeille passe par `useDeleteUpdate(id).remove(updateId)` (faux hook du testkit) ;
// - le focus passe par les outils de `ui/focus`, que ces tests espionnent.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { getProject } from '../projects/api'
import { labelOf } from '../testing/arrivedFocus'
import { passTapGuard } from '../testing/dialog'
import { removalAfterReport } from '../testing/moderation'
import { pathOf } from '../testing/navigation'
import { watchOpeningFocus } from '../testing/openingFocus'
import { recipesProject } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import { focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { useDeleteUpdate } from '../updates/api'
import { ProjectScreen } from './ProjectScreen'
import {
  deleteUpdateButton,
  deleteUpdateName,
  deleteUpdateTitle,
  dialogTitled,
  id,
  mockPush,
  mockRemoveUpdate,
  mockReplace,
  mockScreenProps,
  readsLine,
  resetProjectScreenMocks,
  seenByOther,
  withUpdates,
} from './ProjectScreen.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../projects/api', () => ({ getProject: jest.fn(), deleteProject: jest.fn() }))
// Suivre : un faux hook, dont le test lit les appels (toggle) et choisit l'erreur.
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
// La page de l'auteur est lue (« Suivre » n'est proposé qu'une fois qu'on sait si on le suit, et
// plus quand la lecture échoue : décision du 2/11/2026). Ici, une lecture réussie, auteur non suivi.
jest.mock('../members/api', () => ({
  useMember: () => ({
    data: { id: 'u1', name: 'Léa', handle: 'lea', isFollowed: false },
    isError: false,
    isPending: false,
  }),
}))
// Les mises à jour (R7a, qui remplacent les notes) : de faux hooks, dont le test lit les appels.
jest.mock('../updates/api', () => ({
  useProjectUpdates: jest.fn(),
  usePublishUpdate: jest.fn(),
  useDeleteUpdate: jest.fn(),
}))
// Les réactions et les commentaires (tranche 5) : de faux hooks, dont le test lit les appels.
jest.mock('../reactions/api', () => ({ useReaction: jest.fn() }))
jest.mock('../comments/api', () => ({
  useComments: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
// Les suggestions après « @ » (tranche 6b) : personne à proposer.
jest.mock('../mentions/api', () => ({ useMentionable: () => [] }))
// Le presse-papiers (R5a) : l'appareil n'est jamais touché.
jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
// Où l'écran pose le focus : des espions qui appellent les vrais outils.
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    focusAndReveal: jest.fn(actual.focusAndReveal),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})
// Les paramètres de l'adresse de la page (?announce=testable), choisis par chaque test.
let mockParams: Record<string, string | undefined> = {}
// La page est-elle affichée ? La feuille « Nouvelle mise à jour » est une autre adresse : la page
// la quitte (faux), puis y revient (vrai) quand la feuille se ferme.
let mockFocused = true
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    usePathname: () => '/page/actuelle',
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      navigate: mockPush,
      back: jest.fn(),
      dismissTo: jest.fn(),
      setParams: jest.fn(),
    }),
    useLocalSearchParams: () => mockParams,
    useIsFocused: () => mockFocused,
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      const focused = mockFocused
      useEffect(() => (focused ? effect() : undefined), [focused, effect])
    },
  }
})
// Le cadre de page, tel quel, mais dont le test lit les propriétés.
jest.mock('../ui/Screen', () => {
  const actual = jest.requireActual('../ui/Screen')
  const { createElement } = require('react')
  return {
    ...actual,
    Screen: (props: Record<string, unknown>) => {
      mockScreenProps.push(props)
      return createElement(actual.Screen, props)
    },
  }
})

beforeEach(() => {
  resetProjectScreenMocks()
  mockParams = {}
  mockFocused = true
  jest.mocked(focusWithoutScroll).mockClear()
  jest.mocked(focusAndReveal).mockClear()
  jest.mocked(moveReaderTo).mockClear()
})

afterEach(() => {
  jest.restoreAllMocks()
})

// --- Les textes ---

const TEXT = {
  section: fr.t(($) => $.project.updates.title),
  add: fr.t(($) => $.project.updates.add),
  seeAll: fr.t(($) => $.project.updates.seeAll, { count: 3 }),
  empty: fr.t(($) => $.project.updates.empty),
  emptyPrivate: fr.t(($) => $.project.updates.emptyPrivate),
  deleteBody: fr.t(($) => $.project.updates.deleteBody),
  deleteBodyRemoved: fr.t(($) => $.project.updates.deleteBodyRemoved),
  confirmDelete: fr.t(($) => $.project.updates.confirmDelete),
  deleted: fr.t(($) => $.project.updates.deleted),
  deleteError: fr.t(($) => $.project.updates.deleteError),
  report: fr.t(($) => $.report.update),
  menu: fr.t(($) => $.actionMenu.label),
}

/** Les adresses demandées par la page (push, replace, navigate), en texte. */
const destinations = () =>
  [...mockPush.mock.calls, ...mockReplace.mock.calls].map(([to]) => pathOf(to))

/** Le lien (ou bouton) « Voir les 3 mises à jour ». */
const seeAllControl = async () => {
  await screen.findByText(rocketUpdate.title ?? '')
  return (
    screen.queryByRole('link', { name: TEXT.seeAll }) ??
    screen.getByRole('button', { name: TEXT.seeAll })
  )
}

/** Ouvre le menu « … » de la page (le premier de l'arbre : celui de la photo, en haut). */
const openPageMenu = async () => {
  const [menu] = await screen.findAllByRole('button', { name: TEXT.menu })
  if (!menu) throw new Error('no « … » menu on the page')
  await fireEvent.press(menu)
}

/** Le nom (ou le premier texte) de chaque vue qui a reçu le focus par `ui/focus`, dans l'ordre. */
const focusedLabels = () =>
  [focusWithoutScroll, focusAndReveal, moveReaderTo]
    .flatMap((fn) =>
      jest.mocked(fn).mock.calls.map((call, i) => ({
        node: call[0],
        order: jest.mocked(fn).mock.invocationCallOrder[i] ?? 0,
      })),
    )
    .sort((a, b) => a.order - b.order)
    .map(({ node }) => labelOf(node))

// --- La section ---

describe('the updates of a project on its page', () => {
  it('shows the latest update in full under « Les mises à jour »', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('header', { name: TEXT.section })).toBeTruthy()
    expect(screen.getByText(rocketUpdate.title ?? '')).toBeTruthy()
    // Chaque ligne se lit avec sa famille (interface B4).
    expect(readsLine('new', 'Un compte à rebours avant chaque question')).toBe(true)
    expect(readsLine('fixed', 'Le score ne repart plus à zéro au niveau 3')).toBe(true)
    // Ses photos en avant / après : le curseur « Comparer avant et après ».
    expect(screen.getByLabelText(fr.t(($) => $.project.updates.compare))).toBeTruthy()
  })

  it('titles the latest update below the section heading', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    // Interface A3 : « Les mises à jour » est un titre de section ; la mise à jour, un titre en
    // dessous (niveau 3), lu comme titre par les lecteurs d'écran.
    expect(await screen.findByRole('header', { name: rocketUpdate.title ?? '' })).toBeTruthy()
  })

  it('opens the timeline from « Voir les 3 mises à jour »', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await seeAllControl())

    expect(destinations()).toContain(`/projects/${id}/updates`)
  })

  it('says « Voir la mise à jour » when there is only one', async () => {
    seenByOther({ ...withUpdates, updateCount: 1 })
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText(rocketUpdate.title ?? '')
    expect(
      screen.queryAllByText(containing(fr.t(($) => $.project.updates.seeAll, { count: 1 }))),
    ).not.toHaveLength(0)
  })

  it('shows no section to another member when there is no update', async () => {
    seenByOther(recipesProject)
    await renderWithProviders(<ProjectScreen id={id} />)

    // Témoin : la page est affichée.
    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.queryByRole('header', { name: TEXT.section })).toBeNull()
    expect(screen.queryByText(TEXT.empty)).toBeNull()
  })

  it('invites the author to publish a first update', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('header', { name: TEXT.section })).toBeTruthy()
    expect(screen.getByText(TEXT.empty)).toBeTruthy()
    expect(screen.getByRole('button', { name: TEXT.add })).toBeTruthy()
  })

  it('tells the author of a private project that nobody else will see it', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, visibility: 'private' })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText(TEXT.emptyPrivate)).toBeTruthy()
    expect(screen.queryByText(TEXT.empty)).toBeNull()
  })

  it('shows the author « Publier une mise à jour » under the latest update too', async () => {
    jest.mocked(getProject).mockResolvedValue(withUpdates)
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText(rocketUpdate.title ?? '')
    expect(screen.getByRole('button', { name: TEXT.add })).toBeTruthy()
  })

  it('says under the title when the project was last updated, and its version', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText(containing('Mis à jour'))).toBeTruthy()
  })

  it('keeps « Publié le » alone under the title of a project with no update', async () => {
    seenByOther({ ...recipesProject, updatedAt: '2026-10-19T09:00:00.000Z' })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText(containing('Publié le'))).toBeTruthy()
    expect(screen.queryByText(containing('Mis à jour'))).toBeNull()
  })
})

describe('publishing an update from the project page', () => {
  it('opens the sheet « Nouvelle mise à jour » from the section', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: TEXT.add }))

    expect(destinations()).toEqual([`/projects/${id}/update`])
  })

  it('opens the same sheet from the « … » menu of the author', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await openPageMenu()
    await fireEvent.press(screen.getByRole('menuitem', { name: TEXT.add }))

    expect(destinations()).toEqual([`/projects/${id}/update`])
  })

  it('offers another member neither to publish nor to delete an update', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    // Témoin : la mise à jour est affichée.
    await screen.findByText(rocketUpdate.title ?? '')
    expect(screen.queryByRole('button', { name: TEXT.add })).toBeNull()
    expect(screen.queryByRole('button', { name: deleteUpdateName })).toBeNull()
    await openPageMenu()
    expect(screen.queryByRole('menuitem', { name: TEXT.add })).toBeNull()
  })

  it('gives focus back to « Publier une mise à jour » after publishing', async () => {
    const view = await renderWithProviders(<ProjectScreen id={id} />)
    await fireEvent.press(await screen.findByRole('button', { name: TEXT.add }))

    // La feuille a sa propre adresse : la page est quittée, puis retrouvée quand la feuille se
    // ferme (« Mise à jour publiée. »).
    mockFocused = false
    await view.rerender(<ProjectScreen id={id} />)
    jest.mocked(focusWithoutScroll).mockClear()
    jest.mocked(focusAndReveal).mockClear()
    jest.mocked(moveReaderTo).mockClear()
    mockFocused = true
    await view.rerender(<ProjectScreen id={id} />)

    await waitFor(() => expect(focusedLabels().at(-1)).toBe(TEXT.add))
  })
})

describe('the update suggested after a change of status', () => {
  it('opens the sheet for the author who comes from the form with a new status', async () => {
    mockParams = { id, announce: 'testable' }
    await renderWithProviders(<ProjectScreen id={id} />)

    await waitFor(() =>
      expect(destinations()).toContain(`/projects/${id}/update?announce=testable`),
    )
  })

  it('opens nothing for another member', async () => {
    mockParams = { id, announce: 'testable' }
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText(rocketUpdate.title ?? '')
    await act(async () => {})
    expect(destinations().filter((to) => to.includes('/update'))).toEqual([])
  })

  it('opens nothing for a status that does not exist', async () => {
    // Une adresse fabriquée à la main ne doit rien glisser dans la feuille de l'auteur.
    mockParams = { id, announce: 'piratage' }
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: TEXT.section })
    await act(async () => {})
    expect(destinations().filter((to) => to.includes('/update'))).toEqual([])
  })
})

// --- Supprimer une mise à jour ---

describe('deleting an update from the project page', () => {
  beforeEach(() => {
    jest.mocked(getProject).mockResolvedValue(withUpdates)
  })

  it('offers the author to delete the update, once confirmed', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await deleteUpdateButton())
    expect(mockRemoveUpdate).not.toHaveBeenCalled() // il faut d'abord confirmer
    const dialog = dialogTitled(deleteUpdateTitle)
    expect(dialog.getByText(TEXT.deleteBody)).toBeTruthy()
    await passTapGuard()
    await fireEvent.press(dialog.getByRole('button', { name: TEXT.confirmDelete }))

    expect(useDeleteUpdate).toHaveBeenCalledWith(id)
    expect(mockRemoveUpdate).toHaveBeenCalledWith(rocketUpdate.id)
  })

  it('deletes nothing when the author changes her mind', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await deleteUpdateButton())
    await passTapGuard()
    await fireEvent.press(dialogTitled(deleteUpdateTitle).getByRole('button', { name: 'Annuler' }))

    expect(mockRemoveUpdate).not.toHaveBeenCalled()
    expect(screen.queryByRole('header', { name: deleteUpdateTitle })).toBeNull()
  })

  it('opens the window on « Annuler », not on « Supprimer »', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)
    const trash = await deleteUpdateButton()
    const focused = watchOpeningFocus()

    await fireEvent.press(trash)
    dialogTitled(deleteUpdateTitle)

    await waitFor(() => expect(focused()).toBe('Annuler'))
  })

  it('says « Mise à jour supprimée. » once deleted', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await deleteUpdateButton())
    await passTapGuard()
    await fireEvent.press(
      dialogTitled(deleteUpdateTitle).getByRole('button', { name: TEXT.confirmDelete }),
    )

    expect(await screen.findByText(TEXT.deleted)).toBeTruthy()
    expect(screen.queryByRole('header', { name: deleteUpdateTitle })).toBeNull()
  })

  it('keeps the window open with the reason when the deletion fails, to try again', async () => {
    mockRemoveUpdate.mockResolvedValue(false)
    jest
      .mocked(useDeleteUpdate)
      .mockReturnValue({ remove: mockRemoveUpdate, pending: false, error: true, reason: undefined })
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await deleteUpdateButton())
    await passTapGuard()
    await fireEvent.press(
      dialogTitled(deleteUpdateTitle).getByRole('button', { name: TEXT.confirmDelete }),
    )

    const dialog = dialogTitled(deleteUpdateTitle)
    expect(dialog.getByRole('alert')).toHaveTextContent(TEXT.deleteError)
    await passTapGuard()
    await fireEvent.press(dialog.getByRole('button', { name: TEXT.confirmDelete }))
    expect(mockRemoveUpdate).toHaveBeenCalledTimes(2)
  })

  it('sends one deletion on a double tap on « Supprimer »', async () => {
    // La réponse n'arrive pas : « Supprimer » reste occupé, et la seconde tape n'envoie rien.
    mockRemoveUpdate.mockReturnValue(new Promise<boolean>(() => {}))
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await deleteUpdateButton())
    await passTapGuard()
    const confirm = dialogTitled(deleteUpdateTitle).getByRole('button', {
      name: TEXT.confirmDelete,
    })
    await fireEvent.press(confirm)
    await fireEvent.press(confirm)

    expect(mockRemoveUpdate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('header', { name: deleteUpdateTitle })).toBeTruthy()
  })

  it('says in the window of a removed update that the decision is kept for a year', async () => {
    jest.mocked(getProject).mockResolvedValue({
      ...withUpdates,
      latestUpdate: { ...rocketUpdate, removal: removalAfterReport },
    })
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await deleteUpdateButton())

    const dialog = dialogTitled(deleteUpdateTitle)
    expect(dialog.getByText(TEXT.deleteBodyRemoved)).toBeTruthy()
    expect(dialog.queryByText(TEXT.deleteBody)).toBeNull()
  })
})
