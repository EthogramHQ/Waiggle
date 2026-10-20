// Tests de la page d'un projet. L'API (projects/api) est remplacée par de faux appels.
import { type Comment, NO_REACTIONS, type Project } from '@ruche/contracts'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import {
  useComments,
  useDeleteComment,
  useEditComment,
  useHideComment,
  usePostComment,
} from '../comments/api'
import { useFollow } from '../follows/api'
import { useDeleteNote, usePublishNote } from '../notes/api'
import { deleteProject, getProject } from '../projects/api'
import { useReaction } from '../reactions/api'
import {
  commentOf,
  leaReply,
  maxAuthor,
  maxComment,
  zoeComment,
  zoeReply,
} from '../testing/comments'
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
const mockPush = jest.fn()
const mockReplace = jest.fn()
// Les paramètres de l'adresse de la page (?announce=testable), choisis par chaque test.
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

  it('forgets the error once the field is closed and opened again', async () => {
    mockPublish.mockResolvedValue(false)
    jest
      .mocked(usePublishNote)
      .mockReturnValue({ publish: mockPublish, pending: false, error: true })
    await renderWithProviders(<ProjectScreen id={id} />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Publier une note' }))
    await fireEvent.changeText(screen.getByLabelText('Ta note'), 'v2 : mode hors ligne')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))
    await screen.findByRole('alert')

    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Publier une note' }))

    // L'ancienne erreur n'est pas relue : rien n'a encore été réessayé.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('tells the author of a private project that nobody else sees its notes', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, visibility: 'private' })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(
      await screen.findByText(
        'Pas encore de note. Ce projet est privé : personne d’autre que toi ne verra ses notes, jusqu’à ce que tu le rendes public.',
      ),
    ).toBeTruthy()
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
    mockParams = { id, announce: 'testable' }
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByLabelText('Ta note')).toHaveDisplayValue(suggested)
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))

    expect(mockPublish).toHaveBeenCalledWith(suggested)
  })

  it('suggests nothing to another member', async () => {
    mockParams = { id, announce: 'testable' }
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Journal' })
    expect(screen.queryByLabelText('Ta note')).toBeNull()
    expect(screen.queryByText(suggested)).toBeNull()
  })

  it('suggests nothing for a status that does not exist', async () => {
    // Une adresse fabriquée à la main ne doit rien glisser dans le champ de l'auteur.
    mockParams = { id, announce: 'piratage' }
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Journal' })
    expect(screen.queryByLabelText('Ta note')).toBeNull()
  })

  it('says under the field why it opened by itself', async () => {
    mockParams = { id, announce: 'testable' }
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByLabelText('Ta note')
    // \s : les espaces insécables de la typographie française.
    expect(
      screen.getByText(/Ton projet est passé en «\sTestable\s»\s: annonce-le à tes abonnés/),
    ).toBeTruthy()
  })
})

// --- Relectures de la 4b : quand « Réessaie » ne sert à rien, et les suites d'une suppression ---

/** Ouvre le champ, écrit une note et la publie. */
const publishSomething = async () => {
  await fireEvent.press(await screen.findByRole('button', { name: 'Publier une note' }))
  await fireEvent.changeText(screen.getByLabelText('Ta note'), 'v2 : mode hors ligne')
  await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))
}

describe('a note refused for a reason that trying again cannot fix', () => {
  beforeEach(() => mockPublish.mockResolvedValue(false))

  it('says that the 30 notes of the day are used up', async () => {
    jest
      .mocked(usePublishNote)
      .mockReturnValue({ publish: mockPublish, pending: false, error: true, reason: 'limited' })
    await renderWithProviders(<ProjectScreen id={id} />)
    await publishSomething()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tu as publié 30 notes aujourd’hui. La suivante pourra partir demain.',
    )
  })

  it('says that the session expired', async () => {
    jest
      .mocked(usePublishNote)
      .mockReturnValue({ publish: mockPublish, pending: false, error: true, reason: 'expired' })
    await renderWithProviders(<ProjectScreen id={id} />)
    await publishSomething()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
  })
})

