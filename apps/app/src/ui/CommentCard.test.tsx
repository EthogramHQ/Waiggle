// Tests de la carte d'un commentaire (R5b, scénario « Les commentaires ») : la photo et le nom de
// son auteur (un lien), le badge « Auteur » de la personne qui a publié le projet, la date relative,
// « modifié », le texte et ses mentions en pastilles, « Répondre » dessous et le menu « … » à
// droite. Ses propres commentaires sont sur un fond gris : le test ne lit pas ce fond, il vérifie que
// le lecteur d'écran l'entend (« Ton commentaire »). Viennent ensuite les allures d'un commentaire
// masqué (pour l'auteur du projet, pour l'auteur du commentaire), retiré par la modération (pour son
// auteur), les emplacements sans nom ni date ni action (supprimé, masqué vu par un tiers, retiré,
// bloqué, indisponible), la carte compacte de l'aperçu, et les gardes reprises de l'existant (double
// tape, focus rendu à « … »).
//
// Ces tests remplacent ceux de `components.test.tsx` (tranches 5, 7a) : l'API de la carte change
// (relecture du plan R5b, ui-B8). La carte reçoit le commentaire tel que l'API le rend
// (`CommentReply`) et écrit elle-même ses textes (`project.comments.*`) ; l'écran ne lui donne que
// ce qu'il décide : qui regarde, le menu, « Répondre », la note d'un commentaire masqué.
//
// Ce que Jest ne voit pas (à regarder dans les captures et le catalogue) : le fond gris des siens, le
// miel pâle d'une carte surlignée (`highlighted`), les icônes des emplacements (bulle, bouclier,
// interdiction, œil barré), la photo plus petite d'une réponse.
import { palettes, textStyles } from '@ruche/brand'
import type { CommentAuthor, CommentReply } from '@ruche/contracts'
import { nameOf } from '@ruche/i18n'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { type ComponentProps, createRef, type ReactElement } from 'react'
import {
  AccessibilityInfo,
  Dimensions,
  Platform,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native'
import { labelOf, lendWebPage } from '../testing/arrivedFocus'
import { inesMention, replyOf } from '../testing/comments'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { COMMENT_AVATAR, CommentCard, type CommentCardHandle } from './CommentCard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

afterEach(() => {
  jest.restoreAllMocks()
})

// --- Les données ---------------------------------------------------------------------------------

/** Léa a publié le projet ; Hugo le commente. */
const lea: CommentAuthor = {
  id: 'u1',
  name: 'Léa Moreau',
  handle: 'lea_moreau',
  avatarUrl: null,
  isTester: false,
}
const hugo: CommentAuthor = {
  id: 'u7',
  name: 'Hugo Lefèvre',
  handle: 'hugo_l',
  avatarUrl: null,
  isTester: false,
}

// L'heure de la carte est figée (`now`) : à l'horloge réelle, entre minuit et 3 h, « il y a trois
// heures » tombe la veille et la carte écrit « hier » (vu à 1 h 42 le 5/11/2026).
const NOW = new Date('2026-11-05T14:00:00.000Z')

/** Trois heures avant `NOW` : la carte écrit « il y a 3 h ». */
const threeHoursAgo = () => new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString()

const BODY = 'Super idée, je teste ce soir.'

/** Un commentaire visible de Hugo ; chaque test change ce qui l'intéresse. */
const hugoComment = (fields: Partial<CommentReply> = {}): CommentReply =>
  replyOf({
    id: '6e7f8091-a2b3-4c4d-9e5f-60718293a4b5',
    author: hugo,
    body: BODY,
    createdAt: threeHoursAgo(),
    ...fields,
  })

/** Un emplacement : sans auteur ni texte, gardé parce que des réponses le suivent. */
const placeholderOf = (state: CommentReply['state']): CommentReply =>
  hugoComment({ author: null, body: '', state, mentions: [] })

/** Le bandeau de retrait que l'écran construit pour l'auteur (`reports/removal`). */
const removedBanner = {
  title: 'Retiré par la modération',
  lines: [
    'Il n’est plus visible que de toi, jusqu’à un éventuel rétablissement.',
    'Fondement : les règles.',
    'Explication : Demander un code de carte bancaire n’est pas permis ici.',
    'Pour contester : contact@example.com',
  ],
}

// --- Les textes de la carte (`project.comments.*`) ----------------------------------------------

const text = {
  author: fr.t(($) => $.project.comments.author),
  authorLink: (name: string) => fr.t(($) => $.project.comments.authorLink, { name }),
  menu: (name: string) => fr.t(($) => $.project.comments.menu, { nameOf: nameOf('fr', name) }),
  yours: fr.t(($) => $.project.comments.yours),
  openLine: (name: string, excerpt: string) =>
    fr.t(($) => $.project.comments.openLine, { nameOf: nameOf('fr', name), excerpt }),
  reply: fr.t(($) => $.project.comments.reply),
  edited: fr.t(($) => $.project.comments.edited),
  hiddenByMe: fr.t(($) => $.project.comments.hiddenByMe),
  hiddenNote: fr.t(($) => $.project.comments.hiddenNote),
  hiddenByAuthor: fr.t(($) => $.project.comments.hiddenByAuthor),
  hiddenByAuthorNote: fr.t(($) => $.project.comments.hiddenByAuthorNote),
  unhide: fr.t(($) => $.project.comments.unhideShort),
  readMore: fr.t(($) => $.project.comments.readMore),
  pill: (name: string) => fr.t(($) => $.mentions.pill, { name }),
  closeMenu: fr.t(($) => $.actionMenu.close),
  placeholder: {
    deleted: fr.t(($) => $.project.comments.deletedPlaceholder),
    hidden: fr.t(($) => $.project.comments.hiddenPlaceholder),
    removed: fr.t(($) => $.project.comments.removedPlaceholder),
    blocked: fr.t(($) => $.project.comments.blockedPlaceholder),
    unavailable: fr.t(($) => $.project.comments.unavailablePlaceholder),
  },
}

// --- Les outils ----------------------------------------------------------------------------------

type CardProps = ComponentProps<typeof CommentCard>

/** Une carte vue par un autre membre que l'auteur, sans menu ni « Répondre » : chaque test ajoute. */
const card = (props: Partial<CardProps> = {}): ReactElement => (
  <CommentCard
    comment={hugoComment()}
    kind="root"
    isMine={false}
    isProjectAuthor={false}
    menu={[]}
    hiddenNote={null}
    onAuthorPress={jest.fn()}
    onMemberPress={jest.fn()}
    now={NOW}
    {...props}
  />
)

/** Un lien ou un bouton de ce nom : la carte choisit le rôle (« Démasquer » est un lien au texte). */
const linkOrButton = (name: string) =>
  screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name })

