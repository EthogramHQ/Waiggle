// Tests de la déconnexion et de la suppression du compte (accounts/api.ts) : après une déconnexion
// réussie, la session du membre est oubliée dans l'appli. Le défaut (relecture de sécurité de la
// PR #62, S2) : Better Auth relit la session après la déconnexion sans la vider ; si cette relecture
// échoue (réseau, panne), il garde l'ancienne, et sur un appareil partagé la personne suivante
// voyait encore le nom et l'adresse du membre précédent dans les réglages.
import { Platform } from 'react-native'
import { deleteAccount, signOut } from './api'
import { authClient } from './auth-client'

// Le magasin de session de Better Auth (un « atome » nanostores : une valeur qu'on lit avec get et
// change avec set), remplacé par un faux qui garde simplement sa valeur.
jest.mock('./auth-client', () => {
  let value: Record<string, unknown> = {}
  return {
    authClient: {
      signOut: jest.fn(),
      deleteUser: jest.fn(),
      $store: {
        atoms: {
          session: {
            get: () => value,
            set: (next: Record<string, unknown>) => {
              value = next
            },
          },
        },
      },
    },
  }
})
jest.mock('../api/client', () => ({ apiFetch: jest.fn() }))

const sessionAtom = authClient.$store.atoms.session as unknown as {
  get: () => { data: unknown; error: unknown; isPending: boolean }
  set: (value: Record<string, unknown>) => void
}
const lea = { user: { id: 'u1', name: 'Léa', email: 'lea@example.com' }, session: { id: 's1' } }

beforeEach(() => {
  // Léa est connectée ; la relecture qui suivra la déconnexion échouera (Better Auth garde alors
  // `data`) : seul ce que fait l'appli elle-même peut la faire oublier.
  sessionAtom.set({ data: lea, error: null, isPending: false, isRefetching: false })
})

describe('signOut', () => {
  it('forgets the session in the app once the server has signed the member out', async () => {
    jest
      .mocked(authClient.signOut)
      .mockResolvedValue({ data: { success: true }, error: null } as never)

    await signOut()

    expect(sessionAtom.get().data).toBeNull()
    expect(sessionAtom.get().isPending).toBe(false)
  })

  it('keeps the session when the server refused to sign out (the member is still signed in)', async () => {
    jest
      .mocked(authClient.signOut)
      .mockResolvedValue({ data: null, error: { status: 500, statusText: 'Error' } } as never)

    await signOut()

    expect(sessionAtom.get().data).toBe(lea)
  })
})

describe('deleteAccount', () => {
  it('forgets the session in the app once the account is deleted', async () => {
    jest
      .mocked(authClient.deleteUser)
      .mockResolvedValue({ data: { success: true }, error: null } as never)

    await deleteAccount('correct horse')

    expect(sessionAtom.get().data).toBeNull()
  })
})

// Relecture de sécurité de la PR #64 (A2) : l'écran doit savoir si la déconnexion a abouti, pour le
// dire au membre au lieu de le ramener à l'accueil comme si de rien n'était.
describe('signOut result', () => {
  it('says the sign-out went through', async () => {
    jest
      .mocked(authClient.signOut)
      .mockResolvedValue({ data: { success: true }, error: null } as never)

    await expect(signOut()).resolves.toEqual({ ok: true })
  })

  it('says the server refused to sign out', async () => {
    jest
      .mocked(authClient.signOut)
      .mockResolvedValue({ data: null, error: { status: 500, statusText: 'Error' } } as never)

    await expect(signOut()).resolves.toEqual({ ok: false, error: 'generic' })
  })
})

// Relecture de sécurité de la PR #64 (A3) : sur téléphone, le plugin Expo garde une copie de la
// session dans le coffre-fort ; il ne la vide qu'à la déconnexion. Après la suppression du compte,
// l'appli se déconnecte donc aussi, pour qu'une appli relancée hors ligne ne montre plus ce compte.
describe('deleteAccount on a phone and on the web', () => {
  beforeEach(() => {
    jest
      .mocked(authClient.deleteUser)
      .mockResolvedValue({ data: { success: true }, error: null } as never)
    jest
      .mocked(authClient.signOut)
      .mockReset()
      .mockResolvedValue({ data: null, error: null } as never)
  })

  it('also signs out on a phone, which empties the stored session', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'ios')

    await deleteAccount('correct horse')

    expect(authClient.signOut).toHaveBeenCalledTimes(1)
    platform.restore()
  })

  it('still says the account is deleted when that sign-out fails', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android')
    jest.mocked(authClient.signOut).mockRejectedValue(new Error('network'))

    await expect(deleteAccount('correct horse')).resolves.toEqual({ ok: true })
    platform.restore()
  })

  it('does not sign out again on the web, where the server already cleared the cookie', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'web')

    await deleteAccount('correct horse')

    expect(authClient.signOut).not.toHaveBeenCalled()
    platform.restore()
  })
})
