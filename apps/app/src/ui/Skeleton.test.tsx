// Tests des squelettes (refonte, tranche R1 ; réécrits pour R16, « Les squelettes ») : des formes
// pleines à la place d'un contenu en cours de chargement. Pour un lecteur d'écran, les formes ne
// disent rien : l'ensemble est nommé « Chargement… » (common.loading) et marqué occupé (aria-busy sur
// le web), une seule fois, même pour une grille de plusieurs cartes (`Loading`, le seul
// `progressbar` d'une zone ; plan R16, choix 4).
//
// R16 (scénario, « Quand on le voit » ; plan, choix 6 et 8) :
// - dans l'appli, `Loading` pose sa place tout de suite, mais reste invisible et caché aux lecteurs
//   d'écran pendant 160 ms (`durations.quick`) : une page qui arrive plus vite ne montre aucun
//   squelette ;
// - le squelette pré-rendu (la page web avant l'hydratation) se montre tout de suite, et reste à
//   l'écran quand la page s'hydrate ; « montré tout de suite » se décide au montage ;
// - la respiration de tout le bloc s'en va ; une lueur miel (`SkeletonGlow`) traverse les cartes
//   vides. Sur le web, une animation CSS (images clés en `transform` seul, retard de 150 ms par
//   colonne), arrêtée par la feuille de la page sous « Réduire les animations » (document.ts) : son
//   premier rendu ne dépend donc pas de `useCalmMotion`. Sur téléphone, Reanimated, immobile sous
//   `useCalmMotion`.
//
// L'opacité vue d'un élément se lit en multipliant celles de ses ancêtres, style animé de
// Reanimated compris (comme dans ScreenFade.test.tsx) ; Reanimated avance avec la fausse horloge.
import { durations } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import { getAnimatedStyle, withRepeat } from 'react-native-reanimated'
import { glowAttributesIn, parseCss, underMedia } from '../testing/css'
import { emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { PROJECT_CARD_HEIGHT, ProjectCard, ProjectCardSkeleton } from './ProjectCard'
import { Loading, Shape, SkeletonCard, SkeletonGlow, SkeletonList } from './Skeleton'
import { documentCss } from './theme/document'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// « Réduire les animations » : le préfixe `mock` permet à Jest de lire cette variable dans le
// remplacement du module.
let mockCalm = false
jest.mock('./theme/motion', () => ({
  ...jest.requireActual('./theme/motion'),
  useCalmMotion: () => mockCalm,
}))

// La page est-elle hydratée ? Sur téléphone, toujours ; sur le web, pas avant que l'appli démarre.
let mockHydrated = true
jest.mock('./theme/hydration', () => ({
  ...jest.requireActual('./theme/hydration'),
  useHydrated: () => mockHydrated,
}))

// Reanimated tel quel, sauf la mise en boucle d'une animation (withRepeat), qu'on observe.
// __esModule et default : sans eux, `import Animated from …` ne retrouverait pas Animated.View.
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    withRepeat: jest.fn(actual.withRepeat),
  }
})

const repeat = jest.mocked(withRepeat)
const loading = fr.t(($) => $.common.loading)

/** Le délai avant que le squelette se montre (plan R16, choix 8). */
const APPEAR_MS = durations.quick

type Node = { parent: Node | null; props: Record<string, unknown>; children: (Node | string)[] }

/** Occupé, de la façon que comprend chaque plateforme : aria-busy (web) ou l'état « busy ». */
const busy = (element: unknown): boolean => {
  const { props } = element as Node
  return (
    props['aria-busy'] === true ||
    (props.accessibilityState as { busy?: boolean } | undefined)?.busy === true
  )
}

/** L'opacité propre d'un nœud : son style animé (Reanimated) s'il en a un, sinon son style. */
const ownOpacity = (node: Node): number => {
  const fixed = StyleSheet.flatten(node.props.style as never) as { opacity?: number } | undefined
  const animated = node.props.jestAnimatedStyle
    ? (getAnimatedStyle(node as never) as { opacity?: number }).opacity
    : undefined
  return Number(animated ?? fixed?.opacity ?? 1)
}

/** L'opacité vue d'un élément : le produit de la sienne et de celles de tous ses ancêtres. */
const seenOpacity = (element: unknown): number => {
  let opacity = 1
  for (let node = element as Node | null; node; node = node.parent) opacity *= ownOpacity(node)
  return opacity
}

