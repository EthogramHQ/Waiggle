// Tests de la barre du haut (tablettes et ordinateurs), pour la cloche des notifications
// (tranche 6b) : son nom dit le nombre de nouveautés, sa pastille s'arrête à « 9+ », et rien ne
// s'affiche à zéro. Le nombre vient de useUnreadCount, remplacé ici par un faux hook.
//
// Tranche 7c : la barre porte aussi le bandeau d'un compte suspendu, une fois pour toutes les
// pages qui la montent, sur téléphone comme sur ordinateur, et n'y propose plus « Publier ».
import { layout, palettes, space } from '@ruche/brand'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Dimensions, StyleSheet } from 'react-native'
import { createI18n } from '../i18n'
import { useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { adminMe, leaMe, suspendedMe } from '../testing/fixtures'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing } from '../testing/text'
import { TopNav } from './TopNav'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn().mockReturnValue(new Promise(() => {})) }))
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))
// L'adresse de la page, que les tests de R3 font varier (les liens de la barre marquent l'actif).
let mockPathname = '/'
const mockPush = jest.fn()
const mockSetParams = jest.fn()
// La page qui porte la barre est-elle affichée ? Sur le web, Expo Router garde les pages quittées
// montées dessous, avec la même adresse (R3, relecture de l'interface C9).
let mockFocused = true
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, replace: jest.fn(), setParams: mockSetParams }),
  useIsFocused: () => mockFocused,
}))

const { t } = createI18n('fr')

let restoreWindow: () => void

beforeEach(() => {
  restoreWindow = setDesktopWindow()
  mockPathname = '/'
  mockFocused = true
  mockPush.mockReset()
  mockSetParams.mockReset()
  mockSession({ user: { id: 'u5', name: 'Inès' } })
  jest.mocked(useUnreadCount).mockReset().mockReturnValue(0)
  // Par défaut, le profil n'arrive jamais : la barre s'en passe (son nom vient de la session).
  jest
    .mocked(getMe)
    .mockReset()
    .mockReturnValue(new Promise(() => {}))
})

afterEach(() => {
  restoreWindow()
})

