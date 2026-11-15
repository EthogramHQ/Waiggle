// Tests du sélecteur de ruches du Fil (tranche R10, F-Fil13 ; relecture du plan, interface 11) :
// une rangée de pastilles « Tout · Famille · Amis du jeudi… » au-dessus du Fil. Ce sont des onglets
// (bâtis sur `ui/Tabs`, verre et goutte) : une liste d'onglets nommée « Ruches du fil », chaque
// pastille un onglet dont on lit s'il est choisi, et qui dit quel panneau il commande (le Fil, porté
// par l'écran : `panelId`). Le composant ne dessine aucun panneau. Au clavier (web) : un seul arrêt
// de Tab, les flèches passent à la ruche voisine. La rangée défile de côté et amène la pastille
// choisie entièrement en vue. `ui/FilterPills` (R6b) n'est pas touché : ses 11 tests restent.
//
// L'API (plan R10, « API au contrat ») :
//   HivePills({ hives: { id: string; name: string | null }[]; value: string;
//     onChange: (value: string) => void; panelId: string }) ; `value` vaut 'all' pour « Tout ».
import { layout } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform, ScrollView, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { HivePills } from './HivePills'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

afterEach(() => {
  jest.restoreAllMocks()
})

// --- Les données ---------------------------------------------------------------------------------

const LABEL = fr.t(($) => $.hives.pills.label)
const ALL = fr.t(($) => $.hives.pills.all)
const UNNAMED = fr.t(($) => $.hives.unnamed)
const PANEL = 'feed-panel'

const FAMILY = { id: '0f5b8a64-2c1e-4c55-9d1a-6b7e4a3c2d10', name: 'Famille' }
const THURSDAY = { id: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', name: 'Amis du jeudi' }
const two = [FAMILY, THURSDAY]

/** Huit ruches : plus qu'une rangée de téléphone n'en montre (la dernière déborde à droite). */
const eight = [
  FAMILY,
  THURSDAY,
  { id: '11111111-1111-4111-8111-111111111111', name: 'Atelier IA' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Voisins' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Club photo' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Cousins' },
  { id: '55555555-5555-4555-8555-555555555555', name: 'Bureau' },
  { id: '66666666-6666-4666-8666-666666666666', name: 'Randonnée' },
]

/** La rangée, avec son choix gardé comme dans le Fil ; `onChange` voit chaque valeur. */
function Pills({
  hives = two,
  start = 'all',
  onChange,
}: {
  hives?: { id: string; name: string | null }[]
  start?: string
  onChange?: (value: string) => void
}) {
  const [value, setValue] = useState(start)
  return (
    <HivePills
      hives={hives}
      value={value}
      panelId={PANEL}
      onChange={(next) => {
        onChange?.(next)
        setValue(next)
      }}
    />
  )
}

// --- Les outils ----------------------------------------------------------------------------------

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

/** Tous les éléments sous `node`, lui compris, dans l'ordre de l'arbre. */
const inside = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : inside(child))),
]

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

/** Le tabIndex de chaque onglet, dans l'ordre (des valeurs simples : voir code-appli.md). */
const tabIndexes = () =>
  screen.getAllByRole('tab').map((tab) => tab.props.tabIndex as number | undefined)

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const key = (name: string) => ({ key: name, repeat: false, preventDefault: () => {} })

/** La zone qu'on peut toucher, en hauteur (taille minimale ou fixe, débord). */
const touchHeight = (node: ReturnType<typeof screen.getByRole>) => {
  const style = StyleSheet.flatten(node.props.style) as Record<string, unknown>
  const size = Math.max(
    typeof style?.minHeight === 'number' ? style.minHeight : 0,
    typeof style?.height === 'number' ? style.height : 0,
  )
  const slop: unknown = node.props.hitSlop
  const extra =
    typeof slop === 'number'
      ? 2 * slop
      : slop && typeof slop === 'object'
        ? Number((slop as Record<string, number>).top ?? 0) +
          Number((slop as Record<string, number>).bottom ?? 0)
        : 0
  return size + extra
}

