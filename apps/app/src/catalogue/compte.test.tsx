// La section « Le compte » du catalogue (tranche R2) se dessine, avec ses composants dans tous
// leurs états : les onglets (un seul panneau, celui de l'onglet choisi), les rubriques des réglages
// (des liens, la rubrique ouverte dite « page actuelle »), la feuille posée dans la page et la vraie
// feuille ouverte par son bouton, « Nouvel essai possible à… » bloqué, et les pieds collés.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { AccountCatalogue } from './compte'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('AccountCatalogue', () => {
  it('shows the tabs, one panel at a time, and switches on press', async () => {
    await renderWithProviders(<AccountCatalogue />)

    expect(screen.getByRole('header', { name: 'Le compte' })).toBeTruthy()
    // Deux rangées d'onglets (sur le miel, puis groupée), deux onglets chacune.
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(screen.getAllByRole('tab', { name: 'Se connecter', selected: true })).toHaveLength(1)
    expect(screen.getAllByRole('tab', { name: 'Créer un compte', selected: true })).toHaveLength(1)
    // Chaque rangée montre le panneau de son onglet choisi, et lui seul.
    expect(screen.getAllByText(/Te revoilà/)).toHaveLength(1)
    expect(screen.getAllByText(/Bienvenue/)).toHaveLength(1)

    const [honeySignUp] = screen.getAllByRole('tab', { name: 'Créer un compte' })
    await fireEvent.press(honeySignUp as NonNullable<typeof honeySignUp>)

    expect(screen.getAllByRole('tab', { name: 'Créer un compte', selected: true })).toHaveLength(2)
    expect(screen.queryByText(/Te revoilà/)).toBeNull()
    expect(screen.getAllByText(/Bienvenue/)).toHaveLength(2)
  })

  it('lists the settings sections as links', async () => {
    await renderWithProviders(<AccountCatalogue />)

    expect(screen.getByRole('link', { name: 'Sécurité' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'À propos' })).toBeTruthy()
    expect(screen.getAllByRole('link')).toHaveLength(8)
  })

  it('shows the sheet in the page, with its close button and its footer, and opens the real one', async () => {
    await renderWithProviders(<AccountCatalogue />)

    // Deux feuilles posées dans la page (téléphone, ordinateur) : deux « Fermer ».
    expect(screen.getAllByRole('button', { name: 'Fermer' })).toHaveLength(2)
    expect(screen.getAllByRole('header', { name: 'Supprimer ton compte' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Supprimer définitivement' })).toHaveLength(1)

    await fireEvent.press(screen.getByRole('button', { name: 'Ouvrir la feuille' }))

    expect(screen.getAllByRole('header', { name: 'Supprimer ton compte' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Fermer' })).toHaveLength(3)
  })

  it('says at what time to try again, as a status, and frees the button by itself', async () => {
    jest.useFakeTimers()
    try {
      await renderWithProviders(<AccountCatalogue />)

      expect(screen.getByRole('status', { name: /^Nouvel essai possible à \d/ })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Se connecter' })).toBeEnabled()

      await fireEvent.press(screen.getByRole('button', { name: 'Simuler un refus de 6 secondes' }))
      expect(screen.getAllByRole('status', { name: /^Nouvel essai possible à \d/ })).toHaveLength(2)
      expect(screen.getByRole('button', { name: 'Se connecter' })).toBeDisabled()

      await act(() => jest.advanceTimersByTime(6000))
      expect(screen.getAllByRole('status', { name: /^Nouvel essai possible à \d/ })).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Se connecter' })).toBeEnabled()
      expect(screen.getByText('Libéré : le bouton est de nouveau actif.')).toBeTruthy()
    } finally {
      jest.useRealTimers()
    }
  })

  it('shows the pinned footers with one and two buttons', async () => {
    await renderWithProviders(<AccountCatalogue />)

    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Changer le mot de passe' })).toBeTruthy()
  })
})
