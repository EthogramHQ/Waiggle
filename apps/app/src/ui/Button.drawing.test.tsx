// Tests du bouton seulement dessiné (`Button drawing`, tranche R10) : dans un aperçu (« Ce que
// reçoit Max »), la pilule se voit et son libellé se lit comme un texte, mais elle n'est ni un
// bouton, ni un arrêt du clavier, et un toucher ne fait rien.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('Button drawing', () => {
  it('shows its label without being a button', async () => {
    await renderWithProviders(<Button label="Rejoindre la ruche" onPress={() => {}} drawing />)

    expect(screen.getByText('Rejoindre la ruche')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('stays a button without `drawing`', async () => {
    await renderWithProviders(<Button label="Rejoindre la ruche" onPress={() => {}} />)

    expect(screen.getByRole('button', { name: 'Rejoindre la ruche' })).toBeTruthy() // témoin
  })

  it('has nothing to focus on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<Button label="Refuser" onPress={() => {}} drawing />)

      const label = screen.getByText('Refuser')
      // Aucun ancêtre focalisable : ni `tabIndex`, ni `focusable`, ni geste à lui.
      let node: typeof label | null = label
      while (node) {
        expect(node.props.tabIndex).toBeUndefined()
        expect(node.props.focusable).toBeUndefined()
        expect(node.props.onPress).toBeUndefined()
        node = node.parent
      }
      await fireEvent.press(label)
    } finally {
      jest.restoreAllMocks()
    }
  })
})