/** Le `progressbar` du squelette, lu ou non par un lecteur d'écran. */
const anyProgressbar = () => screen.getByRole('progressbar', { includeHiddenElements: true })

/** Les hauteurs posées sur les formes dessinées, en points, éléments cachés compris. */
const heights = () => {
  const found: number[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    const { height } = (StyleSheet.flatten(node.props.style as never) ?? {}) as { height?: unknown }
    if (typeof height === 'number') found.push(height)
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  return found
}

/** Avance la fausse horloge (les minuteurs et les images de Reanimated). */
const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

/** Affiche le squelette, puis attend qu'il se montre (après les 160 ms d'attente). */
const show = async (...args: Parameters<typeof renderWithProviders>) => {
  const view = await renderWithProviders(...args)
  await wait(APPEAR_MS + 40)
  return view
}

beforeEach(() => {
  jest.useFakeTimers()
  mockCalm = false
  mockHydrated = true
  repeat.mockClear()
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('SkeletonCard', () => {
  it('is named « Loading » and marked busy', async () => {
    await show(<SkeletonCard />)

    expect(busy(screen.getByRole('progressbar', { name: loading }))).toBe(true)
  })

  it('is marked busy on the web with aria-busy', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await show(<SkeletonCard />)

    expect(screen.getByRole('progressbar', { name: loading })).toHaveProp('aria-busy', true)
  })

  it('speaks the language of the app', async () => {
    await show(<SkeletonCard />, 'en')

    expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeTruthy()
  })

  it('has no text of its own to read', async () => {
    // Que des formes : aucun faux titre ni « Lorem ipsum » à lire.
    await show(<SkeletonCard />)

    expect(screen.getByRole('progressbar', { name: loading })).toBeTruthy() // témoin
    expect(screen.queryByText(/./, { includeHiddenElements: true })).toBeNull()
  })

  it('stays named and busy with reduced motion', async () => {
    mockCalm = true
    await show(<SkeletonCard />)

    expect(busy(screen.getByRole('progressbar', { name: loading }))).toBe(true)
  })
})

// R4 : la forme d'une carte du fil (`shape="feed"`), de la hauteur d'une `ProjectCard` (476 points).
// Quand les cartes arrivent, rien ne saute.
describe('SkeletonCard, in the shape of a feed card', () => {
  it('takes the height of a feed card', async () => {
    await show(<SkeletonCard shape="feed" />)

    expect(heights()).toContain(PROJECT_CARD_HEIGHT)
  })

  it('announces the loading once for a list of feed cards', async () => {
    await show(<SkeletonList shape="feed" count={3} />)

    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(heights().filter((height) => height === PROJECT_CARD_HEIGHT)).toHaveLength(3)
    expect(screen.queryByText(/./, { includeHiddenElements: true })).toBeNull()
  })

  it('keeps the plain card shape by default', async () => {
    await show(<SkeletonCard />)

    expect(screen.getByRole('progressbar', { name: loading })).toBeTruthy() // témoin
    expect(heights()).not.toContain(PROJECT_CARD_HEIGHT)
  })
})

// R14 : la forme d'une carte compacte (`shape="compact"`), celle de la mosaïque d'un membre, à la
// hauteur exacte d'une `ProjectCard size="compact"` (lue sur la vraie carte, pas recopiée).
describe('SkeletonCard, in the shape of a compact card (R14)', () => {
  /** La hauteur minimale d'une vraie carte compacte, celle de la vue qui porte sa photo. */
  const compactCardHeight = async () => {
    const view = await renderWithProviders(
      <ProjectCard
        title="Biscotte au parc"
        pitch="Le carnet des promenades du chien."
        author={{ name: 'Tante Odile', avatar: null }}
        when="il y a 5 jours"
        status={{ label: 'En construction', strong: false }}
        size="compact"
        onPress={() => {}}
      />,
    )
    let node = screen.getByText('Biscotte au parc', {
      includeHiddenElements: true,
    }) as unknown as Node | null
    let found = 0
    while (node && !found) {
      const { minHeight } = (StyleSheet.flatten(node.props.style as never) ?? {}) as {
        minHeight?: unknown
      }
      if (typeof minHeight === 'number' && minHeight > 0) found = minHeight
      node = node.parent
    }
    await view.unmount()
    return found
  }

  it('takes the height of a compact card', async () => {
    const compact = await compactCardHeight()
    // Témoin : la carte compacte est plus basse que celle du fil.
    expect(compact).toBeGreaterThanOrEqual(230)
    expect(compact).toBeLessThan(PROJECT_CARD_HEIGHT)

    await show(<SkeletonCard shape="compact" />)

    expect(heights()).toContain(compact)
    expect(heights()).not.toContain(PROJECT_CARD_HEIGHT)
  })

  it('is named « Loading » and marked busy, and has no text of its own', async () => {
    await show(<SkeletonList shape="compact" count={2} />)

    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(busy(screen.getByRole('progressbar', { name: loading }))).toBe(true)
    expect(screen.queryByText(/./, { includeHiddenElements: true })).toBeNull()
  })
})

describe('SkeletonList', () => {
  it('announces the loading once, not once per card', async () => {
    await show(<SkeletonList count={3} />)

    const named = screen.getAllByRole('progressbar', { name: loading })
    expect(named).toHaveLength(1)
    expect(busy(named[0])).toBe(true)
  })
})

// R16, « Quand on le voit » (plan, choix 8).
describe('Loading, when it shows (R16)', () => {
  it('keeps its place during the first 160 ms, hidden from sight and from screen readers', async () => {
    await renderWithProviders(<SkeletonList shape="feed" count={2} />)

    // Sa place est posée dès le premier rendu : les deux cartes, à leur hauteur…
    expect(heights().filter((height) => height === PROJECT_CARD_HEIGHT)).toHaveLength(2)
    // … mais rien ne se voit ni ne se lit encore.
    expect(seenOpacity(anyProgressbar())).toBe(0)
    expect(screen.queryByRole('progressbar')).toBeNull()

    await wait(APPEAR_MS - 20)
    expect(seenOpacity(anyProgressbar())).toBe(0)
    expect(screen.queryByRole('progressbar')).toBeNull()

    // Passé 160 ms : le squelette se montre, et se lit « Chargement… », occupé.
    await wait(40)
    expect(busy(screen.getByRole('progressbar', { name: loading }))).toBe(true)
    await wait(durations.page + 100)
    expect(seenOpacity(screen.getByRole('progressbar', { name: loading }))).toBe(1)
  })

  it('keeps the prerendered skeleton on screen when the page hydrates', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    mockHydrated = false
    const view = await renderWithProviders(<SkeletonList shape="feed" count={2} />)

    // Le pré-rendu : le squelette est là tout de suite, vu et lu (le HTML ne peut rien attendre).
    expect(seenOpacity(screen.getByRole('progressbar', { name: loading }))).toBe(1)

    // L'appli démarre : la page s'hydrate. Le squelette ne disparaît pas, pas même un instant.
    mockHydrated = true
    await view.rerender(<SkeletonList shape="feed" count={2} />)
    for (const step of [0, APPEAR_MS / 2, APPEAR_MS, durations.page + 100]) {
      await wait(step)
      expect(seenOpacity(screen.getByRole('progressbar', { name: loading }))).toBe(1)
    }
  })

  it('shows at once when the page asks for it', async () => {
    // Témoin du premier test : la même attente, montrée tout de suite (`shown`).
    await renderWithProviders(
      <Loading shown>
        <Shape height={14} width="80%" />
      </Loading>,
    )

    expect(seenOpacity(screen.getByRole('progressbar', { name: loading }))).toBe(1)
  })

  it('names a grid of empty cards once, as a single progressbar', async () => {
    await show(
      <Loading>
        <ProjectCardSkeleton />
        <ProjectCardSkeleton />
        <ProjectCardSkeleton />
        <ProjectCardSkeleton />
      </Loading>,
    )

    const bars = screen.getAllByRole('progressbar', { includeHiddenElements: true })
    expect(bars).toHaveLength(1)
    expect(busy(screen.getByRole('progressbar', { name: loading }))).toBe(true)
    // Les quatre cartes vides, dessinées dedans, à leur hauteur, sans rien à lire d'elles-mêmes.
    expect(
      heights().filter((height) => height === PROJECT_CARD_HEIGHT).length,
    ).toBeGreaterThanOrEqual(4)
    expect(screen.queryByText(/./, { includeHiddenElements: true })).toBeNull()
  })

  it('no longer breathes: the whole block stays still once shown', async () => {
    // La respiration grise d'avant (opacité de 1 à 0,55 en 2 s) laisse la place à la lueur.
    await show(<SkeletonList count={2} />)

    for (let step = 0; step < 6; step++) {
      await wait(500)
      expect(seenOpacity(screen.getByRole('progressbar', { name: loading }))).toBe(1)
    }
  })
})

// R16, la lueur (scénario, « La couleur et le mouvement » ; planche R16-Lueur ; plan, choix 6).
describe('SkeletonGlow (R16)', () => {
  /** Ce que dessine la lueur seule, posée dans un cadre repéré, sérialisé pour être comparé. */
  const drawnGlow = async (column: number) => {
    const view = await renderWithProviders(
      <PieceHost>
        <SkeletonGlow column={column} />
      </PieceHost>,
    )
    const drawn = JSON.stringify(view.toJSON())
    const { drawn: count, spoken } = emptyPiece()
    await view.unmount()
    return { drawn, count, spoken }
  }

  /** Les nœuds dessinés, éléments cachés compris. */
  const everyNode = (): Node[] => {
    const all: Node[] = []
    const visit = (node: Node | string) => {
      if (typeof node === 'string') return
      all.push(node)
      for (const child of node.children) visit(child)
    }
    visit(screen.root as unknown as Node)
    return all
  }

  it('renders the same glow before hydration whether or not motion is reduced', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    mockHydrated = false

    mockCalm = false
    const moving = await drawnGlow(1)
    mockCalm = true
    const calm = await drawnGlow(1)

    // La lueur est dessinée (une décoration : rien à lire)…
    expect(moving.count).toBeGreaterThan(0)
    expect(moving.spoken).toEqual([])
    // … et le HTML pré-rendu est le même : c'est la feuille de la page qui l'arrête (document.ts).
    expect(calm.drawn).toBe(moving.drawn)
  })

  it('carries the mark that the page uses to stop it when motion is reduced, on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const marks = parseCss(documentCss)
      .rules.filter((rule) => underMedia(rule, '(prefers-reduced-motion: reduce)'))
      .flatMap((rule) => rule.selectors.flatMap(glowAttributesIn))
    expect(marks).not.toEqual([])

    await renderWithProviders(<SkeletonGlow column={0} />)

    const marked = everyNode().some((node) => {
      const dataSet = node.props.dataSet as Record<string, unknown> | undefined
      return marks.some(
        ({ key, value }) =>
          dataSet?.[key] !== undefined && (value === null || String(dataSet[key]) === value),
      )
    })
    expect(marked).toBe(true)
  })

  it('moves by transform alone on the web, and passes 150 ms later on each next column', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(<SkeletonGlow column={2} />)

    // L'élément animé : celui qui porte les images clés (react-native-web, `animationKeyframes`).
    const animated = everyNode()
      .map(
        (node) => (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>,
      )
      .filter((style) => style.animationKeyframes !== undefined)
    expect(animated).toHaveLength(1)
    const style = animated[0] as Record<string, unknown>
    // Les images clés ne portent que `transform` : la couleur (le dégradé) reste en ligne.
    const keyframes = [style.animationKeyframes].flat() as Record<string, Record<string, unknown>>[]
    for (const frames of keyframes) {
      for (const frame of Object.values(frames)) expect(Object.keys(frame)).toEqual(['transform'])
    }
    // Un passage de 1,8 s puis 1,2 s de pause : un cycle de 3 s, recommencé sans fin.
    const ms = (value: unknown) =>
      typeof value === 'number' ? value : Number.parseFloat(`${value}`)
    expect(ms(style.animationDuration)).toBe(durations.skeletonGlow + durations.skeletonPause)
    expect(style.animationIterationCount).toBe('infinite')
    // La troisième colonne (rang 2) passe 300 ms après la première.
    expect(ms(style.animationDelay)).toBe(2 * durations.skeletonStagger)
  })

  it('travels across the empty card on a phone', async () => {
    // Témoin du test suivant : sans réglage, la lueur passe en boucle (Reanimated).
    await renderWithProviders(
      <PieceHost>
        <SkeletonGlow column={0} />
      </PieceHost>,
    )

    expect(emptyPiece().drawn).toBeGreaterThan(0)
    expect(repeat).toHaveBeenCalled()
  })

  it('stands still with reduced motion on a phone', async () => {
    mockCalm = true
    await renderWithProviders(
      <PieceHost>
        <SkeletonGlow column={0} />
      </PieceHost>,
    )

    // Toujours dessinée (la variante immobile de la planche), mais plus aucune boucle.
    expect(emptyPiece().drawn).toBeGreaterThan(0)
    expect(repeat).not.toHaveBeenCalled()
  })
})
