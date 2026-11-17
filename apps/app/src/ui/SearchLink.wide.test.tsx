// Tests du lien de recherche dans la barre du haut d'un grand écran (tranche R15, « L'ordinateur en
// grand ») : arrêté à 560 points, il laisse la place qui reste à sa droite, pour que ce qui le suit
// dans la barre (la cloche, la photo, « Publier ») reste au bord droit, comme quand il remplissait
// toute la place. Hors de la barre (sans `grow`), il ne prend aucune marge de plus.
// Jest ne calcule aucune position : on lit la marge posée sur la pilule.
import { screen } from '@testing-library/react-native'
import { StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { SearchLink } from './SearchLink'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const label = fr.t(($) => $.search.label)
const placeholder = fr.t(($) => $.search.placeholder)

const pillStyle = () => StyleSheet.flatten(screen.getByRole('link').props.style) as ViewStyle

describe('SearchLink in a wide top bar (R15)', () => {
  it('keeps what follows it at the right edge of the bar once it stops growing', async () => {
    await renderWithProviders(
      <SearchLink label={label} placeholder={placeholder} href="/search" onPress={() => {}} grow />,
    )

    expect(pillStyle().flexGrow).toBe(1) // témoin : il prend la place qui reste
    expect(pillStyle().marginRight).toBe('auto')
  })

  it('takes no room to its right outside the bar', async () => {
    await renderWithProviders(
      <SearchLink label={label} placeholder={placeholder} href="/search" onPress={() => {}} />,
    )

    expect(screen.getByRole('link')).toBeTruthy() // témoin
    expect(pillStyle().marginRight).not.toBe('auto')
    expect(pillStyle().maxWidth).toBeUndefined()
  })
})
