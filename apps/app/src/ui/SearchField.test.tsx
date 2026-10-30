// Tests du champ de recherche (refonte, tranche R3, scénario « La recherche par mots ») : un champ
// nommé « Rechercher » sans étiquette visible (son texte d'attente suffit), qui dit chaque frappe à
// l'écran, une croix « Effacer la recherche » dans un cadre de 44 points, Échap qui vide le champ,
// le focus qui reste après Entrée sur le web, et un double envoi qui ne cherche qu'une fois.
// Il ressemble à TextField (nom, effacement, focus) ; ses gardes sont reprises ici.
import { layout } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Platform, StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { SearchField } from './SearchField'
import { TAP_GUARD_MS } from './tapGuard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Les textes viennent des traductions (le composant reçoit le nom et le texte d'attente en
// propriétés ; le nom de la croix, il le lit lui-même).
const label = fr.t(($) => $.search.label)
const placeholder = fr.t(($) => $.search.placeholder)
const clearLabel = fr.t(($) => $.search.clear)

/** Le champ, retrouvé par son nom. */
const field = () => screen.getByLabelText(label)

/** Une touche tapée dans le champ (sur le web, elle arrive par onKeyPress, comme MentionField). */
const typeKey = (key: string) => {
  const preventDefault = jest.fn()
  return fireEvent(field(), 'keyPress', { nativeEvent: { key, preventDefault } })
}

/**
 * La largeur et la hauteur d'un élément, lues dans son style : la croix doit tenir dans un cadre
 * de 44 points, dessiné (sur le web, `hitSlop` est ignoré : relecture de l'interface, « À noter »).
 */
const frameOf = (element: { props: { style?: unknown } }) => {
  const style = (StyleSheet.flatten(element.props.style as ViewStyle) ?? {}) as ViewStyle
  const size = (own: unknown, min: unknown) =>
    typeof own === 'number' ? own : typeof min === 'number' ? min : 0
  return { width: size(style.width, style.minWidth), height: size(style.height, style.minHeight) }
}

describe('SearchField', () => {
  it('is found by its name, shows its placeholder, and has no visible label', async () => {
    await renderWithProviders(
      <SearchField value="" onChangeText={() => {}} label={label} placeholder={placeholder} />,
    )

    expect(field()).toBeTruthy()
    expect(screen.getByPlaceholderText(placeholder)).toBe(field())
    // Le nom n'est pas écrit à l'écran : seul le texte d'attente se voit.
    expect(screen.queryByText(label)).toBeNull()
  })

  it('carries its name as aria-label on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <SearchField value="" onChangeText={() => {}} label={label} placeholder={placeholder} />,
      )

      const props = field().props as Record<string, unknown>
      expect(props['aria-label'] ?? props.accessibilityLabel).toBe(label)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('passes each keystroke to the screen', async () => {
    const onChangeText = jest.fn()
    await renderWithProviders(
      <SearchField value="" onChangeText={onChangeText} label={label} placeholder={placeholder} />,
    )

    await fireEvent.changeText(field(), 'c')
    await fireEvent.changeText(field(), 'ca')

    expect(onChangeText).toHaveBeenNthCalledWith(1, 'c')
    expect(onChangeText).toHaveBeenNthCalledWith(2, 'ca')
  })

  it('offers « Effacer la recherche » only once something is typed', async () => {
    const { rerender } = await renderWithProviders(
      <SearchField value="" onChangeText={() => {}} label={label} placeholder={placeholder} />,
    )

    expect(screen.queryByRole('button', { name: clearLabel })).toBeNull()

    await rerender(
      <SearchField value="carn" onChangeText={() => {}} label={label} placeholder={placeholder} />,
    )

    expect(screen.getByRole('button', { name: clearLabel })).toBeTruthy()
  })

  it('empties the field when the cross is touched, from a 44-point frame', async () => {
    const onChangeText = jest.fn()
    const onClear = jest.fn()
    await renderWithProviders(
      <SearchField
        value="carn"
        onChangeText={onChangeText}
        onClear={onClear}
        label={label}
        placeholder={placeholder}
      />,
    )

    const clear = screen.getByRole('button', { name: clearLabel })
    const frame = frameOf(clear)
    expect(frame.width).toBeGreaterThanOrEqual(layout.touchTarget)
    expect(frame.height).toBeGreaterThanOrEqual(layout.touchTarget)

    await fireEvent.press(clear)

    expect(onChangeText).toHaveBeenCalledWith('')
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('empties the field with Escape on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onChangeText = jest.fn()
      const onClear = jest.fn()
      await renderWithProviders(
        <SearchField
          value="carn"
          onChangeText={onChangeText}
          onClear={onClear}
          label={label}
          placeholder={placeholder}
        />,
      )

      await typeKey('Escape')

      expect(onChangeText).toHaveBeenCalledWith('')
      expect(onClear).toHaveBeenCalledTimes(1)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('ignores Escape while the field is already empty', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onClear = jest.fn()
      await renderWithProviders(
        <SearchField
          value=""
          onChangeText={() => {}}
          onClear={onClear}
          label={label}
          placeholder={placeholder}
        />,
      )

      await typeKey('Escape')

      expect(onClear).not.toHaveBeenCalled()
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('keeps the focus after Enter on the web (blurOnSubmit false)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <SearchField
          value="carn"
          onChangeText={() => {}}
          onSubmit={() => {}}
          label={label}
          placeholder={placeholder}
        />,
      )

      // React Native nomme ce réglage `submitBehavior` depuis 0.76 ; react-native-web lit encore
      // `blurOnSubmit`. L'un ou l'autre dit la même chose : Entrée ne quitte pas le champ.
      const props = field().props as Record<string, unknown>
      expect(props.blurOnSubmit === false || props.submitBehavior === 'submit').toBe(true)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('asks for the focus when the screen says so (autoFocus)', async () => {
    await renderWithProviders(
      <SearchField
        value=""
        onChangeText={() => {}}
        autoFocus
        label={label}
        placeholder={placeholder}
      />,
    )

    expect(field().props.autoFocus).toBe(true)
  })

  it('does not take the focus unless asked', async () => {
    await renderWithProviders(
      <SearchField value="" onChangeText={() => {}} label={label} placeholder={placeholder} />,
    )

    expect(field().props.autoFocus).toBeFalsy()
  })

  // Une double tape sur la touche Entrée (ou « Rechercher » du clavier) ne lance qu'une recherche :
  // la seconde arrive dans la même fenêtre que la garde des fenêtres (TAP_GUARD_MS, tapGuard.ts).
  describe('against a double Enter', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('tells the screen to search once for two Enter in a row', async () => {
      const onSubmit = jest.fn()
      await renderWithProviders(
        <SearchField
          value="carn"
          onChangeText={() => {}}
          onSubmit={onSubmit}
          label={label}
          placeholder={placeholder}
        />,
      )

      await fireEvent(field(), 'submitEditing')
      await fireEvent(field(), 'submitEditing')

      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    it('searches again for an Enter that comes later', async () => {
      const onSubmit = jest.fn()
      await renderWithProviders(
        <SearchField
          value="carn"
          onChangeText={() => {}}
          onSubmit={onSubmit}
          label={label}
          placeholder={placeholder}
        />,
      )

      await fireEvent(field(), 'submitEditing')
      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
      await fireEvent(field(), 'submitEditing')

      expect(onSubmit).toHaveBeenCalledTimes(2)
    })
  })
})
