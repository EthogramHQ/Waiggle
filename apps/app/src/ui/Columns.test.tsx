// Tests des rangées de Columns (R5a) : sur la page d'un projet, l'ordre de la page (lecteurs
// d'écran, touche Tab) suit l'ordre de lecture, rangée par rangée, et un trait sépare les rangées.
// Jest ne calcule aucune position : on vérifie l'ordre des éléments dans l'arbre, celui que suivent
// le lecteur d'écran et la touche Tab. Les places à l'écran se regardent dans les captures.
import { layout, space } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import { useContext } from 'react'
import {
  Dimensions,
  Platform,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { Button } from './Button'
import { Columns } from './Columns'
import { Screen } from './Screen'
import { type ScreenScroll, ScreenScrollContext } from './scrollLight'
import { Text } from './Text'
import { useContentWidth } from './theme/layout'

// R15 : les colonnes collées se testent dans un vrai Screen (sa barre du haut, sa zone qui défile).
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useIsFocused: () => true,
}))

const noop = () => {}

describe('Columns', () => {
  it('keeps the main column before the side column', async () => {
    await renderWithProviders(
      <Columns
        main={<Button label="Principale" onPress={noop} />}
        side={<Button label="Latérale" onPress={noop} />}
      />,
    )

    const names = screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)
    expect(names).toEqual(['Principale', 'Latérale'])
    // Une seule paire : aucun trait.
    expect(screen.queryByTestId('columns-divider')).toBeNull()
  })

  it('orders rows in reading order: row 1 left, row 1 right, row 2 left, row 2 right', async () => {
    await renderWithProviders(
      <Columns
        divided
        rows={[
          {
            main: <Button label="Galerie" onPress={noop} />,
            side: <Button label="Suivre" onPress={noop} />,
          },
          {
            main: <Button label="Copier le prompt" onPress={noop} />,
            side: <Button label="Envoyer" onPress={noop} />,
          },
        ]}
      />,
    )

    const names = screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)
    expect(names).toEqual(['Galerie', 'Suivre', 'Copier le prompt', 'Envoyer'])
  })

  it('draws one line between two rows, after the first row and before the second', async () => {
    await renderWithProviders(
      <Columns
        divided
        rows={[
          { main: <Text>Rangée 1 gauche</Text>, side: <Text>Rangée 1 droite</Text> },
          { main: <Text>Rangée 2 gauche</Text>, side: <Text>Rangée 2 droite</Text> },
        ]}
      />,
    )

    const divider = screen.getByTestId('columns-divider', { includeHiddenElements: true })
    // L'ordre de l'arbre : on aplatit le rendu en une suite de textes et de traits.
    const order: string[] = []
    type Node = { props: Record<string, unknown>; children: (Node | string)[] }
    const walk = (node: Node | string) => {
      if (typeof node === 'string') {
        order.push(node)
        return
      }
      if (node.props.testID === 'columns-divider') order.push('—')
      for (const child of node.children) walk(child)
    }
    walk(screen.root as unknown as Node)
    expect(order).toEqual([
      'Rangée 1 gauche',
      'Rangée 1 droite',
      '—',
      'Rangée 2 gauche',
      'Rangée 2 droite',
    ])
    // Le trait est un décor : caché aux lecteurs d'écran.
    expect(divider.props['aria-hidden']).toBe(true)
  })

  // Correction C3 de R5a : le pied de la page d'un projet (« Signaler ce projet ») est une rangée
  // qui prolonge la précédente, lue après elle, sans trait entre les deux.
  it('draws no line before a row that continues the previous one', async () => {
    await renderWithProviders(
      <Columns
        divided
        rows={[
          { main: <Text>Galerie</Text>, side: <Text>En-tête</Text> },
          { main: <Text>Description</Text>, side: <Text>Commentaires</Text> },
          { main: <Text>Signaler</Text>, side: null, continues: true },
        ]}
      />,
    )

    expect(screen.getByText('Signaler')).toBeTruthy()
    // Un seul trait : sous la première rangée.
    expect(screen.getAllByTestId('columns-divider', { includeHiddenElements: true })).toHaveLength(
      1,
    )
  })

  // Correction C3 de R5a (décision de Louis du 2/11/2026) : la page d'un projet élargit sa colonne
  // de droite (titre, actions, commentaires) jusqu'à `sideColumnWide`, sans passer en pile plus tôt.
  describe('with a wide side column', () => {
    type Node = { props: Record<string, unknown>; parent: Node | null }
    /** Le style de la colonne qui contient ce texte : le premier ancêtre qui a une base. */
    const columnOf = (text: string) => {
      let node: Node | null = screen.getByText(text) as unknown as Node
      while (node) {
        const style = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)
        if (style?.flexBasis !== undefined) return style
        node = node.parent
      }
      throw new Error(`no column around ${text}`)
    }

    it('lets the side column grow up to sideColumnWide, from the same base', async () => {
      await renderWithProviders(
        <Columns
          sideWidth="wide"
          rows={[{ main: <Text>Galerie</Text>, side: <Text>En-tête</Text> }]}
        />,
      )

      const side = columnOf('En-tête')
      const main = columnOf('Galerie')
      // La même base qu'avant : les colonnes ne passent pas en pile plus tôt.
      expect(side.flexBasis).toBe(layout.sideColumn)
      expect(side.maxWidth).toBe(layout.sideColumnWide)
      expect(layout.sideColumnWide).toBeGreaterThan(layout.sideColumn)
      // La place gagnée se partage : la colonne de droite grandit autant que la principale.
      expect(side.flexGrow).toBe(main.flexGrow)
    })

    it('keeps the narrow side column by default', async () => {
      await renderWithProviders(
        <Columns rows={[{ main: <Text>Galerie</Text>, side: <Text>En-tête</Text> }]} />,
      )

      expect(columnOf('En-tête').maxWidth).toBeUndefined()
      expect(columnOf('Galerie').flexGrow).toBeGreaterThan(columnOf('En-tête').flexGrow ?? 0)
    })
  })

  // R9 (la modération sur ordinateur, planche R9-Moderation-Desktop) : une troisième colonne,
  // `aside` (l'historique récent), à droite de la principale. API fixée au plan :
  // `{ side, main, aside, sideFirst }` ; trois colonnes seulement quand `useLayout().sizeClass`
  // vaut `wide` (1 100 points et plus), sinon comme aujourd'hui (deux colonnes, ou la pile).
  // L'écran choisit seul sa mise en page : sur téléphone, il ne passe pas `aside`.
  describe('with a third column, aside (R9)', () => {
    type Host = { type: unknown; props: Record<string, unknown>; parent: Host | null }
    type Tree = { props: Record<string, unknown>; children: (Tree | string)[] }
    const hasBasis = (node: Host | Tree) =>
      StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)?.flexBasis !== undefined
    /** La colonne qui contient ce texte : le premier ancêtre qui a une base. */
    const columnNode = (text: string): Host => {
      let node: Host | null = screen.getByText(text) as unknown as Host
      while (node) {
        if (hasBasis(node)) return node
        node = node.parent
      }
      throw new Error(`no column around ${text}`)
    }
    /** Les colonnes posées côte à côte dans la rangée de ce texte : les enfants qui ont une base. */
    const columnsBeside = (text: string) => {
      const row = columnNode(text).parent as unknown as Tree | null
      if (!row) throw new Error(`no row around ${text}`)
      return row.children.filter(
        (child): child is Tree => typeof child !== 'string' && hasBasis(child),
      )
    }
    /** Les textes dans l'ordre de l'arbre, celui du lecteur d'écran et de la touche Tab. */
    const readingOrder = () => {
      const order: string[] = []
      const walk = (node: Tree | string) => {
        if (typeof node === 'string') order.push(node)
        else for (const child of node.children) walk(child)
      }
      walk(screen.root as unknown as Tree)
      return order
    }

    let restoreWindow: (() => void) | null = null
    afterEach(() => {
      restoreWindow?.()
      restoreWindow = null
    })
    /** Une fenêtre de 900 points : une tablette, ou une petite fenêtre d'ordinateur (`medium`). */
    const setMediumWindow = () => {
      const medium = { width: 900, height: 900, scale: 2, fontScale: 1 }
      const phoneWindow = { width: 390, height: 844, scale: 3, fontScale: 1 }
      Dimensions.set({ window: medium, screen: medium })
      restoreWindow = () => Dimensions.set({ window: phoneWindow, screen: phoneWindow })
    }

    const threeColumns = (
      <Columns
        sideFirst
        side={<Text>La file</Text>}
        main={<Text>Le détail</Text>}
        aside={<Text>L’historique</Text>}
      />
    )

    it('sets three columns side by side on a wide screen: the queue, the detail, the history', async () => {
      restoreWindow = setDesktopWindow()
      await renderWithProviders(threeColumns)

      // Trois colonnes distinctes, dans la même rangée.
      expect(columnsBeside('Le détail')).toHaveLength(3)
      const columns = new Set(['La file', 'Le détail', 'L’historique'].map(columnNode))
      expect(columns.size).toBe(3)
      expect(columnNode('L’historique').parent).toBe(columnNode('Le détail').parent)
    })

    it('reads the queue, then the detail, then the history', async () => {
      restoreWindow = setDesktopWindow()
      await renderWithProviders(threeColumns)

      expect(readingOrder()).toEqual(['La file', 'Le détail', 'L’historique'])
    })

    it('keeps two columns below a wide screen, without losing the aside', async () => {
      setMediumWindow()
      await renderWithProviders(threeColumns)

      expect(columnsBeside('Le détail')).toHaveLength(2)
      // Rien n'est perdu : ce que l'écran a donné reste lu, après le détail.
      const order = readingOrder()
      expect(order).toContain('L’historique')
      expect(order.indexOf('L’historique')).toBeGreaterThan(order.indexOf('Le détail'))
    })

    it('keeps two columns on a phone too', async () => {
      await renderWithProviders(threeColumns)

      expect(screen.getByText('Le détail')).toBeTruthy() // témoin
      expect(columnsBeside('Le détail').length).toBeLessThanOrEqual(2)
    })

    it('adds no empty third column without an aside, even on a wide screen', async () => {
      restoreWindow = setDesktopWindow()
      await renderWithProviders(
        <Columns sideFirst side={<Text>La file</Text>} main={<Text>Le détail</Text>} />,
      )

      expect(columnsBeside('Le détail')).toHaveLength(2)
      expect(readingOrder()).toEqual(['La file', 'Le détail'])
    })

    it('still puts the side column first only with sideFirst', async () => {
      restoreWindow = setDesktopWindow()
      await renderWithProviders(
        <Columns
          side={<Text>La file</Text>}
          main={<Text>Le détail</Text>}
          aside={<Text>L’historique</Text>}
        />,
      )

      const order = readingOrder()
      expect(order.indexOf('Le détail')).toBeLessThan(order.indexOf('La file'))
      expect(order).toContain('L’historique')
    })
  })

  it('draws no line without `divided`, nor before the first row', async () => {
    await renderWithProviders(
      <Columns
        rows={[
          { main: <Text>Haut</Text>, side: <Text>Côté</Text> },
          { main: <Text>Bas</Text>, side: <Text>Fin</Text> },
        ]}
      />,
    )

    expect(screen.getByText('Bas')).toBeTruthy()
    expect(screen.queryByTestId('columns-divider', { includeHiddenElements: true })).toBeNull()
  })
})