describe('the bell of the top bar', () => {
  it('says how many groups are new, and shows the number', async () => {
    jest.mocked(useUnreadCount).mockReturnValue(3)
    await renderWithProviders(<TopNav />)

    expect(
      screen.getByRole('button', { name: t(($) => $.notifications.bellNew, { count: 3 }) }),
    ).toBeTruthy()
    expect(screen.getByText('3', { includeHiddenElements: true })).toBeTruthy()
  })

  it('stops at « 9+ » beyond nine', async () => {
    // L'API s'arrête à 10 (UNREAD_COUNT_MAX) : c'est son « plus de 9 ».
    jest.mocked(useUnreadCount).mockReturnValue(10)
    await renderWithProviders(<TopNav />)

    expect(
      screen.getByRole('button', { name: t(($) => $.notifications.bellNewMany, { max: 9 }) }),
    ).toBeTruthy()
    // Le nom lu dit le même nombre que la pastille.
    expect(screen.getByRole('button', { name: /plus de 9 nouvelles/ })).toBeTruthy()
    expect(screen.getByText('9+', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('10', { includeHiddenElements: true })).toBeNull()
  })

  it('shows no badge when nothing is new', async () => {
    await renderWithProviders(<TopNav />)

    // Témoin : la cloche est là, avec son seul nom…
    expect(screen.getByRole('button', { name: t(($) => $.notifications.bell) })).toBeTruthy()
    // … sans pastille.
    expect(screen.queryByText('0', { includeHiddenElements: true })).toBeNull()
  })

  it('opens the notifications', async () => {
    jest.mocked(useUnreadCount).mockReturnValue(1)
    await renderWithProviders(<TopNav />)

    await fireEvent.press(
      screen.getByRole('button', { name: t(($) => $.notifications.bellNew, { count: 1 }) }),
    )

    expect(mockPush).toHaveBeenCalledWith('/notifications')
  })

  it('is not there for a visitor', async () => {
    mockSession(null)
    await renderWithProviders(<TopNav />)

    expect(screen.queryByRole('button', { name: /Notifications/ })).toBeNull()
    expect(screen.queryByRole('button', { name: t(($) => $.notifications.bell) })).toBeNull()
  })
})

// Tranche 7c : « Un compte suspendu » (docs/scenarios/phase-1.md). Le bandeau est monté une fois,
// dans la barre, jamais écran par écran (plan de 7c) ; sur téléphone, où la capsule n'apparaît
// pas, la barre ne montre que lui.
describe('the top bar of a suspended member', () => {
  const title = () => screen.findByText(containing(t(($) => $.suspension.title)))

  it('shows the suspension banner on a computer', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderWithProviders(<TopNav />)

    expect(await title()).toBeTruthy()
  })

  it('shows the suspension banner on a phone too, where the bar itself is hidden', async () => {
    restoreWindow()
    restoreWindow = () => {}
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderWithProviders(<TopNav />)

    expect(await title()).toBeTruthy()
    // Témoin : sur téléphone, la capsule (logo, cloche, compte) reste absente.
    expect(screen.queryByRole('button', { name: t(($) => $.notifications.bell) })).toBeNull()
  })

  it('offers no « Publier un projet » to a suspended member', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderWithProviders(<TopNav />)

    await title()
    expect(screen.queryByRole('button', { name: t(($) => $.home.publish) })).toBeNull()
    // Témoin : le reste de la barre est là.
    expect(screen.getByRole('button', { name: t(($) => $.notifications.bell) })).toBeTruthy()
  })

  it('shows no banner, and still offers to publish, to a member who is not suspended', async () => {
    jest.mocked(getMe).mockResolvedValue(leaMe)
    await renderWithProviders(<TopNav />)

    // Le profil est arrivé : la barre a eu le temps de le lire.
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.getByRole('button', { name: t(($) => $.home.publish) })).toBeTruthy()
    expect(screen.queryByText(containing(t(($) => $.suspension.title)))).toBeNull()
  })

  // Décision de Louis du 31/10/2026 : « Publier » est en miel, comme le « + » du téléphone.
  it('offers « Publier » in honey, like the « + » of the phone', async () => {
    await renderWithProviders(<TopNav />)

    const publish = screen.getByRole('button', { name: t(($) => $.home.publish) })
    expect(StyleSheet.flatten(publish.props.style)?.backgroundColor).toBe(palettes.day.honey)
  })
})

// R3 (F-Nav8, F-Nav9) : la photo de la barre s'appelle « Moi » et mène à sa propre page (/me), d'où
// la roue ouvre les réglages. Dans les réglages aussi : on n'y est plus « déjà » (R2 l'y laissait
// sans lien, relecture de l'interface C7), puisque « Moi » est une autre page.
describe('the photo of the top bar', () => {
  it('is named « Moi » and leads to one’s own page', async () => {
    await renderWithProviders(<TopNav />)

    await fireEvent.press(screen.getByRole('link', { name: t(($) => $.nav.me) }))
    expect(mockPush).toHaveBeenCalledWith('/me')
    // L'ancien nom a disparu avec l'ancienne destination (sa clé aussi : le texte, écrit ici).
    expect(screen.queryByRole('button', { name: 'Réglages' })).toBeNull()
  })

  it('leads to « Moi » from the settings too', async () => {
    await renderWithProviders(<TopNav inSettings />)

    // Témoin : la barre est là.
    expect(screen.getByRole('button', { name: t(($) => $.home.publish) })).toBeTruthy()
    await fireEvent.press(screen.getByRole('link', { name: t(($) => $.nav.me) }))
    expect(mockPush).toHaveBeenCalledWith('/me')
  })
})

