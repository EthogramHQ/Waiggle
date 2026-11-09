// Tests de la page d'un projet : ce qu'elle montre (recette, galerie, visiteur, ordinateur) et
// suivre le projet depuis sa page.
//
// L'ancien ProjectScreen.test.tsx est coupé par sections (159 tests, de 50 à 100 s à lui seul) : Jest
// donne un fichier entier à un seul processus, alors que plusieurs fichiers tournent en parallèle.
// L'API est remplacée par de faux appels ; les aides et données communes sont dans
// ProjectScreen.testkit.tsx.
import type { Project } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import { useFollow } from '../follows/api'
import { deleteProject, getProject } from '../projects/api'
import { passTapGuard } from '../testing/dialog'
import { visited } from '../testing/navigation'
import { legacyProject, projectWithPhotos, recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { ProjectScreen } from './ProjectScreen'
import {
  dialogTitled,
  id,
  mockPush,
  mockReplace,
  mockScreenProps,
  mockToggle,
  readingOrder,
  resetProjectScreenMocks,
  signInAgain,
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
// Les notes (tranche 4b) : de faux hooks, dont le test lit les appels (publish, remove).
jest.mock('../notes/api', () => ({ usePublishNote: jest.fn(), useDeleteNote: jest.fn() }))
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
// R6a (ui-M3) : après une suppression, `dismissTo('/me')` est permis (jamais un retour vers la page).
const mockDismissTo = jest.fn()
// RF (ui-1) : la page est-elle affichée ? Sur le web, la page quittée reste montée, cachée ; le
// retour la rend affichée de nouveau. `useIsFocused` et `useFocusEffect` suivent ce drapeau, relu
// à chaque rendu (le test redessine après l'avoir changé).
let mockFocused = true
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    usePathname: () => '/page/actuelle',
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      dismissTo: mockDismissTo,
      back: jest.fn(),
    }),
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
  mockDismissTo.mockReset()
})

// --- R6a : supprimer depuis le menu « … », la recette, la catégorie ---

/** Ouvre le menu « … » de la page (« Plus d'actions »). */
const openMenu = async () =>
  fireEvent.press(await screen.findByRole('button', { name: fr.t(($) => $.actionMenu.label) }))
/** Le titre de la fenêtre de suppression : « Supprimer « Mon agent de recettes » ? ». */
const deleteTitle = fr.t(($) => $.project.page.deleteTitle, { title: recipesProject.title })
/** « Supprimer », touché dans le menu « … » de l'auteur. */
const askToDelete = async () => {
  await openMenu()
  await fireEvent.press(screen.getByRole('menuitem', { name: 'Supprimer' }))
}
/** Le contenu de la fenêtre de suppression. */
const deleteWindow = () => dialogTitled(deleteTitle)
/** Le texte tel que l'écran le montre : les espaces insécables de fr.ts lus comme des espaces. */
const shown = (text: string) => text.replace(/\s+/g, ' ')
/** « Commencé en septembre 2026 ». */
const startedOn = (month: string) => shown(fr.t(($) => $.project.page.startedOn, { month }))
/** « Facile à refaire : À la portée de tous ». */
const difficultyOf = (level: NonNullable<Project['difficulty']>) =>
  shown(fr.t(($) => $.project.page.difficulty, { level: fr.t(($) => $.project.difficulty[level]) }))