// --- R15, « L'ordinateur en grand » ----------------------------------------------------------------
//
// Relecture du plan de R15 :
// - C4 : la colonne de côté a deux largeurs nouvelles, `sideWidth="panel"` (le panneau du Fil et
//   d'Explorer, `layout.sidePanel`) et `sideWidth="profile"` (la colonne du profil d'un membre,
//   `layout.profileColumn`) ; la principale prend le reste ;
// - C2 : `Columns` dit à chaque colonne sa largeur (`useContentWidth()`), lue par les grilles ;
// - B1, B2 : avec `sticky`, la colonne de côté reste en place au défilement (sur le web,
//   `position: 'sticky'`), collée sous la barre du haut quand elle est fixe (au décalage que la
//   barre couvre, `coveredTop` du canal de défilement de Screen), en haut quand la barre suit le
//   contenu ; et seulement si elle tient dans la fenêtre sous la barre : plus haute, elle défile avec
//   la page (sinon son bas ne se montrerait jamais, ni le focus du clavier qui y arrive).
//
// La colonne de côté mesure sa hauteur par un `onLayout` (sur elle, ou sur une vue vide qui
// l'épouse) ; le test l'appelle comme l'appareil le ferait.

type R15Node = {
  type: unknown
  props: Record<string, unknown>
  parent: R15Node | null
  children: (R15Node | string)[]
}

