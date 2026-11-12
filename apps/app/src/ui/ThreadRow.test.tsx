// Tests d'une ligne de la liste des fils de l'auteur (R7b, onglet « Retours » du coin des testeurs ;
// planche validée 5, relecture du plan ui-A1, ui-B1, juridique J12). Une ligne par testeur qui a
// écrit : sa photo, son nom, l'extrait du dernier message et sa date, un point miel s'il y a du
// nouveau, « Ne teste plus » pour un ancien testeur. La ligne est un lien vers le fil :
// - nommée par le nom seul, ou « Léa Moreau, non lu » quand il y a du nouveau (le point ne se lit
//   pas, le nom le dit) ;
// - décrite par l'extrait et la date (« Toi : … » si le dernier mot est de l'auteur, qui lit la
//   liste ; « Un retour, sans texte » s'il n'y a pas de texte) ;
// - sur ordinateur, le fil ouvert à droite marque sa ligne : `aria-current` sur le web,
//   `accessibilityState.selected` sur téléphone et tablette.
//
// L'API (plan R7b, « Briques du fil et du coin, API fixée ») :
// `ThreadRow({ name: string, avatar: ImageSource | null, lastAt: string, lastFrom: TesterRole,
//   excerpt: string | null, unread: boolean, former: boolean, current?: boolean,
//   onPress: () => void })`.
//
// Ce que Jest ne voit pas : le point miel et son liseré ambre, le gras du nom et de l'extrait d'un
// fil non lu (captures et catalogue ; les couleurs sont gardées par `contrastPairs`).
import { fireEvent, screen } from '@testing-library/react-native'
import type { ComponentProps, ReactElement } from 'react'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { relativeDate } from './relativeDate'
import { ThreadRow } from './ThreadRow'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

afterEach(() => {
  jest.restoreAllMocks()
})

// --- Les données ---------------------------------------------------------------------------------

const LEA = 'Léa Moreau'
const EXCERPT = 'Le score repart à zéro au niveau 3'

/** Dix jours plus tôt : une date courte (« 1 nov. »), qui ne bouge pas pendant le test. */
const TEN_DAYS_AGO = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

const text = {
  rowName: (name: string) => fr.t(($) => $.project.testers.thread.rowName, { name }),
  you: (excerpt: string) => fr.t(($) => $.project.testers.thread.you, { excerpt }),
  noText: fr.t(($) => $.project.testers.thread.noText),
  former: fr.t(($) => $.project.testers.thread.former),
}

/** Les façons d'écrire la date dans la description : la ligne choisit la sienne. */
const timeForms = (iso: string): string[] => {
  const date = relativeDate(iso, 'fr')
  return [date.label, date.afterVerb, date.full]
}

type RowProps = ComponentProps<typeof ThreadRow>

/** Le fil de Léa, lu, dont le dernier message est d'elle ; chaque test change ce qui l'intéresse. */
const row = (props: Partial<RowProps> = {}): ReactElement => (
  <ThreadRow
    name={LEA}
    avatar={null}
    lastAt={TEN_DAYS_AGO}
    lastFrom="tester"
    excerpt={EXCERPT}
    unread={false}
    former={false}
    onPress={() => {}}
    {...props}
  />
)

// --- Les outils ----------------------------------------------------------------------------------

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const all = () => hostsOf(screen.root as unknown as Host)

/** Le texte d'un élément et de tout ce qu'il contient, cachés compris. */
const textOf = (node: Host): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('')

/**
 * Ce qui décrit le lien, lu après son nom : l'indice sur téléphone (`accessibilityHint`) ; sur le
 * web, les textes que désigne `aria-describedby` (par leur identifiant), blancs ramenés.
 */
const descriptionOf = (link: unknown): string => {
  const { props } = link as Host
  if (Platform.OS !== 'web') return String(props.accessibilityHint ?? '')
  const ids = String(props['aria-describedby'] ?? '')
    .split(' ')
    .filter(Boolean)
  return ids
    .map((id) =>
      all()
        .filter((node) => node.props.nativeID === id || node.props.id === id)
        .map(textOf)
        .join(' '),
    )
    .join(' ')
}

