// Tests de la feuille de la page de sortie (R5a) : ce qu'elle dit, ses deux boutons, la ligne « La
// démo de … » et la place gardée pour elle.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { LeavingSheet } from './LeavingSheet'

const origin = {
  text: 'La démo de Carnet de cafés, ajoutée par Léa',
  author: { name: 'Léa', source: null },
}
const noop = () => {}

describe('LeavingSheet', () => {
  it('says where the link leads, as a level 1 title, then the site and its address', async () => {
    await renderWithProviders(
      <LeavingSheet
        host="carnet-cafes.vercel.app"
        href="https://carnet-cafes.vercel.app/essai"
        origin={null}
        onOpen={noop}
        onStay={noop}
      />,
    )

    expect(screen.getByRole('header', { name: fr.t(($) => $.leaving.to) })).toBeTruthy()
    expect(screen.getByText('carnet-cafes.vercel.app')).toBeTruthy()
    expect(screen.getByText('https://carnet-cafes.vercel.app/essai')).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.leaving.warningTitle))).toBeTruthy()
  })

  it('opens the site or stays, each with its own button', async () => {
    const onOpen = jest.fn()
    const onStay = jest.fn()
    await renderWithProviders(
      <LeavingSheet
        host="a.example"
        href="https://a.example/"
        origin={null}
        {...{ onOpen, onStay }}
      />,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Ouvrir le site' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Rester sur Waiggle' }))
    expect(onStay).toHaveBeenCalledTimes(1)
  })

  it('shows whose demo it is, the photo hidden from screen readers', async () => {
    await renderWithProviders(
      <LeavingSheet
        host="a.example"
        href="https://a.example/"
        origin={origin}
        onOpen={noop}
        onStay={noop}
      />,
    )

    expect(screen.getByText(origin.text)).toBeTruthy()
    // La photo est un décor : la phrase nomme déjà l'autrice, rien n'est lu deux fois.
    expect(screen.queryByLabelText('Léa')).toBeNull()
  })

  it('keeps the place of the line, empty and silent, while it may still come', async () => {
    await renderWithProviders(
      <LeavingSheet
        host="a.example"
        href="https://a.example/"
        origin={null}
        holdOrigin
        onOpen={noop}
        onStay={noop}
      />,
    )

    // Témoin : la feuille est là.
    expect(screen.getByRole('button', { name: 'Ouvrir le site' })).toBeTruthy()
    expect(screen.queryByText(/La démo de/)).toBeNull()
  })
})
