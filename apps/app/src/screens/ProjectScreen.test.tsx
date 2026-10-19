// Tests de la page d'un projet. L'API (projects/api) est remplacée par de faux appels.
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import { useFollow } from '../follows/api'
import { useDeleteNote, usePublishNote } from '../notes/api'
import { deleteProject, getProject } from '../projects/api'
import { projectWithPhotos, recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { ProjectScreen } from './ProjectScreen'

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
// Les notes (tranche 4b) : de faux hooks, dont le test lit les appels (publish, remove).
jest.mock('../notes/api', () => ({ usePublishNote: jest.fn(), useDeleteNote: jest.fn() }))
const mockPush = jest.fn()
const mockReplace = jest.fn()
// Les paramètres de l'adresse de la page (?annonce=testable), choisis par chaque test.
let mockParams: Record<string, string | undefined> = {}
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}))

const { id } = recipesProject
const mockToggle = jest.fn()

beforeEach(() => {
  mockToggle.mockReset()
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: mockToggle, error: false, expired: false })
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getProject).mockReset().mockResolvedValue(recipesProject)
  jest.mocked(deleteProject).mockReset()
  mockPush.mockReset()
  mockReplace.mockReset()
})

describe('ProjectScreen', () => {
  it('shows the project with its recipe', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('header', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.getByText('Un menu avec ce qu’il y a au frigo.')).toBeTruthy()
    expect(screen.getByText('Léa')).toBeTruthy()
    expect(screen.getByText('Testable')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Comment ça marche' })).toBeTruthy() // la description
    expect(screen.getByText('Claude Code')).toBeTruthy()
    expect(screen.getByText('Un week-end')).toBeTruthy()
    expect(screen.getByText('Propose trois recettes avec : {ingrédients}')).toBeTruthy()
  })

  it('opens the demo through the warning page', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Tester la démo' }))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/out',
      params: { url: 'https://recettes.example.com' },
    })
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

    expect(await screen.findByText('Privé : visible par toi seulement')).toBeTruthy()
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
  })

  it('deletes nothing when the author changes their mind', async () => {
    await renderWithProviders(<ProjectScreen id={recipesProject.id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Supprimer' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))

    expect(deleteProject).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Supprimer le projet' })).toBeNull()
  })

  it('deletes the project once the author confirms, then goes home', async () => {
    jest.mocked(deleteProject).mockResolvedValue({ ok: true, data: null })
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Supprimer' }))
    expect(deleteProject).not.toHaveBeenCalled() // il faut d'abord confirmer
    await fireEvent.press(screen.getByRole('button', { name: 'Supprimer le projet' }))

    expect(deleteProject).toHaveBeenCalledWith(id)
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('says the project cannot be found, without telling whether it is private', async () => {
    jest.mocked(getProject).mockRejectedValue(new ApiError('notFound'))
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('header', { name: 'Ce projet est introuvable' })).toBeTruthy()
  })

  it('shows the vertical cover on a phone, and the other photos as thumbnails', async () => {
    jest.mocked(getProject).mockResolvedValue(projectWithPhotos)
    await renderWithProviders(<ProjectScreen id={id} />)

    // Les tests affichent un téléphone (390 points de large) : la couverture verticale est en grand.
    expect(await screen.findByLabelText('Couverture verticale')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Photo 1 sur 3' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Photo 3 sur 3' })).toBeTruthy()
  })

  it('shows a photo in large when its thumbnail is touched', async () => {
    jest.mocked(getProject).mockResolvedValue(projectWithPhotos)
    await renderWithProviders(<ProjectScreen id={id} />)

    const second = await screen.findByRole('tab', { name: 'Photo 2 sur 3' })
    await fireEvent.press(second)

    expect(screen.getByRole('tab', { name: 'Photo 2 sur 3' })).toBeSelected()
    expect(screen.queryByLabelText('Couverture verticale')).toBeNull()
  })

  it('uses the first photo as the cover when there is no vertical cover', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...projectWithPhotos, portraitCover: null })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('tab', { name: 'Photo 1 sur 3' })).toBeSelected()
  })

  it('shows no thumbnails for a project without photos', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.queryByRole('button', { name: /^Photo / })).toBeNull()
  })

  it('asks a visitor to sign in', async () => {
    mockSession(null)
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(screen.getByRole('header', { name: 'Réservé aux membres' })).toBeTruthy()
    expect(getProject).not.toHaveBeenCalled()
  })

  it('on a computer, puts the title above the columns and offers to publish a project', async () => {
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
})

