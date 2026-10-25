// Tests de la fenêtre de confirmation (Dialog) : son titre, son message, ses boutons, le contenu
// qu'elle rappelle (tranche 7a), et sa fermeture. Qu'elle défile quand elle dépasse de l'écran ne se
// mesure pas ici (Jest ne calcule aucune position) : c'est l'essai --explore de la fenêtre à 200 %
// de texte et en paysage qui le prouve.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Dialog, TAP_GUARD_MS } from './Dialog'

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

  it('shows each paragraph of a longer message on its own', async () => {
    const paragraphs = ['Tu ne verras plus ses contenus.', 'Bloquer ne prévient pas la modération.']
    await renderWithProviders(
      <Dialog {...props} message={paragraphs} onDismiss={jest.fn()}>
        <Button label="Retirer" variant="confirm" onPress={jest.fn()} />
      </Dialog>,
    )

    // Chacun son texte (getByText exact) : aucun n'est collé à l'autre dans un seul paragraphe.
    expect(screen.getByText(paragraphs[0] as string)).toBeTruthy()
    expect(screen.getByText(paragraphs[1] as string)).toBeTruthy()
  })

  it('takes a tap at once when it is not guarded', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <Dialog {...props} onDismiss={jest.fn()}>
        <Button label="Retirer" variant="confirm" onPress={onPress} />
      </Dialog>,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Retirer' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  // La seconde tape d'une double tape sur le geste qui ouvre la fenêtre (« Bloquer » d'un menu)
  // tombait sur sa confirmation (relecture de design 7b, essais A, E, G). Que la tape tombe bien sous
  // le doigt ne se mesure pas ici : l'essai --explore de la double tape le prouve.
  describe('with guardTaps', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('ignores the taps on its buttons just after opening, then takes them', async () => {
      const onPress = jest.fn()
      await renderWithProviders(
        <Dialog {...props} guardTaps onDismiss={jest.fn()}>
          <Button label="Retirer" variant="confirm" onPress={onPress} />
        </Dialog>,
      )

      await fireEvent.press(screen.getByRole('button', { name: 'Retirer' }))
      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS - 50))
      await fireEvent.press(screen.getByRole('button', { name: 'Retirer' }))
      expect(onPress).not.toHaveBeenCalled()

      await act(() => jest.advanceTimersByTime(50))
      await fireEvent.press(screen.getByRole('button', { name: 'Retirer' }))
      expect(onPress).toHaveBeenCalledTimes(1)
    })

    it('guards again each time it opens', async () => {
      const onPress = jest.fn()
      const dialog = (visible: boolean) => (
        <Dialog {...props} visible={visible} guardTaps onDismiss={jest.fn()}>
          <Button label="Retirer" variant="confirm" onPress={onPress} />
        </Dialog>
      )
      await renderWithProviders(dialog(true))
      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))

      await screen.rerender(dialog(false))
      await screen.rerender(dialog(true))
      await fireEvent.press(screen.getByRole('button', { name: 'Retirer' }))

      expect(onPress).not.toHaveBeenCalled()
    })

    it('stays open when « Annuler » is touched during the guard', async () => {
      const onDismiss = jest.fn()
      await renderWithProviders(
        <Dialog {...props} guardTaps onDismiss={onDismiss}>
          <Button label="Annuler" variant="secondary" onPress={onDismiss} />
        </Dialog>,
      )

      await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))

      expect(onDismiss).not.toHaveBeenCalled()
      expect(screen.getByRole('header', { name: 'Retirer ce contenu ?' })).toBeTruthy()
    })
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
