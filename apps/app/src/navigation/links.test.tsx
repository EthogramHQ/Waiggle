// Tout lien vers un site extérieur passe par la page d'avertissement « Tu quittes… ».
import { sourceUrl } from '@ruche/brand'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Pressable, Text } from 'react-native'
import { useOpenDemo, useOpenOutside } from './links'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

function SeeTheCode() {
  const openOutside = useOpenOutside()
  return (
    <Pressable accessibilityRole="link" onPress={() => openOutside(sourceUrl)}>
      <Text>Voir le code</Text>
    </Pressable>
  )
}

// R5a : la démo d'un projet dit aussi de quel projet elle vient (la page relit le projet).
function TryTheDemo() {
  const openDemo = useOpenDemo()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => openDemo('https://recettes.example.com', 'p1')}
    >
      <Text>Tester la démo</Text>
    </Pressable>
  )
}

describe('useOpenDemo', () => {
  it('opens the warning page with the address and the project it comes from', async () => {
    await render(<TryTheDemo />)

    await fireEvent.press(screen.getByRole('button', { name: 'Tester la démo' }))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/out',
      params: { url: 'https://recettes.example.com', project: 'p1' },
    })
  })
})

describe('useOpenOutside', () => {
  it('opens the warning page with the address, never the website directly', async () => {
    await render(<SeeTheCode />)

    await fireEvent.press(screen.getByRole('link'))

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/out', params: { url: sourceUrl } })
  })
})