// --- Tranche 4b : le journal du projet ---

const mockPublish = jest.fn()
const mockRemove = jest.fn()

beforeEach(() => {
  mockParams = {}
  mockPublish.mockReset().mockResolvedValue(true)
  mockRemove.mockReset().mockResolvedValue(true)
  jest
    .mocked(usePublishNote)
    .mockReset()
    .mockReturnValue({ publish: mockPublish, pending: false, error: false })
  jest.mocked(useDeleteNote).mockReset().mockReturnValue({ remove: mockRemove, error: false })
})

/** Deux notes de Léa, telles que l'API les donne : de la plus récente à la plus ancienne. */
const v2 = {
  id: '0b1c2d3e-4f50-4a61-8b72-c3d4e5f60718',
  body: 'v2 : mode hors ligne',
  createdAt: '2026-10-14T09:00:00.000Z',
}
const firstVersion = {
  id: '1c2d3e4f-5061-4b72-9c83-d4e5f6071829',
  body: 'Première version en ligne',
  createdAt: '2026-10-12T09:00:00.000Z',
}
const withNotes = { ...recipesProject, notes: [v2, firstVersion] }

/** Le projet de Léa, vu par Max. */
const seenByOther = (project = withNotes) => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  jest.mocked(getProject).mockResolvedValue({ ...project, isMine: false })
}

/** Les notes affichées, dans l'ordre de la page. */
const shownNotes = () => screen.getAllByText(/^(v2 : mode hors ligne|Première version en ligne)$/)

/**
 * Le contenu de la fenêtre de confirmation qui porte ce titre : on remonte depuis le titre jusqu'au
 * premier ensemble qui contient aussi des boutons. Utile quand un bouton de la page porte le même
 * nom qu'un bouton de la fenêtre (« Supprimer », pour le projet comme pour la note).
 */
const dialogTitled = (title: string) => {
  let node = screen.getByRole('header', { name: title }).parent
  while (node && within(node).queryAllByRole('button').length === 0) node = node.parent
  if (!node) throw new Error(`no dialog titled ${title}`)
  return within(node)
}

/** Le bouton « Supprimer la note » de la note numéro `index` (0 : la plus récente). */
const deleteButton = async (index: number) => {
  const buttons = await screen.findAllByRole('button', { name: 'Supprimer la note' })
  const button = buttons[index]
  if (!button) throw new Error(`no delete button for note ${index}`)
  return button
}

describe('the journal of a project', () => {
  it('shows the notes under a « Journal » header, newest first', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('header', { name: 'Journal' })).toBeTruthy()
    const shown = shownNotes()
    expect(shown).toHaveLength(2)
    expect(shown[0]).toHaveTextContent('v2 : mode hors ligne')
    expect(shown[1]).toHaveTextContent('Première version en ligne')
  })

  it('shows no journal to another member when there is no note', async () => {
    seenByOther(recipesProject)
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.queryByRole('header', { name: 'Journal' })).toBeNull()
  })

  it('offers another member neither to publish nor to delete a note', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Journal' })
    expect(screen.queryByRole('button', { name: 'Publier une note' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Supprimer la note' })).toBeNull()
    expect(screen.queryByLabelText('Ta note')).toBeNull()
  })

  it('invites the author to write a first note', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('header', { name: 'Journal' })).toBeTruthy()
    expect(
      screen.getByText(
        'Pas encore de note. Raconte où en est ton projet : tes abonnés la verront dans leur fil.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publier une note' })).toBeTruthy()
  })
})