describe('writing a note', () => {
  it('forgets the complaint about an empty note as soon as the text changes', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Publier une note' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))
    expect(screen.getByText('Écris ta note avant de la publier.')).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText('Ta note'), 'v')

    expect(screen.queryByText('Écris ta note avant de la publier.')).toBeNull()
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('freezes the text and the cancel button while the note is on its way', async () => {
    jest
      .mocked(usePublishNote)
      .mockReturnValue({ publish: mockPublish, pending: true, error: false })
    await renderWithProviders(<ProjectScreen id={id} />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Publier une note' }))

    expect(screen.getByLabelText('Ta note')).toHaveProp('editable', false)
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  })
})

describe('after deleting a note', () => {
  beforeEach(() => {
    jest.mocked(getProject).mockResolvedValue(withNotes)
  })

  it('keeps the window open with the reason when the deletion fails, to try again', async () => {
    mockRemove.mockResolvedValue(false)
    jest.mocked(useDeleteNote).mockReturnValue({ remove: mockRemove, error: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await deleteButton(0))
    await fireEvent.press(
      dialogTitled('Supprimer cette note ?').getByRole('button', { name: 'Supprimer' }),
    )

    const dialog = dialogTitled('Supprimer cette note ?')
    expect(dialog.getByRole('alert')).toHaveTextContent(
      'La note n’a pas pu être supprimée. Réessaie.',
    )
    await fireEvent.press(dialog.getByRole('button', { name: 'Supprimer' }))
    expect(mockRemove).toHaveBeenCalledTimes(2)
  })

  it('confirms the deletion without interrupting the screen reader', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await deleteButton(0))
    await fireEvent.press(
      dialogTitled('Supprimer cette note ?').getByRole('button', { name: 'Supprimer' }),
    )

    expect(await screen.findByRole('status')).toHaveTextContent('Note supprimée.')
    expect(screen.queryByRole('header', { name: 'Supprimer cette note ?' })).toBeNull()
  })
})

// --- Tranche 5 : réagir et commenter ---

const mockReact = jest.fn()
const mockPost = jest.fn()
const mockEdit = jest.fn()
const mockRemoveComment = jest.fn()
const mockSetHidden = jest.fn()
const mockFetchNextPage = jest.fn()

/**
 * La liste des commentaires telle que useComments la rend : une page déjà lue (comme
 * useInfiniteQuery), et peut-être une suite à charger.
 */
