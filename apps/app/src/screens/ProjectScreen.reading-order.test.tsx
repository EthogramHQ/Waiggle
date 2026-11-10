// Tests de la page d'un projet : l'ordre de lecture sur ordinateur, « Signaler ce projet » en
// dernier, partager un projet retiré et le fondu de la page (RF).
//
// L'ancien ProjectScreen.test.tsx est coupé par sections (159 tests, de 50 à 100 s à lui seul) : Jest
// donne un fichier entier à un seul processus, alors que plusieurs fichiers tournent en parallèle.
// L'API est remplacée par de faux appels ; les aides et données communes sont dans
// ProjectScreen.testkit.tsx.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { getProject } from '../projects/api'
import { commentOf, maxAuthor, zoeAuthor } from '../testing/comments'
import { removalByLaw } from '../testing/moderation'
import { projectWithPhotos, recipesProject } from '../testing/projects'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import { CoverTransitionProvider, useCoverSource } from '../ui/coverTransition'
import { ProjectScreen } from './ProjectScreen'
import {
  followAuthor,
  id,
  insideScroll,
  mockComments,
  mockPush,
  mockReplace,
  mockScreenProps,
  readingOrder,
  resetProjectScreenMocks,
  seenByOther,
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

/**
 * R5b : sur ordinateur, le champ des commentaires est toujours dans la colonne de droite, sous la
 * liste (« Écrire un commentaire », le nom du champ compact, au lieu d'un bouton qui l'ouvrait).
 */
const commentField = () => {
  const field = screen
    .queryAllByLabelText('Écrire un commentaire')
    .find((node) => node.type === 'TextInput')
  if (!field) throw new Error('no comment field on the page')
  return field
}

// F-Pr13 et le point des listes de début de tranche (choix de Louis du 1/11) : au clavier, « Suivre »
// et les réactions venaient après tout le contenu de la colonne principale.
describe('the reading order of the project page on a computer', () => {
  it('reads the gallery, the header, « Suivre » and the reactions before the description', async () => {
    const restore = setDesktopWindow()
    try {
      seenByOther({ ...projectWithPhotos, latestUpdate: rocketUpdate, updateCount: 1 })
      await renderWithProviders(<ProjectScreen id={id} />)

      const gallery = await screen.findByLabelText(fr.t(($) => $.gallery.label))
      const [galleryAt, titleAt, authorAt, followAt, capsuleAt, descriptionAt] = readingOrder(
        gallery,
        screen.getByRole('header', { name: 'Mon agent de recettes' }),
        screen.getByRole('switch', { name: followAuthor }),
        screen.getByRole('switch', { name: 'Suivre ce projet' }),
        screen.getByRole('button', { name: 'Waggle !, 0' }),
        screen.getByRole('header', { name: 'Comment ça marche' }),
      )
      expect([galleryAt, titleAt, authorAt, followAt, capsuleAt, descriptionAt]).not.toContain(-1)
      const at = (value: number | undefined) => value ?? -1
      expect(at(titleAt)).toBeGreaterThan(at(galleryAt))
      expect(at(authorAt)).toBeGreaterThan(at(titleAt))
      expect(at(descriptionAt)).toBeGreaterThan(at(authorAt))
      expect(at(descriptionAt)).toBeGreaterThan(at(followAt))
      expect(at(capsuleAt)).toBeGreaterThan(at(galleryAt))
      expect(at(descriptionAt)).toBeGreaterThan(at(capsuleAt))
    } finally {
      restore()
    }
  })

  // RF (ui-14) : la barre du haut devient fixe sur ordinateur ; la capsule, elle, reste dans la page,
  // sur la galerie (le test suivant), et sur téléphone elle flotte toujours hors de la page.
  it('keeps the top bar out of the page and the capsule in it, on a computer (RF)', async () => {
    const restore = setDesktopWindow()
    try {
      seenByOther(projectWithPhotos)
      await renderWithProviders(<ProjectScreen id={id} />)

      const capsule = await screen.findByRole('button', { name: 'Waggle !, 0' })
      expect(insideScroll(capsule)).toBe(true)
      expect(insideScroll(screen.getByRole('link', { name: fr.t(($) => $.nav.feed) }))).toBe(false)
    } finally {
      restore()
    }
  })

  it('puts the capsule on the gallery, inside the page, on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      seenByOther(projectWithPhotos)
      await renderWithProviders(<ProjectScreen id={id} />)

      const capsule = await screen.findByRole('button', { name: 'Waggle !, 0' })
      expect(insideScroll(capsule)).toBe(true)
    } finally {
      restore()
    }
  })

  // R5a, décision de Louis du 2/11 : « Signaler ce projet » vient après les commentaires, comme sur téléphone.
  it('reads the description, the prompt and the journal before the comments, and « Signaler » after them', async () => {
    const restore = setDesktopWindow()
    try {
      seenByOther({ ...projectWithPhotos, latestUpdate: rocketUpdate, updateCount: 1 })
      await renderWithProviders(<ProjectScreen id={id} />)

      const prompt = await screen.findByRole('header', { name: 'Le prompt de départ' })
      const report =
        screen.queryByRole('link', { name: 'Signaler ce projet' }) ??
        screen.getByRole('button', { name: 'Signaler ce projet' })
      const [descriptionAt, promptAt, journalAt, reportAt, commentAt] = readingOrder(
        screen.getByRole('header', { name: 'Comment ça marche' }),
        prompt,
        screen.getByRole('header', { name: 'Les mises à jour' }),
        report,
        commentField(),
      )
      const at = (value: number | undefined) => value ?? -1
      expect(at(promptAt)).toBeGreaterThan(at(descriptionAt))
      expect(at(journalAt)).toBeGreaterThan(at(promptAt))
      expect(at(commentAt)).toBeGreaterThan(at(journalAt))
      expect(at(reportAt)).toBeGreaterThan(at(commentAt))
    } finally {
      restore()
    }
  })
})

