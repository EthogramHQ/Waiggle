// Tests des mentions dans les commentaires d'un projet (tranche 6b) : Malik tape « @in » dans un
// commentaire, une réponse ou une modification, choisit Inès, et « @ines_morel » part avec le
// texte. Une fois publié, « @ines_morel » est un lien vers la page d'Inès (par son identifiant).
// Le reste des commentaires (tranche 5) est testé dans ProjectScreen.test.tsx.
import type { Comment, Project } from '@ruche/contracts'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { Platform } from 'react-native'
import {
  useComments,
  useDeleteComment,
  useEditComment,
  useHideComment,
  usePostComment,
} from '../comments/api'
import { useMentionable } from '../mentions/api'
import { inesMember, inesMention, inikoMember, maxComment, zoeComment } from '../testing/comments'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { Comments } from './ProjectComments'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../comments/api', () => ({
  useComments: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
// Les suggestions après « @ » : un faux hook, qui propose Inès et Iniko pour « in ».
jest.mock('../mentions/api', () => ({ useMentionable: jest.fn() }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/abc',
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

// Malik regarde le projet public de Léa.
const project: Project = { ...recipesProject, isMine: false }
const mockPost = jest.fn()
const mockEdit = jest.fn()

/** La liste des commentaires telle que useComments la rend : une seule page, sans suite. */
const mockComments = (items: Comment[]) =>
  jest.mocked(useComments).mockReturnValue({
    data: { pages: [{ items, nextCursor: null }], pageParams: [undefined] },
    status: 'success',
    isPending: false,
    isLoading: false,
    isSuccess: true,
    isError: false,
    isFetchNextPageError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    isRefetching: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useComments>)

beforeEach(() => {
  mockPush.mockReset()
  mockSession({ user: { id: 'u4', name: 'Malik' } })
  mockPost.mockReset().mockResolvedValue(true)
  mockEdit.mockReset().mockResolvedValue(true)
  jest
    .mocked(usePostComment)
    .mockReset()
    .mockReturnValue({ post: mockPost, pending: false, error: false })
  jest
    .mocked(useEditComment)
    .mockReset()
    .mockReturnValue({ edit: mockEdit, pending: false, error: false })
  jest.mocked(useDeleteComment).mockReset().mockReturnValue({ remove: jest.fn(), error: false })
  jest.mocked(useHideComment).mockReset().mockReturnValue({ setHidden: jest.fn(), error: false })
  jest
    .mocked(useMentionable)
    .mockReset()
    .mockImplementation((_projectId, query) =>
      query?.startsWith('in') ? [inesMember, inikoMember] : [],
    )
  mockComments([])
})

/** Les actions d'un commentaire : on remonte depuis son texte jusqu'à sa carte (comme ProjectScreen.test). */
const cardOf = (text: string) => {
  let node = screen.getByText(text).parent
  while (node && within(node).queryAllByRole('button').length === 0) node = node.parent
  if (!node) throw new Error(`no actions around the comment ${text}`)
  return within(node)
}

/** Tape ce texte dans le champ, puis choisit Inès dans les suggestions. */
const mentionInes = async (label: string, typed: string) => {
  await fireEvent.changeText(screen.getByLabelText(label), typed)
  await fireEvent.press(screen.getByRole('option', { name: /Inès Morel/ }))
}

describe('mentioning a member in a comment', () => {
  it('looks for the members of « @in » on this project', async () => {
    await renderWithProviders(<Comments project={project} />)

    await fireEvent.press(screen.getByRole('button', { name: 'Écrire un commentaire' }))
    await fireEvent.changeText(screen.getByLabelText('Ton commentaire'), 'Bravo @in')

    expect(useMentionable).toHaveBeenCalledWith(project.id, 'in')
    expect(screen.getByRole('option', { name: /Inès Morel.*@ines_morel/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /Iniko Diallo.*@iniko/ })).toBeTruthy()
  })

  it('writes « @ines_morel » once Inès is chosen, and publishes it with the text', async () => {
    await renderWithProviders(<Comments project={project} />)

    await fireEvent.press(screen.getByRole('button', { name: 'Écrire un commentaire' }))
    await mentionInes('Ton commentaire', 'Bravo @in')
    expect(screen.getByLabelText('Ton commentaire')).toHaveDisplayValue('Bravo @ines_morel ')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier le commentaire' }))

    expect(mockPost).toHaveBeenCalledWith({ body: expect.stringContaining('Bravo @ines_morel') })
  })

  it('offers the same suggestions in a reply', async () => {
    mockComments([zoeComment])
    await renderWithProviders(<Comments project={project} />)

    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', { name: 'Répondre' }),
    )
    await mentionInes('Ta réponse', 'Oui, demande à @in')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la réponse' }))

    expect(mockPost).toHaveBeenCalledWith({
      body: expect.stringContaining('Oui, demande à @ines_morel'),
      replyTo: zoeComment.id,
    })
  })

  it('offers the same suggestions when editing a comment', async () => {
    mockComments([{ ...maxComment, isMine: true }])
    await renderWithProviders(<Comments project={project} />)

    await fireEvent.press(
      cardOf('Super idée, je teste ce soir.').getByRole('button', {
        name: 'Modifier le commentaire',
      }),
    )
    await mentionInes('Ton commentaire', 'Testé avec @in')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(mockEdit).toHaveBeenCalledWith({
      id: maxComment.id,
      body: expect.stringContaining('Testé avec @ines_morel'),
    })
  })

  it('closes the suggestions with Escape, and keeps the field open (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<Comments project={project} />)
      await fireEvent.press(screen.getByRole('button', { name: 'Écrire un commentaire' }))
      const field = screen.getByLabelText('Ton commentaire')
      await fireEvent.changeText(field, 'Bravo @in')
      expect(screen.getByLabelText('Membres à mentionner')).toBeTruthy()

      await fireEvent(field, 'keyPress', {
        nativeEvent: { key: 'Escape', preventDefault: jest.fn() },
      })

      // Échap ferme d'abord la liste ; le commentaire en cours reste ouvert, avec son texte.
      expect(screen.queryByLabelText('Membres à mentionner')).toBeNull()
      expect(screen.getByLabelText('Ton commentaire')).toHaveDisplayValue('Bravo @in')
    } finally {
      jest.restoreAllMocks()
    }
  })
})

describe('a published mention', () => {
  it('is a link to the page of the member mentioned', async () => {
    mockComments([
      { ...maxComment, body: 'Demande à @ines_morel, elle sait.', mentions: [inesMention] },
    ])
    await renderWithProviders(<Comments project={project} />)

    await fireEvent.press(screen.getByRole('link', { name: '@ines_morel' }))

    // Le membre gardé avec la mention (son identifiant), même s'il a changé de pseudo depuis.
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/members/[id]',
      params: { id: inesMention.memberId },
    })
  })

  it('stays plain text when the API did not resolve it', async () => {
    mockComments([
      { ...maxComment, body: 'Salut @zoe_martin et @ines_morel !', mentions: [inesMention] },
    ])
    await renderWithProviders(<Comments project={project} />)

    expect(screen.getByText('Salut @zoe_martin et @ines_morel !')).toBeTruthy()
    // Témoin : la mention rendue par l'API est un lien ; l'autre pseudo reste du texte.
    expect(screen.getByRole('link', { name: '@ines_morel' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: '@zoe_martin' })).toBeNull()
  })
})