/**
 * « Ton commentaire » est entendu : un nom lu (sur le cadre de la carte) ou un texte caché à l'œil
 * (`HiddenHeading`), au choix du composant. Jamais par le fond gris, qui ne se lit pas.
 */
const yoursIsAnnounced = () =>
  screen.queryAllByLabelText(text.yours).length +
    screen.queryAllByText(text.yours, { includeHiddenElements: true }).length >
  0

/**
 * Le texte rendu fait `count` lignes : la mesure que le téléphone envoie (`onTextLayout`) au texte,
 * et que « Lire la suite » attend pour savoir s'il dépasse 10 lignes. L'évènement part du texte et
 * remonte jusqu'à celui qui l'écoute, où qu'il soit.
 */
const reportLines = async (shown: string, count: number) => {
  const lines = Array.from({ length: count }, (_, index) => ({
    text: `ligne ${index + 1}`,
    x: 0,
    y: index * 21,
    width: 300,
    height: 21,
    ascender: 16,
    descender: 5,
    capHeight: 11,
    xHeight: 8,
  }))
  for (const node of screen.getAllByText(shown)) {
    await fireEvent(node, 'textLayout', { nativeEvent: { lines } })
  }
}

/** Un long commentaire de 14 lignes, une phrase par ligne. */
const LONG = Array.from({ length: 14 }, (_, index) => `Ligne ${index + 1} du commentaire.`).join(
  '\n',
)

