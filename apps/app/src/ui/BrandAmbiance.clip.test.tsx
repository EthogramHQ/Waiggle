// Tests du rognage du miel vif (ui/BrandAmbiance.tsx, relecture de design du 10/11) : le décor animé
// (la lumière tournante du portail de la page de sortie) dépasse sa propre boîte, et le navigateur
// comptait ce dépassement dans la hauteur à faire défiler. Le miel le rogne donc à son bord, dans
// les deux mises en page. Sur le web, par `overflow: clip`, qui ne fait pas de cadre que le
// navigateur pourrait faire défiler en donnant le focus ; sur téléphone, par `hidden`.
//
// Jest ne mesure ni hauteur ni défilement : la preuve du défaut et de sa correction est la mesure
// dans le navigateur. Ici, on garde la règle : la couche du miel rogne ce qui la dépasse.
import { screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { BrandAmbiance } from './BrandAmbiance'
import { Text } from './Text'

/** Le débordement de la couche du miel, une fois ses styles mis à plat. */
const honeyOverflow = () =>
  StyleSheet.flatten(
    screen.getByTestId('brand-ambiance', { includeHiddenElements: true }).props.style,
  ).overflow

const page = (size: 'wide' | 'compact') => (
  <BrandAmbiance size={size} scene={<Text>décor</Text>} hero={<Text>scène</Text>}>
    <Text>contenu</Text>
  </BrandAmbiance>
)

describe('the honey of a brand moment clips its decor', () => {
  it.each(['wide', 'compact'] as const)(
    'clips what overflows it on a phone (%s layout)',
    async (size) => {
      await renderWithProviders(page(size))
      expect(honeyOverflow()).toBe('hidden')
    },
  )

  it.each(['wide', 'compact'] as const)(
    'clips without making a box the browser could scroll on the web (%s layout)',
    async (size) => {
      const replaced = jest.replaceProperty(Platform, 'OS', 'web')
      try {
        await renderWithProviders(page(size))
        expect(honeyOverflow()).toBe('clip')
      } finally {
        replaced.restore()
      }
    },
  )
})