describe('publishing a note from the project page', () => {
  it('opens a field to write the note, then publishes it', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    // Le champ n'est pas ouvert d'office.
    await screen.findByRole('header', { name: 'Journal' })
    expect(screen.queryByLabelText('Ta note')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Publier une note' }))
    await fireEvent.changeText(screen.getByLabelText('Ta note'), 'v2 : mode hors ligne')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))

    expect(usePublishNote).toHaveBeenCalledWith(id)
    expect(mockPublish).toHaveBeenCalledWith('v2 : mode hors ligne')
  })

  it('empties and closes the field once the note is published', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Publier une note' }))
    await fireEvent.changeText(screen.getByLabelText('Ta note'), 'v2 : mode hors ligne')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))

    await waitFor(() => expect(screen.queryByLabelText('Ta note')).toBeNull())
    // Rouvert, le champ repart de zéro.
    await fireEvent.press(screen.getByRole('button', { name: 'Publier une note' }))
    expect(screen.getByLabelText('Ta note')).toHaveDisplayValue('')
  })

  it('says so when the note could not be published, and keeps the text', async () => {
    mockPublish.mockResolvedValue(false)
    jest
      .mocked(usePublishNote)
      .mockReturnValue({ publish: mockPublish, pending: false, error: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Publier une note' }))
    await fireEvent.changeText(screen.getByLabelText('Ta note'), 'v2 : mode hors ligne')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La note n’a pas pu être publiée. Réessaie.',
    )
    // Rien n'est perdu : le texte attend dans le champ, pour réessayer.
    expect(screen.getByLabelText('Ta note')).toHaveDisplayValue('v2 : mode hors ligne')
  })
})

describe('deleting a note from the project page', () => {
  beforeEach(() => {
    jest.mocked(getProject).mockResolvedValue(withNotes)
  })

  it('offers the author to delete each note, once confirmed', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findAllByRole('button', { name: 'Supprimer la note' })).toHaveLength(2)
    await fireEvent.press(await deleteButton(0))
    expect(mockRemove).not.toHaveBeenCalled() // il faut d'abord confirmer
    const dialog = dialogTitled('Supprimer cette note ?')
    await fireEvent.press(dialog.getByRole('button', { name: 'Supprimer' }))

    expect(useDeleteNote).toHaveBeenCalledWith(id)
    expect(mockRemove).toHaveBeenCalledWith(v2.id)
  })

  it('deletes nothing when the author changes her mind', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await deleteButton(1))
    await fireEvent.press(
      dialogTitled('Supprimer cette note ?').getByRole('button', { name: 'Annuler' }),
    )

    expect(mockRemove).not.toHaveBeenCalled()
    expect(screen.queryByRole('header', { name: 'Supprimer cette note ?' })).toBeNull()
  })
})

describe('the note suggested after a change of status', () => {
  const suggested = 'Le projet passe en « Testable ».'

  it('opens the field, filled in with the new status, when the author comes from the form', async () => {
    mockParams = { id, annonce: 'testable' }
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByLabelText('Ta note')).toHaveDisplayValue(suggested)
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))

    expect(mockPublish).toHaveBeenCalledWith(suggested)
  })

  it('suggests nothing to another member', async () => {
    mockParams = { id, annonce: 'testable' }
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Journal' })
    expect(screen.queryByLabelText('Ta note')).toBeNull()
    expect(screen.queryByText(suggested)).toBeNull()
  })

  it('suggests nothing for a status that does not exist', async () => {
    // Une adresse fabriquée à la main ne doit rien glisser dans le champ de l'auteur.
    mockParams = { id, annonce: 'piratage' }
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Journal' })
    expect(screen.queryByLabelText('Ta note')).toBeNull()
  })
})
