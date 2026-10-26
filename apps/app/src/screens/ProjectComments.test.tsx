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
import {
  inesMember,
  inesMention,
  inikoMember,
  leaReply,
  maxComment,
  zoeComment,
  zoeReply,
} from '../testing/comments'
import { removalAfterReport } from '../testing/moderation'
import { reportsOpened } from '../testing/navigation'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr, missingSentences, removalSentences } from '../testing/text'
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

/**
 * Le fil d'un commentaire : « Répondre » est porté par le fil, pas par la carte, qui a ses propres
 * actions depuis la tranche 7a (« Signaler »). On remonte donc jusqu'à l'ensemble qui le contient.
 */
const threadOf = (text: string) => {
  let node = screen.getByText(text).parent
  while (node && within(node).queryAllByRole('button', { name: 'Répondre' }).length === 0) {
    node = node.parent
  }
  if (!node) throw new Error(`no thread around the comment ${text}`)
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
      threadOf('Ça marche aussi en anglais ?').getByRole('button', { name: 'Répondre' }),
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

// --- Tranche 7a : signaler un commentaire, et ce qu'on voit d'un commentaire retiré ---

describe('reporting a comment', () => {
  it('offers « Signaler » on the comment of another member, and opens the page for it', async () => {
    mockComments([maxComment])
    await renderWithProviders(<Comments project={project} />)

    await fireEvent.press(
      cardOf('Super idée, je teste ce soir.').getByRole('button', { name: 'Signaler' }),
    )

    expect(reportsOpened(mockPush)).toEqual([
      expect.objectContaining({ kind: 'comment', id: maxComment.id }),
    ])
  })

  it('offers it on a reply too, which is a comment', async () => {
    mockComments([maxComment])
    await renderWithProviders(<Comments project={project} />)

    await fireEvent.press(cardOf(zoeReply.body).getByRole('button', { name: 'Signaler' }))

    expect(reportsOpened(mockPush)).toEqual([
      expect.objectContaining({ kind: 'comment', id: zoeReply.id }),
    ])
  })

  it('says which comment « Signaler » is about, like the other actions', async () => {
    mockComments([maxComment])
    await renderWithProviders(<Comments project={project} />)

    // Sur téléphone, l'indice lu après le nom : l'auteur et le début du texte.
    expect(
      cardOf('Super idée, je teste ce soir.').getByRole('button', { name: 'Signaler' }),
    ).toHaveProp('accessibilityHint', expect.stringContaining('Super idée'))
  })

  it('never offers to report one’s own comment', async () => {
    mockComments([{ ...maxComment, isMine: true, replies: [] }])
    await renderWithProviders(<Comments project={project} />)

    const card = cardOf('Super idée, je teste ce soir.')
    // Témoin : ses propres actions sont là.
    expect(card.getByRole('button', { name: 'Modifier le commentaire' })).toBeTruthy()
    expect(card.queryByRole('button', { name: 'Signaler' })).toBeNull()
  })

  it('lets the author of the project report a comment as well as hide it', async () => {
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    mockComments([{ ...maxComment, replies: [] }])
    await renderWithProviders(<Comments project={{ ...project, isMine: true }} />)

    const card = cardOf('Super idée, je teste ce soir.')
    expect(card.getByRole('button', { name: 'Masquer le commentaire' })).toBeTruthy()
    expect(card.getByRole('button', { name: 'Signaler' })).toBeTruthy()
  })
})

describe('a comment removed by the moderation', () => {
  /** Le commentaire de Max retiré, tel que l'API le donne aux autres : ni auteur, ni texte. */
  const removedForOthers = {
    ...maxComment,
    state: 'removed' as const,
    author: null,
    body: '',
    mentions: [],
    removal: null,
  }

  it('is only « Contenu retiré par la modération » for the others, and its replies stay', async () => {
    mockComments([removedForOthers])
    await renderWithProviders(<Comments project={project} />)

    expect(screen.getByText('Contenu retiré par la modération')).toBeTruthy()
    expect(screen.queryByText('Commentaire masqué')).toBeNull()
    expect(screen.queryByText('Commentaire supprimé')).toBeNull()
    // Les réponses restent lisibles.
    expect(screen.getByText(zoeReply.body)).toBeTruthy()
    expect(screen.getByText(leaReply.body)).toBeTruthy()
  })

  it('is the same placeholder for the author of the project, who cannot read it', async () => {
    // Règle 1 de la relecture du plan : l'auteur du projet lit un commentaire masqué, jamais un
    // commentaire retiré (l'API ne lui en donne que l'emplacement).
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    mockComments([removedForOthers])
    await renderWithProviders(<Comments project={{ ...project, isMine: true }} />)

    expect(screen.getByText('Contenu retiré par la modération')).toBeTruthy()
    expect(screen.queryByText(containing(fr.t(($) => $.removal.onlyYou)))).toBeNull()
    expect(screen.queryByText('Super idée, je teste ce soir.')).toBeNull()
  })

  it('offers no reply under a removed comment', async () => {
    mockComments([{ ...removedForOthers, replies: [zoeReply] }])
    await renderWithProviders(<Comments project={project} />)

    // Témoin : la réponse est affichée ; mais on ne répond pas sous un contenu retiré.
    expect(screen.getByText(zoeReply.body)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Répondre' })).toBeNull()
  })

  it('shows its author the comment, with « Retiré par la modération » and why', async () => {
    mockComments([
      {
        ...maxComment,
        state: 'removed',
        isMine: true,
        removal: removalAfterReport,
        replies: [],
      },
    ])
    await renderWithProviders(<Comments project={project} />)

    // Son texte, qu'il est désormais seul à lire, et le bandeau qui le dit.
    expect(screen.getByText('Super idée, je teste ce soir.')).toBeTruthy()
    expect(screen.getAllByText(containing(fr.t(($) => $.removal.banner))).length).toBeGreaterThan(0)
    // Ce qui est retiré, pour qui, après un signalement, par une personne, pourquoi, et comment
    // contester (règle 13 de la relecture du plan, article 17 du DSA).
    expect(missingSentences(removalSentences(removalAfterReport), screen)).toEqual([])
    expect(screen.queryByText('Contenu retiré par la modération')).toBeNull()
  })

  it('lets its author delete it, but no longer edit it', async () => {
    // Règle 28 du plan : modifier un contenu retiré est refusé (409 `removed`), le supprimer reste
    // permis.
    mockComments([
      { ...maxComment, state: 'removed', isMine: true, removal: removalAfterReport, replies: [] },
    ])
    await renderWithProviders(<Comments project={project} />)

    const card = cardOf('Super idée, je teste ce soir.')
    expect(card.getByRole('button', { name: 'Supprimer le commentaire' })).toBeTruthy()
    expect(card.queryByRole('button', { name: 'Modifier le commentaire' })).toBeNull()
    // Témoin : le bandeau du retrait est bien là (la carte est celle d'un commentaire retiré).
    expect(screen.getAllByText(containing(fr.t(($) => $.removal.banner))).length).toBeGreaterThan(0)
  })

  it('names nobody who reported it, even to its author', async () => {
    mockComments([
      { ...maxComment, state: 'removed', isMine: true, removal: removalAfterReport, replies: [] },
    ])
    await renderWithProviders(<Comments project={project} />)

    // « Après un signalement » : jamais de qui (la file ne le dit pas non plus à l'appli).
    expect(
      screen.getAllByText(containing(fr.t(($) => $.removal.afterReport))).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(/Malik|Zoé|Inès/)).toBeNull()
  })
})

// --- Tranche 7b : ce qu'on voit d'un commentaire quand un blocage sépare deux membres ---
//
// L'API remplace le commentaire de l'autre par un emplacement sans auteur ni texte (CommentState) :
// `blocked` pour qui a bloqué (« Commentaire d'un membre que tu as bloqué »), `unavailable` pour qui
// est bloqué (« Commentaire indisponible »). « Commentaire masqué » reste au geste de l'auteur du
// projet (règle 8 de la relecture du plan, J6). Comme pour un commentaire supprimé ou retiré,
// l'emplacement n'existe que s'il reste des réponses visibles : les réponses restent lisibles.

describe('a comment hidden by a block', () => {
  /** Le commentaire de Max tel que l'API le donne quand un blocage sépare Max et Malik. */
  const placeholderOf = (state: 'blocked' | 'unavailable') => ({
    ...maxComment,
    state,
    author: null,
    body: '',
    mentions: [],
    removal: null,
  })

  it('is « Commentaire d’un membre que tu as bloqué » for who blocked, and its replies stay', async () => {
    mockComments([placeholderOf('blocked')])
    await renderWithProviders(<Comments project={project} />)

    expect(screen.getByText(fr.t(($) => $.project.comments.blockedPlaceholder))).toBeTruthy()
    // Ni le nom de Max, ni les autres emplacements.
    expect(screen.queryByText('Max')).toBeNull()
    expect(screen.queryByText('Commentaire masqué')).toBeNull()
    expect(screen.queryByText('Commentaire indisponible')).toBeNull()
    // Les réponses des autres restent lisibles.
    expect(screen.getByText(zoeReply.body)).toBeTruthy()
    expect(screen.getByText(leaReply.body)).toBeTruthy()
  })

  it('is « Commentaire indisponible » for who is blocked, without a word on the block', async () => {
    mockComments([placeholderOf('unavailable')])
    await renderWithProviders(<Comments project={project} />)

    expect(screen.getByText(fr.t(($) => $.project.comments.unavailablePlaceholder))).toBeTruthy()
    // Rien ne dit à la personne bloquée qu'elle l'est.
    expect(screen.queryByText(/bloqu/i)).toBeNull()
    expect(screen.queryByText('Commentaire masqué')).toBeNull()
    expect(screen.getByText(zoeReply.body)).toBeTruthy()
  })

  it('offers neither a reply nor a report under the placeholder', async () => {
    mockComments([{ ...placeholderOf('blocked'), replies: [zoeReply] }])
    await renderWithProviders(<Comments project={project} />)

    // Témoin : la réponse de Zoé est là, avec son propre « Signaler ».
    expect(screen.getByText(zoeReply.body)).toBeTruthy()
    // Plus d'interaction avec un membre bloqué : on ne lui répond pas.
    expect(screen.queryByRole('button', { name: 'Répondre' })).toBeNull()
    // Un seul « Signaler » : celui de la réponse de Zoé, pas l'emplacement (rien à y lire).
    expect(screen.queryAllByRole('button', { name: /^Signaler/ })).toHaveLength(1)
  })
})

// Règle 2b de la relecture du plan (Louis, 24/10/2026) : mentionner un membre qu'on a bloqué est
// refusé par l'API (422 `blocked_mention`). Le hook le dit par `reason: 'blockedMention'` (nouvelle
// valeur de CommentFailure, comments/api.ts), et l'écran l'explique au lieu de « Réessaie ».
describe('mentioning a member one blocked', () => {
  // « Tu ne peux pas mentionner @x : tu l'as bloqué. » ou, sans pseudo, « … un membre que tu as
  // bloqué. » : l'API ne dit pas quel pseudo ; l'un ou l'autre convient (question au rapport).
  const blockedMention = /Tu ne peux pas mentionner .*bloqué/

  it('says a blocked member cannot be mentioned, and keeps the comment to change it', async () => {
    mockPost.mockResolvedValue(false)
    jest
      .mocked(usePostComment)
      .mockReturnValue({ post: mockPost, pending: false, error: true, reason: 'blockedMention' })
    await renderWithProviders(<Comments project={project} />)

    await fireEvent.press(screen.getByRole('button', { name: 'Écrire un commentaire' }))
    await fireEvent.changeText(screen.getByLabelText('Ton commentaire'), 'Bravo @ines_morel')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier le commentaire' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(blockedMention)
    expect(screen.queryByText(containing(fr.t(($) => $.project.comments.error)))).toBeNull()
    expect(screen.getByLabelText('Ton commentaire')).toHaveDisplayValue('Bravo @ines_morel')
  })

  it('says the same when an edited comment mentions a blocked member', async () => {
    mockEdit.mockResolvedValue(false)
    jest
      .mocked(useEditComment)
      .mockReturnValue({ edit: mockEdit, pending: false, error: true, reason: 'blockedMention' })
    mockComments([{ ...maxComment, isMine: true }])
    await renderWithProviders(<Comments project={project} />)

    await fireEvent.press(
      cardOf('Super idée, je teste ce soir.').getByRole('button', {
        name: 'Modifier le commentaire',
      }),
    )
    await fireEvent.changeText(screen.getByLabelText('Ton commentaire'), 'Testé avec @ines_morel')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(blockedMention)
  })
})
