// Tests du logo animé du lancement (R1) : ce qu'en lit un lecteur d'écran, et son calme quand la
// personne a demandé de réduire les animations. Le dessin lui-même se vérifie sur les captures.
import { screen } from '@testing-library/react-native'
import { useReducedMotion, withRepeat } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { LoadingLogo } from './LoadingLogo'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Reanimated, tel que le prépare jest.setup.ts, avec deux remplacements : le réglage « Réduire les
// animations » de l'appareil, que chaque test choisit, et la mise en boucle d'une animation
// (withRepeat), qu'on observe. jest.fn(réel) garde le vrai comportement et note chaque appel.
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  // __esModule et default : sans eux, `import Animated from …` ne retrouverait pas Animated.View.
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
    withRepeat: jest.fn(actual.withRepeat),
  }
})

const reducedMotion = jest.mocked(useReducedMotion)
const repeat = jest.mocked(withRepeat)

/** « Waiggle se lance… » : le nom de l'image pendant le lancement. */
const loadingApp = fr.t(($) => $.common.loadingApp)

beforeEach(() => {
  reducedMotion.mockReturnValue(false)
  repeat.mockClear()
})

describe('LoadingLogo', () => {
  it('is an image named « {{appName}} se lance… », announced as busy', async () => {
    await renderWithProviders(<LoadingLogo />)

    const logo = screen.getByRole('img', { name: loadingApp })
    expect(logo).toBeBusy()
    // Un seul nom pour tout le dessin : le chemin et l'abeille ne sont pas lus à part.
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  // Témoin du test suivant : sans réglage, l'abeille parcourt son chemin en boucle.
  it('loops while the app starts', async () => {
    await renderWithProviders(<LoadingLogo />)

    expect(screen.getByRole('img', { name: loadingApp })).toBeTruthy()
    expect(repeat).toHaveBeenCalled()
  })

  // « Réduire les animations » : le logo est posé, immobile, et garde son nom.
  it('stands still with reduced motion: no loop at all', async () => {
    reducedMotion.mockReturnValue(true)
    await renderWithProviders(<LoadingLogo />)

    expect(screen.getByRole('img', { name: loadingApp })).toBeBusy()
    expect(repeat).not.toHaveBeenCalled()
  })
})
