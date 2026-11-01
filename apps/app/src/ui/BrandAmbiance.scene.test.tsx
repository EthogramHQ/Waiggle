// Tests de la mise en page du miel vif (relectures de R1) : le décor (`scene`) que l'ambiance place
// elle-même selon la largeur et cache aux lecteurs d'écran, la barre de navigation posée sur le
// miel, et la feuille qui n'est arrondie qu'en haut quand elle descend au bas de la fenêtre.
// (Le contenu sur la feuille est testé dans BrandAmbiance.test.tsx.)
import { radii } from '@ruche/brand'
import { isHiddenFromAccessibility, screen } from '@testing-library/react-native'
import { StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { BrandAmbiance } from './BrandAmbiance'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { parent: Node | null; props: Record<string, unknown> }

/** Le style aplati de chaque parent de l'élément, du plus proche au plus lointain. */
const ancestorStyles = (element: Node): ViewStyle[] => {
  const styles: ViewStyle[] = []
  for (let node: Node | null = element; node; node = node.parent) {
    styles.push((StyleSheet.flatten(node.props.style as ViewStyle) ?? {}) as ViewStyle)
  }
  return styles
}

describe('BrandAmbiance scene', () => {
  it('hides the scene from screen readers on a phone', async () => {
    await renderWithProviders(
      <BrandAmbiance size="compact" scene={<Text>Constellation</Text>}>
        <Text>Contenu</Text>
      </BrandAmbiance>,
    )

    const scene = screen.getByText('Constellation', { includeHiddenElements: true })
    expect(isHiddenFromAccessibility(scene)).toBe(true)
    expect(isHiddenFromAccessibility(screen.getByText('Contenu'))).toBe(false)
  })

  it('puts the scene at the top of the card on a computer, hidden from screen readers', async () => {
    await renderWithProviders(
      <BrandAmbiance size="wide" scene={<Text>Enveloppe</Text>}>
        <Text>Contenu</Text>
      </BrandAmbiance>,
    )

    // Sans scène de gauche (`hero`), l'image ne disparaît pas sur ordinateur.
    const scene = screen.getByText('Enveloppe', { includeHiddenElements: true })
    expect(isHiddenFromAccessibility(scene)).toBe(true)
  })

  it('does not repeat the scene on a computer when the hero already shows it', async () => {
    await renderWithProviders(
      <BrandAmbiance size="wide" scene={<Text>Constellation</Text>} hero={<Text>Scène</Text>}>
        <Text>Contenu</Text>
      </BrandAmbiance>,
    )

    expect(screen.getByText('Scène')).toBeTruthy()
    expect(screen.queryByText('Constellation', { includeHiddenElements: true })).toBeNull()
  })

  it.each(['compact', 'wide'] as const)(
    'keeps the navigation bar readable, above the sheet (%s)',
    async (size) => {
      await renderWithProviders(
        <BrandAmbiance size={size} header={<Text>Mon compte</Text>}>
          <Text>Contenu</Text>
        </BrandAmbiance>,
      )

      // La barre est lue (ce n'est pas du décor), et elle vient avant le contenu de la feuille.
      const bar = screen.getByText('Mon compte')
      expect(isHiddenFromAccessibility(bar)).toBe(false)
      const sheetRadius = (style: ViewStyle) => style.borderRadius === radii.ambiance
      expect(ancestorStyles(bar as unknown as Node).some(sheetRadius)).toBe(false)
    },
  )

  it('rounds the phone sheet at the top only, its bottom corners out of sight', async () => {
    await renderWithProviders(
      <BrandAmbiance size="compact">
        <Text>Contenu</Text>
      </BrandAmbiance>,
    )

    // La feuille (arrondie de radii.ambiance) est prolongée d'au moins son arrondi sous le bord
    // d'un cadre qui rogne : ses coins du bas ne se voient pas, le fond non plus.
    const styles = ancestorStyles(screen.getByText('Contenu') as unknown as Node)
    const sheet = styles.findIndex((style) => style.borderRadius === radii.ambiance)
    expect(sheet).toBeGreaterThanOrEqual(0)
    const pushed = styles.findIndex(
      (style, index) =>
        index >= sheet &&
        typeof style.marginBottom === 'number' &&
        style.marginBottom <= -radii.ambiance,
    )
    expect(pushed).toBeGreaterThanOrEqual(0)
    const clip = styles.findIndex((style, index) => index > pushed && style.overflow === 'hidden')
    expect(clip).toBeGreaterThan(pushed)
  })
})
