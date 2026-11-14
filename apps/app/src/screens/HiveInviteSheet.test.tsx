// Tests de la feuille « Inviter dans Famille » (R10, docs/scenarios/refonte.md, « Inviter », planche
// R10-Inviter) : la recherche parmi les membres (2 lettres au moins), chaque résultat avec
// « Inviter Max Durand », « Déjà membre » ou « Invitation envoyée », la phrase sur le refus, l'aperçu
// « Ce que reçoit Max » (la carte que reçoit l'invité, en aperçu, avec ses trois promesses), le
// bouton qui devient « Invitation envoyée » sans perdre le focus, la double tape, et les sorties.
//
// Ce que ces tests supposent de l'écran (plan R10, UI-C4, « Ce qui change au plan » 9 et 15 ; à
// corriger si le code en décide autrement) : `HiveInviteSheet({ id })`, monté par
// `app/hives/[id]/invite.tsx`, ouvert par `useRouteSheet` (repli `/hives/<id>`) ; GET
// /v1/hives/<id> pour le nom ; GET /v1/hives/<id>/invitable?q= ; POST …/invitations `{ userId }`.
// L'aperçu est `ui/HiveInvitation` en mode `preview` : ses boutons sont dessinés, sans rôle. Le
// reste est dans `Hives.testkit.tsx`.
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { HiveInviteSheet } from './HiveInviteSheet'
import {
  acceptNamed,
  departures,
  heldReply,
  hiveId,
  hiveServer,
  ines,
  invitationLine,
  inviteNamed,
  inviteTitle,
  lea,
  max,
  nora,
  pressEscape,
  refusal,
  resetHiveMocks,
  rowWith,
  shown,
  T,
} from './Hives.testkit'