describe('CommentCard', () => {
  it('shows its author, its relative date and its text exactly as written', async () => {
    // Un commentaire est du texte brut : les astérisques et les balises restent des caractères.
    const body = '**Bravo** : <b>ça marche</b>\nEt vite.'
    await renderWithProviders(card({ comment: hugoComment({ body }) }))

    expect(screen.getByText(body)).toBeTruthy()
    expect(screen.getByText('Hugo Lefèvre')).toBeTruthy()
    expect(screen.getByText('il y a 3 h')).toBeTruthy()
  })

  it('leads to the page of its author through a link named after them', async () => {
    const onAuthorPress = jest.fn()
    await renderWithProviders(card({ onAuthorPress }))

    await fireEvent.press(screen.getByRole('link', { name: 'Hugo Lefèvre' }))

    expect(onAuthorPress).toHaveBeenCalledTimes(1)
  })

  it('says « modifié » when it was edited, and only then', async () => {
    const view = await renderWithProviders(card())
    // Témoin : la carte est là, sans « modifié ».
    expect(screen.getByText(BODY)).toBeTruthy()
    expect(screen.queryByText(text.edited)).toBeNull()

    await view.rerender(card({ comment: hugoComment({ editedAt: new Date().toISOString() }) }))

    expect(screen.getByText(text.edited)).toBeTruthy()
  })

  it("the project author's name link is read « Léa Moreau, Auteur »", async () => {
    await renderWithProviders(
      card({ comment: hugoComment({ author: lea }), isProjectAuthor: true }),
    )

    expect(screen.getByRole('link', { name: text.authorLink('Léa Moreau') })).toBeTruthy()
    // Le badge se voit aussi, à côté du nom.
    expect(screen.getByText(text.author)).toBeTruthy()
  })

  it('shows no « Auteur » badge on a member who did not publish the project', async () => {
    await renderWithProviders(card())

    // Témoin : le lien du nom, sans badge.
    expect(screen.getByRole('link', { name: 'Hugo Lefèvre' })).toBeTruthy()
    expect(screen.queryByText(text.author)).toBeNull()
  })

  it('your own comment is announced « Ton commentaire »', async () => {
    await renderWithProviders(card({ comment: hugoComment({ isMine: true }), isMine: true }))

    expect(yoursIsAnnounced()).toBe(true)
  })

  it('does not announce « Ton commentaire » on the comment of another member', async () => {
    await renderWithProviders(card())

    expect(screen.getByText(BODY)).toBeTruthy() // témoin : la carte est là
    expect(yoursIsAnnounced()).toBe(false)
  })

  it('turns a mention into a pill that opens the member kept with it', async () => {
    const onMemberPress = jest.fn()
    await renderWithProviders(
      card({
        comment: hugoComment({ body: 'Demande à @ines_morel !', mentions: [inesMention] }),
        onMemberPress,
      }),
    )

    await fireEvent.press(screen.getByRole('link', { name: text.pill('Inès Morel') }))

    expect(onMemberPress).toHaveBeenCalledWith(inesMention.memberId)
  })
})

describe('CommentCard, « Répondre » and the « … » menu', () => {
  const menuName = text.menu('Hugo Lefèvre')

  it('offers « Répondre » under the comment when the screen allows it', async () => {
    const onReply = jest.fn()
    await renderWithProviders(card({ onReply }))

    await fireEvent.press(screen.getByRole('button', { name: text.reply }))

    expect(onReply).toHaveBeenCalledTimes(1)
  })

  it('offers no « Répondre » without onReply', async () => {
    await renderWithProviders(card())

    expect(screen.getByText(BODY)).toBeTruthy() // témoin : la carte est là
    expect(screen.queryByRole('button', { name: text.reply })).toBeNull()
  })

  it('opens its menu from « … », named « Actions du commentaire d’Hugo Lefèvre »', async () => {
    const report = jest.fn()
    await renderWithProviders(card({ menu: [{ label: 'Signaler', onPress: report }] }))

    await fireEvent.press(screen.getByRole('button', { name: menuName }))
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Signaler' }))

    expect(report).toHaveBeenCalledTimes(1)
  })

  it('shows the entries it is given, in order, « Supprimer » included', async () => {
    const edit = jest.fn()
    const remove = jest.fn()
    await renderWithProviders(
      card({
        comment: hugoComment({ isMine: true }),
        isMine: true,
        menu: [
          { label: 'Modifier', onPress: edit },
          { label: 'Supprimer', onPress: remove, tone: 'danger' },
        ],
      }),
    )

    await fireEvent.press(screen.getByRole('button', { name: menuName }))

    expect(screen.getAllByRole('menuitem').map((item) => labelOf(item))).toEqual([
      'Modifier',
      'Supprimer',
    ])
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Supprimer' }))
    expect(remove).toHaveBeenCalledTimes(1)
    expect(edit).not.toHaveBeenCalled()
  })

  it('has no « … » when its menu is empty', async () => {
    await renderWithProviders(card({ onReply: jest.fn() }))

    // Témoin : « Répondre » est là.
    expect(screen.getByRole('button', { name: text.reply })).toBeTruthy()
    expect(screen.queryByRole('button', { name: menuName })).toBeNull()
  })

  it('« Répondre », « … » and « Lire la suite » are described by the author and the excerpt', async () => {
    await renderWithProviders(
      card({
        comment: hugoComment({ body: LONG }),
        onReply: jest.fn(),
        menu: [{ label: 'Signaler', onPress: jest.fn() }],
      }),
    )
    await reportLines(LONG, 14)

    // Sur téléphone, l'indice lu après le nom (sur le web : aria-describedby, la même phrase,
    // « Hugo Lefèvre : » puis le début du texte, `project.comments.about`).
    const described = /^Hugo Lefèvre\s:\sLigne 1 du commentaire\./
    for (const control of [
      screen.getByRole('button', { name: text.reply }),
      screen.getByRole('button', { name: menuName }),
      screen.getByRole('button', { name: text.readMore }),
    ]) {
      expect(control.props.accessibilityHint).toMatch(described)
    }
  })
})

