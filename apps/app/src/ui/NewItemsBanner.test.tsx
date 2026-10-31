// Tests du bouton des nouveautés du fil (refonte, tranche R4, décision F-Fil4) : il dit ce qui est
// arrivé (« 3 nouveaux projets », « 2 nouvelles notes », « 4 nouveautés » quand il y a des deux),
// « ou plus » quand la liste relue est pleine, et montre les visages des auteurs (3 au plus).
// Les visages décorent : le nom lu du bouton est son texte, rien de plus. L'arrivée des nouveautés
// est annoncée une seule fois, poliment (`LiveStatus`), sans prendre le focus.
//
// Ce que le bouton reçoit : le nombre (`count`, null : rien de neuf), `more` (la liste relue est
// pleine et il y a une suite), les sortes d'éléments arrivés (`kinds`) et les auteurs, déjà prêts
// à dessiner (`authors` : nom et photo, comme `AvatarStack`).
import { FEED_PAGE_SIZE } from '@ruche/contracts'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { NewItemsBanner } from './NewItemsBanner'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Les blancs de la typographie française (insécables, fines) ramenés à des espaces. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

type Kind = 'project' | 'note'

const nora = { name: 'Nora Benali', source: null }
const sam = { name: 'Sam Petit', source: null }
const caption = 'Les nouveaux projets des personnes que tu suis.'

/** Le bouton tel que le fil le pose, avec ce qui est arrivé. */
const banner = (
  news: { count: number | null; more?: boolean; kinds?: Kind[] },
  onPress: () => unknown = () => {},
) => (
  <NewItemsBanner
    count={news.count}
    more={news.more ?? false}
    kinds={news.kinds ?? ['project']}
    authors={news.count === null ? [] : [nora, sam]}
    onPress={onPress}
    caption={caption}
  />
)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { parent: Node | null }

/** Vrai si `element` est dans `ancestor` (comparés par identité : jamais d'écart écrit sans fin). */
const inside = (element: unknown, ancestor: unknown): boolean => {
  for (let node = element as Node | null; node; node = node.parent) {
    if (node === ancestor) return true
  }
  return false
}

const projects = (count: number) => plain(fr.t(($) => $.feed.newProjects, { count }))
const notes = (count: number) => plain(fr.t(($) => $.feed.newNotes, { count }))
const mixed = (count: number) => plain(fr.t(($) => $.feed.newMixed, { count }))

describe('NewItemsBanner, what it says', () => {
  it('says how many new projects arrived', async () => {
    await renderWithProviders(banner({ count: 3, kinds: ['project'] }))

    expect(screen.getByRole('button', { name: projects(3) })).toBeTruthy()
  })

  it('says one new project in the singular', async () => {
    await renderWithProviders(banner({ count: 1, kinds: ['project'] }))

    expect(screen.getByRole('button', { name: projects(1) })).toBeTruthy()
  })

  it('says new notes when only notes arrived', async () => {
    await renderWithProviders(banner({ count: 2, kinds: ['note'] }))

    expect(screen.getByRole('button', { name: notes(2) })).toBeTruthy()
  })

  it('says nouveautés when projects and notes arrived', async () => {
    await renderWithProviders(banner({ count: 4, kinds: ['note', 'project'] }))

    expect(screen.getByRole('button', { name: mixed(4) })).toBeTruthy()
  })

  it.each([
    [['project'] as Kind[], fr.t(($) => $.feed.newProjectsMany, { max: FEED_PAGE_SIZE })],
    [['note'] as Kind[], fr.t(($) => $.feed.newNotesMany, { max: FEED_PAGE_SIZE })],
    [['project', 'note'] as Kind[], fr.t(($) => $.feed.newMixedMany, { max: FEED_PAGE_SIZE })],
  ])('says « ou plus » at the cap of the list (%j)', async (kinds, text) => {
    await renderWithProviders(banner({ count: FEED_PAGE_SIZE, more: true, kinds }))

    expect(screen.getByRole('button', { name: plain(text) })).toBeTruthy()
  })

  it('speaks the language of the app', async () => {
    await renderWithProviders(banner({ count: 3, kinds: ['project'] }), 'en')

    expect(screen.getByRole('button', { name: '3 new projects' })).toBeTruthy()
  })
})

describe('NewItemsBanner, how it reads', () => {
  it('is read as it is shown', async () => {
    await renderWithProviders(banner({ count: 3, kinds: ['project'] }))

    // Le texte vu dans le bouton est son nom lu, tel quel : on le trouve dans le bouton même.
    const button = screen.getByRole('button', { name: projects(3) })
    const shown = screen.getAllByText(projects(3), { includeHiddenElements: true })
    expect(shown.some((text) => inside(text, button))).toBe(true)
  })

  it('shows the faces of the authors without reading them', async () => {
    await renderWithProviders(banner({ count: 3, kinds: ['project'] }))

    // Témoin : les initiales de Nora sont dessinées…
    expect(screen.getByText('NB', { includeHiddenElements: true })).toBeTruthy()
    // … mais aucun lecteur d'écran ne les lit, ni son nom.
    expect(screen.queryByText('NB')).toBeNull()
    expect(screen.queryByLabelText(nora.name)).toBeNull()
    expect(screen.queryByLabelText(/membres?/)).toBeNull()
  })

  it('announces the news once, not at each new reading of the feed', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
    try {
      const { rerender } = await renderWithProviders(banner({ count: null }))
      announce.mockClear()

      await rerender(banner({ count: 3, kinds: ['project'] }))
      // La relecture suivante trouve les mêmes nouveautés (de nouveaux tableaux, même contenu).
      await rerender(banner({ count: 3, kinds: ['project'] }))

      expect(announce).toHaveBeenCalledTimes(1)
      expect(plain(String(announce.mock.calls[0]?.[0]))).toBe(projects(3))
    } finally {
      announce.mockRestore()
    }
  })

  it('carries the announcement in a single region', async () => {
    const { rerender } = await renderWithProviders(banner({ count: null }))
    await rerender(banner({ count: 3, kinds: ['project'] }))

    // Une seule région annonce « 3 nouveaux projets » (sur ordinateur aussi : un seul bouton).
    const regions = screen.getAllByRole('status', { includeHiddenElements: true })
    const telling = regions.filter(
      (region) =>
        within(region).queryAllByText(projects(3), { includeHiddenElements: true }).length,
    )
    expect(telling).toHaveLength(1)
  })
})

describe('NewItemsBanner, the touch', () => {
  it('shows the new items when touched', async () => {
    const onPress = jest.fn()
    await renderWithProviders(banner({ count: 3, kinds: ['project'] }, onPress))

    await fireEvent.press(screen.getByRole('button', { name: projects(3) }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('says what the feed shows, with nothing to press, when nothing is new', async () => {
    await renderWithProviders(banner({ count: null }))

    expect(screen.getByText(caption)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