describe('ProjectScreen', () => {
  it('shows the project with its recipe', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('header', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.getByText('Un menu avec ce qu’il y a au frigo.')).toBeTruthy()
    expect(screen.getByText('Léa')).toBeTruthy()
    expect(screen.getByText('Testable')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Comment ça marche' })).toBeTruthy() // la description
    expect(screen.getByText('Claude Code')).toBeTruthy()
    // R6a : « La recette » montre le mois de début et la difficulté ; le temps passé a disparu.
    expect(screen.getByText(startedOn('septembre 2026'))).toBeTruthy()
    expect(screen.getByText(difficultyOf('easy'))).toBeTruthy()
    expect(screen.getByText('Propose trois recettes avec : {ingrédients}')).toBeTruthy()
  })

  it('opens the demo through the warning page, which learns from which project it comes', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Tester la démo' }))

    // R5a (plan, U6a) : la page de sortie reçoit aussi l'identifiant du projet, pour dire « La démo
    // de … » ; elle relit le projet par l'API, jamais l'adresse seule.
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/out',
      params: { url: 'https://recettes.example.com', project: id },
    })
  })

  it('says under « Tester la démo » that the demo is on a site outside the app', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(
      await screen.findByText(
        fr.t(($) => $.project.page.external, { host: 'recettes.example.com' }),
      ),
    ).toBeTruthy()
  })

  it('says when there is no demo yet', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, demoUrl: null })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText('Pas encore de démo')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tester la démo' })).toBeNull()
  })

  it('tells the author when the project is private', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, visibility: 'private' })
    await renderWithProviders(<ProjectScreen id={id} />)

    // R5a (jur-1) : le bandeau dit aussi ce que deviennent les commentaires et les réactions reçus.
    expect(await screen.findByText(fr.t(($) => $.project.page.privateBanner))).toBeTruthy()
  })

  it('leads to the page of the author, and to the page of each tool', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('link', { name: 'Voir la page de Léa' }))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/members/[id]', params: { id: 'u1' } })

    await fireEvent.press(screen.getByRole('link', { name: 'Claude Code' }))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/tags/[slug]',
      params: { slug: 'claude-code' },
    })
  })

  it('lets the author edit the project', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Modifier' }))

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/projects/[id]/edit', params: { id } })
  })

  it('offers neither edit nor delete to another member', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, isMine: false })
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull()
    // R6a : ni dans le menu « … » non plus (témoin : le menu s'ouvre, avec « Signaler »).
    await openMenu()
    expect(screen.getByRole('menuitem', { name: 'Signaler ce projet' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Supprimer' })).toBeNull()
  })

  // R6a (scénario « Supprimer », planche `R6-Supprimer`) : « Supprimer » passe dans le menu « … »
  // de l'auteur ; le gros bouton rouge de la page disparaît.
  it('offers Delete in the « … » menu of the author, and no delete button on the page', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull()
    await openMenu()
    expect(screen.getByRole('menuitem', { name: 'Modifier' })).toBeTruthy() // témoin
    expect(screen.getByRole('menuitem', { name: 'Supprimer' })).toBeTruthy()
  })

  it('deletes nothing when the author changes their mind', async () => {
    await renderWithProviders(<ProjectScreen id={recipesProject.id} />)

    await askToDelete()
    await passTapGuard()
    await fireEvent.press(deleteWindow().getByRole('button', { name: 'Annuler' }))

    expect(deleteProject).not.toHaveBeenCalled()
    expect(screen.queryByRole('header', { name: deleteTitle })).toBeNull()
  })

  it('asks with the title and what disappears, before deleting', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await askToDelete()

    expect(screen.getByRole('header', { name: deleteTitle })).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.project.page.deleteConfirm))).toBeTruthy()
    expect(deleteProject).not.toHaveBeenCalled() // il faut d'abord confirmer
  })

  // Choix 7 du scénario et relecture du plan ui-M3 : après la suppression, « Mes projets », jamais
  // un retour vers la page supprimée.
  it('deletes the project once the author confirms, then goes to « Mes projets »', async () => {
    jest.mocked(deleteProject).mockResolvedValue({ ok: true, data: null })
    await renderWithProviders(<ProjectScreen id={id} />)

    await askToDelete()
    await passTapGuard()
    await fireEvent.press(deleteWindow().getByRole('button', { name: 'Supprimer' }))

    expect(deleteProject).toHaveBeenCalledWith(id)
    await waitFor(() =>
      expect(
        visited(mockPush, mockReplace, mockDismissTo).some((href) => href.startsWith('/me')),
      ).toBe(true),
    )
    expect(visited(mockPush, mockReplace, mockDismissTo)).not.toContain(`/projects/${id}`)
  })

  it('deletes once on a double tap, the window staying open while it deletes', async () => {
    // La suppression reste en cours : la fenêtre est occupée (`busy`) et ne se ferme pas.
    jest.mocked(deleteProject).mockReturnValue(new Promise(() => {}))
    await renderWithProviders(<ProjectScreen id={id} />)

    await askToDelete()
    await passTapGuard()
    const confirm = deleteWindow().getByRole('button', { name: 'Supprimer' })
    await fireEvent.press(confirm)
    await fireEvent.press(confirm)

    expect(deleteProject).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('header', { name: deleteTitle })).toBeTruthy()
  })

  it('says the project cannot be found, without telling whether it is private', async () => {
    jest.mocked(getProject).mockRejectedValue(new ApiError('notFound'))
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('header', { name: 'Ce projet est introuvable' })).toBeTruthy()
  })

  // R5a (F-404) : la page introuvable d'un projet ramène au fil, en bas, et garde un Retour en haut.
  it('leads back to the feed from a project that cannot be found', async () => {
    jest.mocked(getProject).mockRejectedValue(new ApiError('notFound'))
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Ce projet est introuvable' })
    expect(screen.getByText(fr.t(($) => $.project.page.notFound))).toBeTruthy()
    const toFeed =
      screen.queryByRole('link', { name: 'Retour au fil' }) ??
      screen.getByRole('button', { name: 'Retour au fil' })
    // L'action d'aujourd'hui (« Retour à l'accueil ») est remplacée, pas doublée.
    expect(screen.queryByRole('button', { name: fr.t(($) => $.states.home) })).toBeNull()
    await fireEvent.press(toFeed)

    expect(visited(mockPush, mockReplace)).toContain('/')
  })
})