const r15Style = (node: R15Node): Record<string, unknown> =>
  (StyleSheet.flatten(node.props.style as never) as Record<string, unknown> | undefined) ?? {}

const r15Contains = (node: R15Node | string, text: string): boolean =>
  typeof node === 'string'
    ? node.includes(text)
    : node.children.some((child) => r15Contains(child, text))

/** La colonne qui porte `text` : son ancêtre dont le parent porte aussi l'autre colonne. */
const columnHolding = (text: string, other: string): R15Node => {
  let node = screen.getByText(text) as unknown as R15Node
  while (node.parent && !r15Contains(node.parent, other)) node = node.parent
  return node
}

/** La largeur fixe d'une colonne : `width`, ou une base qui ne grandit pas au-delà d'elle-même. */
const fixedWidthOf = (node: R15Node): number | undefined => {
  const style = r15Style(node)
  if (typeof style.width === 'number') return style.width
  const basis = style.flexBasis
  if (typeof basis !== 'number') return undefined
  const grows = typeof style.flexGrow === 'number' && style.flexGrow > 0
  return !grows || style.maxWidth === basis ? basis : undefined
}

/** Le premier cadre collé (`position: 'sticky'`) autour de ce texte, ou null. */
const stickyAround = (text: string): R15Node | null => {
  for (let node: R15Node | null = screen.getByText(text) as unknown as R15Node; node; ) {
    if (node.type === 'RCTScrollView') return null
    if (r15Style(node).position === 'sticky') return node
    node = node.parent
  }
  return null
}

