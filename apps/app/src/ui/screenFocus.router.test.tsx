// Tests du signal « la route devient affichée » quand expo-router dit si la page est affichée
// (`useIsFocused`) sans donner sa clé (`useRoute`) : c'est ainsi que les tests des écrans et de la
// barre (TW-2 de RF) simulent une page qui devient affichée. Le nombre compte alors les arrivées vues
// par le composant lui-même.
import { render, screen } from '@testing-library/react-native'
import type { Context } from 'react'
import { Text } from 'react-native'
import { useScreenShownCount } from './screenFocus'

// `useIsFocused` suit un contexte du test ; pas de `useRoute`. `require` dans la fabrique : Jest la
// remonte en tête du fichier, avant les imports.
jest.mock('expo-router', () => {
  const { createContext: create, useContext } = require('react')
  const focus = create(true)
  return { MockFocus: focus, useIsFocused: () => useContext(focus) }
})
const Focus = (jest.requireMock('expo-router') as { MockFocus: Context<boolean> }).MockFocus

function Probe() {
  return <Text>{`count ${useScreenShownCount()}`}</Text>
}

const page = (focused: boolean) => (
  <Focus.Provider value={focused}>
    <Probe />
  </Focus.Provider>
)

describe('useScreenShownCount with a router that gives no route key', () => {
  // Le 0 de départ est aussi le témoin du faux routeur : hors d'un navigateur, le nombre vaut 1.
  it('stays at 0 while the page is mounted but hidden, then counts its arrival', async () => {
    const view = await render(page(false))
    expect(screen.getByText('count 0')).toBeTruthy()

    await view.rerender(page(true))

    expect(screen.getByText('count 1')).toBeTruthy()
  })

  it('counts the return to a page left mounted', async () => {
    const view = await render(page(true))
    await view.rerender(page(false))

    await view.rerender(page(true))

    expect(screen.getByText('count 2')).toBeTruthy()
  })
})
