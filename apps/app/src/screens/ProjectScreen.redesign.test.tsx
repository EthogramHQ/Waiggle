// Tests de la page d'un projet redessinée (R5a) : dates, suivre l'auteur, réactions, menu « … »,
// partager, prompt de départ et bouton du haut.
//
// L'ancien ProjectScreen.test.tsx est coupé par sections (159 tests, de 50 à 100 s à lui seul) : Jest
// donne un fichier entier à un seul processus, alors que plusieurs fichiers tournent en parallèle.
// L'API est remplacée par de faux appels ; les aides et données communes sont dans
// ProjectScreen.testkit.tsx.
import { NO_REACTIONS } from '@ruche/contracts'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { useFollow } from '../follows/api'
import { getProject } from '../projects/api'
import { passTapGuard } from '../testing/dialog'
import { reportsOpened } from '../testing/navigation'
import { recipesProject } from '../testing/projects'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import { copyText } from '../ui/clipboard'
import { ToastProvider } from '../ui/theme/toast'
import { ProjectScreen } from './ProjectScreen'
import {
  controlNames,
  followAuthor,
  id,
  insideScroll,
  mockPush,
  mockReact,
  mockReplace,
  mockScreenProps,
  mockToggle,
  projectUrl,
  readingOrder,
  resetProjectScreenMocks,
  seenByOther,
  withReactions,
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
// Les suggestions après « @ » (tranche 6b) : personne à proposer ; elles sont testées dans
// ProjectComments.test.tsx.
jest.mock('../mentions/api', () => ({ useMentionable: () => [] }))
// Le presse-papiers (R5a) : « Copier le lien » du menu « … » et de la feuille Partager, « Copier »
// d'un prompt. Le test lit ce qui est copié ; l'appareil, lui, n'est jamais touché.
jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
// Les paramètres de l'adresse de la page (?announce=testable), choisis par chaque test.
let mockParams: Record<string, string | undefined> = {}
// RF (ui-1) : la page est-elle affichée ? Sur le web, la page quittée reste montée, cachée ; le
// retour la rend affichée de nouveau. `useIsFocused` et `useFocusEffect` suivent ce drapeau, relu
// à chaque rendu (le test redessine après l'avoir changé).
let mockFocused = true
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    usePathname: () => '/page/actuelle',
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
    useLocalSearchParams: () => mockParams,
    useIsFocused: () => mockFocused,
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      const focused = mockFocused
      useEffect(() => (focused ? effect() : undefined), [focused, effect])
    },
  }
})
// Le cadre de page, tel quel, mais dont le test lit les propriétés (RF : `fade`).
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
})

// --- Tranche R5a : la page projet redessinée (docs/scenarios/refonte.md, « R5a ») ---

describe('the dates under the title', () => {
  it('says when the project was published, and nothing about a change within the minute', async () => {
    jest
      .mocked(getProject)
      .mockResolvedValue({ ...recipesProject, updatedAt: '2026-10-12T08:00:30.000Z' })
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.getAllByText(/Publié /).length).toBeGreaterThan(0)
    expect(screen.queryAllByText(/Mis à jour/)).toHaveLength(0)
  })

  it('adds « Mis à jour » once an update was published, not after a change of the project', async () => {
    jest.mocked(getProject).mockResolvedValue({
      ...recipesProject,
      latestUpdate: rocketUpdate,
      updateCount: 1,
      version: 'v1.2',
    })
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.getAllByText(/Publié /).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Mis à jour /).length).toBeGreaterThan(0)
  })

  it('says « Créé » instead of « Publié » for a private project', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, visibility: 'private' })
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.getAllByText(/Créé /).length).toBeGreaterThan(0)
    expect(screen.queryAllByText(/Publié /)).toHaveLength(0)
  })
})

