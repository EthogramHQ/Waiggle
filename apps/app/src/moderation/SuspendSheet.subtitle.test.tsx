// Le sous-titre de la fenêtre « Suspendre » (R9, planche R9-Suspendre) : la photo du membre, son
// pseudo, « Compte récent » sous 14 jours d'inscription (comme la fiche de l'auteur), sa date
// d'inscription et ce qui a déjà été décidé. Et ce que la fenêtre dit quand la session manque.
// Un fichier à part : le formulaire est testé dans SuspendSheet.test.tsx.
import type { Member } from '@ruche/contracts'
import { nameOf } from '@ruche/i18n'
import { screen } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import { getMember } from '../members/api'
import { adminMe } from '../testing/fixtures'
import { leaPage } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { useDecide } from './api'
import { SuspendSheet, type SuspendSheetAuthor } from './SuspendSheet'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../members/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getMember = jest.fn()
  return {
    getMember,
    useMember: (id: string, enabled = true) =>
      useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled }),
  }
})
jest.mock('./api', () => ({ useDecide: jest.fn() }))

const leaForAdmin: Member = {
  ...leaPage,
  removedParts: [],
  moderation: { isAdmin: false, suspension: null, decisions: 2, canSuspend: true },
}
const DAY = 24 * 60 * 60 * 1000
/** La fiche de Léa, inscrite il y a `days` jours. */
const authorJoined = (days: number): SuspendSheetAuthor => ({
  handle: 'lea',
  joinedAt: new Date(Date.now() - days * DAY).toISOString(),
  removals: 1,
  suspensions: 0,
})
const title = fr.t(($) => $.moderation.suspend.title, { nameOf: nameOf('fr', 'Léa') })
const recent = fr.t(($) => $.moderation.authorCard.recent)

beforeEach(() => {
  mockSession({ user: { id: adminMe.id, name: adminMe.name } })
  jest.mocked(getMember).mockReset().mockResolvedValue(leaForAdmin)
  jest
    .mocked(useDecide)
    .mockReset()
    .mockReturnValue({ decide: jest.fn() } as unknown as ReturnType<typeof useDecide>)
})

const openSheet = async (author?: SuspendSheetAuthor) => {
  await renderWithProviders(
    <SuspendSheet memberId="u1" open onClose={jest.fn()} {...(author ? { author } : null)} />,
  )
  await screen.findByRole('header', { name: title })
}

describe('the subtitle of the sheet', () => {
  it('shows the photo of the member and « Compte récent » for an account of 3 days', async () => {
    await openSheet(authorJoined(3))
    expect(screen.getByRole('image', { name: 'Léa' })).toBeTruthy()
    expect(screen.getByText(recent)).toBeTruthy()
    expect(screen.getByText(containing('@lea'))).toBeTruthy()
  })

  it('says nothing of a recent account after 14 days', async () => {
    await openSheet(authorJoined(30))
    // Témoin : le sous-titre est là.
    expect(screen.getByText(containing('@lea'))).toBeTruthy()
    expect(screen.queryByText(recent)).toBeNull()
  })

  it('still shows the photo and the handle without the record of the queue', async () => {
    await openSheet()
    expect(screen.getByRole('image', { name: 'Léa' })).toBeTruthy()
    expect(screen.getByText(containing('@lea'))).toBeTruthy()
    expect(screen.queryByText(recent)).toBeNull()
  })
})

describe('without a session', () => {
  it('says the session has expired and offers to sign in again when the member read is refused', async () => {
    jest.mocked(getMember).mockReset().mockRejectedValue(new ApiError('unauthorized'))
    await renderWithProviders(<SuspendSheet memberId="u1" open onClose={jest.fn()} />)
    expect(await screen.findByText(fr.t(($) => $.states.expired))).toBeTruthy()
    expect(screen.getByRole('button', { name: fr.t(($) => $.states.signIn) })).toBeTruthy()
  })

  it('offers to sign in to a visitor without a session, and reads nothing', async () => {
    mockSession(null)
    await renderWithProviders(<SuspendSheet memberId="u1" open onClose={jest.fn()} />)
    expect(
      await screen.findByRole('header', { name: fr.t(($) => $.states.signedOutTitle) }),
    ).toBeTruthy()
    expect(getMember).not.toHaveBeenCalled()
  })
})