const mockComments = (
  items: Comment[],
  { hasNextPage = false, isFetchingNextPage = false } = {},
) => {
  jest.mocked(useComments).mockReturnValue({
    data: { pages: [{ items, nextCursor: hasNextPage ? 'abc' : null }], pageParams: [undefined] },
    status: 'success',
    isPending: false,
    isLoading: false,
    isSuccess: true,
    isError: false,
    isFetchNextPageError: false,
    error: null,
    hasNextPage,
    isFetchingNextPage,
    isRefetching: false,
    fetchNextPage: mockFetchNextPage,
    refetch: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useComments>)
}

beforeEach(() => {
  mockReact.mockReset()
  jest
    .mocked(useReaction)
    .mockReset()
    .mockReturnValue({ toggle: mockReact, error: false, expired: false })
  mockPost.mockReset().mockResolvedValue(true)
  mockEdit.mockReset().mockResolvedValue(true)
  mockRemoveComment.mockReset().mockResolvedValue(true)
  mockSetHidden.mockReset().mockResolvedValue(true)
  mockFetchNextPage.mockReset().mockResolvedValue(undefined)
  jest
    .mocked(usePostComment)
    .mockReset()
    .mockReturnValue({ post: mockPost, pending: false, error: false })
  jest
    .mocked(useEditComment)
    .mockReset()
    .mockReturnValue({ edit: mockEdit, pending: false, error: false })
  jest
    .mocked(useDeleteComment)
    .mockReset()
    .mockReturnValue({ remove: mockRemoveComment, error: false })
  jest
    .mocked(useHideComment)
    .mockReset()
    .mockReturnValue({ setHidden: mockSetHidden, error: false })
  jest.mocked(useComments).mockReset()
  mockComments([])
})

/** Le projet de Léa avec ces réactions (vu par elle-même, sauf si le test appelle seenByOther). */
const withReactions = (reactions: Project['reactions']): Project => ({
  ...recipesProject,
  reactions,
})

/**
 * Les actions d'un commentaire : on remonte depuis son texte jusqu'au premier ensemble qui contient
 * des boutons, c'est-à-dire sa carte. Les réponses ont chacune la leur, hors de celle de la racine.
 */
const cardOf = (text: string) => {
  let node = screen.getByText(text).parent
  while (node && within(node).queryAllByRole('button').length === 0) node = node.parent
  if (!node) throw new Error(`no actions around the comment ${text}`)
  return within(node)
}

/** Les textes des commentaires affichés, dans l'ordre de la page. */
const shownComments = () =>
  screen.getAllByText(
    /^(Super idée, je teste ce soir\.|Moi aussi, dis-nous !|Merci à vous deux\.|Ça marche aussi en anglais \?)$/,
  )

describe('reacting to a project from its page', () => {
  it('offers another member the five reactions with their numbers, and reacts to the one touched', async () => {
    seenByOther(withReactions({ counts: { ...NO_REACTIONS.counts, bravo: 3 }, mine: [] }))
    await renderWithProviders(<ProjectScreen id={id} />)

    for (const name of ['Bluffant, 0', 'Inspirant, 0', 'Utile, 0', 'Drôle, 0']) {
      expect(await screen.findByRole('button', { name })).toBeTruthy()
    }
    await fireEvent.press(screen.getByRole('button', { name: 'Bravo, 3' }))

    expect(useReaction).toHaveBeenCalledWith(id)
    expect(mockReact).toHaveBeenCalledWith('bravo')
  })

  it('says in their name which reactions are the member’s own', async () => {
    seenByOther(withReactions({ counts: { ...NO_REACTIONS.counts, bravo: 4 }, mine: ['bravo'] }))
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('button', { name: 'Bravo, réagi, 4' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Utile, 0' })).toBeTruthy()
  })

  it('shows the author the numbers of her project, without letting her react', async () => {
    jest
      .mocked(getProject)
      .mockResolvedValue(withReactions({ counts: { ...NO_REACTIONS.counts, bravo: 2 }, mine: [] }))
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText('Les réactions à ton projet')).toBeTruthy()
    expect(screen.getByLabelText('Bravo, 2')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: /^(Bluffant|Inspirant|Utile|Drôle|Bravo),/ }),
    ).toBeNull()
  })

  it('says so when the reaction could not be saved', async () => {
    seenByOther(recipesProject)
    jest.mocked(useReaction).mockReturnValue({ toggle: mockReact, error: true, expired: false })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta réaction n’a pas pu être enregistrée. Réessaie.',
    )
  })

  it('says that the session expired', async () => {
    seenByOther(recipesProject)
    jest.mocked(useReaction).mockReturnValue({ toggle: mockReact, error: true, expired: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
  })
})

describe('the comments of a project', () => {
  it('shows the comments under their header, newest thread first, replies oldest first', async () => {
    seenByOther({ ...recipesProject, commentCount: 4 })
    mockComments([maxComment, zoeComment])
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('header', { name: 'Commentaires (4)' })).toBeTruthy()
    expect(useComments).toHaveBeenCalledWith(id)
    const shown = shownComments()
    expect(shown).toHaveLength(4)
    expect(shown[0]).toHaveTextContent('Super idée, je teste ce soir.')
    expect(shown[1]).toHaveTextContent('Moi aussi, dis-nous !')
    expect(shown[2]).toHaveTextContent('Merci à vous deux.')
    expect(shown[3]).toHaveTextContent('Ça marche aussi en anglais ?')
  })

  it('leads from a comment to the page of its author', async () => {
    seenByOther()
    mockComments([zoeComment, commentOf({ id: maxComment.id, author: maxAuthor, body: 'Bravo' })])
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('link', { name: 'Voir la page de Max' }))

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/members/[id]', params: { id: 'u2' } })
  })

  it('says when a comment was edited', async () => {
    seenByOther()
    mockComments([{ ...zoeComment, editedAt: '2026-10-14T10:00:00.000Z' }])
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText('modifié')).toBeTruthy()
  })

  it('invites to comment when there is no comment yet', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    // Sans commentaire, le titre seul : « (0) » n’apprend rien que la liste vide ne dise.
    expect(await screen.findByRole('header', { name: 'Commentaires' })).toBeTruthy()
    expect(screen.getByText('Pas encore de commentaire.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Écrire un commentaire' })).toBeTruthy()
    expect(screen.queryByText('C’est tout')).toBeNull()
  })

  it('offers the next comments, then says when there are no more', async () => {
    seenByOther()
    mockComments([zoeComment], { hasNextPage: true })
    const view = await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Afficher la suite' }))
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1)

    mockComments([zoeComment])
    await view.rerender(<ProjectScreen id={id} />)
    expect(await screen.findByText('C’est tout')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Afficher la suite' })).toBeNull()
  })

  it('shows « Commentaire supprimé » in place of a deleted comment, above its replies', async () => {
    seenByOther()
    mockComments([{ ...maxComment, author: null, body: '', state: 'deleted', replies: [zoeReply] }])
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText('Commentaire supprimé')).toBeTruthy()
    expect(screen.getByText('Moi aussi, dis-nous !')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Voir la page de Max' })).toBeNull()
  })

  it('shows « Commentaire masqué » in place of a hidden comment the member cannot read', async () => {
    seenByOther()
    mockComments([{ ...maxComment, author: null, body: '', state: 'hidden', replies: [zoeReply] }])
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText('Commentaire masqué')).toBeTruthy()
    expect(screen.getByText('Moi aussi, dis-nous !')).toBeTruthy()
    // Le bandeau des deux auteurs n'est pas pour les autres : ils ne lisent rien du commentaire.
    expect(
      screen.queryByText('Masqué par l’auteur du projet : les autres membres ne le voient plus.'),
    ).toBeNull()
  })
})

