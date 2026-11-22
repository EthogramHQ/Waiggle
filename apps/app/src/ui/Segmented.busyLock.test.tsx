// Tests du contrôle segmenté figé pendant un choix en cours (R18, plan, choix 6) : tant qu'une
// option est occupée (`busy`, la langue anglaise qui se charge), aucun autre choix ne part, ni au
// toucher, ni au clavier sur le web (Espace, flèches) ; le contrôle n'est pas « inactif » pour
// autant. Complète `Segmented.busy.test.tsx`, qui vérifie l'annonce.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Segmented } from './Segmented'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Lang = 'fr' | 'en'

const onChange = jest.fn()

const languages = (busy?: Lang) =>
  renderWithProviders(
    <Segmented<Lang>
      label="Langue"
      value="fr"
      onChange={onChange}
      busy={busy}
      options={[
        { value: 'fr', label: 'FR', spokenLabel: 'Français' },
        { value: 'en', label: 'EN', spokenLabel: 'English' },
      ]}
    />,
  )

const key = (name: string) => ({ key: name, preventDefault: () => {} })

beforeEach(() => onChange.mockClear())

describe('Segmented while an option is busy', () => {
  it('ignores a second touch, on the busy option as on the checked one', async () => {
    await languages('en')

    await fireEvent.press(screen.getByRole('radio', { name: 'Français' }))
    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))
    expect(onChange).not.toHaveBeenCalled()
    // Occupé n'est pas inactif : l'option se lit toujours, et reste dans le parcours.
    expect(screen.getByRole('radio', { name: 'English' })).not.toBeDisabled()
  })

  it('ignores the keyboard too (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await languages('en')

      const french = screen.getByRole('radio', { name: 'Français' })
      await fireEvent(french, 'keyDown', key('ArrowRight'))
      await fireEvent(french, 'keyDown', key(' '))
      await fireEvent(screen.getByRole('radio', { name: 'English' }), 'keyDown', key('Enter'))
      expect(onChange).not.toHaveBeenCalled()
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('lets a choice go once nothing is busy', async () => {
    // Témoin : sans `busy`, le toucher et les flèches choisissent.
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await languages()

      await fireEvent.press(screen.getByRole('radio', { name: 'English' }))
      await fireEvent(screen.getByRole('radio', { name: 'Français' }), 'keyDown', key('ArrowRight'))
      expect(onChange.mock.calls).toEqual([['en'], ['en']])
    } finally {
      jest.restoreAllMocks()
    }
  })
})
