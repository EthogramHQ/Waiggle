// Tests du champ de recherche (refonte, tranche R3, scénario « La recherche par mots ») : un champ
// nommé « Rechercher » sans étiquette visible (son texte d'attente suffit), qui dit chaque frappe à
// l'écran, une croix « Effacer la recherche » dans un cadre de 44 points, Échap qui vide le champ,
// le focus qui reste après Entrée sur le web, et un double envoi qui ne cherche qu'une fois.
// Il ressemble à TextField (nom, effacement, focus) ; ses gardes sont reprises ici.
import { layout, textStyles } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Platform, StyleSheet, TextInput, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Button } from './Button'
import { SearchField } from './SearchField'
import { TAP_GUARD_MS } from './tapGuard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Les textes viennent des traductions (le composant reçoit le nom et le texte d'attente en
// propriétés ; le nom de la croix, il le lit lui-même).
const label = fr.t(($) => $.search.label)
const placeholder = fr.t(($) => $.search.placeholder)
const clearLabel = fr.t(($) => $.search.clear)
const cancelLabel = fr.t(($) => $.common.cancel)

/** Le style aplati d'un élément (ou d'un parent absent : rien). */
const styleOf = (element: { props: { style?: unknown } } | null | undefined) =>
  (StyleSheet.flatten(element?.props.style as ViewStyle) ?? {}) as ViewStyle

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

// R3, relectures de `136453b` (interface C5, design 5) : la saisie fait 44 points de haut ; toucher
// la loupe ou le bord de la pilule donne le focus à la saisie ; « Annuler » de la page de recherche
// est posé par le champ, qui le fait passer dessous quand le texte est grand.
describe('SearchField, its frame and its action', () => {
  it('keeps the input itself 44 points high', async () => {
    await renderWithProviders(
      <SearchField value="" onChangeText={() => {}} label={label} placeholder={placeholder} />,
    )

    expect(frameOf(field()).height).toBeGreaterThanOrEqual(layout.touchTarget)
  })

  it('gives the focus to the input when the magnifier or the edge of the pill is touched', async () => {
    // La saisie simulée de React Native a déjà une `focus` espionnée, qui garde les appels des tests
    // d'avant (la croix rend le focus) : on repart de zéro.
    const focus = jest.spyOn(TextInput.prototype, 'focus')
    focus.mockClear()
    try {
      await renderWithProviders(
        <SearchField value="" onChangeText={() => {}} label={label} placeholder={placeholder} />,
      )

      // La pilule, autour de la saisie : la loupe et le bord en font partie.
      const pill = field().parent
      expect(pill).toBeTruthy()
      await fireEvent.press(pill as NonNullable<typeof pill>)

      expect(focus).toHaveBeenCalledTimes(1)
    } finally {
      focus.mockRestore()
    }
  })

  it('shows its action (« Annuler ») next to it, and adds no control of its own', async () => {
    const onCancel = jest.fn()
    await renderWithProviders(
      <SearchField
        value=""
        onChangeText={() => {}}
        label={label}
        placeholder={placeholder}
        action={<Button label={cancelLabel} variant="glass" size="compact" onPress={onCancel} />}
      />,
    )

    await fireEvent.press(screen.getByRole('button', { name: cancelLabel }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    // La pilule ni la mesure du texte ne sont des contrôles : un seul bouton, et le champ.
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(field()).toBeTruthy()
  })

  it('lets its action go below it once the text is large (the field asks for more room)', async () => {
    await renderWithProviders(
      <SearchField
        value=""
        onChangeText={() => {}}
        label={label}
        placeholder={placeholder}
        action={<Button label={cancelLabel} variant="glass" size="compact" onPress={() => {}} />}
      />,
    )

    /** La place que le champ demande dans sa rangée (sa `flexBasis`), et la rangée elle-même. */
    const cell = () => {
      let node = field().parent
      while (node && typeof styleOf(node).flexBasis !== 'number') node = node.parent
      return node
    }
    const row = cell()?.parent
    expect(styleOf(row).flexWrap).toBe('wrap')
    const normal = styleOf(cell()).flexBasis as number

    // Le texte doublé : la ligne de mesure, cachée, fait deux fois la hauteur d'une ligne.
    const probe = screen.getByText(placeholder, { includeHiddenElements: true })
    let measured = probe.parent
    while (measured && !measured.props.onLayout) measured = measured.parent
    await fireEvent(measured as NonNullable<typeof measured>, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 2 * textStyles.body.lineHeight } },
    })

    expect(styleOf(cell()).flexBasis).toBe(2 * normal)
  })
})