/**
 * `scrollTo` du faux ScrollView de React Native : une fonction simulée partagée par toutes les
 * bandes (sur le prototype, comme Carousel.test.tsx). Remise à zéro avant chaque test.
 */
const scrollTo = () =>
  (ScrollView.prototype as unknown as { scrollTo: jest.Mock }).scrollTo as jest.Mock

/** La position demandée à `scrollTo`, qu'elle soit donnée en objet (`{ x }`) ou en nombres. */
const xOf = (call: unknown[]): number | undefined => {
  const [first, second] = call
  if (typeof first === 'object' && first !== null) return (first as { x?: number }).x
  // L'ancienne forme scrollTo(y, x) de React Native.
  return typeof second === 'number' ? second : undefined
}

/** La largeur de la rangée visible (un téléphone), et celle de chaque pastille. */
const VIEWPORT = 320
const PILL = 100

/**
 * Donne une mesure à chaque vue qui en attend une (`onLayout`), comme le ferait l'appareil : la
 * bande défilante fait 320 points de large ; une vue qui porte une seule pastille est cette
 * pastille, posée à sa place (100 points chacune, bord à bord) ; une vue qui en porte plusieurs est
 * la rangée entière. Le composant mesure par `onLayout` (Jest ne dessine rien).
 */
const layOut = async () => {
  const tabs = screen.getAllByRole('tab') as unknown as Node[]
  for (const node of inside(screen.root as unknown as Node)) {
    const onLayout = node.props.onLayout
    if (typeof onLayout !== 'function') continue
    const held = inside(node).filter((one) => tabs.includes(one))
    let layout: { x: number; y: number; width: number; height: number } | null = null
    if (node.type === 'RCTScrollView' && node.props.horizontal === true)
      layout = { x: 0, y: 0, width: VIEWPORT, height: 52 }
    else if (held.length === 1 && held[0])
      layout = { x: tabs.indexOf(held[0]) * PILL, y: 0, width: PILL, height: 44 }
    else if (held.length > 1) layout = { x: 0, y: 0, width: tabs.length * PILL, height: 44 }
    if (layout) await act(() => onLayout({ nativeEvent: { layout } }))
  }
}

// --- Les tests -----------------------------------------------------------------------------------

