// Tests de la page d'un projet : où va le focus autour de la section « Les mises à jour » (R7a,
// projects/ProjectUpdatesSection.tsx). En plus de ProjectScreen.updates.test.tsx, qui suit le
// bouton de la section : la feuille ouverte par le menu « … » rend le focus à ce menu, et une mise à
// jour supprimée laisse le focus au titre de la section (plus de corbeille où le garder).
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { getProject } from '../projects/api'
import { labelOf } from '../testing/arrivedFocus'
import { passTapGuard } from '../testing/dialog'
import { recipesProject } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { ProjectScreen } from './ProjectScreen'
import {
  deleteUpdateButton,
  deleteUpdateTitle,
  dialogTitled,
  id,
  mockPush,
  mockReplace,
  mockScreenProps,
  resetProjectScreenMocks,
  withUpdates,
} from './ProjectScreen.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../projects/api', () => ({ getProject: jest.fn(), deleteProject: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../members/api', () => ({
  useMember: () => ({
    data: { id: 'u1', name: 'Léa', handle: 'lea', isFollowed: false },
    isError: false,
    isPending: false,
  }),
}))
jest.mock('../updates/api', () => ({
  useProjectUpdates: jest.fn(),
  usePublishUpdate: jest.fn(),
  useDeleteUpdate: jest.fn(),
}))
jest.mock('../reactions/api', () => ({ useReaction: jest.fn() }))
jest.mock('../comments/api', () => ({
  useComments: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
jest.mock('../mentions/api', () => ({ useMentionable: () => [] }))
jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    focusAndReveal: jest.fn(actual.focusAndReveal),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})
// La page est-elle affichée ? La feuille a sa propre adresse : la page la quitte, puis y revient.
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
    useLocalSearchParams: () => ({}),
    useIsFocused: () => mockFocused,
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      const focused = mockFocused
      useEffect(() => (focused ? effect() : undefined), [focused, effect])
    },
  }
})
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

const clearFocusSpies = () => {
  jest.mocked(focusWithoutScroll).mockClear()
  jest.mocked(focusAndReveal).mockClear()
  jest.mocked(moveReaderTo).mockClear()
}

beforeEach(() => {
  resetProjectScreenMocks()
  mockFocused = true
  clearFocusSpies()
})

afterEach(() => {
  jest.restoreAllMocks()
})

const ADD = fr.t(($) => $.project.updates.add)
const MENU = fr.t(($) => $.actionMenu.label)
const SECTION = fr.t(($) => $.project.updates.title)

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

describe('focus around the updates of the project page', () => {
  it('gives focus back to « … » when the sheet was opened from the menu', async () => {
    jest.mocked(getProject).mockResolvedValue(recipesProject)
    const view = await renderWithProviders(<ProjectScreen id={id} />)
    const [menu] = await screen.findAllByRole('button', { name: MENU })
    if (!menu) throw new Error('no « … » menu on the page')
    await fireEvent.press(menu)
    await fireEvent.press(screen.getByRole('menuitem', { name: ADD }))

    mockFocused = false
    await view.rerender(<ProjectScreen id={id} />)
    clearFocusSpies()
    mockFocused = true
    await view.rerender(<ProjectScreen id={id} />)

    await waitFor(() => expect(focusedLabels().at(-1)).toBe(MENU))
    expect(focusedLabels()).not.toContain(ADD)
  })

  it('moves focus to the section title once the update is deleted', async () => {
    jest.mocked(getProject).mockResolvedValue(withUpdates)
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await deleteUpdateButton())
    await passTapGuard()
    // La couche de la fenêtre ouverte : on remonte depuis son titre jusqu'au Modal (`onDismiss`).
    let layer = screen.getByRole('header', { name: deleteUpdateTitle }).parent
    while (layer && typeof layer.props.onDismiss !== 'function') layer = layer.parent
    const onDismiss = layer?.props.onDismiss as () => void
    expect(onDismiss).toBeDefined()
    clearFocusSpies()
    await fireEvent.press(
      dialogTitled(deleteUpdateTitle).getByRole('button', {
        name: fr.t(($) => $.project.updates.confirmDelete),
      }),
    )

    // Le Modal simulé n'appelle pas `onDismiss` à la fin de son fondu : on le fait à sa place, pour
    // la fenêtre de suppression, maintenant fermée.
    await waitFor(() =>
      expect(screen.queryByRole('header', { name: deleteUpdateTitle })).toBeNull(),
    )
    await act(async () => onDismiss())

    // Le faux projet garde sa mise à jour (rien ne relit le cache) : son titre la reçoit, sinon
    // celui de la section ; jamais rien d'autre.
    await waitFor(() => expect(focusedLabels().length).toBeGreaterThan(0))
    expect([SECTION, withUpdates.latestUpdate?.title]).toContain(focusedLabels().at(-1))
  })
})
