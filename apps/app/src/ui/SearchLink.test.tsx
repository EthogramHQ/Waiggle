// Tests du lien dessiné comme un champ de recherche (R3, le haut d'Explorer sur téléphone) : un
// lien, pas un champ ; son nom commence par celui du champ et contient le texte affiché ; sur le web,
// un vrai lien avec son adresse, qu'Entrée ouvre.
import { layout, radii } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform, StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { SearchLink } from './SearchLink'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const label = fr.t(($) => $.search.label)
const placeholder = fr.t(($) => $.search.placeholder)

describe('SearchLink', () => {
  it('is a link named by the field, then by the text it shows', async () => {
    await renderWithProviders(
      <SearchLink label={label} placeholder={placeholder} href="/search" onPress={() => {}} />,
    )

    expect(screen.getByRole('link', { name: `${label}, ${placeholder}` })).toBeTruthy()
    expect(screen.getByText(placeholder)).toBeTruthy()
    // Ce n'est pas un champ : rien à taper ici.
    expect(screen.queryByPlaceholderText(placeholder)).toBeNull()
  })

  it('opens the search when touched', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <SearchLink label={label} placeholder={placeholder} href="/search" onPress={onPress} />,
    )

    await fireEvent.press(screen.getByRole('link'))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('carries its address on the web, and opens with Enter', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onPress = jest.fn()
      await renderWithProviders(
        <SearchLink label={label} placeholder={placeholder} href="/search" onPress={onPress} />,
      )

      const link = screen.getByRole('link')
      expect(link.props.href).toBe('/search')
      await fireEvent(link, 'keyDown', { key: 'Enter', preventDefault: () => {} })
      expect(onPress).toHaveBeenCalledTimes(1)
    } finally {
      jest.restoreAllMocks()
    }
  })

  // R3, relecture de l'interface C4 : un seul SearchLink (Explorer et la barre du haut), dont le
  // texte passe à la ligne au lieu d'être coupé à 200 %.
  it('lets its text wrap instead of cutting it', async () => {
    await renderWithProviders(
      <SearchLink label={label} placeholder={placeholder} href="/search" onPress={() => {}} grow />,
    )

    expect(screen.getByText(placeholder).props.numberOfLines).toBeUndefined()
  })

  it('takes the room left in a row when asked (the top bar), and keeps 44 points of height', async () => {
    await renderWithProviders(
      <SearchLink label={label} placeholder={placeholder} href="/search" onPress={() => {}} grow />,
    )

    const style = StyleSheet.flatten(screen.getByRole('link').props.style) as ViewStyle
    expect(style.flexGrow).toBe(1)
    expect(style.minHeight).toBeGreaterThanOrEqual(layout.touchTarget)
  })

  it('becomes a rounded panel, not a pill, once its text runs on several lines', async () => {
    await renderWithProviders(
      <SearchLink label={label} placeholder={placeholder} href="/search" onPress={() => {}} />,
    )
    const radius = () =>
      (StyleSheet.flatten(screen.getByRole('link').props.style) as ViewStyle).borderRadius

    expect(radius()).toBe(radii.pill)
    await fireEvent(screen.getByRole('link'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 160, height: 3 * layout.touchTarget } },
    })
    expect(radius()).toBe(radii.panel)
  })
})