describe('following the author from the project page', () => {
  it('offers to follow the author, then says « Tu suis Léa »', async () => {
    seenByOther(recipesProject)
    await renderWithProviders(<ProjectScreen id={id} />)

    const chip = await screen.findByRole('switch', { name: followAuthor })
    expect(chip).not.toBeChecked()
    expect(useFollow).toHaveBeenCalledWith({ kind: 'member', id: 'u1' })
    await fireEvent.press(chip)

    expect(mockToggle).toHaveBeenCalledTimes(1)
    // Comme sur la page d'un membre : le nom lu reprend le texte affiché.
    expect(await screen.findByRole('switch', { name: 'Tu suis Léa' })).toBeChecked()
  })

  it('offers no « Suivre » next to one’s own name', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    // Témoin : la page de l'auteur est là, avec « Modifier ».
    expect(await screen.findByRole('button', { name: 'Modifier' })).toBeTruthy()
    expect(screen.queryByRole('switch', { name: followAuthor })).toBeNull()
    expect(screen.queryByText(/^Tu suis/)).toBeNull()
  })
})

describe('the reactions of the project page (R5a)', () => {
  it('on a phone, floats the capsule outside the scrolling page, read after all the content', async () => {
    // Décision de Louis du 2/11/2026 (ui-13) : la place flottante de `Screen` est hors du
    // défilement ; le lecteur d'écran lit la capsule après tout le contenu, comme une barre.
    seenByOther(recipesProject)
    await renderWithProviders(<ProjectScreen id={id} />)

    const capsule = await screen.findByRole('button', { name: 'Waggle !, 0' })
    expect(insideScroll(capsule)).toBe(false)
    const names = controlNames()
    expect(names.indexOf('Waggle !, 0')).toBeGreaterThan(names.indexOf('Signaler ce projet'))
    expect(names.indexOf('Waggle !, 0')).toBeGreaterThan(names.indexOf('Écrire un commentaire'))
  })

  // L'éventail se cherche par son nom : sa couche n'est pas « accessible » (VoiceOver n'atteindrait
  // plus ses lignes), et getByRole ne trouve que les éléments accessibles (ReactionFan.test.tsx).
  it('opens the fan of reactions on a long press on the capsule, without reacting', async () => {
    seenByOther(recipesProject)
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent(await screen.findByRole('button', { name: 'Utile, 0' }), 'longPress')

    expect(await screen.findByLabelText(fr.t(($) => $.reactions.fan.title))).toBeTruthy()
    expect(mockReact).not.toHaveBeenCalled()
  })

  it('reacts to the line touched in the fan', async () => {
    seenByOther(recipesProject)
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent(await screen.findByRole('button', { name: 'Utile, 0' }), 'longPress')
    const fan = within(await screen.findByLabelText(fr.t(($) => $.reactions.fan.title)))
    // Les lignes sont gardées un instant après l'ouverture (le doigt de l'appui long se lève).
    await passTapGuard()
    const funny = fan.getByRole('button', { name: 'Drôle, 0' })
    await fireEvent(funny, 'pressIn')
    await fireEvent.press(funny)

    expect(mockReact).toHaveBeenCalledWith('funny')
  })

  it('tells the author « Pas encore de réaction » instead of five zeros', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText(fr.t(($) => $.project.reactions.ownNone))).toBeTruthy()
    expect(screen.queryAllByRole('listitem', { name: /^(Bluffant|Waggle\s!),/ })).toHaveLength(0)
    // Ni capsule ni éventail pour l'auteur.
    expect(screen.queryByRole('button', { name: /^(Bluffant|Waggle\s!),/ })).toBeNull()
  })

  it('tells the author that only numbers are shown, never who reacted', async () => {
    jest
      .mocked(getProject)
      .mockResolvedValue(withReactions({ counts: { ...NO_REACTIONS.counts, bravo: 2 }, mine: [] }))
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText(fr.t(($) => $.project.reactions.ownCaption))).toBeTruthy()
  })
})