// --- Corrections après les relectures de R5a (C3) ---

// Décision de Louis du 2/11/2026 : sur ordinateur aussi, « Signaler ce projet » vient en dernier,
// après les commentaires, comme sur téléphone (au clavier, il passait avant la conversation).
describe('« Signaler ce projet » on a computer', () => {
  it('comes after the comments, as on a phone', async () => {
    const restore = setDesktopWindow()
    try {
      seenByOther({ ...projectWithPhotos, latestUpdate: rocketUpdate, updateCount: 1 })
      await renderWithProviders(<ProjectScreen id={id} />)

      // R5b : sur ordinateur, le champ de la colonne remplace le bouton « Écrire un commentaire ».
      await screen.findByRole('header', { name: 'Les mises à jour' })
      const comment = commentField()
      const report =
        screen.queryByRole('link', { name: 'Signaler ce projet' }) ??
        screen.getByRole('button', { name: 'Signaler ce projet' })
      const [journalAt, commentAt, reportAt] = readingOrder(
        screen.getByRole('header', { name: 'Les mises à jour' }),
        comment,
        report,
      )
      const at = (value: number | undefined) => value ?? -1
      expect([journalAt, commentAt, reportAt]).not.toContain(-1)
      expect(at(commentAt)).toBeGreaterThan(at(journalAt))
      expect(at(reportAt)).toBeGreaterThan(at(commentAt))
    } finally {
      restore()
    }
  })
})

