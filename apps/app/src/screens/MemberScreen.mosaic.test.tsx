// Tests de la mosaïque de cartes sur la page d'un membre (tranche R14, docs/scenarios/refonte.md,
// « La mosaïque ») : le plus récent de ses projets est une grande carte, comme celles du Fil (photo,
// titre, accroche, statut, « Tester » s'il est testable, réactions) ; les suivants sont des cartes
// compactes (photo, titre, statut, réactions ; sans photo, l'accroche). Aucune carte ne répète le
// nom du membre ; la pastille de visibilité reste ; la photo d'une carte est la première de la
// galerie (`cover`), à toute largeur ; toucher une carte ouvre le projet par « la carte qui devient
// la page » (`ui/coverTransition`).
//
// Ce fichier remplace MemberScreen.tiles.test.tsx (R10, les tuiles), que la décision 16 du
// 17/11/2026 (« ok, mosaïque ») contredit. Mêmes faux appels : l'API (members/api, profile/api,
// follows/api, blocks/api) est remplacée, la page du membre vient de `testing/hives.ts` (Tante
// Odile, quatre projets dont deux réservés à Famille, avec et sans photo).
//
// Ce que ces tests supposent du code : la mosaïque est `ui/ProjectMosaic` (`role="list"`, une case
// `listitem` par projet) et chaque carte un `SummaryCard` (`owner`, `size`, `badge`), qui dessine
// une `ProjectCard` (un lien nommé par le titre). Le faux module de ProjectCard note ce qu'il reçoit
// et dessine la vraie carte.
import type { ProjectSummary, ProjectVisual } from '@ruche/contracts'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { getMember } from '../members/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { biscotte, herbier, odileMemberPage, recettesMamie, tricot } from '../testing/hives'
import { pathOf } from '../testing/navigation'
import { draftProject, projectWithPhotos, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { MemberScreen } from './MemberScreen'

/** Les propriétés reçues par chaque ProjectCard, rangées par titre (la dernière reçue). */
const mockCardProps = new Map<string, Record<string, unknown>>()
jest.mock('../ui/ProjectCard', () => {
  const actual = jest.requireActual('../ui/ProjectCard')
  const { createElement } = require('react')
  return {
    ...actual,
    ProjectCard: (props: Record<string, unknown>) => {
      mockCardProps.set(String(props.title), props)
      return createElement(actual.ProjectCard, props)
    },
  }
})
/** Les projets dont la carte a demandé « la carte qui devient la page » (`capture`). */
const mockCaptured: string[] = []
jest.mock('../ui/coverTransition', () => {
  const actual = jest.requireActual('../ui/coverTransition')
  return {
    ...actual,
    useCoverSource: (id: string) => {
      const real = actual.useCoverSource(id)
      return {
        ...real,
        capture: (then: () => void) => {
          mockCaptured.push(id)
          real.capture(then)
        },
      }
    },
  }
})
jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les catégories des cartes : la liste de départ, sans réseau.
jest.mock('../api/client', () => {
  const actual: typeof import('../api/client') = jest.requireActual('../api/client')
  const { categoryList }: typeof import('../testing/categories') =
    jest.requireActual('../testing/categories')
  return {
    ...actual,
    request: jest.fn((...args: Parameters<typeof actual.request>) =>
      String(args[0]).startsWith('/v1/categories')
        ? Promise.resolve({ ok: true, data: categoryList('fr') })
        : Promise.resolve({ ok: false, error: 'internal' }),
    ),
  }
})
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
  useRouter: () => ({
    push: mockPush,
    navigate: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
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
const roleOf = (node: Host) => node.props.role ?? node.props.accessibilityRole

/**
 * La mosaïque : la liste qui contient les cartes. `getByRole` ne la trouve pas (une vue non
 * `accessible`) : on parcourt l'arbre.
 */
const mosaic = () => {
  const lists = hostsOf(screen.root as unknown as Host).filter((node) => roleOf(node) === 'list')
  const found = lists.find((list) => hostsOf(list).some((node) => roleOf(node) === 'listitem'))
  if (!found) throw new Error('no mosaic of cards on the page')
  return found
}
/** Les cases de la mosaïque, dans l'ordre (une par projet). */
const cells = () => hostsOf(mosaic()).filter((node) => roleOf(node) === 'listitem')
/** La case d'un projet, trouvée par le lien nommé par son titre. */
const cellOf = (title: string) => {
  const found = cells().find(
    (cell) => within(cell as never).queryByRole('link', { name: title }) !== null,
  )
  if (!found) throw new Error(`no card for « ${title} »`)
  return found
}
/**
 * Les images dessinées dans une case, par leur source mise en texte : expo-image range l'adresse
 * dans un tableau de sources (comme `imagesOf` de CallCard.test.tsx).
 */
const imagesIn = (cell: Host) =>
  hostsOf(cell).flatMap((node) => (node.props.source ? [JSON.stringify(node.props.source)] : []))
/** La taille reçue par la carte d'un projet (`full` par défaut, celle du Fil). */
const sizeOf = (title: string) => mockCardProps.get(title)?.size ?? 'full'

const HIDDEN_TOO = { includeHiddenElements: true }
const shown = [biscotte, recettesMamie, herbier, tricot]
const reservedToFamille = fr.t(($) => $.hives.page.reserved, { hive: 'Famille' })
const testName = (title: string) => fr.t(($) => $.explore.testProject, { title })

/** Une photo verticale, différente de la couverture (la première photo de la galerie). */
const portrait: ProjectVisual = {
  id: 'a1b2c3d4-0000-4000-8000-000000009999',
  kind: 'image',
  url: 'http://localhost:3000/media/visuals/a1b2c3d4-0000-4000-8000-000000009999.webp',
  width: 900,
  height: 1600,
  thumbhash: '3OcRJYB4d3h/iIeHeEh3eIhw+j3A', // gitleaks:allow (un résumé d'image, pas une clé)
  description: null,
}

const openOdile = async (projects: ProjectSummary[] = shown) => {
  jest.mocked(getMember).mockResolvedValue({ ...odileMemberPage, projects })
  await renderWithProviders(<MemberScreen id="odile-id" />)
  await screen.findByRole('header', { name: 'Tante Odile' })
}

beforeEach(() => {
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  jest.mocked(getMe).mockResolvedValue(leaMe)
  jest.mocked(getMember).mockReset().mockResolvedValue(odileMemberPage)
  mockPush.mockReset()
  mockCardProps.clear()
  mockCaptured.length = 0
})

describe('MemberScreen, her projects as a mosaic of cards (R14)', () => {
  it('shows the newest project as the big card, then the others as compact cards, in order', async () => {
    await openOdile()

    const titles = cells().map(
      (cell) =>
        shown.find((project) => within(cell as never).queryByRole('link', { name: project.title }))
          ?.title,
    )
    expect(titles).toEqual(shown.map((project) => project.title))
    expect(shown.map((project) => sizeOf(project.title))).toEqual([
      'full',
      'compact',
      'compact',
      'compact',
    ])
  })

  it('shows the pitch on the big card, and on a compact card only without a photo', async () => {
    await openOdile()

    expect(within(cellOf(biscotte.title) as never).getByText(biscotte.pitch)).toBeTruthy()
    // « Les recettes de Mamie » n'a pas de photo : la lumière miel et son accroche.
    expect(within(cellOf(recettesMamie.title) as never).getByText(recettesMamie.pitch)).toBeTruthy()
    expect(within(cellOf(tricot.title) as never).queryByText(tricot.pitch, HIDDEN_TOO)).toBeNull()
  })

  it('offers « Tester » on the big card only', async () => {
    // Témoin : l'herbier, testable avec une démo, en tête, offre « Tester ».
    await openOdile([herbier, biscotte, tricot])
    expect(screen.getByRole('link', { name: testName(herbier.title) })).toBeTruthy()
  })

  it('offers no « Tester » on a compact card', async () => {
    await openOdile()

    expect(herbier.status).toBe('testable')
    expect(within(cellOf(herbier.title) as never).getByText(herbier.title)).toBeTruthy()
    expect(screen.queryByRole('link', { name: testName(herbier.title) })).toBeNull()
  })

  it('shows no name of the member on the cards', async () => {
    await openOdile()

    expect(cells()).toHaveLength(shown.length) // témoin : les cartes sont là
    for (const cell of cells()) {
      expect(within(cell as never).queryByText('Tante Odile', HIDDEN_TOO)).toBeNull()
    }
    expect(screen.queryByRole('link', { name: 'Tante Odile' })).toBeNull()
  })

  it('marks « Réservé à Famille » on the card of a project reserved to the hive only', async () => {
    await openOdile()

    expect(within(cellOf(biscotte.title) as never).getByText(reservedToFamille)).toBeTruthy()
    expect(within(cellOf(recettesMamie.title) as never).getByText(reservedToFamille)).toBeTruthy()
    expect(within(cellOf(tricot.title) as never).queryByText(reservedToFamille)).toBeNull()
  })

  it('still marks her own private project « Privé » on its card, on her own page', async () => {
    jest.mocked(getMember).mockResolvedValue({
      ...odileMemberPage,
      id: leaMe.id,
      name: leaMe.name,
      isMe: true,
      projects: [summaryOf(projectWithPhotos), summaryOf(draftProject)],
    })
    await renderWithProviders(<MemberScreen id={leaMe.id} />)
    await screen.findByRole('link', { name: draftProject.title })

    const privateMark = fr.t(($) => $.member.private)
    expect(within(cellOf(draftProject.title) as never).getByText(privateMark)).toBeTruthy()
    expect(within(cellOf(projectWithPhotos.title) as never).queryByText(privateMark)).toBeNull()
    // Sa propre page ne répète pas son nom non plus.
    expect(within(cellOf(draftProject.title) as never).queryByText(leaMe.name)).toBeNull()
  })

  it('shows the cover, not the portrait cover, on a phone', async () => {
    // La fenêtre de Jest est un téléphone (390 points), où le Fil prend la photo verticale.
    const withPortrait = { ...tricot, portraitCover: portrait }
    await openOdile([biscotte, withPortrait])

    const sources = imagesIn(cellOf(tricot.title))
    const cover = tricot.cover?.url ?? 'no cover'
    expect(sources.some((source) => source.includes(cover))).toBe(true)
    expect(sources.some((source) => source.includes(portrait.url))).toBe(false)
  })

  it('opens the project through the card that becomes the page', async () => {
    await openOdile()

    await fireEvent.press(
      within(cellOf(tricot.title) as never).getByRole('link', { name: tricot.title }),
    )

    expect(mockCaptured).toEqual([tricot.id])
    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual([`/projects/${tricot.id}`])
  })
})
