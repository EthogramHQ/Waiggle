// Vérifie les réglages des fondus de la marque : un fondu n'est pas un déplacement, il doit donc
// jouer même quand la personne a activé « Réduire les animations » (règle A11 de docs/design/miel.md).
import { durations } from '@ruche/brand'
import { ReduceMotion, withTiming } from 'react-native-reanimated'
import { fade } from './motion'

// On espionne withTiming pour lire les options que fade() lui passe, sans lancer d'animation.
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  return { ...actual, withTiming: jest.fn(() => 0) }
})

describe('fade', () => {
  beforeEach(() => jest.mocked(withTiming).mockClear())

  it('still plays when the device asks for reduced motion', () => {
    fade(1)
    const options = jest.mocked(withTiming).mock.calls[0]?.[1]
    expect(options?.reduceMotion).toBe(ReduceMotion.Never)
  })

  it('uses the brand exit curve rather than the library default', () => {
    fade(0, 'quick')
    const options = jest.mocked(withTiming).mock.calls[0]?.[1]
    // Sans courbe donnée, Reanimated prend la sienne (`inOut(quad)`) ; Easing.bezier rend une
    // fabrique (un objet), qu'on ne peut pas comparer : on vérifie qu'une courbe est passée.
    expect(options?.easing).toBeDefined()
  })

  it('takes its duration from the brand tokens', () => {
    fade(1, 'medium')
    expect(jest.mocked(withTiming).mock.calls[0]?.[0]).toBe(1)
    expect(jest.mocked(withTiming).mock.calls[0]?.[1]?.duration).toBe(durations.medium)
  })
})