// R5a (F-Pr7) : la galerie qui glisse remplace la couverture et ses miniatures. Les anciens tests
// des miniatures (« Photo 2 sur 3 » en onglet, la couverture verticale en grand) sont réécrits ici.
describe('the gallery of a project', () => {
  /** L'élément réglable de la galerie, nommé « Photos du projet ». */
  const gallery = () => screen.findByLabelText(fr.t(($) => $.gallery.label))

  it('shows the photos in a gallery with « 1 sur 3 », instead of thumbnails', async () => {
    jest.mocked(getProject).mockResolvedValue(projectWithPhotos)
    await renderWithProviders(<ProjectScreen id={id} />)

    const photos = await gallery()
    expect(photos.props.accessibilityValue).toEqual(
      expect.objectContaining({ text: 'Photo 1 sur 3' }),
    )
    expect(screen.getByText('1 sur 3')).toBeTruthy()
    // Les miniatures ont disparu : plus d'onglet « Photo 1 sur 3 ».
    expect(screen.queryByRole('tab', { name: /^Photo / })).toBeNull()
  })

  it('lets a screen reader move to the next photo without swiping', async () => {
    jest.mocked(getProject).mockResolvedValue(projectWithPhotos)
    await renderWithProviders(<ProjectScreen id={id} />)

    const photos = await gallery()
    await fireEvent(photos, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })

    expect(await screen.findByText('2 sur 3')).toBeTruthy()
  })

  it('shows neither dots nor « 1 sur 1 » for a single photo', async () => {
    jest.mocked(getProject).mockResolvedValue({
      ...projectWithPhotos,
      visuals: projectWithPhotos.visuals.slice(0, 1),
      portraitCover: null,
    })
    await renderWithProviders(<ProjectScreen id={id} />)

    // Témoin : la galerie est là, avec sa photo unique.
    expect(await gallery()).toBeTruthy()
    expect(screen.queryByText('1 sur 1')).toBeNull()
  })

  it('shows no gallery counter for a project without photos', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.queryByText(/^\d+ sur \d+$/)).toBeNull()
    expect(screen.queryByRole('tab', { name: /^Photo / })).toBeNull()
  })

  it('offers arrows on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      jest.mocked(getProject).mockResolvedValue(projectWithPhotos)
      await renderWithProviders(<ProjectScreen id={id} />)

      await gallery()
      expect(screen.getByRole('button', { name: fr.t(($) => $.gallery.next) })).toBeTruthy()
      expect(screen.getByRole('button', { name: fr.t(($) => $.gallery.previous) })).toBeTruthy()
    } finally {
      restore()
    }
  })
})

describe('ProjectScreen, for a visitor and on a computer', () => {
  it('asks a visitor to sign in', async () => {
    mockSession(null)
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(screen.getByRole('header', { name: 'Réservé aux membres' })).toBeTruthy()
    expect(getProject).not.toHaveBeenCalled()
  })

  // R5a (F-Pr13) : le titre passe dans la colonne de droite ; il reste le seul titre de ce nom.
  it('on a computer, shows the title once and offers to publish a project', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(<ProjectScreen id={id} />)

      expect(await screen.findByRole('header', { name: 'Mon agent de recettes' })).toBeTruthy()
      expect(screen.getAllByRole('header', { name: 'Mon agent de recettes' })).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Publier un projet' })).toBeTruthy()
    } finally {
      restore()
    }
  })
})