// R3 (« La barre du haut ») : la barre porte les liens Fil, Explorer et Ruches, l'actif dans sa
// goutte et dit « page actuelle » aux lecteurs d'écran, avec la même table des chemins que la barre
// d'onglets du téléphone (navigation/AppTabBar.tsx).
describe('the links of the top bar', () => {
  const navLink = (label: string) => screen.getByRole('link', { name: label })

  it('offers Fil, Explorer and Ruches, each with its address', async () => {
    await renderWithProviders(<TopNav />)

    expect(navLink(t(($) => $.nav.feed)).props.href).toBe('/feed')
    expect(navLink(t(($) => $.nav.explore)).props.href).toBe('/explore')
    expect(navLink(t(($) => $.nav.hives)).props.href).toBe('/hives')
  })

  it.each([
    ['/feed', 'feed'],
    ['/explore', 'explore'],
    ['/search', 'explore'],
    ['/tools', 'explore'],
    ['/tags/claude', 'explore'],
    ['/hives', 'hives'],
  ] as const)('on %s, marks « %s » as the current page, and only it', async (pathname, key) => {
    mockPathname = pathname
    await renderWithProviders(<TopNav />)

    const labels = {
      feed: t(($) => $.nav.feed),
      explore: t(($) => $.nav.explore),
      hives: t(($) => $.nav.hives),
    }
    expect(navLink(labels[key]).props['aria-current']).toBe('page')
    for (const other of (Object.keys(labels) as (keyof typeof labels)[]).filter((k) => k !== key)) {
      expect(navLink(labels[other]).props['aria-current']).not.toBe('page')
    }
  })

  it('marks no link on the home page (/, the showcase since R12)', async () => {
    mockPathname = '/'
    await renderWithProviders(<TopNav />)

    for (const label of [t(($) => $.nav.feed), t(($) => $.nav.explore), t(($) => $.nav.hives)]) {
      expect(navLink(label).props['aria-current']).not.toBe('page')
    }
  })

  it('marks no link on a page pushed over the tabs', async () => {
    mockPathname = '/projects/p1'
    await renderWithProviders(<TopNav />)

    for (const label of [t(($) => $.nav.feed), t(($) => $.nav.explore), t(($) => $.nav.hives)]) {
      expect(navLink(label).props['aria-current']).not.toBe('page')
    }
  })

  it('opens the page of the link touched', async () => {
    await renderWithProviders(<TopNav />)

    await fireEvent.press(navLink(t(($) => $.nav.explore)))

    expect(mockPush).toHaveBeenCalledWith('/explore')
  })

  it('is not there for a visitor', async () => {
    mockSession(null)
    await renderWithProviders(<TopNav />)

    expect(screen.queryByRole('link', { name: t(($) => $.nav.explore) })).toBeNull()
  })
})

