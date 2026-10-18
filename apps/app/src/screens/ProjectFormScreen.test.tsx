// Tests du formulaire de projet : publier, puis modifier. L'API est remplacée par de faux appels.
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import {
  createProject,
  deleteVisual,
  getProject,
  pickVisual,
  updateProject,
  uploadVisual,
} from '../projects/api'
import { photo, projectWithPhotos, recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { ProjectFormScreen } from './ProjectFormScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../projects/api', () => ({
  getProject: jest.fn(),
  createProject: jest.fn(),
  updateProject: jest.fn(),
  pickVisual: jest.fn(),
  uploadVisual: jest.fn(),
  deleteVisual: jest.fn(),
}))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}))

/** Une photo choisie dans la galerie de l'appareil. */
const picked = (name: string) => ({ uri: `file:///${name}.jpg`, width: 2048, height: 1536 })

beforeEach(() => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getProject).mockReset().mockResolvedValue(recipesProject)
  jest.mocked(createProject).mockReset()
  jest.mocked(updateProject).mockReset()
  jest.mocked(pickVisual).mockReset()
  jest.mocked(uploadVisual).mockReset()
  jest.mocked(deleteVisual).mockReset()
  mockReplace.mockReset()
})

describe('ProjectFormScreen, publishing', () => {
  it('points to the fields to fix, and drops that hint once they are fixed', async () => {
    await renderWithProviders(<ProjectFormScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Publier' }))
    expect(screen.getByText('Vérifie les champs en rouge.')).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText('Titre'), 'Mon agent de recettes')
    expect(screen.queryByText('Donne un titre à ton projet.')).toBeNull()
    expect(screen.getByText('Vérifie les champs en rouge.')).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText('Le pitch, en une phrase'), 'Un menu malin.')
    expect(screen.queryByText('Vérifie les champs en rouge.')).toBeNull()
  })

  it('publishes a project and opens its page', async () => {
    jest.mocked(createProject).mockResolvedValue({ ok: true, data: recipesProject })
    await renderWithProviders(<ProjectFormScreen />)

    await fireEvent.changeText(screen.getByLabelText('Titre'), 'Mon agent de recettes')
    await fireEvent.changeText(screen.getByLabelText('Le pitch, en une phrase'), 'Un menu malin.')
    await fireEvent.press(screen.getByRole('radio', { name: 'Testable' }))
    // Public par défaut : on le passe en privé.
    await fireEvent.press(screen.getByRole('switch', { name: 'Public' }))
    await fireEvent.changeText(
      screen.getByLabelText('Lien de démo (facultatif)'),
      'https://recettes.example.com',
    )
    expect(screen.getByText('C’est bon : un site public en https.')).toBeTruthy()
    // La recette est repliée au départ.
    await fireEvent.press(screen.getByRole('button', { name: 'Ajouter la recette' }))
    await fireEvent.changeText(
      screen.getByLabelText('Outils et modèles utilisés'),
      'Claude, Cursor',
    )
    await fireEvent.press(screen.getByRole('radio', { name: 'Un week-end' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Ajouter un prompt' }))
    await fireEvent.changeText(screen.getByLabelText('Prompt 1'), 'Propose trois recettes')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier' }))

    expect(createProject).toHaveBeenCalledWith({
      title: 'Mon agent de recettes',
      pitch: 'Un menu malin.',
      description: '',
      status: 'testable',
      visibility: 'private',
      demoUrl: 'https://recettes.example.com/', // forme standard de l'adresse
      tools: ['Claude', 'Cursor'],
      timeSpent: 'weekend',
      prompts: ['Propose trois recettes'],
    })
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/projects/[id]',
      params: { id: recipesProject.id },
    })
  })

  it('explains what is wrong and sends nothing', async () => {
    await renderWithProviders(<ProjectFormScreen />)

    await fireEvent.changeText(
      screen.getByLabelText('Lien de démo (facultatif)'),
      'http://site.example.org',
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Publier' }))

    expect(screen.getByText('Donne un titre à ton projet.')).toBeTruthy()
    expect(screen.getByText('Résume ton projet en une phrase.')).toBeTruthy()
    expect(screen.getByText(/Le lien doit commencer par https:\/\//)).toBeTruthy()
    expect(createProject).not.toHaveBeenCalled()
  })

  it('removes a prompt that was added by mistake', async () => {
    await renderWithProviders(<ProjectFormScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Ajouter la recette' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Ajouter un prompt' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Retirer le prompt 1' }))

    expect(screen.queryByLabelText('Prompt 1')).toBeNull()
  })

  it('shows the message of the API when it refuses', async () => {
    jest.mocked(createProject).mockResolvedValue({ ok: false, error: 'rateLimited' })
    await renderWithProviders(<ProjectFormScreen />)

    await fireEvent.changeText(screen.getByLabelText('Titre'), 'Mon agent')
    await fireEvent.changeText(screen.getByLabelText('Le pitch, en une phrase'), 'Un menu malin.')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier' }))

    expect(
      await screen.findByText('Trop de demandes. Réessaie dans quelques minutes.'),
    ).toBeTruthy()
  })
})

describe('ProjectFormScreen, photos of a new project', () => {
  const fillIn = async () => {
    await fireEvent.changeText(screen.getByLabelText('Titre'), 'Mon agent de recettes')
    await fireEvent.changeText(screen.getByLabelText('Le pitch, en une phrase'), 'Un menu malin.')
  }

  it('keeps the chosen photos until publication, then sends them in order', async () => {
    jest
      .mocked(pickVisual)
      .mockResolvedValueOnce(picked('a'))
      .mockResolvedValueOnce(picked('b'))
      .mockResolvedValueOnce(picked('vertical'))
    jest.mocked(createProject).mockResolvedValue({ ok: true, data: recipesProject })
    jest.mocked(uploadVisual).mockResolvedValue({ ok: true, data: projectWithPhotos })
    await renderWithProviders(<ProjectFormScreen />)

    await fillIn()
    await fireEvent.press(screen.getByRole('button', { name: 'Ajouter une photo' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Ajouter une photo' }))
    // La seconde passe en couverture avant la publication.
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Mettre la photo 2 en couverture' }),
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Choisir une couverture verticale' }))
    expect(uploadVisual).not.toHaveBeenCalled() // rien ne part avant la publication
    await fireEvent.press(screen.getByRole('button', { name: 'Publier' }))

    await waitFor(() => expect(uploadVisual).toHaveBeenCalledTimes(3))
    expect(jest.mocked(uploadVisual).mock.calls).toEqual([
      [recipesProject.id, picked('b'), 'gallery'],
      [recipesProject.id, picked('a'), 'gallery'],
      [recipesProject.id, picked('vertical'), 'portrait'],
    ])
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/projects/[id]',
      params: { id: recipesProject.id },
    })
  })

  it('cannot publish while a chosen photo is still being prepared, so it is never lost', async () => {
    // La photo est choisie (onChosen), puis préparée sur l'appareil : on garde la main sur la fin.
    let finish: (image: ReturnType<typeof picked>) => void = () => {}
    jest.mocked(pickVisual).mockImplementation((_slot, onChosen) => {
      onChosen?.()
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    jest.mocked(createProject).mockResolvedValue({ ok: true, data: recipesProject })
    jest.mocked(uploadVisual).mockResolvedValue({ ok: true, data: projectWithPhotos })
    await renderWithProviders(<ProjectFormScreen />)

    await fillIn()
    await fireEvent.press(screen.getByRole('button', { name: 'Ajouter une photo' }))

    expect(await screen.findByText('Préparation de la photo…')).toBeTruthy()
    const publish = screen.getByRole('button', { name: 'Publier' })
    expect(publish).toBeDisabled()
    await fireEvent.press(publish)
    expect(createProject).not.toHaveBeenCalled()

    finish(picked('a'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publier' })).toBeEnabled())
    expect(screen.queryByText('Préparation de la photo…')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Publier' }))
    await waitFor(() =>
      expect(uploadVisual).toHaveBeenCalledWith(recipesProject.id, picked('a'), 'gallery'),
    )
  })

  it('lets the member publish when she closes the photo picker without choosing', async () => {
    jest.mocked(pickVisual).mockResolvedValue(null) // annulé : onChosen n'est jamais appelé
    await renderWithProviders(<ProjectFormScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Ajouter une photo' }))

    expect(screen.queryByText('Préparation de la photo…')).toBeNull()
    expect(screen.getByRole('button', { name: 'Publier' })).toBeEnabled()
  })

  it('publishes the project anyway when a photo fails, and says so on the edit page', async () => {
    jest.mocked(pickVisual).mockResolvedValueOnce(picked('a'))
    jest.mocked(createProject).mockResolvedValue({ ok: true, data: recipesProject })
    jest.mocked(uploadVisual).mockResolvedValue({ ok: false, error: 'unsupportedMediaType' })
    await renderWithProviders(<ProjectFormScreen />)

    await fillIn()
    await fireEvent.press(screen.getByRole('button', { name: 'Ajouter une photo' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Publier' }))

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/projects/[id]/edit',
        params: { id: recipesProject.id, photos: 'failed' },
      }),
    )
  })

  it('tells what happened when arriving on the edit page after such a failure', async () => {
    await renderWithProviders(<ProjectFormScreen id={recipesProject.id} uploadFailed />)

    expect(
      await screen.findByText(
        'Le projet est publié, mais certaines photos n’ont pas pu être envoyées. Ajoute-les à nouveau ici.',
      ),
    ).toBeTruthy()
  })
})

describe('ProjectFormScreen, photos of an existing project', () => {
  beforeEach(() => {
    jest.mocked(getProject).mockResolvedValue(projectWithPhotos)
  })

  it('sends a new photo right away', async () => {
    const added = {
      ...projectWithPhotos,
      visuals: [...projectWithPhotos.visuals, photo('55555555-5555-4555-8555-555555555555')],
    }
    jest.mocked(pickVisual).mockResolvedValue(picked('d'))
    jest.mocked(uploadVisual).mockResolvedValue({ ok: true, data: added })
    await renderWithProviders(<ProjectFormScreen id={recipesProject.id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Ajouter une photo' }))

    expect(uploadVisual).toHaveBeenCalledWith(recipesProject.id, picked('d'), 'gallery')
    expect(await screen.findByRole('button', { name: 'Retirer la photo 4' })).toBeTruthy()
  })

  it('saves a new cover by sending the whole new order', async () => {
    const [a, b, c] = projectWithPhotos.visuals.map((v) => v.id)
    jest.mocked(updateProject).mockResolvedValue({ ok: true, data: projectWithPhotos })
    await renderWithProviders(<ProjectFormScreen id={recipesProject.id} />)

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Mettre la photo 3 en couverture' }),
    )

    expect(updateProject).toHaveBeenCalledWith(recipesProject.id, { visualOrder: [c, a, b] })
  })

  it('removes a photo, and the vertical cover', async () => {
    const [, second] = projectWithPhotos.visuals
    jest.mocked(deleteVisual).mockResolvedValue({ ok: true, data: projectWithPhotos })
    await renderWithProviders(<ProjectFormScreen id={recipesProject.id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Retirer la photo 2' }))
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Retirer la couverture verticale' }),
    )

    expect(deleteVisual).toHaveBeenNthCalledWith(1, recipesProject.id, second?.id)
    expect(deleteVisual).toHaveBeenNthCalledWith(
      2,
      recipesProject.id,
      projectWithPhotos.portraitCover?.id,
    )
  })

  it('shows why a photo was refused', async () => {
    jest.mocked(pickVisual).mockResolvedValue(picked('e'))
    jest.mocked(uploadVisual).mockResolvedValue({ ok: false, error: 'tooManyVisuals' })
    await renderWithProviders(<ProjectFormScreen id={recipesProject.id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Ajouter une photo' }))

    expect(
      await screen.findByText(
        'Six photos au plus par projet. Retires-en une pour en ajouter une autre.',
      ),
    ).toBeTruthy()
  })
})

describe('ProjectFormScreen, editing', () => {
  it('starts from the project and saves the changes', async () => {
    jest
      .mocked(updateProject)
      .mockResolvedValue({ ok: true, data: { ...recipesProject, title: 'Nouveau titre' } })
    await renderWithProviders(<ProjectFormScreen id={recipesProject.id} />)

    await fireEvent.changeText(
      await screen.findByDisplayValue('Mon agent de recettes'),
      'Nouveau titre',
    )
    // La recette existante est dépliée, avec ses outils en pastilles.
    expect(screen.getByRole('button', { name: 'Retirer Claude Code' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(updateProject).toHaveBeenCalledWith(
      recipesProject.id,
      expect.objectContaining({ title: 'Nouveau titre', status: 'testable' }),
    )
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/projects/[id]',
      params: { id: recipesProject.id },
    })
  })

  it('is refused to anyone but the author', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, isMine: false })
    await renderWithProviders(<ProjectFormScreen id={recipesProject.id} />)

    expect(await screen.findByText('Seul l’auteur peut modifier ce projet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
  })

  it('on a computer, does not offer to publish another project from the form', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(<ProjectFormScreen />)

      expect(await screen.findByRole('button', { name: 'Publier' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Publier un projet' })).toBeNull()
    } finally {
      restore()
    }
  })
})
