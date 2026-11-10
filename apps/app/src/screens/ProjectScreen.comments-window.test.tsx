// Tests de la page d'un projet : ce que le champ des commentaires dit selon la fenêtre (R5b, décisions
// 17 et 19 du scénario, relecture design des-A2 et des-A9) :
// - une fenêtre basse, la légende se réduit à la phrase qui dit qui lira, sauf celle d'un commentaire
//   masqué, qui reste entière ;
// - sur ordinateur, le bandeau d'une réponse rappelle un extrait du commentaire visé, que la colonne a
//   pu sortir de l'écran ; la feuille d'un téléphone, où la carte reste en vue, garde « Réponse à … ».
//
// L'API est remplacée par de faux appels ; les aides et données communes sont dans
// ProjectScreen.testkit.tsx (la page) et ProjectComments.testkit.tsx (les commentaires).
import { fireEvent, screen } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { getProject } from '../projects/api'
import { maxComment, zoeComment } from '../testing/comments'
import { recipesProject } from '../testing/projects'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { cardOf, chooseInMenu, commentField, openSheet, sheet } from './ProjectComments.testkit'
import { ProjectScreen } from './ProjectScreen'
import {
  id,
  mockComments,
  mockPush,
  mockReplace,
  mockScreenProps,
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
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
// La page de l'auteur est lue, comme dans les autres fichiers de la page.
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
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    usePathname: () => '/page/actuelle',
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useIsFocused: () => true,
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      useEffect(() => effect(), [effect])
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
})

/** Les blancs d'Intl et de la typographie française ramenés à des espaces, comme getByText. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

const windowOf = (width: number, height: number) => {
  const size = { width, height, scale: 2, fontScale: 1 }
  Dimensions.set({ window: size, screen: size })
}

afterEach(() => {
  windowOf(390, 844)
})

/** Rend la page d'un autre membre avec deux commentaires, puis ouvre la feuille. */
const openOnPhone = async () => {
  await renderWithProviders(<ProjectScreen id={id} />)
  await screen.findByRole('header', { name: /^Commentaires/ })
  await openSheet()
}

const replyTo = async (text: string) => {
  await fireEvent.press(cardOf(text).getByRole('button', { name: 'Répondre' }))
}

const MAX_TEXT = 'Super idée, je teste ce soir.'

const texts = fr.t(($) => $.project.comments, { returnObjects: true })

describe('the caption of the comment field in a low window', () => {
  it('in a normal window, the whole sentence (témoin)', async () => {
    seenByOther({ ...withUpdates, commentCount: 2 })
    mockComments([maxComment, zoeComment])
    windowOf(390, 844)
    await openOnPhone()

    expect(sheet().getByText(plain(texts.hint))).toBeTruthy()
    expect(sheet().queryByText(plain(texts.hintShort))).toBeNull()
  })

  it('keeps the whole sentence at 600 points high, the lowest normal window', async () => {
    seenByOther({ ...withUpdates, commentCount: 2 })
    mockComments([maxComment, zoeComment])
    windowOf(390, 600)
    await openOnPhone()

    expect(sheet().getByText(plain(texts.hint))).toBeTruthy()
  })

  it('under 600 points high, only the sentence that says who will read', async () => {
    seenByOther({ ...withUpdates, commentCount: 2 })
    mockComments([maxComment, zoeComment])
    windowOf(390, 599)
    await openOnPhone()

    expect(sheet().getByText(plain(texts.hintShort))).toBeTruthy()
    expect(sheet().queryByText(plain(texts.hint))).toBeNull()
  })

  it('a reply in a low window has its short sentence', async () => {
    seenByOther({ ...withUpdates, commentCount: 2 })
    mockComments([maxComment, zoeComment])
    windowOf(844, 390)
    await openOnPhone()

    await replyTo(MAX_TEXT)

    expect(sheet().getByText(plain(texts.replyHintShort))).toBeTruthy()
    expect(sheet().queryByText(plain(texts.replyHint))).toBeNull()
  })

  it('an edit in a low window has its short sentence', async () => {
    seenByOther({ ...withUpdates, commentCount: 1 })
    mockComments([{ ...maxComment, isMine: true, replies: [] }])
    windowOf(844, 390)
    await openOnPhone()

    await chooseInMenu(MAX_TEXT, 'Modifier')

    expect(sheet().getByText(plain(texts.editHintShort))).toBeTruthy()
    expect(sheet().queryByText(plain(texts.editHint))).toBeNull()
  })

  it('the edit of a hidden comment keeps its whole sentence, even in a low window', async () => {
    seenByOther({ ...withUpdates, commentCount: 1 })
    mockComments([{ ...maxComment, isMine: true, state: 'hidden', replies: [] }])
    windowOf(844, 390)
    await openOnPhone()

    await chooseInMenu(MAX_TEXT, 'Modifier')

    expect(sheet().getByText(plain(texts.editHintHidden))).toBeTruthy()
  })

  it('on a private project, the short sentences say that nobody else will read', async () => {
    jest
      .mocked(getProject)
      .mockResolvedValue({ ...recipesProject, visibility: 'private', commentCount: 0 })
    mockComments([{ ...maxComment, isMine: true, replies: [] }])
    windowOf(390, 500)
    await openOnPhone()

    expect(sheet().getByText(plain(texts.hintPrivateShort))).toBeTruthy()

    await replyTo(MAX_TEXT)

    expect(sheet().getByText(plain(texts.replyHintPrivateShort))).toBeTruthy()
  })

  it('in the column of a low window, the field scrolls with the page: the whole sentence', async () => {
    // La légende ne prend la place de rien : elle défile avec la page.
    seenByOther({ ...withUpdates, commentCount: 2 })
    mockComments([maxComment, zoeComment])
    windowOf(1440, 500)
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: /^Commentaires/ })
    expect(commentField()).toBeTruthy()
    expect(screen.getByText(plain(texts.hint))).toBeTruthy()
  })
})

describe('the banner of a reply', () => {
  const excerptPart = (comment: string) => {
    const sentence = fr.t(($) => $.project.comments.replyToExcerpt, {
      name: 'Max',
      excerpt: comment,
    })
    return plain(sentence.slice(sentence.indexOf('Max') + 'Max'.length))
  }

  it('on a computer, reminds the replied comment, whose card may be out of the window', async () => {
    const phone = setDesktopWindow()
    try {
      seenByOther({ ...withUpdates, commentCount: 2 })
      mockComments([maxComment, zoeComment])
      await renderWithProviders(<ProjectScreen id={id} />)
      await screen.findByRole('header', { name: /^Commentaires/ })

      // Pas de feuille sur ordinateur : le premier « Répondre » de la colonne, celui de Max.
      await fireEvent.press(screen.getAllByRole('button', { name: 'Répondre' })[0] as never)

      expect(screen.getByText(`Réponse à ${maxComment.author?.name}`)).toBeTruthy()
      expect(screen.getByText(excerptPart(MAX_TEXT))).toBeTruthy()
    } finally {
      phone()
    }
  })

  it('in the sheet of a phone, stays « Réponse à … » alone', async () => {
    seenByOther({ ...withUpdates, commentCount: 2 })
    mockComments([maxComment, zoeComment])
    await openOnPhone()

    await replyTo(MAX_TEXT)

    expect(sheet().getByText(`Réponse à ${maxComment.author?.name}`)).toBeTruthy()
    expect(sheet().queryByText(excerptPart(MAX_TEXT))).toBeNull()
  })
})
