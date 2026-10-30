// Tests du panneau d'entrée (AuthPanel, tranche R2) : deux onglets sur la carte d'ordinateur, un
// seul formulaire sur téléphone ; l'écran est prévenu quand on change d'onglet.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithI18n, setDesktopWindow } from '../testing/render'
import { AuthPanel } from './AuthPanel'
import { Text } from './Text'

const tabs = [
  { key: 'signIn', label: 'Se connecter', content: <Text>Formulaire de connexion</Text> },
  { key: 'signUp', label: 'Créer un compte', content: <Text>Formulaire d’inscription</Text> },
] as const

describe('AuthPanel', () => {
  it('shows only the chosen form on a phone, without tabs', async () => {
    await renderWithI18n(
      <AuthPanel
        label="Connexion ou inscription"
        tabs={tabs}
        selected="signUp"
        onSelect={jest.fn()}
      />,
    )

    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.getByText('Formulaire d’inscription')).toBeTruthy()
    expect(screen.queryByText('Formulaire de connexion')).toBeNull()
  })

  it('shows two tabs on a computer, the chosen one selected, and tells which one is pressed', async () => {
    const restore = setDesktopWindow()
    try {
      const onSelect = jest.fn()
      await renderWithI18n(
        <AuthPanel
          label="Connexion ou inscription"
          tabs={tabs}
          selected="signIn"
          onSelect={onSelect}
        />,
      )

      expect(screen.getByRole('tab', { name: 'Se connecter', selected: true })).toBeTruthy()
      expect(screen.getByRole('tab', { name: 'Créer un compte', selected: false })).toBeTruthy()
      expect(screen.getByText('Formulaire de connexion')).toBeTruthy()

      await fireEvent.press(screen.getByRole('tab', { name: 'Créer un compte' }))
      expect(onSelect).toHaveBeenCalledWith('signUp')
    } finally {
      restore()
    }
  })

  it('takes the presentation it is given, whatever the width (catalogue)', async () => {
    await renderWithI18n(
      <AuthPanel
        label="Connexion ou inscription"
        tabs={tabs}
        selected="signIn"
        onSelect={jest.fn()}
        presentation="tabs"
      />,
    )

    expect(screen.getByRole('tab', { name: 'Se connecter', selected: true })).toBeTruthy()
  })
})