describe('CommentCard, folded after 10 lines', () => {
  it('offers « Lire la suite » under a text longer than 10 lines', async () => {
    await renderWithProviders(card({ comment: hugoComment({ body: LONG }) }))

    await reportLines(LONG, 14)

    expect(screen.getByRole('button', { name: text.readMore, expanded: false })).toBeTruthy()
  })

  it('offers no « Lire la suite » under a short text', async () => {
    await renderWithProviders(card())

    await reportLines(BODY, 1)

    expect(screen.getByText(BODY)).toBeTruthy() // témoin : la carte est là
    expect(screen.queryByRole('button', { name: text.readMore })).toBeNull()
  })
})

describe('CommentCard, hidden by the project author', () => {
  it('tells the project author that only the comment author still sees a hidden comment', async () => {
    await renderWithProviders(
      card({ comment: hugoComment({ state: 'hidden' }), hiddenNote: 'byYou', onUnhide: jest.fn() }),
    )

    expect(screen.getByText(text.hiddenByMe)).toBeTruthy()
    expect(screen.getByText(text.hiddenNote)).toBeTruthy()
    // Le texte reste à sa place pour lui, avec « Démasquer ».
    expect(screen.getByText(BODY)).toBeTruthy()
    expect(linkOrButton(text.unhide)).toBeTruthy()
  })

  it('unhides the comment through « Démasquer »', async () => {
    const onUnhide = jest.fn()
    await renderWithProviders(
      card({ comment: hugoComment({ state: 'hidden' }), hiddenNote: 'byYou', onUnhide }),
    )

    await fireEvent.press(linkOrButton(text.unhide))

    expect(onUnhide).toHaveBeenCalledTimes(1)
  })

  it('a double tap on « Démasquer » sends one request', async () => {
    const onUnhide = jest.fn()
    await renderWithProviders(
      card({ comment: hugoComment({ state: 'hidden' }), hiddenNote: 'byYou', onUnhide }),
    )

    // Deux tapes à la suite, avant que l'écran n'ait pu redessiner la carte (`unhiding`).
    const unhide = linkOrButton(text.unhide)
    await fireEvent.press(unhide)
    await fireEvent.press(unhide)

    expect(onUnhide).toHaveBeenCalledTimes(1)
  })

  it('ignores « Démasquer » while the request is on its way', async () => {
    const onUnhide = jest.fn()
    await renderWithProviders(
      card({
        comment: hugoComment({ state: 'hidden' }),
        hiddenNote: 'byYou',
        onUnhide,
        unhiding: true,
      }),
    )

    await fireEvent.press(linkOrButton(text.unhide))

    expect(onUnhide).not.toHaveBeenCalled()
  })

  it('tells the comment author that only they and the project author still see their hidden comment', async () => {
    await renderWithProviders(
      card({
        comment: hugoComment({ state: 'hidden', isMine: true }),
        isMine: true,
        hiddenNote: 'byProjectAuthor',
      }),
    )

    expect(screen.getByText(text.hiddenByAuthor)).toBeTruthy()
    expect(screen.getByText(text.hiddenByAuthorNote)).toBeTruthy()
    expect(screen.getByText(BODY)).toBeTruthy()
    // Ce n'est pas lui qui peut le démasquer.
    expect(screen.queryByRole('link', { name: text.unhide })).toBeNull()
    expect(screen.queryByRole('button', { name: text.unhide })).toBeNull()
  })
})

describe('CommentCard, placeholders', () => {
  it('the hidden placeholder reads « Commentaire masqué » with no name, date nor action', async () => {
    await renderWithProviders(
      card({
        comment: placeholderOf('hidden'),
        onReply: jest.fn(),
        menu: [{ label: 'Signaler', onPress: jest.fn() }],
      }),
    )

    expect(screen.getByText(text.placeholder.hidden)).toBeTruthy()
    expect(screen.queryByText('Hugo Lefèvre')).toBeNull()
    expect(screen.queryByText('il y a 3 h')).toBeNull()
    // Ni lien, ni « Répondre », ni « … », même si l'écran en donne.
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it.each([
    ['deleted', text.placeholder.deleted],
    ['removed', text.placeholder.removed],
    ['blocked', text.placeholder.blocked],
    ['unavailable', text.placeholder.unavailable],
  ] as const)(
    'the %s placeholder reads « %s » with no name, date nor action',
    async (state, shown) => {
      await renderWithProviders(
        card({
          comment: placeholderOf(state),
          onReply: jest.fn(),
          menu: [{ label: 'Signaler', onPress: jest.fn() }],
        }),
      )

      expect(screen.getByText(shown)).toBeTruthy()
      expect(screen.queryByText('il y a 3 h')).toBeNull()
      expect(screen.queryAllByRole('link')).toHaveLength(0)
      expect(screen.queryAllByRole('button')).toHaveLength(0)
    },
  )

  it('a placeholder shows no removal banner, even when given one', async () => {
    await renderWithProviders(card({ comment: placeholderOf('removed'), removed: removedBanner }))

    expect(screen.getByText(text.placeholder.removed)).toBeTruthy() // témoin
    expect(screen.queryByText(removedBanner.title)).toBeNull()
  })
})

describe('CommentCard, removed by the moderation', () => {
  it('shows its author the removal banner, every sentence of it, and the text', async () => {
    await renderWithProviders(
      card({
        comment: hugoComment({ state: 'removed', isMine: true }),
        isMine: true,
        removed: removedBanner,
      }),
    )

    expect(screen.getByText(removedBanner.title)).toBeTruthy()
    for (const line of removedBanner.lines) expect(screen.getByText(line)).toBeTruthy()
    expect(screen.getByText(BODY)).toBeTruthy()
  })

  it('offers no « Répondre » under a removed comment', async () => {
    await renderWithProviders(
      card({
        comment: hugoComment({ state: 'removed', isMine: true }),
        isMine: true,
        removed: removedBanner,
      }),
    )

    expect(screen.getByText(BODY)).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: text.reply })).toBeNull()
  })
})

