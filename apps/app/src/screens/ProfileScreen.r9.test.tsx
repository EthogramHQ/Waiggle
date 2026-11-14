// Tests R9 de « Mon profil » pendant une suspension (scénario refonte.md, ## R9, « Un compte
// suspendu » ; jur-R5, décision L5 de Louis ; planche R9-Suspendu) : en plus de ce qu'il pouvait
// faire, un membre suspendu peut **retirer** sa bio, ses outils favoris et sa photo, sans en mettre
// d'autres. Trois boutons : « Retirer ma bio », « Retirer mes outils », « Retirer ma photo », chacun
// seulement s'il y a quelque chose à retirer. Après le geste, le bouton disparaît : le focus va au
// titre de la section (relecture de l'interface, P8), pas sur `body`.
//
// Ce qui part sur le réseau, sans fixer la fonction de profile/api qui l'envoie : PATCH /v1/me avec
// `{ bio: '' }` ou `{ favoriteTools: [] }` seuls (l'API refuse toute autre valeur, sec-P7), et
// DELETE /v1/me/avatar (route neuve de R9). Le client réseau (api/client) est donc remplacé, et
// profile/api garde son vrai code.
import type { Me } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { request, requestWithoutBody } from '../api/client'
import { suspendedMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { ProfileScreen } from './ProfileScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({
  request: jest.fn(),
  requestWithoutBody: jest.fn(),
  apiFetch: jest.fn(),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/settings/profile',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
}))
// Le focus posé après un geste : on garde le vrai code, et on lit à qui il est donné.
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    focusAndReveal: jest.fn(actual.focusAndReveal),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})

const removeBio = fr.t(($) => $.suspension.removeBio)
const removeTools = fr.t(($) => $.suspension.removeTools)
const removeAvatar = fr.t(($) => $.suspension.removeAvatar)

/** Léa, suspendue, avec une bio, deux outils favoris et une photo. */
const suspendedLea: Me = {
  ...suspendedMe,
  avatarUrl: 'https://api.example.com/media/avatars/lea.webp',
  provisional: { name: false, handle: false },
}

/** Le profil que le faux serveur rend, changé par chaque écriture acceptée. */
let current: Me
/** Ce qui est parti sur le réseau : la méthode, l'adresse, le corps lu. */
let sent: { method: string; path: string; body: unknown }[]
/** Vrai : le serveur refuse toute écriture (500). */
let failing: boolean
/** Tant que cette promesse n'est pas tenue, les écritures attendent leur réponse. */
let gate: Promise<void> | null

/** Le corps JSON d'une demande, ou null sans corps. */
const bodyOf = (init: RequestInit | undefined): unknown =>
  typeof init?.body === 'string' ? JSON.parse(init.body) : null

/** Un faux serveur : /v1/me relu et modifié, /v1/me/avatar effacé, le catalogue des outils vide. */
const answer = async (path: string, init?: RequestInit) => {
  const method = (init?.method ?? 'GET').toUpperCase()
  if (path === '/v1/tools') return { ok: true, data: { tools: [], others: [] } }
  if (method === 'GET' && path === '/v1/me') return { ok: true, data: current }
  sent.push({ method, path, body: bodyOf(init) })
  // Une réponse tenue en attente : une seconde tape arrive pendant l'écriture (code-appli.md).
  if (gate) await gate
  if (failing) return { ok: false, error: 'internal' }
  if (method === 'PATCH' && path === '/v1/me') {
    current = { ...current, ...(bodyOf(init) as Partial<Me>) }
    return { ok: true, data: current }
  }
  if (method === 'DELETE' && path === '/v1/me/avatar') {
    current = { ...current, avatarUrl: null }
    return { ok: true, data: current }
  }
  return { ok: false, error: 'notFound' }
}

/** Les écritures parties, sans les lectures. */
const writes = () => sent.map(({ method, path, body }) => ({ method, path, body }))

/** Le dernier élément qui a reçu le focus (clavier ou lecteur d'écran), ou null. */
const lastFocused = (): { props?: Record<string, unknown> } | null => {
  const calls = [focusWithoutScroll, focusAndReveal, moveReaderTo].flatMap((fn) => {
    const { calls: made, invocationCallOrder } = jest.mocked(fn).mock
    return made.map(([node], index) => ({ node, order: invocationCallOrder[index] ?? 0 }))
  })
  calls.sort((a, b) => a.order - b.order)
  return (calls.at(-1)?.node as { props?: Record<string, unknown> } | undefined) ?? null
}

/** Vrai si cet élément est un titre (Text `heading` : rôle « header », `aria-level` sur le web). */
const isHeading = (node: { props?: Record<string, unknown> } | null) =>
  node?.props?.accessibilityRole === 'header' ||
  node?.props?.role === 'heading' ||
  node?.props?.['aria-level'] !== undefined

/** « Mon profil » ouvert par Léa suspendue, une fois son profil lu. */
const renderLocked = async (me: Me = suspendedLea) => {
  current = me
  await renderWithProviders(<ProfileScreen />)
  await screen.findByText(containing(fr.t(($) => $.suspension.profileLocked)))
}

