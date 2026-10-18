// L'adresse affichée vient de l'URL : on ne montre qu'une vraie adresse e-mail.
import { screen } from '@testing-library/react-native'
import { useLocalSearchParams } from 'expo-router'
import { renderWithI18n } from '../testing/render'
import { CheckEmailScreen } from './CheckEmailScreen'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useLocalSearchParams: jest.fn(),
}))

describe('CheckEmailScreen', () => {
  it('reminds the member where the link was sent', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ email: 'lea@example.com' })
    await renderWithI18n(<CheckEmailScreen />)

    expect(screen.getByText(/lea@example\.com/)).toBeTruthy()
  })

  it('never shows a text slipped into the link instead of an address', async () => {
    jest
      .mocked(useLocalSearchParams)
      .mockReturnValue({ email: 'Ton compte est bloqué, appelle le 01 23 45 67 89' })
    await renderWithI18n(<CheckEmailScreen />)

    expect(screen.queryByText(/appelle/)).toBeNull()
    expect(
      screen.getByText(
        'Nous t’avons envoyé un lien par e-mail. Clique dessus pour activer ton compte.',
      ),
    ).toBeTruthy()
  })
})
