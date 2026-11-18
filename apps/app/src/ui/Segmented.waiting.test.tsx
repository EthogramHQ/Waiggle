// Tests des choix qui attendent leur nombre (R16, planche R16-Recherche-Squelette-1920) : pendant la
// recherche, les onglets ont leur vrai nom et une pièce vide à la place du nombre ; seul le choix
// actif se choisit, les autres attendent (désactivés, sautés par les flèches). La place gardée se
// mesure dans le navigateur (Jest ne calcule aucune position).
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Segmented } from './Segmented'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Tab = 'all' | 'projects' | 'members' | 'tools'

const waitingTabs = (onChange: (value: Tab) => void, value: Tab = 'all') =>
  renderWithProviders(
    <Segmented<Tab>
      label="Résultats"
      fill={false}
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: 'Tout' },
        { value: 'projects', label: 'Projets', waiting: true },
        { value: 'members', label: 'Membres', waiting: true },
        { value: 'tools', label: 'Outils', waiting: true },
      ]}
    />,
  )

describe('Segmented choices that wait for their count', () => {
  const os = Platform.OS
  afterEach(() => {
    Platform.OS = os
  })

  it('names each waiting choice by its real name, without the count, and keeps “All” checked', async () => {
    await waitingTabs(jest.fn())
    expect(screen.getByLabelText('Résultats').props.accessibilityRole).toBe('radiogroup')
    expect(screen.getByRole('radio', { name: 'Tout', checked: true })).toBeTruthy()
    for (const name of ['Projets', 'Membres', 'Outils']) {
      expect(screen.getByRole('radio', { name, checked: false, disabled: true })).toBeTruthy()
    }
  })

  it('ignores a tap on a waiting choice, and still lets the checked one be pressed', async () => {
    const onChange = jest.fn()
    await waitingTabs(onChange)
    fireEvent.press(screen.getByRole('radio', { name: 'Projets' }))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('radio', { name: 'Tout' }))
    expect(onChange).toHaveBeenCalledWith('all')
  })

  it('keeps a waiting choice that is already checked enabled', async () => {
    await waitingTabs(jest.fn(), 'projects')
    expect(
      screen.getByRole('radio', { name: 'Projets', checked: true, disabled: false }),
    ).toBeTruthy()
  })

  it('skips the waiting choices with the arrows on the web', async () => {
    Platform.OS = 'web'
    const onChange = jest.fn()
    await waitingTabs(onChange)
    const all = screen.getByRole('radio', { name: 'Tout' })
    const preventDefault = jest.fn()
    fireEvent(all, 'keyDown', { key: 'ArrowRight', preventDefault })
    fireEvent(all, 'keyDown', { key: 'ArrowLeft', preventDefault })
    // Tous les voisins attendent : rien ne se choisit, et la page ne défile pas.
    expect(onChange).not.toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalledTimes(2)
  })
})