/** Ouvre le champ, écrit un commentaire et le publie. */
const commentSomething = async (text = 'Bravo, ça marche !') => {
  await fireEvent.press(await screen.findByRole('button', { name: 'Écrire un commentaire' }))
  await fireEvent.changeText(screen.getByLabelText('Ton commentaire'), text)
  await fireEvent.press(screen.getByRole('button', { name: 'Publier le commentaire' }))
}

describe('writing a comment', () => {
  it('opens a field to write the comment, then publishes it', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    // Le champ n'est pas ouvert d'office.
    await screen.findByRole('button', { name: 'Écrire un commentaire' })
    expect(screen.queryByLabelText('Ton commentaire')).toBeNull()
    await commentSomething('Bravo, ça marche !')

    expect(usePostComment).toHaveBeenCalledWith(id)
    expect(mockPost).toHaveBeenCalledWith({ body: 'Bravo, ça marche !' })
  })

  it('lets the author comment her own project too', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await commentSomething('Merci pour vos retours.')

    expect(mockPost).toHaveBeenCalledWith({ body: 'Merci pour vos retours.' })
  })

  it('empties and closes the field once the comment is published, and says so', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    await commentSomething()

    await waitFor(() => expect(screen.queryByLabelText('Ton commentaire')).toBeNull())
    expect(screen.getByRole('status')).toHaveTextContent('Commentaire publié.')
    // Rouvert, le champ repart de zéro.
    await fireEvent.press(screen.getByRole('button', { name: 'Écrire un commentaire' }))
    expect(screen.getByLabelText('Ton commentaire')).toHaveDisplayValue('')
  })

  it('says so when the comment could not be published, and keeps the text', async () => {
    seenByOther()
    mockPost.mockResolvedValue(false)
    jest.mocked(usePostComment).mockReturnValue({ post: mockPost, pending: false, error: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    await commentSomething('Bravo, ça marche !')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le commentaire n’a pas pu être publié. Réessaie.',
    )
    expect(screen.getByLabelText('Ton commentaire')).toHaveDisplayValue('Bravo, ça marche !')
  })

  it('says that the 60 comments of the hour are used up', async () => {
    seenByOther()
    mockPost.mockResolvedValue(false)
    jest
      .mocked(usePostComment)
      .mockReturnValue({ post: mockPost, pending: false, error: true, reason: 'limited' })
    await renderWithProviders(<ProjectScreen id={id} />)

    await commentSomething()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tu as publié 60 commentaires en une heure. Attends un peu avant le suivant.',
    )
  })

  it('says that the session expired', async () => {
    seenByOther()
    mockPost.mockResolvedValue(false)
    jest
      .mocked(usePostComment)
      .mockReturnValue({ post: mockPost, pending: false, error: true, reason: 'expired' })
    await renderWithProviders(<ProjectScreen id={id} />)

    await commentSomething()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
  })

  it('asks for a text before publishing', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Écrire un commentaire' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Publier le commentaire' }))

    expect(screen.getByText('Écris ton commentaire avant de le publier.')).toBeTruthy()
    expect(mockPost).not.toHaveBeenCalled()
  })
})

