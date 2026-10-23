// Tests de la fenêtre de confirmation (Dialog) : son titre, son message, ses boutons, le contenu
// qu'elle rappelle (tranche 7a), et sa fermeture. Qu'elle défile quand elle dépasse de l'écran ne se
// mesure pas ici (Jest ne calcule aucune position) : c'est l'essai --explore de la fenêtre à 200 %
// de texte et en paysage qui le prouve.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Dialog } from './Dialog'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const props = {
  visible: true,
  title: 'Retirer ce contenu ?',
  message: 'Les autres membres ne le verront plus.',
}

describe('Dialog', () => {
  it('shows its title, its message and its buttons', async () => {
    await renderWithProviders(
      <Dialog {...props} onDismiss={jest.fn()}>
        <Button label="Retirer" variant="confirm" onPress={jest.fn()} />
      </Dialog>,
    )

    expect(screen.getByRole('header', { name: 'Retirer ce contenu ?' })).toBeTruthy()
    expect(screen.getByText('Les autres membres ne le verront plus.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retirer' })).toBeTruthy()
  })

  it('recalls the content it acts on, its kind and its text, in three lines at most', async () => {
    const text = 'Envoie-moi le code de ta carte, je te débloque la version pro.'
    await renderWithProviders(
      <Dialog {...props} quote={{ label: 'Commentaire', text }} onDismiss={jest.fn()}>
        <Button label="Retirer" variant="confirm" onPress={jest.fn()} />
      </Dialog>,
    )

    expect(screen.getByText('Commentaire')).toBeTruthy()
    expect(screen.getByText(text).props.numberOfLines).toBe(3)
  })

  it('recalls nothing when it is given no content', async () => {
    await renderWithProviders(
      <Dialog {...props} onDismiss={jest.fn()}>
        <Button label="Retirer" variant="confirm" onPress={jest.fn()} />
      </Dialog>,
    )

    expect(screen.getByText('Les autres membres ne le verront plus.')).toBeTruthy() // témoin
    expect(screen.queryByText('Commentaire')).toBeNull()
  })

  it('closes through its « Annuler »', async () => {
    const onDismiss = jest.fn()
    await renderWithProviders(
      <Dialog {...props} onDismiss={onDismiss}>
        <Button label="Annuler" variant="secondary" onPress={onDismiss} />
      </Dialog>,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('shows nothing while closed', async () => {
    await renderWithProviders(
      <Dialog {...props} visible={false} onDismiss={jest.fn()}>
        <Button label="Retirer" variant="confirm" onPress={jest.fn()} />
      </Dialog>,
    )

    expect(screen.queryByRole('header', { name: 'Retirer ce contenu ?' })).toBeNull()
  })
})
