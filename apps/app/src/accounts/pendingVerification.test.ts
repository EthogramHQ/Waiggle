// Tests de l'adresse qui attend sa vérification (accounts/pendingVerification.ts) : où elle est
// gardée sur le web (le sessionStorage de l'onglet), et quand elle s'oublie. Relecture de sécurité
// de R2 (C1) : sur un PC partagé, l'adresse de la personne précédente restait dans l'onglet et
// s'affichait à la suivante sur « Vérifie ta boîte mail ». Elle s'efface donc après une connexion
// réussie, à la déconnexion et à la suppression du compte (ici), et sur « Adresse vérifiée »
// (VerifiedScreen.test.tsx).
import { Platform } from 'react-native'
import { deleteAccount, signIn, signOut } from './api'
import { authClient } from './auth-client'
import { PENDING_EMAIL_KEY, setPendingEmail } from './pendingVerification'

// Better Auth, remplacé : seules comptent ses réponses (connexion acceptée ou refusée).
jest.mock('./auth-client', () => ({
  authClient: {
    signIn: { email: jest.fn() },
    signOut: jest.fn(),
    deleteUser: jest.fn(),
  },
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

const email = 'ines.haddad@exemple.fr'
const credentials = { email, password: 'un-mot-de-passe-long' }

beforeEach(() => {
  stored.clear()
  jest.replaceProperty(Platform, 'OS', 'web')
  Object.assign(globalThis, { sessionStorage: fakeStorage })
  // Ce qu'a laissé l'inscription : l'adresse à vérifier, gardée dans l'onglet.
  setPendingEmail(email)
})

afterEach(() => {
  setPendingEmail(null)
  jest.restoreAllMocks()
})

describe('the address waiting for its verification', () => {
  it('is kept in the tab after the sign-up', () => {
    expect(stored.get(PENDING_EMAIL_KEY)).toBe(email)
  })

  it('is forgotten once a member signs in', async () => {
    jest.mocked(authClient.signIn.email).mockResolvedValue({ data: {}, error: null } as never)

    await expect(signIn(credentials)).resolves.toEqual({ ok: true })

    expect(stored.has(PENDING_EMAIL_KEY)).toBe(false)
  })

  it('stays while the sign-in is refused (the same person tries again)', async () => {
    jest.mocked(authClient.signIn.email).mockResolvedValue({
      data: null,
      error: { status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' },
    } as never)

    await signIn(credentials)

    expect(stored.get(PENDING_EMAIL_KEY)).toBe(email)
  })

  it('is forgotten when the member signs out', async () => {
    jest.mocked(authClient.signOut).mockResolvedValue({ data: {}, error: null } as never)

    await signOut()

    expect(stored.has(PENDING_EMAIL_KEY)).toBe(false)
  })

  it('is forgotten on sign-out even when the server does not answer', async () => {
    jest.mocked(authClient.signOut).mockRejectedValue(new Error('network'))

    await expect(signOut()).rejects.toThrow('network')

    expect(stored.has(PENDING_EMAIL_KEY)).toBe(false)
  })

  it('is forgotten when the account is deleted', async () => {
    jest.mocked(authClient.deleteUser).mockResolvedValue({ data: {}, error: null } as never)

    await expect(deleteAccount('un-mot-de-passe-long')).resolves.toEqual({ ok: true })

    expect(stored.has(PENDING_EMAIL_KEY)).toBe(false)
  })
})