describe('following a project from its page', () => {
  /** Le projet de Léa, vu par Max. */
  const seenByMax = (follow: { isFollowed: boolean; followerCount: number }) => {
    mockSession({ user: { id: 'u2', name: 'Max' } })
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, isMine: false, ...follow })
  }

  it('offers to follow the project of another member, and says how many follow it', async () => {
    seenByMax({ isFollowed: false, followerCount: 2 })
    await renderWithProviders(<ProjectScreen id={id} />)

    const button = await screen.findByRole('switch', { name: 'Suivre ce projet' })
    expect(button).not.toBeChecked()
    expect(screen.getByText('Suivre ce projet')).toBeTruthy()
    expect(screen.getByText('2 abonnés')).toBeTruthy()
    expect(useFollow).toHaveBeenCalledWith({ kind: 'project', id })

    await fireEvent.press(button)

    expect(mockToggle).toHaveBeenCalledTimes(1)
  })

  it('shows that the project is followed', async () => {
    seenByMax({ isFollowed: true, followerCount: 3 })
    await renderWithProviders(<ProjectScreen id={id} />)

    // Une fois suivi, le nom lu reprend le texte affiché, pour la commande vocale.
    expect(await screen.findByRole('switch', { name: 'Projet suivi' })).toBeChecked()
    expect(screen.getByText('Projet suivi')).toBeTruthy()
    expect(screen.getByText('3 abonnés')).toBeTruthy()
  })

  it('offers no follow button on one’s own project', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.queryByRole('switch', { name: 'Suivre ce projet' })).toBeNull()
  })

  it('says so when the follow could not be saved', async () => {
    seenByMax({ isFollowed: false, followerCount: 2 })
    jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: true, expired: false })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'L’abonnement n’a pas pu être enregistré. Réessaie.',
    )
  })

  it('offers no sign-in link when the follow failed for another reason (slice 6c)', async () => {
    seenByMax({ isFollowed: false, followerCount: 2 })
    jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: true, expired: false })
    await renderWithProviders(<ProjectScreen id={id} />)

    // Témoin : le message d'erreur est bien là.
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Me reconnecter' })).toBeNull()
  })

  it('offers to sign in again when the session expired while following (slice 6c)', async () => {
    seenByMax({ isFollowed: false, followerCount: 2 })
    jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: true, expired: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
    await signInAgain()
  })
})

// R6a (scénario « Commencé en » et « Facile à refaire ? », « La catégorie sur les cartes et la
// page ») : la recette montre le mois de début et la difficulté quand l'auteur les a donnés, plus
// le temps passé ; la catégorie est à côté du statut, la seconde après un point.
describe('the recipe and the category of a project (R6a)', () => {
  it('shows neither the month nor the difficulty when the author gave none, and no time spent', async () => {
    jest
      .mocked(getProject)
      .mockResolvedValue({ ...recipesProject, startedOn: null, difficulty: null })
    await renderWithProviders(<ProjectScreen id={id} />)

    // Témoin : la recette est là, avec ses outils.
    expect(await screen.findByRole('header', { name: 'La recette' })).toBeTruthy()
    expect(screen.queryByText(/^Commencé en/)).toBeNull()
    expect(screen.queryByText(/^Facile à refaire/)).toBeNull()
    expect(screen.queryByText(/Temps passé/)).toBeNull()
  })

  it('shows the recipe with only a month and a difficulty, without tools', async () => {
    jest.mocked(getProject).mockResolvedValue({
      ...recipesProject,
      tools: [],
      startedOn: '2026-03',
      difficulty: 'medium',
    })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('header', { name: 'La recette' })).toBeTruthy()
    expect(screen.getByText(startedOn('mars 2026'))).toBeTruthy()
    expect(screen.getByText(difficultyOf('medium'))).toBeTruthy()
  })

  it('shows the category next to the status, the second after a dot', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    const title = await screen.findByRole('header', { name: 'Mon agent de recettes' })
    const categories = screen.getByText(
      shown(
        fr.t(($) => $.project.page.categories, {
          primary: fr.t(($) => $.project.category.cooking),
          secondary: fr.t(($) => $.project.category.family),
        }),
      ),
    )
    // À côté du statut, avant le titre (comme le statut aujourd'hui).
    const [status, category, heading] = readingOrder(
      screen.getByText('Testable'),
      categories,
      title,
    )
    expect(status).toBeGreaterThanOrEqual(0)
    expect(category).toBeGreaterThan(status ?? -1)
    expect(heading).toBeGreaterThan(category ?? -1)
  })

  it('shows the primary category alone when there is no second', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, secondaryCategory: null })
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.getByText(fr.t(($) => $.project.category.cooking))).toBeTruthy()
    expect(screen.queryByText(/ · /)).toBeNull()
  })

  it('shows no category for a project published before categories', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...legacyProject, title: recipesProject.title })
    await renderWithProviders(<ProjectScreen id={id} />)

    // Témoin : la page et son statut sont là.
    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.getByText('Testable')).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.project.category.cooking))).toBeNull()
    expect(screen.queryByText(/ · /)).toBeNull()
  })
})
