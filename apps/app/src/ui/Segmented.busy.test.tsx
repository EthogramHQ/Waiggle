// Tests du choix « occupé » d'un contrôle segmenté (R18, « Le premier chargement plus léger » ;
// plan, choix 6) : quand un choix prend du temps (la langue anglaise qui se charge), l'option touchée
// est annoncée occupée (`busy`, la valeur touchée), et l'option cochée reste cochée tant que le
// changement n'est pas fait. Rôle et nom de chaque option ne changent pas.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Segmented } from './Segmented'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Lang = 'fr' | 'en'

const languages = (busy?: Lang) =>
  renderWithProviders(
    <Segmented<Lang>
      label="Langue"
      value="fr"
      onChange={jest.fn()}
      busy={busy}
      options={[
        { value: 'fr', label: 'FR', spokenLabel: 'Français' },
        { value: 'en', label: 'EN', spokenLabel: 'English' },
      ]}
    />,
  )

describe('Segmented with a busy option', () => {
  it('announces the touched option as busy and keeps the checked one', async () => {
    await languages('en')

    const english = screen.getByRole('radio', { name: 'English' })
    expect(english).toBeBusy()
    expect(english).not.toBeChecked()
    const french = screen.getByRole('radio', { name: 'Français' })
    expect(french).toBeChecked()
    expect(french).not.toBeBusy()
  })

  it('announces no option as busy without a busy value', async () => {
    // Témoin : sans `busy`, rien n'est occupé (le test du dessus ne passe pas par hasard).
    await languages()

    expect(screen.getByRole('radio', { name: 'English' })).not.toBeBusy()
    expect(screen.getByRole('radio', { name: 'Français' })).not.toBeBusy()
  })
})
