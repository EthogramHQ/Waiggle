// Tests de la page d'un membre sur ordinateur (tranche R15, docs/scenarios/refonte.md, « La page
// d'un membre », planche R15-Membre-1920) : dès 1 100 points, son profil (photo, nom, pseudo, bio,
// outils, abonnés, Suivre) est une colonne à gauche, lue d'abord, et la mosaïque de ses projets (R14)
// occupe la droite. Sur téléphone et tablette, la page reste celle de R14 : l'en-tête centré, puis
// la mosaïque dessous.
//
// Jest ne place rien à l'écran : on vérifie la structure. L'en-tête reçoit `layout="column"` ; la
// page pose ses deux colonnes par `Columns`, le profil en colonne latérale lue d'abord (`sideFirst`,
// à gauche), la mosaïque en colonne principale. Le faux module de `Columns` dessine le vrai, en
// enveloppant chaque colonne dans une vue repérable (`testID`), pour savoir où tombe chaque élément.
// Mêmes faux appels que MemberScreen.mosaic.test.tsx (Tante Odile, de `testing/hives.ts`).
import { screen, within } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { getMember } from '../members/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { biscotte, odileMemberPage } from '../testing/hives'
import { mockSession, renderWithProviders } from '../testing/render'
import { MemberScreen } from './MemberScreen'

/** Les propriétés reçues par chaque en-tête de membre, notées par son faux module. */
const mockHeaderProps: Record<string, unknown>[] = []
/** Les propriétés reçues par chaque `Columns`, notées par son faux module. */
const mockColumnsProps: Record<string, unknown>[] = []
/** Les propriétés reçues par le cadre de page (`Screen`). */
const mockScreenProps: Record<string, unknown>[] = []

jest.mock('../ui/MemberHeader', () => {
  const actual = jest.requireActual('../ui/MemberHeader')
  const { createElement } = require('react')
  return {
    ...actual,
    MemberHeader: (props: Record<string, unknown>) => {
      mockHeaderProps.push(props)
      return createElement(actual.MemberHeader, props)
    },
  }
})
jest.mock('../ui/Columns', () => {
  const actual = jest.requireActual('../ui/Columns')
  const { createElement, isValidElement } = require('react')
  const { View } = require('react-native')
  /** Une colonne enveloppée dans une vue repérable ; un contenu qui n'est pas un élément reste tel quel. */
  const mark = (content: unknown, testID: string) =>
    isValidElement(content) ? createElement(View, { testID }, content) : content
  return {
    ...actual,
    Columns: (props: Record<string, unknown>) => {
      mockColumnsProps.push(props)
      return createElement(actual.Columns, {
        ...props,
        ...('main' in props ? { main: mark(props.main, 'columns-main') } : null),
        ...('side' in props ? { side: mark(props.side, 'columns-side') } : null),
      })
    },
  }
})
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
jest.mock('expo-router', () => ({
  usePathname: () => '/members/odile-id',
  useRouter: () => ({
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}))

beforeEach(() => {
  mockHeaderProps.length = 0
  mockColumnsProps.length = 0
  mockScreenProps.length = 0
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  jest.mocked(getMe).mockResolvedValue(leaMe)
  jest.mocked(getMember).mockReset().mockResolvedValue(odileMemberPage)
})

/** Le temps d'un test, une fenêtre de cette taille ; le téléphone est remis à la fin. */
const atWindow = async (width: number, height: number, run: () => Promise<void>) => {
  const window = { width, height, scale: 2, fontScale: 1 }
  const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
  Dimensions.set({ window, screen: window })
  try {
    await run()
  } finally {
    Dimensions.set({ window: phone, screen: phone })
  }
}

const NAME = 'Tante Odile'
const openOdile = async () => {
  await renderWithProviders(<MemberScreen id="odile-id" />)
  await screen.findByRole('header', { name: NAME })
}
/** Le lien de la grande carte de la mosaïque (son projet le plus récent). */
const firstCard = () => screen.getByRole('link', { name: biscotte.title })

type Host = { props: Record<string, unknown>; children: (Host | string)[] }
/** Vrai si `first` est lu avant `second` (l'arbre rendu, parcouru de haut en bas). */
const readBefore = (first: unknown, second: unknown) => {
  const order: unknown[] = []
  const walk = (node: Host) => {
    order.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as unknown as Host)
  expect(order.indexOf(first)).toBeGreaterThanOrEqual(0)
  expect(order.indexOf(second)).toBeGreaterThanOrEqual(0)
  return order.indexOf(first) < order.indexOf(second)
}

describe('MemberScreen on a computer (R15)', () => {
  it('lays the page out on the wide template', () =>
    atWindow(1920, 1080, async () => {
      await openOdile()

      expect(mockScreenProps.at(-1)?.width).toBe('wide')
    }))

  for (const [width, height] of [
    [1100, 800],
    [1920, 1080],
  ] as const) {
    it(`puts her profile in a column on the left, then the mosaic on the right, at ${width}`, () =>
      atWindow(width, height, async () => {
        await openOdile()

        // L'en-tête prend sa forme en colonne.
        expect(mockHeaderProps.at(-1)?.layout).toBe('column')
        // Deux colonnes : le profil en latérale lue d'abord (à gauche), la mosaïque en principale.
        expect(mockColumnsProps.some((props) => props.sideFirst === true)).toBe(true)
        const side = screen.getByTestId('columns-side')
        const main = screen.getByTestId('columns-main')
        expect(within(side).getByRole('header', { name: NAME })).toBeTruthy()
        expect(within(main).getByRole('link', { name: biscotte.title })).toBeTruthy()
        expect(within(side).queryByRole('link', { name: biscotte.title })).toBeNull()
        // Le profil est lu avant ses projets.
        expect(readBefore(screen.getByRole('header', { name: NAME }), firstCard())).toBe(true)
      }))
  }
})

describe('MemberScreen on a phone stays the page of R14 (R15)', () => {
  it('keeps the centered header above the mosaic at 390', async () => {
    await openOdile()

    expect(mockHeaderProps.at(-1)?.layout).not.toBe('column')
    // Aucune colonne de profil : l'en-tête n'est pas posé dans une colonne latérale.
    expect(screen.queryByTestId('columns-side')).toBeNull()
    // Témoin : la mosaïque est là, sous l'en-tête.
    expect(readBefore(screen.getByRole('header', { name: NAME }), firstCard())).toBe(true)
  })
})
