// La barre du haut sur le miel (relecture RF, design n° 6) : sur ordinateur, la capsule de la barre
// descendait de 32 points en passant d'une page ordinaire (Explorer) à une page du miel (le projet
// introuvable), puis remontait au retour. La barre fixe des pages ordinaires (ui/ScreenTopBar.tsx)
// se pose à la marge du haut de l'écran (zone sûre comprise, plus `space.lg`) ; BrandAmbiance posait
// la sienne plus bas, sous la grande marge de la carte. Ces tests comparent les deux, rendues
// côte à côte : la distance entre le haut de la page et la barre, somme des marges du haut de tous
// ses cadres.
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { BrandAmbiance } from './BrandAmbiance'
import { ScreenTopBar } from './ScreenTopBar'
import { Text } from './Text'
import type { SizeClass } from './theme/layout'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { parent: Node | null; props: Record<string, unknown> }

/** Du haut de la page au haut d'un élément : les marges du haut de tous ses cadres. */
const topOf = (element: unknown): number => {
  let top = 0
  for (let node = (element as Node).parent; node; node = node.parent) {
    const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
    for (const key of ['paddingTop', 'marginTop', 'paddingVertical', 'marginVertical', 'top']) {
      const value = style[key]
      if (typeof value === 'number') top += value
    }
  }
  return top
}

/** Une page ordinaire (sa barre) et une page du miel (la sienne), dans la mise en page donnée. */
const pages = (size: SizeClass) => (
  <>
    <ScreenTopBar>
      <Text>Barre ordinaire</Text>
    </ScreenTopBar>
    <BrandAmbiance size={size} header={<Text>Barre du miel</Text>}>
      <Text>Ce projet est introuvable</Text>
    </BrandAmbiance>
  </>
)

describe('BrandAmbiance, its top bar', () => {
  it('puts its bar where ordinary pages put theirs, on a computer (the card)', async () => {
    await renderWithProviders(pages('wide'))

    expect(topOf(screen.getByText('Barre du miel'))).toBe(
      topOf(screen.getByText('Barre ordinaire')),
    )
  })

  // Témoin : sur téléphone et tablette, la bande de miel la posait déjà au même endroit.
  it('puts its bar where ordinary pages put theirs, on a phone (the band)', async () => {
    await renderWithProviders(pages('compact'))

    expect(topOf(screen.getByText('Barre du miel'))).toBe(
      topOf(screen.getByText('Barre ordinaire')),
    )
  })
})