describe('CommentCard, compact (the preview)', () => {
  it('a compact card is one button named after its author and excerpt, with no link inside', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      card({
        comment: hugoComment({ body: 'Demande à @ines_morel !', mentions: [inesMention] }),
        compact: true,
        onPress,
        // Donnés par erreur : la carte compacte n'en fait rien.
        onReply: jest.fn(),
        menu: [{ label: 'Signaler', onPress: jest.fn() }],
      }),
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.props.accessibilityLabel).toMatch(/^Commentaire d’Hugo Lefèvre\s:\s/)
    // Ni le nom, ni la pastille ne sont des liens : toute la carte ouvre la feuille.
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    await fireEvent.press(buttons[0] as NonNullable<(typeof buttons)[0]>)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('names the compact card « Commentaire d’Hugo Lefèvre : » and the start of the text', async () => {
    await renderWithProviders(card({ compact: true, onPress: jest.fn() }))

    expect(screen.getByRole('button', { name: text.openLine('Hugo Lefèvre', BODY) })).toBeTruthy()
  })
})

describe('CommentCard, an action that failed', () => {
  it('shows the error under the comment, with its action', async () => {
    const reconnect = jest.fn()
    await renderWithProviders(
      card({
        error: 'Ta session a expiré.',
        errorAction: { label: 'Me reconnecter', onPress: reconnect },
      }),
    )

    expect(screen.getByText('Ta session a expiré.')).toBeTruthy()
    await fireEvent.press(linkOrButton('Me reconnecter'))
    expect(reconnect).toHaveBeenCalledTimes(1)
  })
})

// --- Les corrections de la relecture de design (K2) ---------------------------------------------
// Ces tests lisent la structure et quelques styles : ils fixent des règles de mise en page (qui est
// dans quelle colonne, ce qui ne se sépare pas). Les positions réelles se mesurent dans le navigateur.

type Node = {
  props: Record<string, unknown>
  parent: Node | null
  children: ReadonlyArray<Node | string>
}
const flat = (node: Node) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as ViewStyle & { color?: string }
const nodesOf = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : nodesOf(child))),
]
const allNodes = () => nodesOf(screen.root as unknown as Node)
const chainOf = (node: Node): Node[] => {
  const chain: Node[] = []
  for (let at: Node | null = node; at; at = at.parent) chain.push(at)
  return chain
}
const commonParent = (a: Node, b: Node) => {
  const others = chainOf(b)
  return chainOf(a).find((node) => others.includes(node)) as Node
}
const shown = (value: string) => screen.getByText(value) as unknown as Node
const placeOf = (node: Node) => allNodes().indexOf(node)
/** Le retrait du texte : la somme des `paddingLeft` entre le texte et la carte. */
const indentOf = (node: Node) =>
  chainOf(node).reduce((sum, at) => sum + Number(flat(at).paddingLeft ?? 0), 0)
/** La photo de l'auteur (sans image : ses initiales, sur un rond au rôle d'image). */
const photo = () =>
  allNodes().find((node) => node.props.accessibilityRole === 'image') as unknown as Node

const editedComment = () => hugoComment({ editedAt: threeHoursAgo() })
const hiddenByMe = (fields: Partial<CardProps> = {}) =>
  card({
    comment: hugoComment({ state: 'hidden' }),
    hiddenNote: 'byYou',
    onUnhide: jest.fn(),
    ...fields,
  })

