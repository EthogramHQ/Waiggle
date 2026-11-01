// Tests de « Adresse vérifiée », la page où mène le lien de l'e-mail de vérification (tranche R2).
// Relecture de sécurité C1 : l'adresse qui attendait sa vérification n'a plus de raison d'être
// gardée dans l'onglet ; sur un PC partagé, la personne suivante la lisait sur « Vérifie ta boîte
// mail ». La page l'oublie dès qu'elle s'affiche.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { PENDING_EMAIL_KEY, setPendingEmail } from '../accounts/pendingVerification'
import { renderWithProviders } from '../testing/render'
import { VerifiedScreen } from './VerifiedScreen'

jest.mock('expo-router', () => ({
  usePathname: () => '/verified',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
}))
// Sur le web, le premier écran prend la langue d'expo-localization (l'anglais en test) : français.
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'fr-FR', languageCode: 'fr' }],
}))

/** Un faux sessionStorage : une simple table, lue par le test. */
const stored = new Map<string, string>()
const fakeStorage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => {
    stored.set(key, value)
  },
  removeItem: (key: string) => {
    stored.delete(key)
  },
}

beforeEach(() => {
  stored.clear()
  Object.assign(globalThis, { sessionStorage: fakeStorage })
})

afterEach(() => {
  setPendingEmail(null)
  jest.restoreAllMocks()
})

describe('VerifiedScreen', () => {
  it('forgets the address that was waiting for its verification', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      setPendingEmail('ines.haddad@gmail.com')
      expect(stored.get(PENDING_EMAIL_KEY)).toBe('ines.haddad@gmail.com')

      await renderWithProviders(<VerifiedScreen />)

      // Témoin : la page est bien là.
      expect(await screen.findByRole('button', { name: 'Continuer' })).toBeTruthy()
      expect(stored.has(PENDING_EMAIL_KEY)).toBe(false)
    } finally {
      platform.restore()
    }
  })
})
