// Tests de la place que Screen réserve à la barre du haut avant qu'elle soit mesurée (tranche R13,
// « Le premier chargement » : « le titre est lisible en entier : la barre du haut a déjà sa place et
// ne recouvre rien » ; relecture du plan, décision 1).
//
// Dans la page pré-rendue, aucun script ne mesure la barre : sans réserve, le contenu commençait en
// haut, sous la barre, jusqu'au démarrage de l'appli (7 s sur un téléphone modeste, mesure du
// 17/11/2026). Screen réserve donc dès son premier rendu la hauteur du jeton
// `layout.topBarHeight` (`compact` sur téléphone et avant l'hydratation, `regular` au-delà), plus
// l'écart habituel entre la barre et le titre (`space.xl`) :
// - seulement pour une barre qui la déclare (`VisitorBar`, la barre des pages publiques) ;
// - jamais pour un en-tête qui ne rend rien (`TopNav` d'un visiteur, sur les Règles) ;
// - la mesure garde le dernier mot, sans déplacer le titre quand elle vaut la réserve.
//
// Le pré-rendu se dessine en largeur de téléphone (`useLayout`, avant l'hydratation) : la fenêtre de
// téléphone de Jest en est l'équivalent. Jest ne calcule aucune position : on appelle les `onLayout`
// comme l'appareil le ferait, et on lit la place réservée en haut de la zone qui défile.
import { layout, space } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import { TopNav } from '../navigation/TopNav'
import { useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { Screen } from './Screen'
import { forgetTopBarSpace } from './ScreenTopBar'
import { VisitorBar } from './VisitorBar'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/fr/rules',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useIsFocused: () => true,
}))

// Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'expose pas le type complet).
type Node = {
  type: unknown
  props: Record<string, unknown>
  parent: Node | null
  children: (Node | string)[]
}

const styleOf = (node: Node): Record<string, unknown> =>
  (StyleSheet.flatten(node.props.style as never) as Record<string, unknown> | undefined) ?? {}

/** Tous les nœuds sous `node`, lui compris, dans l'ordre de lecture (profondeur d'abord). */
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

const isInside = (node: Node, ancestor: Node): boolean => {
  for (let current: Node | null = node; current; current = current.parent) {
    if (current === ancestor) return true
  }
  return false
}

/** La zone qui défile de l'écran (l'élément natif RCTScrollView). */
const scroller = (): Node => {
  const found = everyNode(screen.root as unknown as Node).find(
    (node) => node.type === 'RCTScrollView',
  )
  if (!found) throw new Error('No scrolling page')
  return found
}

/** La place réservée en haut du contenu qui défile. */
const reservedTop = (): number => {
  const style = StyleSheet.flatten(scroller().props.contentContainerStyle as never) as
    | Record<string, unknown>
    | undefined
  const value = style?.paddingTop ?? style?.paddingVertical ?? style?.padding
  return typeof value === 'number' ? value : 0
}

/**
 * La barre du haut prend une hauteur, comme l'appareil la mesurerait : la vue vide de mesure de
 * ScreenTopBar (`StyleSheet.absoluteFill`, avec `onLayout`), la première hors de la zone qui défile.
 * Elle existe même quand l'en-tête ne rend rien : la bande garde sa marge du haut.
 */
const measureBar = async (height: number) => {
  const scroll = scroller()
  const probe = everyNode(screen.root as unknown as Node).find(
    (node) =>
      !isInside(node, scroll) &&
      node.children.length === 0 &&
      typeof node.props.onLayout === 'function' &&
      styleOf(node).position === 'absolute',
  )
  if (!probe) throw new Error('Nothing measures the top bar')
  const onLayout = probe.props.onLayout as (event: unknown) => void
  const event = { nativeEvent: { layout: { x: 0, y: 0, width: 390, height } }, persist: () => {} }
  await act(async () => onLayout(event))
}

const TITLE = 'Les règles'

const visitorPage = () => (
  <Screen title={TITLE} header={<VisitorBar homeHref="/fr/" next="/fr/rules" />}>
    {null}
  </Screen>
)

const page = (header: ReactNode) => (
  <Screen title={TITLE} header={header}>
    {null}
  </Screen>
)

let restoreWindow = () => {}

beforeEach(() => {
  // La place mesurée d'une page précédente (même largeur) servirait de réserve : chaque test part
  // d'un premier chargement, sans aucune mesure.
  forgetTopBarSpace()
  mockSession(null)
  jest.mocked(useUnreadCount).mockReturnValue(0)
  jest.mocked(getMe).mockReturnValue(new Promise(() => {}))
})

afterEach(() => {
  restoreWindow()
  restoreWindow = () => {}
})

describe('Screen, the room of the top bar before it is measured', () => {
  it('reserves the visitor bar above the title before anything is measured', async () => {
    await renderWithProviders(visitorPage())

    expect(screen.getByText(TITLE)).toBeTruthy() // témoin : la page est dessinée
    expect(reservedTop()).toBe(layout.topBarHeight.compact + space.xl)
  })

  it('reserves the computer visitor bar on a wide window before it is measured', async () => {
    restoreWindow = setDesktopWindow()
    await renderWithProviders(visitorPage())

    expect(reservedTop()).toBe(layout.topBarHeight.regular + space.xl)
  })

  it('reserves no bar when the header renders nothing, before and after the measure', async () => {
    // Les Règles d'un visiteur sur ordinateur : `TopNav` sans session (et sans attente) ne rend rien.
    restoreWindow = setDesktopWindow()
    await renderWithProviders(page(<TopNav />))
    // La marge du haut seule, puis l'écart habituel (zone sûre nulle dans Jest).
    const empty = space.lg + space.xl
    expect(reservedTop()).toBe(empty)

    // La bande vide mesure sa seule marge du haut : rien ne bouge.
    await measureBar(space.lg)

    expect(reservedTop()).toBe(empty)
  })

  it('lets the measure replace the reserve without moving the title when they match', async () => {
    await renderWithProviders(visitorPage())
    const reserve = reservedTop()
    expect(reserve).toBe(layout.topBarHeight.compact + space.xl)

    // La barre mesure ce que dit le jeton : le titre ne bouge pas.
    await measureBar(layout.topBarHeight.compact)
    expect(reservedTop()).toBe(reserve)

    // Une autre mesure (texte agrandi) : elle l'emporte sur la réserve.
    await measureBar(layout.topBarHeight.compact + 24)
    expect(reservedTop()).toBe(layout.topBarHeight.compact + 24 + space.xl)
  })
})