/** Le premier élément qui mesure, d'un nœud vers le bas jusqu'au texte : lui, ou une vue vide sœur. */
const measurerBelow = (top: R15Node, text: string): ((event: unknown) => void) => {
  const path: R15Node[] = []
  for (let node: R15Node | null = screen.getByText(text) as unknown as R15Node; node; ) {
    path.unshift(node)
    if (node === top) break
    node = node.parent
  }
  for (const node of path) {
    if (typeof node.props.onLayout === 'function') return node.props.onLayout as never
    const probe = node.children.find(
      (child): child is R15Node =>
        typeof child !== 'string' &&
        child.children.length === 0 &&
        typeof child.props.onLayout === 'function',
    )
    if (probe) return probe.props.onLayout as never
  }
  throw new Error(`Nothing measures the column of ${text}`)
}

const layoutEvent = (width: number, height: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width, height } },
  persist: () => {},
})

const BAR = 'Barre du haut'
const MAIN = 'Le fil'
const SIDE = 'Le panneau'

/** La barre du haut mesure `height` points (son premier cadre qui mesure, hors de la zone qui défile). */
const measureBar = async (height: number) => {
  let path = (screen.getByText(BAR) as unknown as R15Node).parent as R15Node
  for (let node = path.parent; node; path = node, node = node.parent) {
    if (r15Contains(node, MAIN)) break
    const own = node.props.onLayout
    const probe = node.children.find(
      (child): child is R15Node =>
        typeof child !== 'string' &&
        child !== path &&
        child.children.length === 0 &&
        typeof child.props.onLayout === 'function',
    )
    const handler = typeof own === 'function' ? own : probe?.props.onLayout
    if (typeof handler === 'function') {
      await act(async () => (handler as (event: unknown) => void)(layoutEvent(1440, height)))
      return
    }
  }
  throw new Error('Nothing measures the top bar')
}