describe('CommentCard, the row of its name (design C6)', () => {
  it('keeps the photo out of the row where the name, the date and « modifié » wrap', async () => {
    await renderWithProviders(card({ comment: editedComment() }))

    const row = commonParent(shown('Hugo Lefèvre'), shown('il y a 3 h'))
    expect(flat(row).flexWrap).toBe('wrap')
    expect(chainOf(photo())).not.toContain(row)
    // « modifié » passe à la ligne dans cette rangée, à droite de la photo.
    expect(chainOf(shown(text.edited))).toContain(row)
  })

  it('never separates the date from « · modifié » at the normal text size', async () => {
    await renderWithProviders(card({ comment: editedComment() }))

    expect(flat(commonParent(shown('il y a 3 h'), shown(text.edited))).flexWrap).not.toBe('wrap')
    // Témoin : le point est là.
    expect(screen.queryByText('·', { includeHiddenElements: true })).not.toBeNull()
  })

  it('keeps the same row on a compact card: no point opens a line, nothing wraps under the photo', async () => {
    await renderWithProviders(card({ comment: editedComment(), compact: true }))

    const row = commonParent(shown('Hugo Lefèvre'), shown('il y a 3 h'))
    expect(flat(row).flexWrap).toBe('wrap')
    expect(chainOf(photo())).not.toContain(row)
    expect(flat(commonParent(shown('il y a 3 h'), shown(text.edited))).flexWrap).not.toBe('wrap')
  })

  it('reads one link only, the photo being hidden from screen readers and from the finger', async () => {
    await renderWithProviders(card())

    expect(screen.getAllByRole('link', { name: 'Hugo Lefèvre' })).toHaveLength(1)
    const hidden = chainOf(photo()).find(
      (node) => node.props.importantForAccessibility === 'no-hide-descendants',
    )
    expect(hidden?.props['aria-hidden']).toBe(true)
    // Le doigt passe à travers elle, jusqu'au lien qui la recouvre (`pointerEvents` en propriété).
    expect(hidden?.props.pointerEvents).toBe('none')
  })

  it('spreads the link over the photo: pulled back by its width, given back to the name', async () => {
    await renderWithProviders(card())

    const over = COMMENT_AVATAR.root + 8
    const chain = chainOf(shown('Hugo Lefèvre'))
    const link = screen.getByRole('link', { name: 'Hugo Lefèvre' }) as unknown as Node
    const inside = chain.slice(0, chain.indexOf(link))
    const outside = chain.slice(chain.indexOf(link))
    expect(inside.some((node) => flat(node).paddingLeft === over)).toBe(true)
    expect(outside.some((node) => flat(node).marginLeft === -over)).toBe(true)
  })
})

describe('CommentCard, the place of its text (design C6, decision 21)', () => {
  const setFontScale = async (fontScale: number) => {
    const window = { width: 320, height: 844, scale: 3, fontScale }
    await act(async () => Dimensions.set({ window, screen: window }))
  }

  afterEach(async () => {
    const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
    await act(async () => Dimensions.set({ window: phone, screen: phone }))
  })

  it('stays under the name at the normal text size, on a phone too', async () => {
    await setFontScale(1)
    await renderWithProviders(card())

    expect(indentOf(shown(BODY))).toBe(COMMENT_AVATAR.root + 8)
  })

  it('stays under the name up to 149 %', async () => {
    await setFontScale(1.49)
    await renderWithProviders(card({ kind: 'reply' }))

    expect(indentOf(shown(BODY))).toBe(COMMENT_AVATAR.reply + 8)
  })

  it('goes under the photo from 150 %', async () => {
    await setFontScale(1.5)
    await renderWithProviders(card({ comment: editedComment() }))

    expect(indentOf(shown(BODY))).toBe(0)
    // Agrandi, « modifié » peut passer sous la date : il perd son point, plutôt que d'en commencer
    // sa ligne.
    expect(screen.queryByText('·', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByText(text.edited)).toBeTruthy()
  })

  it('goes under the photo on the web when the measured text is that large', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await setFontScale(1)
    await renderWithProviders(card())
    expect(indentOf(shown(BODY))).toBe(COMMENT_AVATAR.root + 8) // témoin

    // Sur le web, `fontScale` vaut toujours 1 : seule la hauteur d'une ligne cachée le dit.
    const probe = allNodes().find(
      (node) => node.props.onLayout !== undefined && node.props['aria-hidden'] === true,
    ) as unknown as Parameters<typeof fireEvent>[0]
    await fireEvent(probe, 'layout', {
      nativeEvent: { layout: { height: textStyles.body.lineHeight * 2 } },
    })

    expect(indentOf(shown(BODY))).toBe(0)
  })
})

