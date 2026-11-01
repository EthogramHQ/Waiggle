// Tests de la pastille des nouveautés (cloche des notifications) : « 9+ » au-delà du plafond, rien à
// zéro, et une pastille qui reste petite quand le texte grandit (relecture de design de R3, 12 : à
// 200 % sur le web, elle montait jusqu'à 2 px du bord de l'écran).
import { textStyles } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { badgeText, badgeTextScale, CountBadge } from './CountBadge'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; parent: Node | null }

/** La plus grande hauteur permise au chiffre : sa hauteur de ligne ×1,2. */
const CAP = textStyles.micro.lineHeight * 1.2

describe('CountBadge', () => {
  it('writes the number, or « max+ » beyond it', () => {
    expect(badgeText(3)).toBe('3')
    expect(badgeText(9)).toBe('9')
    expect(badgeText(10)).toBe('9+')
    expect(badgeText(12, 20)).toBe('12')
  })

  it('draws nothing at zero', async () => {
    await renderWithProviders(<CountBadge count={0} />)

    expect(screen.queryByText('0', { includeHiddenElements: true })).toBeNull()
  })

  it.each([
    [null, 1],
    [{ width: 7, height: 14 }, 1],
    [{ width: 14, height: 28 }, CAP / 28],
  ])('scales a number measured at %j by %d', (natural, expected) => {
    expect(badgeTextScale(natural)).toBeCloseTo(expected, 5)
  })

  // Sur le web, rien ne borne la taille du texte : la pastille mesure son chiffre et le réduit.
  it('keeps its number under 1.2 times its size when the text grows, on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<CountBadge count={3} />)
      // Témoin : la pastille est là, cachée aux lecteurs d'écran (le bouton dit le nombre).
      const digit = screen.getByText('3', { includeHiddenElements: true }) as unknown as Node
      // Le chiffre, puis la boîte qu'on mesure, puis la boîte qui prend la taille réduite.
      const measured = digit.parent as Node
      const room = measured.parent as Node

      // Le navigateur, à 200 % : un chiffre de 14 × 28 au lieu de 7 × 14.
      await act(async () => {
        ;(measured.props.onLayout as (event: unknown) => void)({
          nativeEvent: { layout: { x: 0, y: 0, width: 14, height: 28 } },
        })
      })

      const style = room.props.style as { height?: number }
      expect(style.height).toBeCloseTo(CAP, 5)
    } finally {
      jest.restoreAllMocks()
    }
  })
})
