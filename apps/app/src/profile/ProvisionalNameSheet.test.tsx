// Tests de la feuille « Choisis un nouveau pseudo » (R9, 7d ; planche R9-Activite-Moderation, choix 6
// de la session, décision L3 de Louis). Quand la modération a retiré son pseudo (ou son nom), le
// membre s'appelle « @membre_4f2a » (ou « Membre ») partout ; à sa visite suivante, cette feuille
// lui propose d'en choisir un autre. « Plus tard » la ferme ; un bandeau reste sur « Moi ».
//
// L'API fixée au plan : `ProvisionalNameSheet({ me: Me; otherSheetOpen: boolean })`, montée une fois
// dans le cadre de l'appli. Elle s'ouvre :
// - seulement si `me.provisional.handle` (ou `.name`) est vrai ;
// - après `useHydrated()` (la page web pré-rendue ne connaît pas le membre) ;
// - jamais par-dessus une autre feuille (`otherSheetOpen`, relecture de l'interface P8) : elle attend
//   que l'autre se ferme ;
// - une fois par visite : fermée, elle ne revient pas tant qu'elle reste montée (le cadre de l'appli
//   vit toute la visite), même quand le profil est relu ou qu'une autre feuille s'ouvre et se ferme.
//
// Le choix part par PATCH /v1/me (`{ handle }` ou `{ name }`) : le client réseau est remplacé, et
// profile/api garde son vrai code (la fonction qui l'envoie n'est pas fixée).
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH, type Me } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { request } from '../api/client'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ProvisionalNameSheet } from './ProvisionalNameSheet'

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
  usePathname: () => '/',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))
// La page hydratée ou non : le test décide (vraie sur téléphone, fausse au pré-rendu web).
let mockHydrated = true
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: () => mockHydrated,
}))

/** Le pseudo provisoire mis d'office (quatre signes au hasard, sans tiret). */
const provisionalHandle = 'membre_4f2a'

/** Léa, son pseudo retiré par la modération : elle est « @membre_4f2a » partout. */
const handleRemoved: Me = {
  ...leaMe,
  handle: provisionalHandle,
  provisional: { name: false, handle: true },
}
/** Léa, son nom retiré : elle s'appelle « Membre » partout. */
const nameRemoved: Me = { ...leaMe, name: 'Membre', provisional: { name: true, handle: false } }
/** Léa, ses nom et pseudo à elle. */
const ownNames: Me = { ...leaMe, provisional: { name: false, handle: false } }

const handleTitle = fr.t(($) => $.profile.provisional.handleTitle)
const later = fr.t(($) => $.profile.provisional.later)

/** Ce qui est parti sur le réseau (écritures seulement). */
let sent: { method: string; path: string; body: unknown }[]
/** La réponse du serveur à PATCH /v1/me. */
let patchAnswer: { ok: true } | { ok: false; error: string }

/** La feuille montée comme le cadre de l'appli la monte. */
const sheet = (me: Me, otherSheetOpen = false) => (
  <ProvisionalNameSheet me={me} otherSheetOpen={otherSheetOpen} />
)

/** Le titre de la feuille, s'il est à l'écran. */
const titleShown = (title = handleTitle) => screen.queryByRole('header', { name: title }) !== null

beforeEach(() => {
  mockHydrated = true
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  sent = []
  patchAnswer = { ok: true }
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (path: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'GET') return { ok: false, error: 'notFound' }
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
      sent.push({ method, path, body })
      if (!patchAnswer.ok) return patchAnswer
      return {
        ok: true,
        data: { ...leaMe, ...body, provisional: { name: false, handle: false } },
      }
    }) as unknown as typeof request)
})