// R5b (choix 1 du scénario) : sur ordinateur, « Voir les 6 commentaires » déroule toute la liste dans
// la colonne de droite, sans feuille, et le champ reste sous la liste. Au clavier et au lecteur
// d'écran, la liste déroulée et le champ viennent après tout le contenu de gauche (la description,
// le prompt, le journal), et « Signaler ce projet » toujours en dernier.
describe('the comments unrolled on a computer', () => {
  /** Six fils d'une seule racine, du plus récent au plus ancien, tels que l'API les donne. */
  const sixThreads = [
    'Premier fil, le plus récent.',
    'Deuxième fil.',
    'Troisième fil.',
    'Quatrième fil.',
    'Cinquième fil.',
    'Sixième fil, le plus ancien.',
  ].map((body, index) =>
    commentOf({
      id: `7f8091a2-b3c4-4dd5-8ee6-f708192a3b4${index}`,
      author: index % 2 === 0 ? maxAuthor : zoeAuthor,
      body,
      createdAt: `2026-10-1${5 - (index % 5)}T0${index}:00:00.000Z`,
    }),
  )

  it('keeps the unrolled list and the comment field after the content of the left column', async () => {
    const restore = setDesktopWindow()
    try {
      seenByOther({
        ...projectWithPhotos,
        latestUpdate: rocketUpdate,
        updateCount: 1,
        commentCount: 6,
      })
      mockComments(sixThreads)
      await renderWithProviders(<ProjectScreen id={id} />)

      // Avant : 5 commentaires au plus, puis le bouton qui déroule la liste.
      await fireEvent.press(await screen.findByRole('button', { name: 'Voir les 6 commentaires' }))
      // Le sixième fil apparaît en place : aucune feuille ne s'ouvre sur ordinateur.
      const sixth = await screen.findByText('Sixième fil, le plus ancien.')
      expect(screen.queryByRole('button', { name: 'Voir les 6 commentaires' })).toBeNull()
      const report =
        screen.queryByRole('link', { name: 'Signaler ce projet' }) ??
        screen.getByRole('button', { name: 'Signaler ce projet' })
      const [descriptionAt, promptAt, journalAt, firstAt, sixthAt, fieldAt, sendAt, reportAt] =
        readingOrder(
          screen.getByRole('header', { name: 'Comment ça marche' }),
          screen.getByRole('header', { name: 'Le prompt de départ' }),
          screen.getByRole('header', { name: 'Les mises à jour' }),
          screen.getByText('Premier fil, le plus récent.'),
          sixth,
          commentField(),
          screen.getByRole('button', { name: /^Envoyer( le commentaire)?$/ }),
          report,
        )
      const at = (value: number | undefined) => value ?? -1
      expect([descriptionAt, promptAt, journalAt, firstAt, sixthAt, fieldAt, sendAt]).not.toContain(
        -1,
      )
      // Tout le contenu de gauche d'abord…
      expect(at(firstAt)).toBeGreaterThan(at(descriptionAt))
      expect(at(firstAt)).toBeGreaterThan(at(promptAt))
      expect(at(firstAt)).toBeGreaterThan(at(journalAt))
      // … puis la liste, dans l'ordre, puis le champ et son envoi, puis « Signaler ce projet ».
      expect(at(sixthAt)).toBeGreaterThan(at(firstAt))
      expect(at(fieldAt)).toBeGreaterThan(at(sixthAt))
      expect(at(sendAt)).toBeGreaterThan(at(fieldAt))
      expect(at(reportAt)).toBeGreaterThan(at(sendAt))
    } finally {
      restore()
    }
  })
})