describe('replying to a comment', () => {
  beforeEach(() => {
    seenByOther()
    mockComments([maxComment, zoeComment])
  })

  it('opens a field under the comment, then publishes the reply in its thread', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Ça marche aussi en anglais ?')
    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', { name: 'Répondre' }),
    )
    await fireEvent.changeText(screen.getByLabelText('Ta réponse'), 'Oui, en anglais aussi.')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la réponse' }))

    expect(mockPost).toHaveBeenCalledWith({
      body: 'Oui, en anglais aussi.',
      replyTo: zoeComment.id,
    })
    // Une fois publiée, le champ de réponse se referme.
    await waitFor(() => expect(screen.queryByLabelText('Ta réponse')).toBeNull())
  })

  it('answers a reply in the same thread, under its first comment', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Moi aussi, dis-nous !')
    await fireEvent.press(cardOf('Moi aussi, dis-nous !').getByRole('button', { name: 'Répondre' }))
    await fireEvent.changeText(screen.getByLabelText('Ta réponse'), 'Je vous raconte demain.')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la réponse' }))

    // Les réponses tiennent sur un seul niveau : on répond au commentaire racine.
    expect(mockPost).toHaveBeenCalledWith({
      body: 'Je vous raconte demain.',
      replyTo: maxComment.id,
    })
  })

  it('offers no reply under a deleted comment, even to its replies', async () => {
    mockComments([{ ...zoeComment, author: null, body: '', state: 'deleted', replies: [leaReply] }])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Commentaire supprimé')
    // « Répondre » appartient au fil, et ce fil n’accepte plus de réponse : aucun bouton, pas même
    // sous la réponse de Léa, encore visible.
    expect(screen.getByText('Merci à vous deux.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Répondre' })).toBeNull()
  })
})

describe('editing and deleting one’s comment', () => {
  // Max regarde le projet de Léa : son propre commentaire, et celui de Zoé.
  beforeEach(() => {
    seenByOther()
    mockComments([{ ...maxComment, isMine: true }, zoeComment])
  })

  /** Touche ce bouton dans la carte du commentaire de Max. */
  const pressOnMaxComment = async (name: string) => {
    await screen.findByText('Super idée, je teste ce soir.')
    await fireEvent.press(cardOf('Super idée, je teste ce soir.').getByRole('button', { name }))
  }

  it('lets the author of a comment edit it, starting from its text', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await pressOnMaxComment('Modifier le commentaire')
    const field = screen.getByLabelText('Ton commentaire')
    expect(field).toHaveDisplayValue('Super idée, je teste ce soir.')
    await fireEvent.changeText(field, 'Testé : ça marche.')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(useEditComment).toHaveBeenCalledWith(id)
    expect(mockEdit).toHaveBeenCalledWith({ id: maxComment.id, body: 'Testé : ça marche.' })
    await waitFor(() => expect(screen.queryByLabelText('Ton commentaire')).toBeNull())
  })

  it('says so when the edit could not be saved, and keeps the text', async () => {
    mockEdit.mockResolvedValue(false)
    jest.mocked(useEditComment).mockReturnValue({ edit: mockEdit, pending: false, error: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    await pressOnMaxComment('Modifier le commentaire')
    await fireEvent.changeText(screen.getByLabelText('Ton commentaire'), 'Testé.')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le commentaire n’a pas pu être modifié. Réessaie.',
    )
    expect(screen.getByLabelText('Ton commentaire')).toHaveDisplayValue('Testé.')
  })

  it('offers neither edit nor delete on the comments of others', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Ça marche aussi en anglais ?')
    const others = cardOf('Ça marche aussi en anglais ?')
    expect(others.queryByRole('button', { name: 'Modifier le commentaire' })).toBeNull()
    expect(others.queryByRole('button', { name: 'Supprimer le commentaire' })).toBeNull()
    // Une seule paire en tout : celle du commentaire de Max.
    expect(screen.getAllByRole('button', { name: 'Modifier le commentaire' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Supprimer le commentaire' })).toHaveLength(1)
  })

  it('deletes a comment once its author confirms, and says so', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await pressOnMaxComment('Supprimer le commentaire')
    expect(mockRemoveComment).not.toHaveBeenCalled() // il faut d'abord confirmer
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Supprimer' }),
    )

    expect(useDeleteComment).toHaveBeenCalledWith(id)
    expect(mockRemoveComment).toHaveBeenCalledWith(maxComment.id)
    expect(await screen.findByRole('status')).toHaveTextContent('Ton commentaire a été supprimé.')
  })

  it('deletes nothing when the author changes her mind', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await pressOnMaxComment('Supprimer le commentaire')
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Annuler' }),
    )

    expect(mockRemoveComment).not.toHaveBeenCalled()
    expect(screen.queryByRole('header', { name: 'Supprimer ce commentaire ?' })).toBeNull()
  })

  it('keeps the window open with the reason when the deletion fails, to try again', async () => {
    mockRemoveComment.mockResolvedValue(false)
    jest.mocked(useDeleteComment).mockReturnValue({ remove: mockRemoveComment, error: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    await pressOnMaxComment('Supprimer le commentaire')
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Supprimer' }),
    )

    expect(dialogTitled('Supprimer ce commentaire ?').getByRole('alert')).toHaveTextContent(
      'Le commentaire n’a pas pu être supprimé. Réessaie.',
    )
  })
})

