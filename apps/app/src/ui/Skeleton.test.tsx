// Tests des squelettes (refonte, tranche R1) : des formes pleines à la place d'un contenu en cours
// de chargement (le fil, une page), au lieu du mot « Chargement… ». Pour un lecteur d'écran, les
// formes ne disent rien : l'ensemble est nommé « Chargement… » (common.loading) et marqué occupé
// (aria-busy sur le web), une seule fois, même pour une liste de plusieurs cartes.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
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

describe('SkeletonList', () => {
  it('announces the loading once, not once per card', async () => {
    await renderWithProviders(<SkeletonList count={3} />)

    const labelled = screen.getAllByLabelText(loading)
    expect(labelled).toHaveLength(1)
    expect(busy(labelled[0] as Node)).toBe(true)
  })
})