describe('the « … » menu of the project page', () => {
  const openMenu = async () =>
    fireEvent.press(await screen.findByRole('button', { name: fr.t(($) => $.actionMenu.label) }))

  it('offers another member « Copier le lien » and « Signaler ce projet »', async () => {
    seenByOther(recipesProject)
    await renderWithProviders(<ProjectScreen id={id} />)

    await openMenu()
    expect(screen.getByRole('menuitem', { name: 'Copier le lien' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Modifier' })).toBeNull()
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Signaler ce projet' }))

    expect(reportsOpened(mockPush)).toEqual([expect.objectContaining({ kind: 'project', id })])
  })

  it('offers the author « Copier le lien » and « Modifier »', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await openMenu()
    expect(screen.getByRole('menuitem', { name: 'Copier le lien' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Modifier' }))

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/projects/[id]/edit', params: { id } })
  })

  it('copies the address of the project and nothing else, then says who can open it', async () => {
    seenByOther(recipesProject)
    await renderWithProviders(
      <ToastProvider>
        <ProjectScreen id={id} />
      </ToastProvider>,
    )

    await openMenu()
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Copier le lien' }))

    expect(copyText).toHaveBeenCalledWith(projectUrl)
    expect((await screen.findAllByText(fr.t(($) => $.share.copiedMembers))).length).toBeGreaterThan(
      0,
    )
  })

  it('tells the author of a private project that the copied link opens only for her', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, visibility: 'private' })
    await renderWithProviders(
      <ToastProvider>
        <ProjectScreen id={id} />
      </ToastProvider>,
    )

    await openMenu()
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Copier le lien' }))

    expect((await screen.findAllByText(fr.t(($) => $.share.copiedPrivate))).length).toBeGreaterThan(
      0,
    )
  })
})

describe('sharing a project', () => {
  it('opens the share sheet, with the title, who can open the link, and « Copier le lien »', async () => {
    seenByOther(recipesProject)
    await renderWithProviders(
      <ToastProvider>
        <ProjectScreen id={id} />
      </ToastProvider>,
    )

    await fireEvent.press(await screen.findByRole('button', { name: 'Partager' }))

    expect(
      await screen.findByText(fr.t(($) => $.share.title, { title: 'Mon agent de recettes' })),
    ).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.share.membersOnly))).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Copier le lien' }))
    expect(copyText).toHaveBeenCalledWith(projectUrl)
  })

  it('tells the author of a private project that the link opens only for her', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, visibility: 'private' })
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Partager' }))

    expect(await screen.findByText(fr.t(($) => $.share.privateOnly))).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.share.membersOnly))).toBeNull()
  })
})

describe('the starting prompt', () => {
  it('shows « Le prompt de départ » after the description, with its own « Copier »', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    const heading = await screen.findByRole('header', { name: 'Le prompt de départ' })
    expect(
      screen.getByRole('button', { name: fr.t(($) => $.project.prompts.copyStarting) }),
    ).toBeTruthy()
    const description = screen.getByRole('header', { name: 'Comment ça marche' })
    const [descriptionAt, promptAt] = readingOrder(description, heading)
    expect(promptAt).toBeGreaterThan(descriptionAt ?? Number.POSITIVE_INFINITY)
    // L'ancienne liste « Prompts clés » de la recette est remplacée, pas doublée.
    expect(screen.queryByRole('header', { name: 'Prompts clés' })).toBeNull()
  })

  it('folds the other prompts under « Les autres prompts · 2 »', async () => {
    jest.mocked(getProject).mockResolvedValue({
      ...recipesProject,
      prompts: ['Propose trois recettes avec : {ingrédients}', 'Fais la liste', 'Classe par prix'],
    })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(
      await screen.findByRole('button', {
        name: containing(fr.t(($) => $.project.prompts.others, { count: 2 })),
      }),
    ).toBeTruthy()
  })

  it('shows no such section for a project without prompts', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, prompts: [] })
    await renderWithProviders(<ProjectScreen id={id} />)

    // Témoin : la page est là.
    expect(await screen.findByRole('header', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.queryByRole('header', { name: 'Le prompt de départ' })).toBeNull()
  })
})

describe('the button at the top of the project page', () => {
  it('says « Retour » on a phone, never « Retour au fil »', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.getByRole('button', { name: fr.t(($) => $.project.page.back) })).toBeTruthy()
    expect(screen.queryByText('Retour au fil')).toBeNull()
  })

  it('shows « Retour » in words on a computer, once', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(<ProjectScreen id={id} />)

      await screen.findByRole('header', { name: 'Mon agent de recettes' })
      const backs = screen.getAllByRole('button', { name: 'Retour' })
      expect(backs).toHaveLength(1)
      const [back] = backs
      if (!back) throw new Error('a back button is expected')
      expect(within(back).getByText('Retour')).toBeTruthy()
      expect(screen.queryByText('Retour au fil')).toBeNull()
    } finally {
      restore()
    }
  })
})