describe('hiding a comment from the project page', () => {
  // Léa regarde son projet : le commentaire de Max (et ses réponses, dont la sienne), et celui de
  // Zoé.
  beforeEach(() => {
    mockComments([
      { ...maxComment, replies: [zoeReply, { ...leaReply, isMine: true }] },
      zoeComment,
    ])
  })

  it('lets the author of the project hide the comment of another member', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Super idée, je teste ce soir.')
    await fireEvent.press(
      cardOf('Super idée, je teste ce soir.').getByRole('button', {
        name: 'Masquer le commentaire',
      }),
    )

    expect(useHideComment).toHaveBeenCalledWith(id)
    expect(mockSetHidden).toHaveBeenCalledWith({ id: maxComment.id, hidden: true })
  })

  it('offers her to hide the comments of others only, and to delete her own instead', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Merci à vous deux.')
    const own = cardOf('Merci à vous deux.')
    // Son propre commentaire, elle le supprime plutôt que de le masquer.
    expect(own.queryByRole('button', { name: 'Masquer le commentaire' })).toBeNull()
    expect(own.getByRole('button', { name: 'Supprimer le commentaire' })).toBeTruthy()
    // Celui d'un autre, elle ne le modifie ni ne le supprime : elle peut le masquer.
    const others = cardOf('Ça marche aussi en anglais ?')
    expect(others.queryByRole('button', { name: 'Modifier le commentaire' })).toBeNull()
    expect(others.queryByRole('button', { name: 'Supprimer le commentaire' })).toBeNull()
    expect(others.getByRole('button', { name: 'Masquer le commentaire' })).toBeTruthy()
  })

  it('shows her a hidden comment with its banner, and lets her show it back', async () => {
    mockComments([{ ...zoeComment, state: 'hidden' }])
    await renderWithProviders(<ProjectScreen id={id} />)

    // C’est elle qui l’a masqué : le bandeau le lui dit.
    expect(await screen.findByText('Masqué par toi')).toBeTruthy()
    expect(screen.getByText('Ça marche aussi en anglais ?')).toBeTruthy()
    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', {
        name: 'Démasquer le commentaire',
      }),
    )

    expect(mockSetHidden).toHaveBeenCalledWith({ id: zoeComment.id, hidden: false })
  })

  it('shows its author that a comment is hidden, without letting him show it back', async () => {
    seenByOther()
    mockComments([{ ...maxComment, state: 'hidden', isMine: true, replies: [] }])
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(
      await screen.findByText(
        'Masqué par l’auteur du projet : les autres membres ne le voient plus.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Super idée, je teste ce soir.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Démasquer le commentaire' })).toBeNull()
  })

  it('never offers other members to hide a comment', async () => {
    seenByOther()
    mockComments([maxComment, zoeComment])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Super idée, je teste ce soir.')
    expect(screen.queryByRole('button', { name: 'Masquer le commentaire' })).toBeNull()
  })

  it('says so when the comment could not be hidden', async () => {
    mockSetHidden.mockResolvedValue(false)
    jest.mocked(useHideComment).mockReturnValue({ setHidden: mockSetHidden, error: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Super idée, je teste ce soir.')
    await fireEvent.press(
      cardOf('Super idée, je teste ce soir.').getByRole('button', {
        name: 'Masquer le commentaire',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le changement n’a pas pu être enregistré. Réessaie.',
    )
  })
})

// --- Après les relectures de la tranche 5 ---

/** L'ancêtre le plus proche qui porte ce rôle (les listes et les groupes ne sont pas « accessibles »
 * sur téléphone : getByRole ne les trouve pas, leur rôle sert au web). */
const ancestorWithRole = (node: ReturnType<typeof screen.getByText>, role: string) => {
  let parent = node.parent
  while (parent && parent.props.role !== role) parent = parent.parent
  return parent
}

describe('reactions, after the reviews', () => {
  it('gathers the five reactions of another member in a group named after what they do', async () => {
    seenByOther(recipesProject)
    await renderWithProviders(<ProjectScreen id={id} />)

    const bravo = await screen.findByRole('button', { name: 'Bravo, 0' })
    expect(ancestorWithRole(bravo, 'group')?.props.accessibilityLabel).toBe('Réagir à ce projet')
  })

  it('shows the author her numbers as a list, zeros included', async () => {
    jest
      .mocked(getProject)
      .mockResolvedValue(withReactions({ counts: { ...NO_REACTIONS.counts, bravo: 9 }, mine: [] }))
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Les réactions à ton projet')
    const items = screen.getAllByRole('listitem', {
      name: /^(Bluffant|Inspirant|Utile|Drôle|Bravo),/,
    })
    expect(items).toHaveLength(5)
    expect(screen.getByRole('listitem', { name: 'Bravo, 9' })).toBeTruthy()
    expect(screen.getAllByText('0')).toHaveLength(4)
    const bravo = screen.getByRole('listitem', { name: 'Bravo, 9' })
    expect(ancestorWithRole(bravo, 'list')?.props.accessibilityLabel).toBe(
      'Les réactions à ton projet',
    )
  })
})

describe('replying, once per thread', () => {
  it('offers « Répondre » once per thread, at its end, and on no comment', async () => {
    seenByOther()
    mockComments([maxComment, zoeComment])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Super idée, je teste ce soir.')
    // Deux fils, deux « Répondre » ; le fil de Max en a un seul pour lui et ses deux réponses.
    expect(screen.getAllByRole('button', { name: 'Répondre' })).toHaveLength(2)
    const replies = screen.getAllByText(/^(Moi aussi, dis-nous !|Merci à vous deux\.)$/)
    expect(replies).toHaveLength(2)
  })

  it('offers no reply under a hidden comment, even to the author of the project', async () => {
    mockComments([{ ...maxComment, state: 'hidden' }])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Masqué par toi')
    expect(screen.queryByRole('button', { name: 'Répondre' })).toBeNull()
  })

  it('says that the thread no longer takes replies when the API cannot find it', async () => {
    seenByOther()
    mockComments([zoeComment])
    mockPost.mockResolvedValue(false)
    jest
      .mocked(usePostComment)
      .mockReturnValue({ post: mockPost, pending: false, error: true, reason: 'gone' })
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Répondre' }))
    await fireEvent.changeText(screen.getByLabelText('Ta réponse'), 'Et en espagnol ?')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la réponse' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce fil n’accepte plus de réponse.')
    // Le texte reste dans le champ : rien de ce qui est écrit ne se perd.
    expect(screen.getByLabelText('Ta réponse')).toHaveDisplayValue('Et en espagnol ?')
  })
})

describe('the comments, after the reviews', () => {
  it('shows « Commenter » on a phone, and keeps the full name for screen readers', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    const add = await screen.findByRole('button', { name: 'Écrire un commentaire' })
    expect(within(add).getByText('Commenter')).toBeTruthy()
  })

  it('tells who will read the comment', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Écrire un commentaire' }))

    expect(
      screen.getByText(
        'Tous les membres connectés liront ton commentaire. L’auteur du projet peut le masquer.',
      ),
    ).toBeTruthy()
  })

  it('tells the author of a private project that nobody else will read her reply', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, visibility: 'private' })
    mockComments([{ ...leaReply, isMine: true, replies: [] }])
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Répondre' }))

    expect(screen.getByText(/personne d’autre que toi ne lira cette réponse/)).toBeTruthy()
  })

  it('tells the author of a hidden comment, while editing it, who still reads it', async () => {
    seenByOther()
    mockComments([{ ...maxComment, state: 'hidden', isMine: true, replies: [] }])
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Modifier le commentaire' }))

    expect(
      screen.getByText(/il ne reste visible que de toi et de l’auteur du projet\.$/),
    ).toBeTruthy()
  })

  it('asks to confirm with a word on the replies kept, for a comment that has some', async () => {
    seenByOther()
    mockComments([
      { ...maxComment, isMine: true },
      { ...zoeComment, isMine: true },
    ])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Super idée, je teste ce soir.')
    await fireEvent.press(
      cardOf('Super idée, je teste ce soir.').getByRole('button', {
        name: 'Supprimer le commentaire',
      }),
    )
    expect(
      screen.getByText(/^Ton texte et ton nom disparaîtront pour tout le monde\./),
    ).toBeTruthy()
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Annuler' }),
    )

    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', {
        name: 'Supprimer le commentaire',
      }),
    )
    expect(screen.getByText('Il disparaîtra pour tout le monde.')).toBeTruthy()
  })

  it('says where a deleted reply was that it is gone', async () => {
    seenByOther()
    mockComments([{ ...maxComment, replies: [{ ...zoeReply, isMine: true }, leaReply] }])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Moi aussi, dis-nous !')
    await fireEvent.press(
      cardOf('Moi aussi, dis-nous !').getByRole('button', { name: 'Supprimer le commentaire' }),
    )
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Supprimer' }),
    )
    // La liste n'a pas encore changé dans ce faux hook : on la change comme l'aurait fait l'API.
    mockComments([{ ...maxComment, replies: [leaReply] }])

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('Ton commentaire a été supprimé.')
    // À sa place, juste avant la réponse de Léa, dans le fil.
    const shown = screen.getAllByText(/^(Ton commentaire a été supprimé\.|Merci à vous deux\.)$/)
    expect(shown.map((node) => node.props.children)).toEqual([
      'Ton commentaire a été supprimé.',
      'Merci à vous deux.',
    ])
  })

  it('keeps the button of a comment being hidden busy, without sending twice', async () => {
    // L'API ne répond pas encore : le masquage reste en route.
    mockSetHidden.mockReturnValue(new Promise(() => {}))
    mockComments([zoeComment])
    await renderWithProviders(<ProjectScreen id={id} />)

    const button = await screen.findByRole('button', { name: 'Masquer le commentaire' })
    await fireEvent.press(button)

    expect(screen.getByRole('button', { name: 'Masquer le commentaire' })).toBeBusy()
    await fireEvent.press(screen.getByRole('button', { name: 'Masquer le commentaire' }))
    expect(mockSetHidden).toHaveBeenCalledTimes(1)
  })

  it('offers no retry when the comments could not load because the session expired', async () => {
    seenByOther()
    jest.mocked(useComments).mockReturnValue({
      data: undefined,
      status: 'error',
      isPending: false,
      isError: true,
      isFetchNextPageError: false,
      error: new ApiError('unauthorized'),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useComments>)
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(
      await screen.findByText('Ta session a expiré. Reconnecte-toi pour continuer.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
  })

  it('offers to retry when the comments could not load for another reason', async () => {
    seenByOther()
    jest.mocked(useComments).mockReturnValue({
      data: undefined,
      status: 'error',
      isPending: false,
      isError: true,
      isFetchNextPageError: false,
      error: new ApiError('network'),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useComments>)
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText('Les commentaires n’ont pas pu se charger.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy()
  })

  it('puts « Modifier » and « Supprimer » after the comments on a phone', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('button', { name: 'Écrire un commentaire' })
    const order = screen
      .getAllByRole('button', { name: /^(Écrire un commentaire|Modifier|Supprimer)$/ })
      .map((button) => button.props.accessibilityLabel)
    expect(order).toEqual(['Écrire un commentaire', 'Modifier', 'Supprimer'])
  })
})
