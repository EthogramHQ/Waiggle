// Tests des squelettes (refonte, tranche R1) : des formes pleines à la place d'un contenu en cours
// de chargement (le fil, une page), au lieu du mot « Chargement… ». Pour un lecteur d'écran, les
// formes ne disent rien : l'ensemble est nommé « Chargement… » (common.loading) et marqué occupé
// (aria-busy sur le web), une seule fois, même pour une liste de plusieurs cartes.
import { screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { SkeletonCard, SkeletonList } from './Skeleton'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// « Réduire les animations » : la respiration des formes s'arrête, le reste ne change pas. Le
// préfixe `mock` permet à Jest de lire cette variable dans le remplacement du module.
let mockCalm = false
jest.mock('./theme/motion', () => ({
  ...jest.requireActual('./theme/motion'),
  useCalmMotion: () => mockCalm,
}))

const loading = fr.t(($) => $.common.loading)

/** La hauteur par défaut d'une carte du fil (`ProjectCard`, `height = 476`). */
const FEED_CARD_HEIGHT = 476

type Node = { props: Record<string, unknown> }

/** Occupé, de la façon que comprend chaque plateforme : aria-busy (web) ou l'état « busy ». */
const busy = (element: Node): boolean =>
  element.props['aria-busy'] === true ||
  (element.props.accessibilityState as { busy?: boolean } | undefined)?.busy === true

beforeEach(() => {
  mockCalm = false
})

describe('SkeletonCard', () => {
  it('is named « Loading » and marked busy', async () => {
    await renderWithProviders(<SkeletonCard />)

    expect(busy(screen.getByLabelText(loading))).toBe(true)
  })

  it('is marked busy on the web with aria-busy', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<SkeletonCard />)

      expect(screen.getByLabelText(loading)).toHaveProp('aria-busy', true)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('speaks the language of the app', async () => {
    await renderWithProviders(<SkeletonCard />, 'en')

    expect(screen.getByLabelText('Loading…')).toBeTruthy()
  })

  it('has no text of its own to read', async () => {
    // Que des formes : aucun faux titre ni « Lorem ipsum » à lire.
    await renderWithProviders(<SkeletonCard />)

    expect(screen.getByLabelText(loading)).toBeTruthy() // témoin
    expect(screen.queryByText(/./, { includeHiddenElements: true })).toBeNull()
  })

  it('stays named and busy with reduced motion', async () => {
    mockCalm = true
    await renderWithProviders(<SkeletonCard />)

    expect(busy(screen.getByLabelText(loading))).toBe(true)
  })
})

// R4 : la forme d'une carte du fil (`shape="feed"`) : un bloc de la hauteur d'une `ProjectCard`
// (476 points, sa hauteur par défaut) et, en bas, un panneau plein à la place du verre. Quand les
// cartes arrivent, rien ne saute.
describe('SkeletonCard, in the shape of a feed card', () => {
  /** Les hauteurs posées sur les formes dessinées, en points. */
  const heights = () => {
    const found: number[] = []
    const visit = (node: unknown) => {
      if (!node || typeof node !== 'object' || !('props' in node)) return
      const { props, children } = node as { props: { style?: unknown }; children: unknown[] }
      const { height } = (StyleSheet.flatten(props.style as object) ?? {}) as { height?: unknown }
      if (typeof height === 'number') found.push(height)
      for (const child of children) visit(child)
    }
    visit(screen.root)
    return found
  }

  it('takes the height of a feed card', async () => {
    await renderWithProviders(<SkeletonCard shape="feed" />)

    expect(heights()).toContain(FEED_CARD_HEIGHT)
  })

  it('is named « Loading » and marked busy, like the other shapes', async () => {
    await renderWithProviders(<SkeletonCard shape="feed" />)

    expect(busy(screen.getByLabelText(loading))).toBe(true)
  })

  it('has no text of its own to read', async () => {
    await renderWithProviders(<SkeletonCard shape="feed" />)

    expect(screen.getByLabelText(loading)).toBeTruthy() // témoin
    expect(screen.queryByText(/./, { includeHiddenElements: true })).toBeNull()
  })

  it('announces the loading once for a list of feed cards', async () => {
    await renderWithProviders(<SkeletonList shape="feed" count={3} />)

    expect(screen.getAllByLabelText(loading)).toHaveLength(1)
    expect(heights().filter((height) => height === FEED_CARD_HEIGHT)).toHaveLength(3)
  })

  it('keeps the plain card shape by default', async () => {
    await renderWithProviders(<SkeletonCard />)

    expect(screen.getByLabelText(loading)).toBeTruthy() // témoin
    expect(heights()).not.toContain(FEED_CARD_HEIGHT)
  })
})

describe('SkeletonList', () => {
  it('announces the loading once, not once per card', async () => {
    await renderWithProviders(<SkeletonList count={3} />)

    const labelled = screen.getAllByLabelText(loading)
    expect(labelled).toHaveLength(1)
    expect(busy(labelled[0] as Node)).toBe(true)
  })
})