// R13 (relecture du plan, décision 1, R4) : sur ordinateur, la capsule attend la réponse de la
// session (une requête partie après le démarrage de l'appli). Pendant ce temps, la barre garde sa
// place, vide : sinon le titre remonte puis redescend quand la capsule arrive. La place n'a rien à
// dire ni à toucher : cachée aux lecteurs d'écran.
describe('the top bar while the session loads', () => {
  type Node = {
    type: unknown
    props: Record<string, unknown>
    parent: Node | null
    children: (Node | string)[]
  }
  const everyNode = (node: Node): Node[] => {
    const all: Node[] = []
    const visit = (current: Node | string) => {
      if (typeof current === 'string') return
      all.push(current)
      for (const child of current.children) visit(child)
    }
    visit(node)
    return all
  }
  const hiddenFromReaders = (node: Node) =>
    node.props['aria-hidden'] === true ||
    node.props.accessibilityElementsHidden === true ||
    node.props.importantForAccessibility === 'no-hide-descendants'

  it('holds the capsule place, hidden from screen readers, while the session loads on a wide screen', async () => {
    mockSession(null, true)
    await renderWithProviders(<TopNav />)

    // La hauteur de la capsule : la place réservée de la barre, moins la marge du haut que la bande
    // (ScreenTopBar) ajoute elle-même au-dessus (zone sûre nulle dans Jest).
    const capsule = layout.topBarHeight.regular - space.lg
    const holders = everyNode(screen.root as unknown as Node).filter((node) => {
      const style = StyleSheet.flatten(node.props.style as never) as
        | Record<string, unknown>
        | undefined
      return style?.height === capsule || style?.minHeight === capsule
    })
    expect(holders).toHaveLength(1)
    const holder = holders[0] as Node
    expect(hiddenFromReaders(holder)).toBe(true)
    expect(holder.props.role ?? holder.props.accessibilityRole).toBeUndefined()
    // Rien à lire ni à toucher dedans.
    expect(screen.queryAllByRole('button', { includeHiddenElements: true })).toEqual([])
    expect(screen.queryAllByRole('link', { includeHiddenElements: true })).toEqual([])
    expect(everyNode(holder).some((node) => node.children.some((c) => typeof c === 'string'))).toBe(
      false,
    )
  })

  it('holds no place for a visitor once the session is known', async () => {
    // Témoin : la session répond « personne » ; la barre ne rend rien, plus de place gardée.
    mockSession(null, false)
    await renderWithProviders(<TopNav />)

    const capsule = layout.topBarHeight.regular - space.lg
    const holders = everyNode(screen.root as unknown as Node).filter((node) => {
      const style = StyleSheet.flatten(node.props.style as never) as
        | Record<string, unknown>
        | undefined
      return style?.height === capsule || style?.minHeight === capsule
    })
    expect(holders).toEqual([])
  })

  it('holds no place on a phone, where the capsule never shows', async () => {
    restoreWindow()
    restoreWindow = () => {}
    mockSession(null, true)
    await renderWithProviders(<TopNav />)

    expect(screen.queryAllByRole('button', { includeHiddenElements: true })).toEqual([])
    const capsule = layout.topBarHeight.regular - space.lg
    const holders = everyNode(screen.root as unknown as Node).filter((node) => {
      const style = StyleSheet.flatten(node.props.style as never) as
        | Record<string, unknown>
        | undefined
      return style?.height === capsule || style?.minHeight === capsule
    })
    expect(holders).toEqual([])
  })
})

