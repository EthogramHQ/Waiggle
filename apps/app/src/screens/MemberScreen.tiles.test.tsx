// Tests de la mosaïque de tuiles sur la page d'un membre (R10, F-Et5, docs/scenarios/refonte.md,
// « La mosaïque de tuiles ») : « Ses projets » en tuiles, comme la page d'un outil (`TagScreen`) et
// l'onglet Projets d'une ruche. Une tuile garde la photo, le titre et l'auteur, et mène à la page du
// projet ; elle perd ce que porte la grande carte du Fil : l'accroche, « Tester », « Suivre » et le
// lien vers l'auteur (on est déjà sur sa page). Deux colonnes sur téléphone, quatre sur ordinateur.
//
// Fichier à part de MemberScreen.test.tsx (trop long) ; mêmes faux appels : l'API (members/api,
// profile/api, follows/api, blocks/api) est remplacée, la page du membre vient de `testing/hives.ts`
// (Tante Odile, quatre projets dont deux réservés à Famille, avec et sans photo).
//
// Ce que ces tests supposent du code : la mosaïque est `ui/TileMosaic` (une liste posée à la main,
// `role="list"`, une case `listitem` par projet, les rangées de `columns` cases) et chaque projet un
// `ui/ProjectTile` (un lien nommé par le titre, l'auteur en texte, la couverture en image).
import { fireEvent, screen, within } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { getMember } from '../members/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { biscotte, herbier, odileMemberPage, recettesMamie, tricot } from '../testing/hives'
import { visited } from '../testing/navigation'
import { draftProject, projectWithPhotos, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { MemberScreen } from './MemberScreen'

jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../follows/api', () => ({
  useFollow: () => ({ toggle: jest.fn(), error: false, expired: false }),
}))
jest.mock('../blocks/api', () => ({
  useBlock: () => ({ block: jest.fn() }),
  useUnblock: () => ({ unblock: jest.fn() }),
}))
jest.mock('../members/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getMember = jest.fn()
  return {
    getMember,
    useMember: (id: string, enabled = true) =>
      useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled }),
  }
})
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/members/odile-id',
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}))

type Host = {
  props: Record<string, unknown>
  children: ReadonlyArray<Host | string>
}

/** Tous les éléments de l'arbre rendu, en profondeur (RNTL 14 n'a plus `findAll`). */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const hostChildren = (node: Host) =>
  node.children.filter((child): child is Host => typeof child !== 'string')

/**
 * La mosaïque : la liste posée à la main (`role="list"`) qui contient les tuiles. `getByRole` ne la
 * trouve pas (une vue non `accessible`) : on parcourt l'arbre.
 */
const mosaic = () => {
  const lists = hostsOf(screen.root as unknown as Host).filter((node) => node.props.role === 'list')
  const found = lists.find((list) => hostsOf(list).some((node) => node.props.role === 'listitem'))
  if (!found) throw new Error('no mosaic of tiles on the page')
  return found
}
/** Les cases remplies de la mosaïque, dans l'ordre (une par projet). */
const tiles = () => hostsOf(mosaic()).filter((node) => node.props.role === 'listitem')
/** La tuile d'un projet : sa case, trouvée par le lien nommé par son titre. */
const tileOf = (title: string) => {
  const found = tiles().find(
    (cell) => within(cell as never).queryByRole('link', { name: title }) !== null,
  )
  if (!found) throw new Error(`no tile for « ${title} »`)
  return found
}
/**
 * Les images dessinées dans une tuile, par leur source mise en texte : expo-image range l'adresse
 * dans un tableau de sources (comme `imagesOf` de CallCard.test.tsx).
 */
const imagesIn = (cell: Host) =>
  hostsOf(cell).flatMap((node) => (node.props.source ? [JSON.stringify(node.props.source)] : []))

const shown = [biscotte, recettesMamie, herbier, tricot]

// La fenêtre de Jest (un téléphone, 390 points), rendue après le test qui la change.
const initialWindow = Dimensions.get('window')
const setWindow = (width: number, height: number) => {
  const size = { ...initialWindow, width, height }
  Dimensions.set({ window: size, screen: size })
}

beforeEach(() => {
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  jest.mocked(getMe).mockResolvedValue(leaMe)
  jest.mocked(getMember).mockReset().mockResolvedValue(odileMemberPage)
  mockPush.mockReset()
})
afterEach(() => {
  Dimensions.set({ window: initialWindow, screen: initialWindow })
})

