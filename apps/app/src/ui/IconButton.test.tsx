// Tests du bouton rond à icône (R5b) : il gagne `loading`, pour le bouton d'envoi d'un commentaire
// (la flèche du champ, relecture de l'interface ui-B3). Pendant l'envoi, il est annoncé « occupé »,
// garde son nom, et ignore les appuis : un double toucher n'envoie qu'un commentaire. Comme
// `Button`, il ne quitte pas pour autant le parcours au clavier sur le web : le membre qui vient
// d'envoyer avec Entrée garde le focus là où il était.
import { palettes } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform, StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { IconButton } from './IconButton'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LABEL = 'Envoyer le commentaire'

/** L'état « occupé », qu'il soit écrit `aria-busy` (web et téléphone) ou dans accessibilityState. */
const busyOf = (props: Record<string, unknown>) =>
  props['aria-busy'] === true ||
  (props.accessibilityState as { busy?: boolean } | undefined)?.busy === true

describe('IconButton', () => {
  it('calls onPress when touched (témoin)', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<IconButton icon="arrow-up" label={LABEL} onPress={onPress} />)

    const button = screen.getByRole('button', { name: LABEL })
    expect(busyOf(button.props)).toBe(false)
    await fireEvent.press(button)

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('is announced busy while loading, keeps its name, and ignores presses', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <IconButton icon="arrow-up" label={LABEL} onPress={onPress} loading />,
    )

    const button = screen.getByRole('button', { name: LABEL })
    expect(busyOf(button.props)).toBe(true)
    await fireEvent.press(button)
    await fireEvent.press(button)

    expect(onPress).not.toHaveBeenCalled()
  })

  it('stays in the keyboard order while loading, on the web', async () => {
    // Sur le web, `disabled` pose tabIndex -1 : le bouton qui a le focus le perdrait au moment
    // même de l'envoi, et le focus retomberait sur la page (code-appli.md, « disabled web »).
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <IconButton icon="arrow-up" label={LABEL} onPress={() => {}} loading />,
      )

      const button = screen.getByRole('button', { name: LABEL })
      expect(busyOf(button.props)).toBe(true)
      // Le `Pressable` désactivé n'est plus focalisable (`focusable` faux, tabIndex -1 sur le web).
      expect(button.props.focusable).not.toBe(false)
      expect(button.props.tabIndex).not.toBe(-1)
    } finally {
      jest.restoreAllMocks()
    }
  })
})

// La variante `bare` (R5b, relecture de design A1) : le « … » d'un commentaire, répété à chaque carte,
// ne pose aucun disque au repos (la planche n'en a qu'à l'ouverture), mais la zone reste de 44 points.
describe('IconButton, the bare variant', () => {
  const disc = (name: string) =>
    (StyleSheet.flatten(screen.getByRole('button', { name }).props.style) as ViewStyle)
      .backgroundColor

  it('keeps its 44-point target but draws no disc at rest', async () => {
    await renderWithProviders(
      <IconButton variant="bare" icon="dots-three" label={LABEL} onPress={() => {}} />,
    )

    const style = StyleSheet.flatten(
      screen.getByRole('button', { name: LABEL }).props.style,
    ) as ViewStyle
    expect(style.width).toBe(44)
    expect(style.height).toBe(44)
    expect(disc(LABEL)).toBeUndefined()
  })

  it('draws its disc when what it opens is open', async () => {
    await renderWithProviders(
      <IconButton variant="bare" icon="dots-three" label={LABEL} onPress={() => {}} expanded />,
    )

    expect(disc(LABEL)).toBe(palettes.day.glass)
  })

  it('draws its disc under the finger', async () => {
    await renderWithProviders(
      <IconButton variant="bare" icon="dots-three" label={LABEL} onPress={() => {}} />,
    )

    await fireEvent(screen.getByRole('button', { name: LABEL }), 'responderGrant', {
      nativeEvent: { touches: [], changedTouches: [] },
      dispatchConfig: { registrationName: 'onResponderGrant' },
      persist: () => {},
    })

    expect(disc(LABEL)).toBe(palettes.day.glass)
  })

  it('leaves the plain variant its disc at rest', async () => {
    await renderWithProviders(
      <IconButton variant="plain" icon="share-network" label={LABEL} onPress={() => {}} />,
    )

    expect(disc(LABEL)).toBe(palettes.day.surfaceGrouped)
  })
})
