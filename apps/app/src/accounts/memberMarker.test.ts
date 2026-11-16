// Tests du marqueur de membre `waiggle_member` (tranche R12, plan, choix 9 et décision 14 de la
// relecture, UI C3 ; relecture juridique, « Le cookie waiggle_member ») : un cookie non secret posé
// par l'appli web sur son propre domaine quand une session existe, pour que le serveur web envoie
// une arrivée sur `/` vers le Fil. Il ne donne aucun droit. Il vit 7 jours et se repose à chaque
// session (un ordinateur familial ne le garde pas 180 jours) ; il est posé aussi pour une session
// d'avant le déploiement ; il s'efface quand il n'y a plus de session (déconnexion, 401, compte
// supprimé) ; une lecture de la session qui échoue (réseau, 429, serveur) ne l'efface pas.
//
// Ce que ces tests supposent du module (plan R12, « API des modules partagés », déplacé dans
// `src/accounts/` par la décision 14 ; à corriger si le code en décide autrement, en le disant) :
// - `MEMBER_MARKER = 'waiggle_member'`, `setMemberMarker(): void`, `clearMemberMarker(): void`,
//   qui écrivent `document.cookie` sur le web et ne font rien ailleurs ;
// - `useMemberMarkerSync(): void`, monté une fois à la racine (`app/_layout.tsx`), qui suit
//   `useMemberSession()` : connecté → pose ; personne de connecté → efface ; en attente ou en
//   erreur → rien.
// Le cookie se lit dans ce que l'appli écrit dans `document.cookie` (un faux document).
import { renderHook } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { mockSession } from '../testing/render'
import { useSession } from './api'
import {
  clearMemberMarker,
  MEMBER_MARKER,
  setMemberMarker,
  useMemberMarkerSync,
} from './memberMarker'

jest.mock('./api', () => ({ useSession: jest.fn() }))

const SEVEN_DAYS = 7 * 24 * 60 * 60

/** Ce que l'appli a écrit dans `document.cookie`, dans l'ordre. */
let writes: string[] = []

/** Les attributs d'une écriture, en minuscules (`max-age`, `path`…) ; le premier est le cookie. */
const attributesOf = (write: string): Map<string, string> =>
  new Map(
    write
      .split(';')
      .slice(1)
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .map((part) => {
        const [key = '', ...value] = part.split('=')
        return [key.trim().toLowerCase(), value.join('=').trim()] as const
      }),
  )

/** La durée de vie demandée, en secondes : par `Max-Age`, sinon par `Expires`. */
const lifetimeOf = (write: string): number | null => {
  const attributes = attributesOf(write)
  const maxAge = attributes.get('max-age')
  if (maxAge !== undefined) return Number(maxAge)
  const expires = attributes.get('expires')
  if (expires !== undefined) return Math.round((Date.parse(expires) - Date.now()) / 1000)
  return null
}

const isMarker = (write: string) => write.trim().startsWith(`${MEMBER_MARKER}=`)
/** Une écriture qui pose le marqueur (valeur 1, une vie positive). */
const sets = (write: string) =>
  isMarker(write) && write.trim().startsWith(`${MEMBER_MARKER}=1`) && (lifetimeOf(write) ?? 0) > 0
/** Une écriture qui l'efface (une vie nulle, ou une date passée). */
const clears = (write: string) => isMarker(write) && (lifetimeOf(write) ?? 1) <= 0

const setWrites = () => writes.filter(sets)
const clearWrites = () => writes.filter(clears)

/** Le temps d'un test : le web, et un document dont on note les écritures de cookie. */
let restorePlatform: () => void = () => {}
beforeEach(() => {
  writes = []
  const replaced = jest.replaceProperty(Platform, 'OS', 'web')
  restorePlatform = () => replaced.restore()
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      get cookie() {
        return ''
      },
      set cookie(value: string) {
        writes.push(value)
      },
    },
  })
})
afterEach(() => {
  restorePlatform()
  Reflect.deleteProperty(globalThis, 'document')
})

/** La session telle que Better Auth la rend : une erreur de lecture (statut HTTP). */
const mockSessionError = (status: number) =>
  jest.mocked(useSession).mockReturnValue({
    data: null,
    isPending: false,
    error: { status },
    refetch: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useSession>)

describe('the member marker, written by hand', () => {
  it('is named waiggle_member', () => {
    expect(MEMBER_MARKER).toBe('waiggle_member')
  })

  it('lives 7 days, for the whole site, sent on a first visit, over HTTPS only', () => {
    setMemberMarker()

    expect(setWrites()).toHaveLength(1)
    const write = setWrites()[0] ?? ''
    expect(Math.abs((lifetimeOf(write) ?? 0) - SEVEN_DAYS)).toBeLessThanOrEqual(60)
    const attributes = attributesOf(write)
    expect(attributes.get('path')).toBe('/')
    expect(attributes.get('samesite')?.toLowerCase()).toBe('lax')
    expect(attributes.has('secure')).toBe(true)
  })

  it('is erased for the whole site', () => {
    clearMemberMarker()

    expect(clearWrites()).toHaveLength(1)
    expect(attributesOf(clearWrites()[0] ?? '').get('path')).toBe('/')
  })

  it('writes nothing outside the web', () => {
    // La plateforme d'avant le test : celle de Jest, un téléphone (iOS).
    restorePlatform()
    restorePlatform = () => {}
    expect(Platform.OS).not.toBe('web') // témoin

    setMemberMarker()
    clearMemberMarker()

    expect(writes).toEqual([])
  })
})

describe('the member marker, following the session (UI C3)', () => {
  it('sets the marker for a session that already exists', async () => {
    // Un membre connecté avant le déploiement de R12 : sa session est là dès l'ouverture.
    mockSession({ user: { id: 'u1', name: 'Léa' } })

    await renderHook(() => useMemberMarkerSync())

    expect(setWrites()).toHaveLength(1)
    expect(clearWrites()).toHaveLength(0)
  })

  it('erases the marker once signed out', async () => {
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    const { rerender } = await renderHook(() => useMemberMarkerSync())
    expect(setWrites()).toHaveLength(1) // témoin : posé d'abord

    mockSession(null)
    await rerender({})

    expect(clearWrites()).toHaveLength(1)
  })

  it('erases the marker when the session is refused (401)', async () => {
    mockSessionError(401)

    await renderHook(() => useMemberMarkerSync())

    expect(clearWrites()).toHaveLength(1)
    expect(setWrites()).toHaveLength(0)
  })

  it('keeps the marker when the session read fails', async () => {
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    const { rerender } = await renderHook(() => useMemberMarkerSync())
    expect(setWrites()).toHaveLength(1) // témoin : posé d'abord

    // Un 429, un serveur en panne : on ne sait pas, on ne touche à rien.
    mockSessionError(429)
    await rerender({})
    mockSessionError(503)
    await rerender({})

    expect(clearWrites()).toHaveLength(0)
  })

  it('touches nothing while the session is being read', async () => {
    mockSession(null, true)

    await renderHook(() => useMemberMarkerSync())

    expect(writes.filter(isMarker)).toEqual([])
  })

  it('sets the marker again for a new session, so that it lives 7 days from then', async () => {
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    const { rerender } = await renderHook(() => useMemberMarkerSync())
    mockSession(null)
    await rerender({})

    mockSession({ user: { id: 'u2', name: 'Max' } })
    await rerender({})

    expect(setWrites()).toHaveLength(2)
  })
})