describe('MemberScreen, her projects as a mosaic of tiles (R10, F-Et5)', () => {
  it('shows her projects as tiles, one per project, from the newest to the oldest', async () => {
    await renderWithProviders(<MemberScreen id="odile-id" />)
    expect(await screen.findByRole('header', { name: 'Tante Odile' })).toBeTruthy()

    const titles = tiles().map(
      (cell) =>
        shown.find((project) => within(cell as never).queryByRole('link', { name: project.title }))
          ?.title,
    )
    expect(titles).toEqual(shown.map((project) => project.title))
  })

  it('keeps on each tile its title, its author and its photo', async () => {
    await renderWithProviders(<MemberScreen id="odile-id" />)
    await screen.findByRole('header', { name: 'Tante Odile' })

    const tile = tileOf(biscotte.title)
    expect(within(tile as never).getByText(biscotte.title)).toBeTruthy()
    expect(within(tile as never).getByText('Tante Odile')).toBeTruthy()
    const cover = biscotte.cover?.url ?? 'no cover'
    expect(imagesIn(tile).some((source) => source.includes(cover))).toBe(true)
  })

  it('keeps the tile of a project without a photo, without any image', async () => {
    await renderWithProviders(<MemberScreen id="odile-id" />)
    await screen.findByRole('header', { name: 'Tante Odile' })

    const tile = tileOf(recettesMamie.title)
    expect(within(tile as never).getByText('Tante Odile')).toBeTruthy() // témoin : la tuile est là
    expect(imagesIn(tile)).toEqual([])
  })

  // La tuile est un seul lien : l'accroche, « Tester », « Suivre » et le lien vers l'auteur sont
  // ceux de la grande carte du Fil, que la tuile perd (scénario, « La mosaïque de tuiles »).
  it('drops the pitch, « Tester », « Suivre » and the link to the author from the tiles', async () => {
    await renderWithProviders(<MemberScreen id="odile-id" />)
    await screen.findByRole('header', { name: 'Tante Odile' })

    // Témoin : « Mon herbier de balcon » est testable, avec une démo ; sa carte offrait « Tester ».
    const tile = tileOf(herbier.title)
    expect(herbier.status).toBe('testable')
    expect(within(tile as never).queryByText(herbier.pitch)).toBeNull()
    for (const cell of tiles()) {
      const links = within(cell as never).queryAllByRole('link')
      const buttons = within(cell as never).queryAllByRole('button')
      // Un seul lien par tuile, celui du projet ; aucun bouton (ni « Tester », ni « Suivre »).
      expect(links).toHaveLength(1)
      expect(buttons).toHaveLength(0)
    }
    expect(
      screen.queryByRole('button', { name: new RegExp(`^${fr.t(($) => $.explore.test)}`) }),
    ).toBeNull()
    expect(screen.queryByRole('link', { name: 'Tante Odile' })).toBeNull()
  })

  it('opens the page of the project from its tile', async () => {
    await renderWithProviders(<MemberScreen id="odile-id" />)
    await screen.findByRole('header', { name: 'Tante Odile' })

    await fireEvent.press(within(tileOf(biscotte.title) as never).getByRole('link'))

    expect(visited(mockPush)).toEqual([`/projects/${biscotte.id}`])
  })

  it('lays the tiles out in two columns on a phone', async () => {
    setWindow(390, 844)
    await renderWithProviders(<MemberScreen id="odile-id" />)
    await screen.findByRole('header', { name: 'Tante Odile' })

    const rows = hostChildren(mosaic())
    expect(rows.map((row) => hostChildren(row).length)).toEqual([2, 2])
  })

  it('lays the tiles out in four columns on a computer', async () => {
    setWindow(1440, 900)
    await renderWithProviders(<MemberScreen id="odile-id" />)
    await screen.findByRole('header', { name: 'Tante Odile' })

    const rows = hostChildren(mosaic())
    expect(rows.map((row) => hostChildren(row).length)).toEqual([4])
  })

  // R3 (« Mes projets · 3 », les privés marqués « Privé ») : la tuile garde la marque, sur la tuile
  // du projet privé seulement.
  it('still marks her own private project « Privé » on its tile, on her own page', async () => {
    jest.mocked(getMember).mockResolvedValue({
      ...odileMemberPage,
      id: leaMe.id,
      name: leaMe.name,
      isMe: true,
      projects: [summaryOf(draftProject), summaryOf(projectWithPhotos)],
    })
    await renderWithProviders(<MemberScreen id={leaMe.id} />)
    await screen.findByRole('link', { name: draftProject.title })

    const privateMark = fr.t(($) => $.member.private)
    expect(within(tileOf(draftProject.title) as never).getByText(privateMark)).toBeTruthy()
    expect(within(tileOf(projectWithPhotos.title) as never).queryByText(privateMark)).toBeNull()
  })
})
