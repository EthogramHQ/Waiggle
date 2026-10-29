// Tests du fondu entre le jour et la nuit sur le web (scénario R1, « Le passage du jour à la nuit
// est un fondu, pendant lequel les textes restent lisibles ») et de la feuille de style de la page.
// Jest ne dessine rien : on vérifie l'attribut posé sur <html> et les règles CSS écrites. Le
// contraste à mi-course se mesure dans le navigateur (essai --explore).
import AsyncStorage from '@react-native-async-storage/async-storage'
import { durations, palettes } from '@ruche/brand'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Platform, Pressable, Text } from 'react-native'
import { documentCss, SCHEME_FADE_MS, SCHEME_FADING } from './document'
import { ThemeProvider, useTheme } from './ThemeProvider'

/** Un faux <html> qui retient ses attributs : c'est tout ce que le thème y lit et y écrit. */
const fakeRoot = () => {
  const attributes = new Map<string, string>()
  return {
    attributes,
    style: { setProperty: jest.fn() } as Record<string, unknown>,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  }
}

let root: ReturnType<typeof fakeRoot>
const fading = () => root.attributes.has(SCHEME_FADING)

beforeEach(async () => {
  await AsyncStorage.clear()
  jest.useFakeTimers()
  jest.replaceProperty(Platform, 'OS', 'web')
  root = fakeRoot()
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { documentElement: root, body: { style: {} } },
  })
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'document')
})

function Switcher() {
  const { scheme, setAppearance } = useTheme()
  return (
    <>
      <Text>{scheme}</Text>
      {(['day', 'night'] as const).map((choice) => (
        <Pressable key={choice} accessibilityRole="button" onPress={() => setAppearance(choice)}>
          <Text>{`to ${choice}`}</Text>
        </Pressable>
      ))}
    </>
  )
}

describe('the day / night fade (web)', () => {
  it('fades for the duration of the scheme token only, then stops fading', async () => {
    await render(
      <ThemeProvider>
        <Switcher />
      </ThemeProvider>,
    )
    expect(fading()).toBe(false)

    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'to night' })))
    expect(screen.getByText('night')).toBeTruthy()
    expect(fading()).toBe(true)

    await act(async () => jest.advanceTimersByTime(durations.scheme - 1))
    expect(fading()).toBe(true)
    await act(async () => jest.advanceTimersByTime(SCHEME_FADE_MS))
    expect(fading()).toBe(false)
  })

  // Témoin : un choix qui ne change pas ce qui est affiché ne lance aucun fondu.
  it('does not fade when the scheme shown stays the same', async () => {
    await render(
      <ThemeProvider>
        <Switcher />
      </ThemeProvider>,
    )
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'to day' })))
    expect(fading()).toBe(false)
  })

  it('leaves the page alone from a nested provider with a forced scheme', async () => {
    await render(
      <ThemeProvider appearance="day">
        <ThemeProvider appearance="night">
          <Text>inside</Text>
        </ThemeProvider>
      </ThemeProvider>,
    )
    // Seul le thème extérieur, le jour, règle la page : la couleur de focus de la nuit n'y est
    // jamais écrite, même un instant (React lance les effets du dedans avant ceux du dehors).
    expect(root.style.setProperty).toHaveBeenCalledWith('--focus-ring', palettes.day.focusRing)
    expect(root.style.setProperty).not.toHaveBeenCalledWith(
      '--focus-ring',
      palettes.night.focusRing,
    )
    expect(root.style.colorScheme).toBe('light')
  })
})

describe('the page stylesheet', () => {
  it('never fades the text color (it would pass through an unreadable grey)', () => {
    const properties = /transition-property:([^;]+);/.exec(documentCss)?.[1] ?? ''
    const faded = properties.split(',').map((property) => property.trim())
    expect(faded).toEqual(expect.arrayContaining(['background-color', 'border-color']))
    expect(faded).not.toContain('color')
    expect(faded).not.toContain('all')
  })

  it('draws a halo around the keyboard focus, from the theme variable', () => {
    expect(documentCss).toMatch(/box-shadow: 0 0 0 \d+px var\(--focus-halo/)
  })
})
