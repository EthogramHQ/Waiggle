// Tests de la déconnexion et de la suppression du compte (accounts/api.ts) : après une déconnexion
// réussie, la session du membre est oubliée dans l'appli. Le défaut (relecture de sécurité de la
// PR #62, S2) : Better Auth relit la session après la déconnexion sans la vider ; si cette relecture
// échoue (réseau, panne), il garde l'ancienne, et sur un appareil partagé la personne suivante
// voyait encore le nom et l'adresse du membre précédent dans les réglages.
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
