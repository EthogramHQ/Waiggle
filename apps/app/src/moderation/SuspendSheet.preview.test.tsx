// L'aperçu « Ce que lira … » de la fenêtre « Suspendre » (R9, planche R9-Suspendre, C11), comme
// celui de « Retirer » : la notification que le membre recevra si la suspension est confirmée,
// remplie pendant qu'on choisit la durée et le fondement et qu'on écrit l'explication. Sur
// ordinateur, dans la colonne à droite du formulaire ; sur téléphone, sous le formulaire. Un fichier
// à part (un fichier par sujet) : le formulaire est testé dans SuspendSheet.test.tsx.
import type { Member } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { getMember } from '../members/api'
import { passTapGuard } from '../testing/dialog'
import { adminMe } from '../testing/fixtures'
import { leaPage } from '../testing/projects'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { useDecide } from './api'
import { SuspendSheet } from './SuspendSheet'

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
const explanation = 'Des liens d’arnaque publiés trois fois cette semaine.'
const previewTitle = fr.t(($) => $.moderation.removeSheet.preview, { name: 'Léa' })

beforeEach(() => {
  mockSession({ user: { id: adminMe.id, name: adminMe.name } })
  jest.mocked(getMember).mockReset().mockResolvedValue(leaForAdmin)
  jest
    .mocked(useDecide)
    .mockReset()
    .mockReturnValue({ decide: jest.fn() } as unknown as ReturnType<typeof useDecide>)
})

const openSheet = async (fromReport = false) => {
  await renderWithProviders(
    <SuspendSheet
      memberId="u1"
      open
      onClose={jest.fn()}
      {...(fromReport ? { fromReport: { kind: 'comment', id: 'c1' } } : null)}
    />,
  )
  await screen.findByRole('header', { name: previewTitle })
  await passTapGuard()
}

const radio = (name: string) => screen.getByRole('radio', { name: containing(name) })

describe('what the member will read', () => {
  it('names the member, says a person decided after the report, and how to contest', async () => {
    await openSheet(true)
    expect(screen.getByText(fr.t(($) => $.suspension.afterReport))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.suspension.contest))).toBeTruthy()
  })

  it('takes up the typed explanation, the ground and the duration as they are chosen', async () => {
    await openSheet()
    const said = fr.t(($) => $.suspension.explanation, { explanation })
    const rules = fr.t(($) => $.removal.grounds.rules)
    const indefinite = fr.t(($) => $.notifications.suspendedIndefinite)
    // Rien de choisi ni d'écrit : ni fondement, ni explication, ni fin.
    expect(screen.getByText(fr.t(($) => $.suspension.direct))).toBeTruthy()
    expect(screen.queryByText(said)).toBeNull()
    expect(screen.queryByText(rules)).toBeNull()
    expect(screen.queryByLabelText(indefinite)).toBeNull()

    await fireEvent.press(radio(fr.t(($) => $.moderation.durations.indefinite)))
    await fireEvent.press(radio(fr.t(($) => $.moderation.grounds.rules)))
    await fireEvent.changeText(
      screen.getByLabelText(fr.t(($) => $.moderation.explanation)),
      `  ${explanation}  `,
    )

    expect(screen.getByText(said)).toBeTruthy()
    expect(screen.getByText(rules)).toBeTruthy()
    // Le bandeau est un groupe nommé par son titre : la mesure et sa fin.
    expect(screen.getByLabelText(indefinite)).toBeTruthy()
  })

  it('is shown on a computer too, beside the form', async () => {
    const restore = setDesktopWindow()
    try {
      await openSheet()
      expect(screen.getByText(fr.t(($) => $.suspension.direct))).toBeTruthy()
    } finally {
      restore()
    }
  })
})