const kit = () => require('./Hives.testkit') as typeof import('./Hives.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => kit().mockExpoRouter())

beforeEach(() => {
  resetHiveMocks(`/hives/${hiveId}/invite`, { id: hiveId })
  mockSession({ user: { id: lea.id, name: lea.name } })
})

// --- Les aides ---

const SEARCH = new RegExp(`^/v1/hives/${hiveId}/invitable$`)
const INVITE = new RegExp(`^/v1/hives/${hiveId}/invitations$`)
const TITLE = inviteTitle('Famille')
const invites = () => hiveServer.received('POST', INVITE).map((one) => one.body)

/** Ouvre la feuille et attend son champ de recherche, puis la fin de la garde des tapes. */
const openSheet = async () => {
  const view = await renderWithProviders(
    <ToastProvider>
      <HiveInviteSheet id={hiveId} />
    </ToastProvider>,
  )
  await screen.findByLabelText(containing(T.inviteSearch))
  await passTapGuard()
  return view
}

const search = (text: string) =>
  fireEvent.changeText(screen.getByLabelText(containing(T.inviteSearch)), text)

/** Cherche « ma » et attend la ligne de Max. */
const findMax = async () => {
  await search('ma')
  return screen.findByRole('button', { name: inviteNamed(max.name) })
}

// --- Ce que la feuille montre ---

describe('the sheet « Inviter dans Famille »', () => {
  it('opens on « Inviter dans Famille », with the search and the phrase on refusals', async () => {
    await openSheet()

    expect(shown(TITLE)).toBe(true)
    expect(shown(T.invitePhrase)).toBe(true)
  })

  it('searches nothing under two letters, and says so', async () => {
    await openSheet()

    await search('m')

    expect(shown(T.inviteHint)).toBe(true)
    expect(hiveServer.received('GET', SEARCH)).toEqual([])
  })

  it('finds members by name, each with « Inviter Max Durand », « Déjà membre » or « Invitation envoyée »', async () => {
    await openSheet()

    // « na » : Nora Benali, déjà invitée.
    await search('na')
    await waitFor(() => expect(shown(nora.name)).toBe(true))
    expect(hiveServer.received('GET', SEARCH).at(-1)?.query.get('q')).toBe('na')
    expect(shown(T.inviteSent)).toBe(true)
    // « in » : Inès, déjà membre, sans bouton « Inviter ».
    await search('in')
    await waitFor(() => expect(shown(ines.name)).toBe(true))
    expect(shown(T.inviteMember)).toBe(true)
    expect(screen.queryByRole('button', { name: inviteNamed(ines.name) })).toBeNull()
  })

  it('previews the invitation with the component the invitee receives', async () => {
    await openSheet()
    await findMax()

    // « Ce que reçoit Max » (ou « la personne invitée ») : la carte de l'invité, à son nom à elle
    // (Léa l'invite), avec les trois promesses et « Refuser ne prévient personne. ».
    const previewTitle = fr.t(($) => $.hives.invite.previewTitle, { name: '' }).trim()
    expect(shown(previewTitle)).toBe(true)
    expect(shown(invitationLine(lea.name, 'Famille'))).toBe(true)
    for (const promise of T.promises) expect(shown(promise)).toBe(true)
    expect(shown(T.refuseHint)).toBe(true)
    // En aperçu, ses boutons sont dessinés mais ne se touchent pas : aucun rôle de bouton.
    expect(screen.queryByRole('button', { name: acceptNamed('Famille') })).toBeNull()
  })
})

// --- Inviter ---

describe('inviting a member', () => {
  it('sends the invitation of Max, and the button says « Invitation envoyée »', async () => {
    await openSheet()

    await fireEvent.press(await findMax())

    await waitFor(() => expect(invites()).toEqual([{ userId: max.id }]))
    await waitFor(() =>
      expect(
        rowWith(max.name, T.inviteSent).getByRole('button', { name: T.inviteSent }),
      ).toBeTruthy(),
    )
  })

  it('keeps the focus on the row once the invitation is sent', async () => {
    await openSheet()
    await fireEvent.press(await findMax())

    await waitFor(() => expect(invites()).toHaveLength(1))
    // Le même bouton change de nom sur la ligne de Max : il reste un bouton qu'on peut atteindre
    // (pas grisé, qui perdrait le focus au clavier), et aucun autre ne paraît à sa place.
    const sent = await waitFor(() =>
      rowWith(max.name, T.inviteSent).getByRole('button', { name: T.inviteSent }),
    )
    expect(sent).not.toBeDisabled()
    expect(screen.queryByRole('button', { name: inviteNamed(max.name) })).toBeNull()
  })

  it('sends one invitation on a double tap', async () => {
    const held = heldReply()
    hiveServer.answer('POST', INVITE, () => held.reply)
    await openSheet()
    const button = await findMax()

    await fireEvent.press(button)
    await fireEvent.press(button)

    expect(invites()).toHaveLength(1)
    await held.release({ status: 201 })
  })

  it('says the invitation could not leave, keeping « Inviter Max Durand »', async () => {
    hiveServer.answer('POST', INVITE, () => refusal(500, 'internal'))
    await openSheet()

    await fireEvent.press(await findMax())

    await waitFor(() => expect(shown(T.inviteError)).toBe(true))
    expect(screen.getByRole('button', { name: inviteNamed(max.name) })).toBeTruthy()
  })
})

// --- Les sorties ---

describe('leaving the invite sheet', () => {
  it('closes on « Fermer »', async () => {
    await openSheet()

    await fireEvent.press(screen.getByRole('button', { name: T.inviteClose }))

    expect(departures()).toBe(1)
  })

  it('closes on Escape', async () => {
    await openSheet()

    await pressEscape(TITLE)

    expect(departures()).toBe(1)
  })

  it('lets the browser Back close the sheet', async () => {
    await openSheet()
    await findMax()

    const event = await kit().navigatorRemoves()

    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('refuses the sheet of a hive the member is not in', async () => {
    hiveServer.pages.delete(hiveId)
    await renderWithProviders(<HiveInviteSheet id={hiveId} />)

    await waitFor(() => expect(shown(T.notFound) || departures() > 0).toBe(true))
    expect(screen.queryByLabelText(containing(T.inviteSearch))).toBeNull()
  })
})