beforeEach(() => {
  mockSession({ user: { id: suspendedMe.id, name: suspendedMe.name } })
  sent = []
  failing = false
  gate = null
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(answer as typeof request)
  jest
    .mocked(requestWithoutBody)
    .mockReset()
    .mockImplementation((async (path: string, init?: RequestInit) => {
      const result = await answer(path, init)
      return result.ok ? { ok: true, data: null } : result
    }) as unknown as typeof requestWithoutBody)
  for (const fn of [focusWithoutScroll, focusAndReveal, moveReaderTo]) jest.mocked(fn).mockClear()
})

describe('« Mon profil » of a suspended member (R9, jur-R5)', () => {
  it('offers to remove the bio, tools and photo instead of saying the profile is locked', async () => {
    await renderLocked()

    expect(screen.getByRole('button', { name: removeBio })).toBeTruthy()
    expect(screen.getByRole('button', { name: removeTools })).toBeTruthy()
    expect(screen.getByRole('button', { name: removeAvatar })).toBeTruthy()
    // Toujours rien à écrire : ni champ, ni « Changer la photo », ni « Enregistrer ».
    expect(screen.queryByRole('button', { name: fr.t(($) => $.profile.avatar.change) })).toBeNull()
    expect(screen.queryByRole('button', { name: fr.t(($) => $.profile.save) })).toBeNull()
  })

  it('removes the bio alone, then says so and drops its button', async () => {
    await renderLocked()

    await fireEvent.press(screen.getByRole('button', { name: removeBio }))

    await waitFor(() =>
      expect(writes()).toEqual([{ method: 'PATCH', path: '/v1/me', body: { bio: '' } }]),
    )
    expect(await screen.findByText(containing(fr.t(($) => $.suspension.bioRemoved)))).toBeTruthy()
    expect(screen.queryByText(suspendedLea.bio)).toBeNull()
    await waitFor(() => expect(screen.queryByRole('button', { name: removeBio })).toBeNull())
    // Les deux autres restent.
    expect(screen.getByRole('button', { name: removeTools })).toBeTruthy()
  })

  it('moves the focus to the title of the section once « Retirer ma bio » is gone', async () => {
    await renderLocked()

    await fireEvent.press(screen.getByRole('button', { name: removeBio }))
    await waitFor(() => expect(screen.queryByRole('button', { name: removeBio })).toBeNull())

    // Le bouton touché a disparu : le focus ne retombe pas sur la page, il va au titre (P8).
    await waitFor(() => expect(isHeading(lastFocused())).toBe(true))
  })

  it('removes all the favourite tools at once, and nothing else', async () => {
    await renderLocked()

    await fireEvent.press(screen.getByRole('button', { name: removeTools }))

    await waitFor(() =>
      expect(writes()).toEqual([{ method: 'PATCH', path: '/v1/me', body: { favoriteTools: [] } }]),
    )
    expect(await screen.findByText(containing(fr.t(($) => $.suspension.toolsRemoved)))).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: removeTools })).toBeNull())
  })

  it('removes the photo by deleting it, without sending another one', async () => {
    await renderLocked()

    await fireEvent.press(screen.getByRole('button', { name: removeAvatar }))

    await waitFor(() =>
      expect(writes().map(({ method, path }) => ({ method, path }))).toEqual([
        { method: 'DELETE', path: '/v1/me/avatar' },
      ]),
    )
    expect(
      await screen.findByText(containing(fr.t(($) => $.suspension.avatarRemoved))),
    ).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: removeAvatar })).toBeNull())
  })

  it('offers only what there is to remove', async () => {
    await renderLocked({ ...suspendedLea, bio: '', avatarUrl: null })

    // Témoin : ses outils, eux, peuvent partir.
    expect(screen.getByRole('button', { name: removeTools })).toBeTruthy()
    expect(screen.queryByRole('button', { name: removeBio })).toBeNull()
    expect(screen.queryByRole('button', { name: removeAvatar })).toBeNull()
  })

  it('removes the bio only once for a double tap', async () => {
    await renderLocked()
    let release: () => void = () => {}
    gate = new Promise((resolve) => {
      release = resolve
    })

    const button = screen.getByRole('button', { name: removeBio })
    await fireEvent.press(button)
    await fireEvent.press(button)

    expect(writes()).toHaveLength(1)
    await act(async () => release())
  })

  it('says so and keeps the button when the removal could not be saved', async () => {
    await renderLocked()
    failing = true

    await fireEvent.press(screen.getByRole('button', { name: removeBio }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(screen.queryByText(containing(fr.t(($) => $.suspension.bioRemoved)))).toBeNull()
    expect(screen.getByRole('button', { name: removeBio })).toBeTruthy()
    expect(screen.getByText(suspendedLea.bio)).toBeTruthy()
  })
})

describe('« Mon profil » of a member who is not suspended (R9)', () => {
  it('offers none of the removals of a suspension, but every field', async () => {
    current = { ...suspendedLea, suspension: null }
    await renderWithProviders(<ProfileScreen />)

    // Témoin : le formulaire est là.
    expect(await screen.findByDisplayValue(suspendedLea.name)).toBeTruthy()
    for (const name of [removeBio, removeTools, removeAvatar]) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
  })
})