// Décision de Louis du 2/11/2026 : un projet retiré par la modération ne s'ouvre plus que pour son
// auteur (l'API répond 404 à tous les autres). La feuille « Partager » disait pourtant « seuls les
// membres pourront l'ouvrir » : ni « Partager » ni « Copier le lien » sur un projet retiré.
describe('sharing a project removed by the moderation', () => {
  const removed = { ...recipesProject, removal: removalByLaw }
  const share = fr.t(($) => $.share.action)
  const copy = fr.t(($) => $.share.copy)
  const menu = fr.t(($) => $.actionMenu.label)

  it('offers its author neither « Partager » nor « Copier le lien » on a phone', async () => {
    jest.mocked(getProject).mockResolvedValue(removed)
    await renderWithProviders(<ProjectScreen id={id} />)

    // Témoin : la page de l'auteur est là, avec son bandeau de retrait.
    expect(await screen.findByRole('header', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.getAllByText(containing(fr.t(($) => $.removal.banner))).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: share })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: copy })).toBeNull()
    // Le menu « … » ne garde que « Supprimer » (jur-J1, R6a : l'auteur peut toujours supprimer un
    // projet retiré ; « Modifier » y est refusé). Avant R6a : aucun menu.
    await fireEvent.press(screen.getByRole('button', { name: menu }))
    expect(screen.getAllByRole('menuitem').map((item) => item.props.accessibilityLabel)).toEqual([
      'Supprimer',
    ])
  })

  it('offers its author neither « Partager » nor « Copier le lien » on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      jest.mocked(getProject).mockResolvedValue(removed)
      await renderWithProviders(<ProjectScreen id={id} />)

      expect(await screen.findByRole('header', { name: 'Mon agent de recettes' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: share })).toBeNull()
      expect(screen.queryByRole('menuitem', { name: copy })).toBeNull()
      // jur-J1 (R6a) : le menu ne garde que « Supprimer ».
      await fireEvent.press(screen.getByRole('button', { name: menu }))
      expect(screen.getAllByRole('menuitem').map((item) => item.props.accessibilityLabel)).toEqual([
        'Supprimer',
      ])
    } finally {
      restore()
    }
  })

  it('still offers « Partager » and « Copier le lien » on a project that was not removed', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.getByRole('button', { name: share })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: menu }))
    expect(screen.getByRole('menuitem', { name: copy })).toBeTruthy()
  })
})

// RF (« Les pages apparaissent en fondu », relecture du plan ui-1) : la page d'un projet ouverte
// depuis une carte garde son passage de R4 (la photo de la carte grandit, ou son propre fondu) ; le
// fondu des pages ne s'y ajoute pas : ProjectScreen passe `fade={false}` à Screen pendant cette
// arrivée, chargement compris. Au retour sur la page, restée montée (le membre revient d'une autre
// page), elle apparaît en fondu comme les autres.
describe('the page fade of the project page (RF, ui-1)', () => {
  // La carte du fil, touchée : elle prévient la page qu'elle arrive d'elle (coverTransition.tsx).
  let card: ReturnType<typeof useCoverSource> | undefined
  function Card() {
    card = useCoverSource(id)
    return null
  }
  const stage = (page: boolean) => (
    <CoverTransitionProvider>
      <Card />
      {page ? <ProjectScreen id={id} /> : null}
    </CoverTransitionProvider>
  )
  const fades = () => mockScreenProps.map((props) => props.fade)

  /** Ouvre la page depuis la carte touchée, et attend son titre. */
  const openFromCard = async () => {
    const view = await renderWithProviders(stage(false))
    await act(async () => card?.capture(() => {}))
    mockScreenProps.length = 0
    await view.rerender(stage(true))
    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    return view
  }

  it('does not fade in the page that arrives from a card, loading included', async () => {
    await openFromCard()

    expect(fades().length).toBeGreaterThan(0) // témoin : la page est passée par Screen
    expect(fades().every((fade) => fade === false)).toBe(true)
  })

  it('fades in a page opened by its address, without a card (witness)', async () => {
    await renderWithProviders(stage(true))
    await screen.findByRole('header', { name: 'Mon agent de recettes' })

    expect(fades().at(-1)).not.toBe(false)
  })

  it('fades in the page when the member comes back to it', async () => {
    const view = await openFromCard()
    // Témoin : à l'arrivée depuis la carte, pas de fondu (sinon ce test passerait sans la règle).
    expect(fades().at(-1)).toBe(false)

    // Le membre part vers une autre page (celle-ci, restée montée, est cachée), puis revient.
    mockFocused = false
    await view.rerender(stage(true))
    mockFocused = true
    await view.rerender(stage(true))

    expect(fades().at(-1)).not.toBe(false)
  })
})