// R3 (relecture de l'interface, ui-5 et ui-6) : hors de /search, le champ de la barre est un lien
// qui ouvre la recherche avec le focus (aucune lettre perdue au changement de page) ; sur /search,
// c'est le vrai champ. En largeur moyenne (700 à 1 100), le champ cède la place à un bouton loupe.
describe('the search of the top bar', () => {
  /** Une fenêtre de largeur moyenne (une tablette, une petite fenêtre). */
  const setMediumWindow = () => {
    const medium = { width: 900, height: 900, scale: 2, fontScale: 1 }
    Dimensions.set({ window: medium, screen: medium })
  }

  /**
   * Le nom du lien qui a l'air d'un champ : le nom du champ, puis le texte affiché (charte : le nom
   * lu contient le texte affiché ; un seul SearchLink, R3, relecture de l'interface C4).
   */
  const searchLinkName = `${t(($) => $.search.label)}, ${t(($) => $.search.placeholder)}`

  it('is a link to the search page when not on it', async () => {
    await renderWithProviders(<TopNav />)

    const field = screen.getByRole('link', { name: searchLinkName })
    expect(field.props.href).toBe('/search')
    await fireEvent.press(field)
    expect(mockPush).toHaveBeenCalledWith('/search')
  })

  it('is the real field on the search page', async () => {
    mockPathname = '/search'
    await renderWithProviders(<TopNav />)

    expect(screen.queryByRole('link', { name: searchLinkName })).toBeNull()
    // Le champ, nommé pour les lecteurs d'écran, reçoit ce qu'on tape.
    const field = screen.getByLabelText(t(($) => $.search.label))
    expect(typeof field.props.onChangeText).toBe('function')
  })

  // R11 : comme le champ de la page, la barre n'écrit l'adresse qu'à la pause de la frappe, pour que
  // l'historique et les journaux du serveur ne gardent pas chaque préfixe tapé.
  it('updates the address only once typing pauses', async () => {
    mockPathname = '/search'
    await renderWithProviders(<TopNav />)
    jest.useFakeTimers()
    try {
      const field = screen.getByLabelText(t(($) => $.search.label))
      await fireEvent.changeText(field, 'c')
      await fireEvent.changeText(field, 'ca')
      await fireEvent.changeText(field, 'car')
      await act(async () => {
        jest.advanceTimersByTime(249)
      })
      expect(mockSetParams).not.toHaveBeenCalled()

      await act(async () => {
        jest.advanceTimersByTime(1)
      })
      expect(mockSetParams).toHaveBeenCalledTimes(1)
      expect(mockSetParams).toHaveBeenCalledWith({ q: 'car' })
    } finally {
      jest.useRealTimers()
    }
  })

  it('leaves the real field to the page shown, not to a page kept mounted below it', async () => {
    mockPathname = '/search'
    mockFocused = false
    await renderWithProviders(<TopNav />)

    // Témoin : la barre est là (sa cloche).
    expect(screen.getByRole('button', { name: t(($) => $.notifications.bell) })).toBeTruthy()
    // Aucun champ qui pourrait prendre le clavier : la page cachée garde son lien.
    expect(screen.queryByLabelText(t(($) => $.search.label))).toBeNull()
    expect(screen.getByRole('link', { name: searchLinkName })).toBeTruthy()
  })

  it('becomes a magnifier button on a medium window, which opens the search page', async () => {
    setMediumWindow()
    await renderWithProviders(<TopNav />)

    // Témoin : la barre est là (sa cloche).
    expect(screen.getByRole('button', { name: t(($) => $.notifications.bell) })).toBeTruthy()
    expect(screen.queryByLabelText(t(($) => $.search.label))).toBeNull()
    await fireEvent.press(
      screen.queryByRole('link', { name: t(($) => $.nav.search) }) ??
        screen.getByRole('button', { name: t(($) => $.nav.search) }),
    )
    expect(mockPush).toHaveBeenCalledWith('/search')
  })

  it('shows the field, not the magnifier, on a wide window', async () => {
    await renderWithProviders(<TopNav />)

    expect(screen.queryByRole('button', { name: t(($) => $.nav.search) })).toBeNull()
    expect(screen.getByRole('link', { name: searchLinkName })).toBeTruthy()
  })
})

// R3 : « Modération » dans la barre d'un administrateur seulement (sur téléphone, la ligne reste
// dans les réglages).
describe('« Modération » in the top bar', () => {
  it('is offered to an administrator, and leads to the moderation page', async () => {
    jest.mocked(getMe).mockResolvedValue(adminMe)
    await renderWithProviders(<TopNav />)

    const link = await screen.findByRole('link', { name: t(($) => $.nav.moderation) })
    expect(link.props.href).toBe('/moderation')
    await fireEvent.press(link)
    expect(mockPush).toHaveBeenCalledWith('/moderation')
  })

  it('is not offered to an ordinary member', async () => {
    jest.mocked(getMe).mockResolvedValue(leaMe)
    await renderWithProviders(<TopNav />)

    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await act(async () => {})
    // Témoin : le profil est lu, la barre complète est là.
    expect(screen.getByRole('button', { name: t(($) => $.home.publish) })).toBeTruthy()
    expect(screen.queryByRole('link', { name: t(($) => $.nav.moderation) })).toBeNull()
  })
})