/** Les blancs ramenés à une espace (les espaces insécables du français comprises). */
const flat = (value: string) => value.replace(/\s+/g, ' ')

/** La description dit-elle l'extrait et la date (une de ses formes) ? */
const describes = (description: string, excerpt: string) => ({
  excerpt: flat(description).includes(flat(excerpt)),
  date: timeForms(TEN_DAYS_AGO).some((time) => flat(description).includes(flat(time))),
})

// --- Les tests -----------------------------------------------------------------------------------

describe('ThreadRow', () => {
  it('names a thread row « Léa Moreau, non lu » and describes it by its excerpt and date', async () => {
    await renderWithProviders(row({ unread: true }))

    expect(text.rowName(LEA)).toBe('Léa Moreau, non lu')
    const link = screen.getByRole('link', { name: text.rowName(LEA) })
    expect(describes(descriptionOf(link), EXCERPT)).toEqual({ excerpt: true, date: true })
  })

  it('describes the row by its excerpt and date on the web too', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(row({ unread: true }))

    const link = screen.getByRole('link', { name: text.rowName(LEA) })
    expect(describes(descriptionOf(link), EXCERPT)).toEqual({ excerpt: true, date: true })
  })

  it('is named by the name alone once read', async () => {
    await renderWithProviders(row())

    expect(screen.getByRole('link', { name: LEA })).toBeTruthy()
    expect(screen.queryByRole('link', { name: text.rowName(LEA) })).toBeNull()
  })

  it('shows the name and the excerpt', async () => {
    await renderWithProviders(row())

    expect(screen.getByText(LEA)).toBeTruthy()
    expect(screen.getByText(EXCERPT)).toBeTruthy()
  })

  it('starts the excerpt with « Toi : » when the author wrote last', async () => {
    await renderWithProviders(row({ lastFrom: 'author', excerpt: 'Merci, je corrige' }))

    const excerpt = text.you('Merci, je corrige')
    expect(flat(excerpt)).toBe('Toi : Merci, je corrige')
    const link = screen.getByRole('link', { name: LEA })
    expect(describes(descriptionOf(link), excerpt)).toEqual({ excerpt: true, date: true })
  })

  it('says « Un retour, sans texte » when the last message has no text', async () => {
    await renderWithProviders(row({ excerpt: null }))

    const link = screen.getByRole('link', { name: LEA })
    expect(describes(descriptionOf(link), text.noText)).toEqual({ excerpt: true, date: true })
  })

  it('says « Ne teste plus » for a former tester, and only then', async () => {
    const view = await renderWithProviders(row())
    // Témoin : la ligne est là, sans la mention.
    expect(screen.getByRole('link', { name: LEA })).toBeTruthy()
    expect(screen.queryByText(text.former, { includeHiddenElements: true })).toBeNull()

    await view.rerender(row({ former: true }))

    expect(screen.getByText(text.former, { includeHiddenElements: true })).toBeTruthy()
  })

  it('opens the thread when touched', async () => {
    const onPress = jest.fn()
    await renderWithProviders(row({ onPress }))

    await fireEvent.press(screen.getByRole('link', { name: LEA }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('marks the row of the thread open beside the list as selected, on a phone or tablet', async () => {
    const view = await renderWithProviders(row())
    const selected = () =>
      (
        screen.getByRole('link', { name: LEA }).props.accessibilityState as
          | { selected?: boolean }
          | undefined
      )?.selected === true
    // Témoin : une autre ligne n'est pas marquée.
    expect(selected()).toBe(false)

    await view.rerender(row({ current: true }))

    expect(selected()).toBe(true)
  })

  it('marks the row of the thread open beside the list with aria-current on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const view = await renderWithProviders(row())
    const current = () => screen.getByRole('link', { name: LEA }).props['aria-current']
    expect([undefined, false, 'false']).toContain(current())

    await view.rerender(row({ current: true }))

    expect(['page', 'true', true]).toContain(current())
  })
})
