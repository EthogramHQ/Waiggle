// Le nom affiché de l'inscription montre sa limite de 30 caractères (décision du 1/11/2026), comme
// celui de Mon profil : le compteur « 3 / 30 » à côté de l'étiquette, avant même l'envoi.
import { screen } from '@testing-library/react-native'
import { renderWithI18n } from '../testing/render'
import { SignUpForm } from './SignUpForm'

jest.mock('../accounts/api', () => ({ signUp: jest.fn() }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

describe('the sign-up name', () => {
  it('shows its limit of 30 characters while the member types', async () => {
    await renderWithI18n(
      <SignUpForm draft={{ inviteCode: '', name: 'Léa', email: '' }} onDraft={jest.fn()} />,
    )

    expect(screen.getByText('3 / 30')).toBeTruthy()
  })
})