describe('CommentCard, its density (design A3)', () => {
  it('a highlighted card does not take more room than a plain one: the text does not jump', async () => {
    await renderWithProviders(card({ highlighted: true }))

    const frame = chainOf(shown(BODY)).find(
      (node) => flat(node).backgroundColor === palettes.day.highlightSoft,
    ) as unknown as Node
    const style = flat(frame)
    expect(Number(style.paddingTop ?? style.padding ?? 0) + Number(style.marginTop ?? 0)).toBe(0)
    expect(
      Number(style.paddingBottom ?? style.padding ?? 0) + Number(style.marginBottom ?? 0),
    ).toBe(0)
  })

  it('the row of the name keeps its 44 points, hung over the text it stays above', async () => {
    await renderWithProviders(card({ onReply: jest.fn() }))

    const link = screen.getByRole('link', { name: 'Hugo Lefèvre' }) as unknown as Node
    expect(flat(link).minHeight).toBe(44)
    const hung = chainOf(link).find((node) => flat(node).marginVertical === -8)
    expect(hung).toBeDefined()
    // Au-dessus du texte, mais le doigt l'atteint à côté des zones : ni le nom ni la pastille d'une
    // mention ne sont masqués par la rangée elle-même.
    const row = chainOf(link).find(
      (node) => flat(node).zIndex === 1 && node.props.pointerEvents === 'box-none',
    )
    expect(row).toBeDefined()
    expect(chainOf(shown(BODY))).not.toContain(row)
  })

  it('« Répondre » hangs its 44 points over the gap below it', async () => {
    await renderWithProviders(card({ onReply: jest.fn() }))

    const button = screen.getByRole('button', { name: text.reply }) as unknown as Node
    expect(flat(button).minHeight).toBe(44)
    expect(Number(flat(button.parent as Node).marginBottom)).toBeLessThan(0)
  })

  it('« Répondre » does not hang over the error that follows it', async () => {
    await renderWithProviders(card({ onReply: jest.fn(), error: 'Ta session a expiré.' }))

    const button = screen.getByRole('button', { name: text.reply }) as unknown as Node
    expect(Number(flat(button.parent as Node).marginBottom ?? 0)).toBeGreaterThanOrEqual(0)
  })
})

describe('CommentCard, its « … » (design A1)', () => {
  const menu = [{ label: 'Signaler', onPress: jest.fn() }]
  const discOf = () =>
    flat(screen.getByRole('button', { name: text.menu('Hugo Lefèvre') }) as unknown as Node)
      .backgroundColor

  it('has no disc at rest, only once its menu is open', async () => {
    await renderWithProviders(card({ menu }))
    expect(discOf()).toBeUndefined()

    await fireEvent.press(screen.getByRole('button', { name: text.menu('Hugo Lefèvre') }))

    expect(discOf()).toBe(palettes.day.glass)
  })
})

describe('CommentCard, hidden: its order and its grey (design A4)', () => {
  it('writes the text in grey for both people who still see it', async () => {
    await renderWithProviders(hiddenByMe())
    expect(flat(shown(BODY)).color).toBe(palettes.day.textMuted)
  })

  it('writes the text in grey for the author of the comment too', async () => {
    await renderWithProviders(
      card({
        comment: hugoComment({ state: 'hidden', isMine: true }),
        isMine: true,
        hiddenNote: 'byProjectAuthor',
      }),
    )
    expect(flat(shown(BODY)).color).toBe(palettes.day.textMuted)
  })

  it('keeps the ink on a comment that is not hidden', async () => {
    await renderWithProviders(card())
    expect(flat(shown(BODY)).color).toBe(palettes.day.text)
  })

  it('puts the pill on the row of the name, and the note under the text', async () => {
    await renderWithProviders(hiddenByMe())

    const row = commonParent(shown('Hugo Lefèvre'), shown('il y a 3 h'))
    expect(chainOf(shown(text.hiddenByMe))).toContain(row)
    expect(chainOf(shown(BODY))).not.toContain(row)
    expect(placeOf(shown(BODY))).toBeLessThan(placeOf(shown(text.hiddenNote)))
    expect(placeOf(shown(text.hiddenNote))).toBeLessThan(
      placeOf(screen.getByRole('button', { name: text.unhide }) as unknown as Node),
    )
  })
})

describe('CommentCard, a placeholder (design A5)', () => {
  /** La tuile : le rond qui porte l'icône, de la taille de la photo. */
  const tileOf = (size: number) =>
    allNodes().filter((node) => {
      const style = flat(node)
      return style.width === size && style.height === size && style.borderRadius === size / 2
    })

  it('draws its icon on a round tile the size of a photo, its text where a name would be', async () => {
    await renderWithProviders(card({ comment: placeholderOf('deleted') }))

    const [tile] = tileOf(COMMENT_AVATAR.root)
    expect(tile).toBeDefined()
    expect(flat(tile as Node).backgroundColor).toBe(palettes.day.surfaceGrouped)
    // La phrase n'est pas dans la tuile : elle vient à côté, à la place du nom (photo + 8 points).
    const phrase = shown(text.placeholder.deleted)
    expect(chainOf(phrase)).not.toContain(tile)
    expect(flat(commonParent(phrase, tile as Node)).gap).toBe(8)
  })

  it('takes the size of a reply photo in a reply', async () => {
    await renderWithProviders(card({ comment: placeholderOf('deleted'), kind: 'reply' }))

    expect(tileOf(COMMENT_AVATAR.reply)).toHaveLength(1)
  })
})