/** La colonne de côté mesure `height` points. */
const measureSide = async (height: number) => {
  const measurer = measurerBelow(columnHolding(SIDE, MAIN), SIDE)
  await act(async () => measurer(layoutEvent(layout.sidePanel, height)))
}

/** Le canal de défilement de l'écran, noté par une sonde posée dans son contenu. */
let channel: ScreenScroll | null = null
function ChannelProbe() {
  channel = useContext(ScreenScrollContext)
  return null
}

/** Le Fil d'un ordinateur : la colonne principale et le panneau collé, sous une barre du haut. */
const stickyPage = (
  <Screen
    width="wide"
    title="Fil"
    header={
      <View>
        <Text>{BAR}</Text>
      </View>
    }
  >
    <ChannelProbe />
    <Columns sideWidth="panel" sticky main={<Text>{MAIN}</Text>} side={<Text>{SIDE}</Text>} />
  </Screen>
)

const r15Phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
const setR15Window = (width: number, height: number) => {
  const size = { width, height, scale: 2, fontScale: 1 }
  Dimensions.set({ window: size, screen: size })
}

describe('Columns in the wide layout (R15)', () => {
  beforeEach(() => {
    channel = null
  })
  afterEach(async () => {
    await act(async () => Dimensions.set({ window: r15Phone, screen: r15Phone }))
    jest.restoreAllMocks()
  })

  it('Columns gives the side column the panel width and the profile width', async () => {
    setR15Window(1920, 1080)
    await renderWithProviders(
      <>
        <Columns sideWidth="panel" main={<Text>Les cartes</Text>} side={<Text>Panneau</Text>} />
        <Columns
          sideWidth="profile"
          sideFirst
          main={<Text>La mosaïque</Text>}
          side={<Text>Profil</Text>}
        />
      </>,
    )

    expect(fixedWidthOf(columnHolding('Panneau', 'Les cartes'))).toBe(layout.sidePanel)
    expect(fixedWidthOf(columnHolding('Profil', 'La mosaïque'))).toBe(layout.profileColumn)
    // La principale prend toute la place qui reste.
    expect(Number(r15Style(columnHolding('Les cartes', 'Panneau')).flexGrow ?? 0)).toBeGreaterThan(
      0,
    )
  })

  it('tells the main column the width left beside the panel, and the panel its own', async () => {
    setR15Window(1920, 1080)
    function Probe({ name }: { name: string }) {
      return <Text>{`${name} ${useContentWidth()}`}</Text>
    }
    await renderWithProviders(
      <Screen width="wide" title="Fil">
        <Columns
          sideWidth="panel"
          main={<Probe name="Principale" />}
          side={<Probe name="Panneau" />}
        />
      </Screen>,
    )

    // 1 728 points de contenu à 1 920, moins le panneau et l'écart entre les colonnes.
    expect(screen.getByText(`Principale ${1728 - layout.sidePanel - space.xxl}`)).toBeTruthy()
    expect(screen.getByText(`Panneau ${layout.sidePanel}`)).toBeTruthy()
  })

  it('tells the main column the whole width once the panel goes below it', async () => {
    function Probe({ name }: { name: string }) {
      return <Text>{`${name} ${useContentWidth()}`}</Text>
    }
    await renderWithProviders(
      <Screen width="wide" title="Fil">
        <Columns
          sideWidth="panel"
          main={<Probe name="Principale" />}
          side={<Probe name="Panneau" />}
        />
      </Screen>,
    )

    // Le téléphone de Jest (390) : les colonnes l'une sous l'autre, chacune sur toute la largeur.
    const whole = 390 - 2 * layout.screenPadding.compact
    expect(screen.getByText(`Principale ${whole}`)).toBeTruthy()
  })

  it('Columns sticks the side column below the pinned top bar', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    setR15Window(1440, 900)
    await renderWithProviders(stickyPage)

    // La colonne tient dans la fenêtre ; puis la barre est mesurée, fixe (moins d'un quart de la
    // hauteur) : la colonne se colle dessous, sans attendre une autre mesure.
    await measureSide(400)
    await measureBar(64)

    const covered = channel?.coveredTop.current ?? 0
    expect(covered).toBeGreaterThan(0) // témoin : la barre est fixe et couvre le haut
    const sticky = stickyAround(SIDE)
    expect(sticky).not.toBeNull()
    // Relecture de design de R15 (17/11/2026) : avec l'air du contenu sous la barre, `space.xl`.
    expect(sticky ? r15Style(sticky).top : undefined).toBe(covered + space.xl)
  })

  it('Columns sticks the side column at the top when the bar follows the content', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    setR15Window(1440, 900)
    await renderWithProviders(stickyPage)

    // Une barre de 300 points dépasse le quart de la fenêtre : elle suit le contenu, ne couvre rien.
    await measureSide(400)
    await measureBar(300)

    expect(channel?.coveredTop.current).toBe(0) // témoin : la barre n'est pas fixe
    const sticky = stickyAround(SIDE)
    expect(sticky).not.toBeNull()
    // Relecture de design de R15 (17/11/2026) : le même air, sous le haut de la fenêtre.
    expect(sticky ? r15Style(sticky).top : undefined).toBe(space.xl)
  })

  // Une colonne à peine plus haute que la place sous la barre fixe (mais plus basse que la fenêtre)
  // se colle elle aussi par le bas (relecture de design de R15, 17/11/2026) : avant, elle restait
  // dans le flux et défilait avec la page.
  it('sticks by its bottom a side column just taller than the room below the bar', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    setR15Window(1440, 900)
    await renderWithProviders(stickyPage)

    await measureBar(64)
    await measureSide(880)

    const sticky = stickyAround(SIDE)
    expect(sticky).not.toBeNull()
    expect(sticky ? r15Style(sticky).top : undefined).toBe(900 - 880 - space.xl)
  })

  // Relecture de design de R15 (17/11/2026) : une colonne plus haute que la fenêtre se colle par
  // le bas. Son haut collé devient négatif (la hauteur de la fenêtre, moins la sienne, moins l'air
  // gardé sous son pied) : elle défile avec la page jusqu'à ce que son bas apparaisse, puis reste
  // en place. Tant qu'elle n'est pas mesurée, elle reste dans le flux, comme avant.
  it('Columns sticks a side column taller than the window by its bottom, once measured', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    setR15Window(1440, 900)
    await renderWithProviders(stickyPage)

    await measureBar(64)
    expect(stickyAround(SIDE)).toBeNull() // pas encore mesurée : dans le flux

    await measureSide(2000)
    const sticky = stickyAround(SIDE)
    expect(sticky).not.toBeNull()
    expect(sticky ? r15Style(sticky).top : undefined).toBe(900 - 2000 - space.xl)
  })

  it('does not stick the side column on a phone, where it goes below the main column', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(stickyPage)

    expect(screen.getByText(SIDE)).toBeTruthy() // témoin
    expect(stickyAround(SIDE)).toBeNull()
  })

  it('does not stick the side column without sticky', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    setR15Window(1440, 900)
    await renderWithProviders(
      <Screen width="wide" title="Fil">
        <Columns sideWidth="panel" main={<Text>{MAIN}</Text>} side={<Text>{SIDE}</Text>} />
      </Screen>,
    )

    expect(screen.getByText(SIDE)).toBeTruthy() // témoin
    expect(stickyAround(SIDE)).toBeNull()
  })
})
