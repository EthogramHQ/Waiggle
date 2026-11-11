// Tests du pied d'écran posé depuis le contenu (R7b, K12) : sur téléphone, Screen le colle en bas,
// hors de la zone qui défile ; sur ordinateur, il reste à sa place dans le contenu ; parti avec son
// onglet, le pied s'en va aussi.
//
// Jest ne calcule aucune position : « collé en bas » se lit dans l'arbre (aucun ScrollView autour).
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { Button } from './Button'
import { Screen } from './Screen'
import { ScreenFooterSlot } from './ScreenFooterSlot'
import { Text } from './Text'

jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useIsFocused: () => true,
}))

type TreeNode = { type: unknown; parent: TreeNode | null }
/** Vrai si l'élément est dans la zone qui défile de l'écran. */
const insideScroller = (element: unknown) => {
  let node = element as TreeNode | null
  while (node) {
    if (node.type === 'RCTScrollView') return true
    node = node.parent
  }
  return false
}

/** Un écran dont le contenu pose un pied, qu'un bouton retire (un onglet qu'on quitte). */
const Sample = () => {
  const [shown, setShown] = useState(true)
  return (
    <Screen title="Le fil">
      <Text>Le contenu</Text>
      <Button label="Retirer le pied" onPress={() => setShown(false)} />
      {shown ? (
        <ScreenFooterSlot>
          <Button label="Envoyer la réponse" onPress={() => {}} />
        </ScreenFooterSlot>
      ) : null}
    </Screen>
  )
}

describe('a footer set from the content of a screen', () => {
  it('is pinned out of the scrolling area on a phone', async () => {
    await renderWithProviders(<Sample />)

    expect(insideScroller(screen.getByText('Le contenu'))).toBe(true) // témoin
    expect(insideScroller(screen.getByRole('button', { name: 'Envoyer la réponse' }))).toBe(false)
  })

  it('stays in the content on a wide window', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(<Sample />)

      expect(insideScroller(screen.getByRole('button', { name: 'Envoyer la réponse' }))).toBe(true)
    } finally {
      restore()
    }
  })

  it('leaves with the content that set it', async () => {
    await renderWithProviders(<Sample />)
    expect(screen.getByRole('button', { name: 'Envoyer la réponse' })).toBeTruthy()

    await fireEvent.press(screen.getByRole('button', { name: 'Retirer le pied' }))

    expect(screen.queryByRole('button', { name: 'Envoyer la réponse' })).toBeNull()
  })

  it('stays where it is out of a screen', async () => {
    await renderWithProviders(
      <ScreenFooterSlot>
        <Text>Seul</Text>
      </ScreenFooterSlot>,
    )
    expect(screen.getByText('Seul')).toBeTruthy()
  })
})
