// La section « Modération » du catalogue (tranche 7a) se dessine, avec ses cartes dans tous leurs
// états : décisions proposées, envoi en cours, aucune décision (« Te concerne »), contenu retiré,
// carte décidée (le résultat à la place des boutons), panne ; et la fenêtre « Retirer ».
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { ModerationCatalogue } from './moderation'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('ModerationCatalogue', () => {
  it('shows the report card in all its states, and the moderation notifications', async () => {
    await renderWithProviders(<ModerationCatalogue />)

    expect(screen.getByRole('header', { name: 'Modération' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Retirer' })).toHaveLength(1)
    // Trois cartes à décider, et une quatrième dont la décision a échoué (ses boutons restent).
    expect(screen.getAllByRole('button', { name: 'Classer sans suite' }).length).toBe(4)
    expect(screen.getByRole('button', { name: 'Rétablir' })).toBeTruthy()
    expect(screen.getByText('Te concerne : un autre administrateur doit décider.')).toBeTruthy()
    // Une notification sans destination (signalement traité, cible plus visible) n'est pas un lien.
    expect(screen.getAllByRole('link', { name: /a été traité/ })).toHaveLength(1)
  })

  it('shows the cards once decided, the outcome in place of their buttons, and a failure', async () => {
    await renderWithProviders(<ModerationCatalogue />)

    expect(screen.getByRole('status', { name: 'Signalement classé sans suite.' })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Contenu retiré.' })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Contenu rétabli.' })).toBeTruthy()
    expect(
      screen.getByRole('status', {
        name: 'Une décision a déjà été prise sur ce contenu entre-temps.',
      }),
    ).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
    // Un commentaire retiré mène au projet qui le portait ; un projet retiré, nulle part.
    expect(screen.getAllByRole('link', { name: 'Voir le projet' })).toHaveLength(1)
  })

  it('opens the « Retirer » window, which recalls the content under its title', async () => {
    await renderWithProviders(<ModerationCatalogue />)

    await fireEvent.press(screen.getByRole('button', { name: 'Ouvrir la fenêtre « Retirer »' }))

    expect(screen.getByRole('header', { name: 'Retirer ce contenu ?' })).toBeTruthy()
    expect(screen.getByText(/^Lien douteux\. Lien douteux\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy()
  })
})
