// Le petit disque de la mascotte devant un texte (un toast) : la même couleur `mascotDisc` que le
// grand disque, de jour comme de nuit. C'est sur elle que contrastPairs mesure le contour noir de
// l'abeille (« mascotInk » sur « mascotDisc », 3:1 au moins) ; sans ce disque, de nuit, le contour
// se perdait sur la pilule sombre du toast.
import { palettes } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Mascot } from './Mascot'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('Mascot, inline (in a toast)', () => {
  it.each(['day', 'night'] as const)(
    'sits on a disc of the mascot disc colour, the size of the line (%s)',
    async (scheme) => {
      await renderWithProviders(<Mascot pose="sleep" size="inline" decorative />, 'fr', scheme)

      const style = StyleSheet.flatten(
        screen.getByTestId('mascot-disc', { includeHiddenElements: true }).props.style,
      )
      expect(style.backgroundColor).toBe(palettes[scheme].mascotDisc)
      // La pilule du toast (46 points) ne grandit pas : le disque garde la taille de la ligne.
      expect(style.height).toBeLessThanOrEqual(28)
    },
  )
})
