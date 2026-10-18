import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { getMe, updateProfile } from '../profile/api'
import { LanguageSync } from '../profile/LanguageSync'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { LanguageSwitcher } from './LanguageSwitcher'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))

beforeEach(() => {
  jest.mocked(updateProfile).mockReset()
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
})

describe('LanguageSwitcher', () => {
  it('saves the choice on the account of a signed-in member', async () => {
    mockSession({ user: { name: 'Léa' } })
    jest.mocked(updateProfile).mockResolvedValue({ ok: true, data: { ...leaMe, language: 'en' } })
    const { i18n } = await renderWithProviders(<LanguageSwitcher />)

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))

    expect(i18n.language).toBe('en')
    expect(updateProfile).toHaveBeenCalledWith({ language: 'en' })
  })

  it('only changes the screen language for a visitor', async () => {
    mockSession(null)
    const { i18n } = await renderWithProviders(<LanguageSwitcher />)

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))

    expect(i18n.language).toBe('en')
    expect(updateProfile).not.toHaveBeenCalled()
  })
})

describe('LanguageSync', () => {
  it('uses the language saved on the account, on any device', async () => {
    mockSession({ user: { name: 'Léa' } })
    jest.mocked(getMe).mockResolvedValue({ ...leaMe, language: 'en' })

    const { i18n } = await renderWithProviders(<LanguageSync />, 'fr')

    await waitFor(() => expect(i18n.language).toBe('en'))
  })

  it('leaves the device language alone for a visitor', async () => {
    mockSession(null)

    const { i18n } = await renderWithProviders(<LanguageSync />, 'fr')

    expect(i18n.language).toBe('fr')
    expect(getMe).not.toHaveBeenCalled()
  })
})
