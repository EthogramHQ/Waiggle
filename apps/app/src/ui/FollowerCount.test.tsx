// Tests de FollowerCount (R21, « Le temps réel ») : le nombre d'abonnés qui change sous les yeux
// arrive en fondu, sans saut ; rien avec « Réduire les animations » ; jamais d'annonce. Jest ne joue
// aucune animation : on lit l'animation d'entrée (`entering`) que Reanimated jouerait.
import { screen } from '@testing-library/react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { FollowerCount } from './FollowerCount'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Reanimated tel que le prépare jest.setup.ts, avec le réglage « Réduire les animations » choisi par
// chaque test (useCalmMotion le lit).
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
  }
})

const reducedMotion = jest.mocked(useReducedMotion)

type Node = { props: Record<string, unknown>; parent: Node | null }

/** L'animation d'entrée posée autour de ce texte, ou undefined. */
const enteringOf = (text: string) => {
  let node: Node | null = screen.getByText(text) as unknown as Node
  while (node) {
    if (node.props.entering !== undefined) return node.props.entering
    node = node.parent
  }
  return undefined
}

beforeEach(() => reducedMotion.mockReturnValue(false))

describe('FollowerCount', () => {
  it('shows the first count as it is, without an entrance', async () => {
    await renderWithProviders(<FollowerCount text="12 abonnés" />)

    expect(screen.getByText('12 abonnés')).toBeTruthy()
    expect(enteringOf('12 abonnés')).toBeUndefined()
  })

  it('fades the new count in when another member follows', async () => {
    const { rerender } = await renderWithProviders(<FollowerCount text="12 abonnés" />)

    await rerender(<FollowerCount text="13 abonnés" />)

    expect(screen.getByText('13 abonnés')).toBeTruthy()
    expect(screen.queryByText('12 abonnés')).toBeNull()
    expect(enteringOf('13 abonnés')).toBeDefined()
  })

  it('changes the count without any animation under « Réduire les animations »', async () => {
    reducedMotion.mockReturnValue(true)
    const { rerender } = await renderWithProviders(<FollowerCount text="12 abonnés" />)

    await rerender(<FollowerCount text="13 abonnés" />)

    expect(screen.getByText('13 abonnés')).toBeTruthy()
    expect(enteringOf('13 abonnés')).toBeUndefined()
  })

  it('never announces the change to the screen reader', async () => {
    const { rerender } = await renderWithProviders(<FollowerCount text="12 abonnés" />)

    await rerender(<FollowerCount text="13 abonnés" />)

    // Ni région annoncée, ni état : le nombre se lit en passant dessus.
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