describe('HivePills', () => {
  beforeEach(() => scrollTo().mockClear())

  it('marks the chosen hive tab as selected in a named tab list', async () => {
    expect(LABEL).toBe('Ruches du fil') // témoin des traductions
    await renderWithProviders(<Pills start={FAMILY.id} />)

    // La liste n'est pas « accessible » au sens de React Native (ses onglets le sont) : on la trouve
    // par son nom, puis on lit son rôle.
    expect(roleOf(screen.getByLabelText(LABEL).props)).toBe('tablist')
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('tab', { name: 'Famille', selected: true })).toBeTruthy()
    expect(screen.getByRole('tab', { name: ALL, selected: false })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Amis du jeudi', selected: false })).toBeTruthy()
    expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1)
  })

  it('puts « Tout » first, chosen for the value all', async () => {
    expect(ALL).toBe('Tout')
    await renderWithProviders(<Pills />)

    const names = screen
      .getAllByRole('tab')
      .map((tab) => tab.props.accessibilityLabel ?? tab.props['aria-label'])
    expect(names).toEqual([ALL, 'Famille', 'Amis du jeudi'])
    expect(screen.getByRole('tab', { name: ALL, selected: true })).toBeTruthy()
  })

  it('gives the id of the hive touched, and « all » for « Tout »', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Pills onChange={onChange} />)

    await fireEvent.press(screen.getByRole('tab', { name: 'Amis du jeudi' }))
    expect(onChange).toHaveBeenLastCalledWith(THURSDAY.id)
    expect(screen.getByRole('tab', { name: 'Amis du jeudi', selected: true })).toBeTruthy()

    await fireEvent.press(screen.getByRole('tab', { name: ALL }))
    expect(onChange).toHaveBeenLastCalledWith('all')
  })

  it('reads « Ruche sans nom » for a hive whose name was removed', async () => {
    await renderWithProviders(<Pills hives={[FAMILY, { id: THURSDAY.id, name: null }]} />)

    expect(screen.getByRole('tab', { name: UNNAMED })).toBeTruthy()
  })

  it('points every tab to the feed panel given by the screen, and draws no panel itself', async () => {
    await renderWithProviders(<Pills />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3) // témoin
    for (const tab of tabs) expect(tab.props['aria-controls']).toBe(PANEL)
    // Le panneau, c'est le Fil de l'écran : aucun `tabpanel` ici.
    const panels = inside(screen.root as unknown as Node).filter(
      (node) => typeof node.type === 'string' && roleOf(node.props) === 'tabpanel',
    )
    expect(panels).toEqual([])
  })

  it('keeps every pill at least 44 points high', async () => {
    await renderWithProviders(<Pills />)

    for (const tab of screen.getAllByRole('tab')) {
      expect(touchHeight(tab)).toBeGreaterThanOrEqual(layout.touchTarget)
    }
  })

  it('scrolls sideways in one row', async () => {
    await renderWithProviders(<Pills hives={eight} />)

    const band = inside(screen.root as unknown as Node).find(
      (node) => node.type === 'RCTScrollView' && node.props.horizontal === true,
    )
    expect(band).toBeDefined()
    // Les neuf pastilles sont dans la bande.
    const tabs = screen.getAllByRole('tab') as unknown as Node[]
    expect(tabs).toHaveLength(9)
    if (band) expect(inside(band).filter((node) => tabs.includes(node))).toHaveLength(9)
  })

  it('brings the chosen pill fully into view', async () => {
    const view = await renderWithProviders(
      <HivePills hives={eight} value="all" panelId={PANEL} onChange={() => {}} />,
    )
    await layOut()
    scrollTo().mockClear()

    // La pastille de l'adresse arrive après l'hydratation : « Randonnée », la neuvième, de 800 à
    // 900 points, hors de la bande de 320 points.
    await view.rerender(
      <HivePills hives={eight} value={eight[7]?.id ?? ''} panelId={PANEL} onChange={() => {}} />,
    )
    await layOut()

    const asked = scrollTo()
      .mock.calls.map(xOf)
      .filter((x) => x !== undefined)
    expect(asked.length).toBeGreaterThan(0)
    const x = asked.at(-1) ?? 0
    // Vue de x à x + 320 : la pastille (800 à 900) y tient entière.
    expect(x).toBeLessThanOrEqual(8 * PILL)
    expect(x + VIEWPORT).toBeGreaterThanOrEqual(9 * PILL)
  })

  describe('on the web, with the keyboard', () => {
    beforeEach(() => jest.replaceProperty(Platform, 'OS', 'web'))

    it('keeps one Tab stop and moves to the next hive with the arrows', async () => {
      const onChange = jest.fn()
      await renderWithProviders(<Pills onChange={onChange} />)

      // « Tout » choisi : le seul arrêt de Tab.
      expect(tabIndexes()).toEqual([0, -1, -1])

      await fireEvent(screen.getByRole('tab', { name: ALL }), 'keyDown', key('ArrowRight'))
      expect(onChange).toHaveBeenLastCalledWith(FAMILY.id)
      expect(screen.getByRole('tab', { name: 'Famille', selected: true })).toBeTruthy()
      expect(tabIndexes()).toEqual([-1, 0, -1])

      await fireEvent(screen.getByRole('tab', { name: 'Famille' }), 'keyDown', key('ArrowRight'))
      expect(onChange).toHaveBeenLastCalledWith(THURSDAY.id)
      expect(tabIndexes()).toEqual([-1, -1, 0])

      await fireEvent(
        screen.getByRole('tab', { name: 'Amis du jeudi' }),
        'keyDown',
        key('ArrowLeft'),
      )
      expect(onChange).toHaveBeenLastCalledWith(FAMILY.id)
      expect(screen.getByRole('tab', { name: 'Famille', selected: true })).toBeTruthy()
    })
  })
})
