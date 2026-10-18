// Tout lien vers un site extérieur passe par la page d'avertissement « Tu quittes… ».
import { sourceUrl } from '@ruche/brand'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Pressable, Text } from 'react-native'
import { useOpenOutside } from './links'

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

describe('useOpenOutside', () => {
  it('opens the warning page with the address, never the website directly', async () => {
    await render(<SeeTheCode />)

    await fireEvent.press(screen.getByRole('link'))

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/out', params: { url: sourceUrl } })
  })
})
