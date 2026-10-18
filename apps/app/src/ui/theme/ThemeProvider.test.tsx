// Tests du thème : le choix « Automatique / Jour / Nuit » de l'appareil (scénario « Choisir
// l'apparence » dans docs/scenarios/phase-1.md).
import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Pressable, Text, useColorScheme } from 'react-native'
import { ThemeProvider, useTheme } from './ThemeProvider'

// On décide nous-mêmes du mode clair ou sombre « de l'appareil ».
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}))

/** Affiche ce qui est réellement à l'écran, et un bouton par apparence. */
function Probe() {
  const { scheme, appearance, setAppearance } = useTheme()
  return (
    <>
      <Text>{`${appearance} → ${scheme}`}</Text>
      {(['auto', 'day', 'night'] as const).map((choice) => (
        <Pressable key={choice} accessibilityRole="button" onPress={() => setAppearance(choice)}>
          <Text>{choice}</Text>
        </Pressable>
      ))}
    </>
  )
}

beforeEach(async () => {
  await AsyncStorage.clear()
  jest.mocked(useColorScheme).mockReturnValue('light')
})

describe('ThemeProvider', () => {
  it('follows the device by default, even when it changes', async () => {
    const view = await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByText('auto → day')).toBeTruthy()

    jest.mocked(useColorScheme).mockReturnValue('dark')
    await view.rerender(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(screen.getByText('auto → night')).toBeTruthy()
  })

  it('switches at once and remembers the choice on this device', async () => {
    const view = await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'night' }))
    expect(screen.getByText('night → night')).toBeTruthy()
    await view.unmount()

    // L'appli est rouverte : le choix est relu sur l'appareil.
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    await waitFor(() => expect(screen.getByText('night → night')).toBeTruthy())
  })

  it('ignores a stored value it does not know', async () => {
    await AsyncStorage.setItem('appearance', 'purple')

    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    await act(async () => {}) // laisse le temps de relire le stockage

    expect(screen.getByText('auto → day')).toBeTruthy()
  })
})