describe('ProvisionalNameSheet, the handle (R9)', () => {
  it('asks for a new handle, says the provisional one, and when the former one comes back', async () => {
    await renderWithProviders(sheet(handleRemoved))

    expect(await screen.findByRole('header', { name: handleTitle })).toBeTruthy()
    expect(
      screen.getByText(
        containing(fr.t(($) => $.profile.provisional.handleLead, { handle: provisionalHandle })),
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(
        containing(
          fr.t(($) => $.profile.provisional.handleRule, {
            min: HANDLE_MIN_LENGTH,
            max: HANDLE_MAX_LENGTH,
          }),
        ),
      ),
    ).toBeTruthy()
    // Décision L3 : l'ancien pseudo revient après une contestation, s'il n'en a pas choisi d'autre.
    expect(
      screen.getByText(containing(fr.t(($) => $.profile.provisional.restoreNote))),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: later })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: fr.t(($) => $.profile.provisional.chooseHandle) }),
    ).toBeTruthy()
  })

  it('opens nothing when her name and handle are her own', async () => {
    await renderWithProviders(sheet(ownNames))

    // Témoin : la même feuille s'ouvre pour un pseudo provisoire (premier test) ; ici, rien.
    await waitFor(() => expect(titleShown()).toBe(false))
    expect(
      screen.queryByText(containing(fr.t(($) => $.profile.provisional.restoreNote))),
    ).toBeNull()
  })

  it('waits for the page to be hydrated before opening', async () => {
    mockHydrated = false
    const { rerender } = await renderWithProviders(sheet(handleRemoved))

    expect(titleShown()).toBe(false)

    mockHydrated = true
    await rerender(sheet(handleRemoved))

    expect(await screen.findByRole('header', { name: handleTitle })).toBeTruthy()
  })

  it('never opens over another sheet, and opens once that one is closed', async () => {
    const { rerender } = await renderWithProviders(sheet(handleRemoved, true))

    expect(titleShown()).toBe(false)

    await rerender(sheet(handleRemoved, false))

    expect(await screen.findByRole('header', { name: handleTitle })).toBeTruthy()
  })

  it('closes with « Plus tard » and does not come back during the visit', async () => {
    const { rerender } = await renderWithProviders(sheet(handleRemoved))
    await screen.findByRole('header', { name: handleTitle })

    await fireEvent.press(screen.getByRole('button', { name: later }))
    await waitFor(() => expect(titleShown()).toBe(false))

    // Le profil relu (un nouvel objet), une autre feuille ouverte puis fermée : elle ne revient pas.
    await rerender(sheet({ ...handleRemoved }, true))
    await rerender(sheet({ ...handleRemoved }, false))

    expect(titleShown()).toBe(false)
    expect(sent).toEqual([])
  })

  it('sends the chosen handle, then closes', async () => {
    await renderWithProviders(sheet(handleRemoved))
    await screen.findByRole('header', { name: handleTitle })

    await fireEvent.changeText(
      screen.getByLabelText(fr.t(($) => $.profile.fields.handle)),
      'ines_ciel',
    )
    await fireEvent.press(
      screen.getByRole('button', { name: fr.t(($) => $.profile.provisional.chooseHandle) }),
    )

    await waitFor(() =>
      expect(sent).toEqual([{ method: 'PATCH', path: '/v1/me', body: { handle: 'ines_ciel' } }]),
    )
    await waitFor(() => expect(titleShown()).toBe(false))
  })

  it('says the handle is taken, and stays open to choose another one', async () => {
    patchAnswer = { ok: false, error: 'handleTaken' }
    await renderWithProviders(sheet(handleRemoved))
    await screen.findByRole('header', { name: handleTitle })

    await fireEvent.changeText(
      screen.getByLabelText(fr.t(($) => $.profile.fields.handle)),
      'karim_le_vrai',
    )
    await fireEvent.press(
      screen.getByRole('button', { name: fr.t(($) => $.profile.provisional.chooseHandle) }),
    )

    expect(await screen.findByText(containing(fr.t(($) => $.errors.handleTaken)))).toBeTruthy()
    expect(titleShown()).toBe(true)
  })
})

describe('ProvisionalNameSheet, the name (R9)', () => {
  const nameTitle = fr.t(($) => $.profile.provisional.nameTitle)

  it('asks for a new name, saying the provisional one', async () => {
    await renderWithProviders(sheet(nameRemoved))

    expect(await screen.findByRole('header', { name: nameTitle })).toBeTruthy()
    expect(
      screen.getByText(containing(fr.t(($) => $.profile.provisional.nameLead, { name: 'Membre' }))),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: fr.t(($) => $.profile.provisional.chooseName) }),
    ).toBeTruthy()
  })

  it('sends the chosen name, then closes', async () => {
    await renderWithProviders(sheet(nameRemoved))
    await screen.findByRole('header', { name: nameTitle })

    await fireEvent.changeText(
      screen.getByLabelText(fr.t(($) => $.profile.fields.name)),
      'Léa Martin',
    )
    await fireEvent.press(
      screen.getByRole('button', { name: fr.t(($) => $.profile.provisional.chooseName) }),
    )

    await waitFor(() =>
      expect(sent).toEqual([{ method: 'PATCH', path: '/v1/me', body: { name: 'Léa Martin' } }]),
    )
    await waitFor(() => expect(titleShown(nameTitle)).toBe(false))
  })
})