describe('CommentCard, compact and yours (ui-A5)', () => {
  it('names your own compact card « Ton commentaire : » and the start of the text', async () => {
    await renderWithProviders(
      card({ comment: hugoComment({ isMine: true }), isMine: true, compact: true }),
    )

    expect(
      screen.getByRole('button', {
        name: fr.t(($) => $.project.comments.openLineMine, { excerpt: BODY }),
      }),
    ).toBeTruthy()
    // Le nom du bouton l'emporte sur son contenu : un texte caché n'y serait jamais lu.
    expect(screen.queryByText(text.yours, { includeHiddenElements: true })).toBeNull()
  })

  it('keeps « Commentaire d’Hugo » on the compact card of someone else', async () => {
    await renderWithProviders(card({ compact: true }))

    expect(screen.getByRole('button', { name: text.openLine('Hugo Lefèvre', BODY) })).toBeTruthy()
  })
})

describe('CommentCard, the focus', () => {
  const menuName = text.menu('Hugo Lefèvre')

  describe('on the web, with a keyboard', () => {
    let restore: () => void
    beforeEach(() => {
      restore = lendWebPage()
    })
    afterEach(() => {
      restore()
    })

    /**
     * Rend la carte, puis écoute `focus` sur le prototype des vues natives (une vue témoin le
     * donne) : rend le nom de chaque vue qui a reçu le focus pendant `act`.
     */
    const focusedDuring = async (props: Partial<CardProps>, act: () => unknown) => {
      const probe = createRef<View>()
      await renderWithProviders(
        <>
          <View ref={probe} />
          {card(props)}
        </>,
      )
      const proto = Object.getPrototypeOf(probe.current) as { focus?: unknown }
      const hadFocus = Object.hasOwn(proto, 'focus')
      const original = proto.focus
      if (typeof proto.focus !== 'function') proto.focus = () => {}
      const focus = jest.spyOn(proto as { focus: () => void }, 'focus')
      focus.mockClear()
      try {
        const result = act()
        return { result, focused: focus.mock.contexts.map(labelOf) }
      } finally {
        focus.mockRestore()
        if (hadFocus) proto.focus = original
        else delete proto.focus
      }
    }

    it('focusMenu() puts the focus on « … » and returns true', async () => {
      const handle = createRef<CommentCardHandle>()
      const { result, focused } = await focusedDuring(
        { handle, menu: [{ label: 'Signaler', onPress: jest.fn() }] },
        () => handle.current?.focusMenu(),
      )

      expect(result).toBe(true)
      expect(focused).toEqual([menuName])
    })

    it('focusMenu() returns false when there is no « … »', async () => {
      const handle = createRef<CommentCardHandle>()
      const { result } = await focusedDuring({ handle }, () => handle.current?.focusMenu())

      expect(result).toBe(false)
    })

    it('focusReply() puts the focus on « Répondre » and returns true', async () => {
      const handle = createRef<CommentCardHandle>()
      const { result, focused } = await focusedDuring({ handle, onReply: jest.fn() }, () =>
        handle.current?.focusReply(),
      )

      expect(result).toBe(true)
      expect(focused).toEqual([text.reply])
    })

    it('focusReply() returns false when there is no « Répondre »', async () => {
      const handle = createRef<CommentCardHandle>()
      const { result } = await focusedDuring({ handle }, () => handle.current?.focusReply())

      expect(result).toBe(false)
    })
  })

  it('on phone, closing the menu gives the screen reader focus back to « … »', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    const sent = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
    const set = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus')
    await renderWithProviders(card({ menu: [{ label: 'Signaler', onPress: jest.fn() }] }))
    await fireEvent.press(screen.getByRole('button', { name: menuName }))
    sent.mockClear()
    set.mockClear()

    // Un toucher à côté du menu le ferme (« Fermer le menu »).
    await fireEvent.press(screen.getByRole('button', { name: text.closeMenu }))

    // Le focus du lecteur d'écran revient à « … » : par `sendAccessibilityEvent(vue, 'focus')`, qui
    // dit quelle vue, ou par `setAccessibilityFocus(numéro de la vue)`, que Jest ne relie à aucune.
    await waitFor(() => {
      const toMenu = sent.mock.calls.some(
        ([node, kind]) => kind === 'focus' && labelOf(node) === menuName,
      )
      expect(toMenu || set.mock.calls.length > 0).toBe(true)
    })
    expect(screen.queryByRole('menuitem')).toBeNull()
  })
})
