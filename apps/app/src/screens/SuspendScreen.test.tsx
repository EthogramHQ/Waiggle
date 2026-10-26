// Tests de la page « Suspendre » (tranche 7c, « /suspend?member=<id> »). Scénario « Suspendre un
// compte » : Louis, administrateur, arrive depuis la page de Karim ou depuis une carte de la file,
// choisit une durée (7 jours, 30 jours, sans fin), le fondement et une explication, puis confirme.
// Si le compte est déjà suspendu, la page devient « Lever la suspension » : la raison (plus tôt,
// ou erreur, J10) et une explication.
//
// L'interface attendue (écrite par ui-dev) :
// - `src/screens/SuspendScreen.tsx` exporte `SuspendScreen`, de props
//   `{ memberId: string; fromKind?: string; fromId?: string }` : la route d'une ligne
//   `app/suspend.tsx` lit `?member=&fromKind=&fromId=` dans l'adresse (comme `app/report.tsx`).
//   `fromKind` et `fromId` : la cible du signalement d'où l'on vient (une carte de la file), envoyée
//   comme `fromReport` (relecture juridique J2) ;
// - la page lit le membre par `useMember(id)` (`src/members/api.ts`) : `Member.moderation` dit
//   s'il est suspendu (`suspension`) et s'il peut l'être (`canSuspend`) ; null pour un visiteur qui
//   n'est pas administrateur ;
// - elle décide par `useDecide().decide(input)` (`src/moderation/api.ts`), qui rend un `ApiResult` ;
// - le mot de passe n'est demandé que si l'API répond `password_required` ; on le confirme par
//   « Confirmer » (`moderation.password.confirm`).
import {
  type Member,
  MODERATION_DECISIONS_PER_DAY,
  REMOVALS_BEFORE_PASSWORD,
  SUSPENSIONS_BEFORE_PASSWORD,
} from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { getMember } from '../members/api'
import { useDecide } from '../moderation/api'
import { getMe } from '../profile/api'
import { adminMe } from '../testing/fixtures'
import {
  indefiniteSuspension,
  parisEndDate,
  parisEndTime,
  scamCommentItem,
  sevenDaySuspension,
} from '../testing/moderation'
import { leaPage } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { SuspendScreen } from './SuspendScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre de navigation lit le profil (avatar, rôle) : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../members/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getMember = jest.fn()
  return {
    getMember,
    useMember: (id: string, enabled = true) =>
      useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled }),
  }
})
jest.mock('../moderation/api', () => ({ useDecide: jest.fn() }))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/suspend',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

const mockDecide = jest.fn()
const decided = { ok: true, data: { id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' } }

/** Léa, vue par un administrateur : pas suspendue, et elle peut l'être. */
const leaForAdmin: Member = {
  ...leaPage,
  moderation: { isAdmin: false, suspension: null, decisions: 2, canSuspend: true },
}
/** Léa, suspendue 7 jours (fin : le 3 novembre à 0 h 30, heure de Paris). */
const suspendedLea: Member = {
  ...leaPage,
  moderation: { isAdmin: false, suspension: sevenDaySuspension, decisions: 3, canSuspend: false },
}

const explanation = 'Trois messages d’arnaque en deux jours, après deux retraits.'

beforeEach(() => {
  mockSession({ user: { id: adminMe.id, name: adminMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(adminMe)
  jest.mocked(getMember).mockReset().mockResolvedValue(leaForAdmin)
  mockDecide.mockReset().mockResolvedValue(decided)
  jest
    .mocked(useDecide)
    .mockReset()
    .mockReturnValue({ decide: mockDecide } as unknown as ReturnType<typeof useDecide>)
  mockPush.mockReset()
  mockReplace.mockReset()
  mockBack.mockReset()
})

const suspendTitle = fr.t(($) => $.moderation.suspend.title, { name: 'Léa' })
const liftTitle = fr.t(($) => $.moderation.lift.title, { name: 'Léa' })
const confirmSuspend = () =>
  screen.getByRole('button', { name: fr.t(($) => $.moderation.suspend.confirm) })
const confirmPassword = () =>
  screen.getByRole('button', { name: fr.t(($) => $.moderation.password.confirm) })

/** Ouvre la page pour Léa et attend son titre. */
const openSuspend = async (props: { fromKind?: string; fromId?: string } = {}) => {
  await renderWithProviders(<SuspendScreen memberId="u1" {...props} />)
  await screen.findByRole('header', { name: suspendTitle })
}

/** Choisit la durée et le fondement, écrit l'explication, et confirme. */
const fillAndConfirm = async (duration: '7d' | '30d' | 'indefinite' = '7d') => {
  await fireEvent.press(
    screen.getByRole('radio', { name: fr.t(($) => $.moderation.durations[duration]) }),
  )
  await fireEvent.press(
    screen.getByRole('radio', { name: fr.t(($) => $.moderation.grounds.rules) }),
  )
  await fireEvent.changeText(
    screen.getByLabelText(fr.t(($) => $.moderation.explanation)),
    explanation,
  )
  await fireEvent.press(confirmSuspend())
}

const suspension = (duration: '7d' | '30d' | 'indefinite') => ({
  action: 'suspend',
  memberId: 'u1',
  duration,
  ground: 'rules',
  explanation,
})

describe('suspending an account', () => {
  it('names the member, says what a suspension does, and offers the three durations', async () => {
    await openSuspend()

    expect(screen.getByText(containing(fr.t(($) => $.moderation.suspend.intro)))).toBeTruthy()
    for (const duration of ['7d', '30d', 'indefinite'] as const) {
      expect(
        screen.getByRole('radio', { name: fr.t(($) => $.moderation.durations[duration]) }),
      ).toBeTruthy()
    }
  })

  it('asks for the ground, the law or the rules, and an explanation with its hint (J9)', async () => {
    await openSuspend()

    expect(
      screen.getByRole('radio', { name: fr.t(($) => $.moderation.grounds.illegal) }),
    ).toBeTruthy()
    expect(
      screen.getByRole('radio', { name: fr.t(($) => $.moderation.grounds.rules) }),
    ).toBeTruthy()
    expect(screen.getByLabelText(fr.t(($) => $.moderation.explanation))).toBeTruthy()
    // Relecture juridique J9 : les faits et la règle, pas la personne.
    expect(
      screen.getByText(containing(fr.t(($) => $.moderation.suspend.explanationHint))),
    ).toBeTruthy()
  })

  it('suspends for 7 days with the ground and the explanation, and says so', async () => {
    await openSuspend()

    await fillAndConfirm('7d')

    expect(mockDecide).toHaveBeenCalledTimes(1)
    expect(mockDecide).toHaveBeenCalledWith(suspension('7d'))
    expect(await screen.findByText(containing(fr.t(($) => $.moderation.suspend.done)))).toBeTruthy()
  })

  it('sends the duration chosen: 30 days', async () => {
    await openSuspend()

    await fillAndConfirm('30d')

    expect(mockDecide).toHaveBeenCalledWith(suspension('30d'))
  })

  it('suspends nothing without a ground', async () => {
    await openSuspend()

    await fireEvent.press(
      screen.getByRole('radio', { name: fr.t(($) => $.moderation.durations['7d']) }),
    )
    await fireEvent.changeText(
      screen.getByLabelText(fr.t(($) => $.moderation.explanation)),
      explanation,
    )
    await fireEvent.press(confirmSuspend())

    expect(mockDecide).not.toHaveBeenCalled()
  })

  it('suspends nothing without an explanation', async () => {
    await openSuspend()

    await fireEvent.press(
      screen.getByRole('radio', { name: fr.t(($) => $.moderation.durations['7d']) }),
    )
    await fireEvent.press(
      screen.getByRole('radio', { name: fr.t(($) => $.moderation.grounds.rules) }),
    )
    await fireEvent.changeText(screen.getByLabelText(fr.t(($) => $.moderation.explanation)), '   ')
    await fireEvent.press(confirmSuspend())

    expect(mockDecide).not.toHaveBeenCalled()
  })

  it('sends a single suspension for a double tap', async () => {
    // La réponse reste en attente : le second appui arrive pendant l'envoi (charte, 7b).
    mockDecide.mockReturnValue(new Promise(() => {}))
    await openSuspend()

    await fillAndConfirm('7d')
    await fireEvent.press(confirmSuspend())

    expect(mockDecide).toHaveBeenCalledTimes(1)
  })

  it('says the daily limit of decisions on 429 (J15)', async () => {
    mockDecide.mockResolvedValue({ ok: false, error: 'rateLimited' })
    await openSuspend()

    await fillAndConfirm('7d')

    expect(
      await screen.findByText(
        containing(fr.t(($) => $.moderation.limited, { max: MODERATION_DECISIONS_PER_DAY })),
      ),
    ).toBeTruthy()
    expect(screen.queryByText(containing(fr.t(($) => $.moderation.suspend.done)))).toBeNull()
  })

  it('sends the report it comes from, when opened from a card of the queue (J2)', async () => {
    await openSuspend({ fromKind: 'comment', fromId: scamCommentItem.target.id })

    await fillAndConfirm('7d')

    expect(mockDecide).toHaveBeenCalledWith({
      ...suspension('7d'),
      fromReport: { kind: 'comment', id: scamCommentItem.target.id },
    })
  })

  it('sends no report when opened from the page of the member', async () => {
    await openSuspend()

    await fillAndConfirm('7d')

    expect(mockDecide.mock.calls[0]?.[0]).not.toHaveProperty('fromReport')
  })
})

describe('the password asked again', () => {
  const passwordLabel = fr.t(($) => $.moderation.password.label)

  it('asks no password before the API requires it', async () => {
    await openSuspend()

    expect(confirmSuspend()).toBeTruthy() // témoin
    expect(screen.queryByLabelText(passwordLabel)).toBeNull()
  })

  it('asks the password when the API requires it, says when, then sends it with the same suspension', async () => {
    // Une suspension sans fin le demande toujours (S11).
    mockDecide
      .mockResolvedValueOnce({ ok: false, error: 'passwordRequired' })
      .mockResolvedValueOnce(decided)
    await openSuspend()
    await fillAndConfirm('indefinite')

    const field = await screen.findByLabelText(passwordLabel)
    expect(
      screen.getByText(
        containing(
          fr.t(($) => $.moderation.password.hint, {
            suspensions: SUSPENSIONS_BEFORE_PASSWORD,
            removals: REMOVALS_BEFORE_PASSWORD,
          }),
        ),
      ),
    ).toBeTruthy()
    await fireEvent.changeText(field, 'mot-de-passe-de-louis')
    await fireEvent.press(confirmPassword())

    expect(mockDecide).toHaveBeenCalledTimes(2)
    expect(mockDecide).toHaveBeenLastCalledWith({
      ...suspension('indefinite'),
      password: 'mot-de-passe-de-louis',
    })
    expect(await screen.findByText(containing(fr.t(($) => $.moderation.suspend.done)))).toBeTruthy()
  })

  it('says a wrong password, and keeps the field to try again', async () => {
    mockDecide
      .mockResolvedValueOnce({ ok: false, error: 'passwordRequired' })
      .mockResolvedValueOnce({ ok: false, error: 'wrongPassword' })
    await openSuspend()
    await fillAndConfirm('indefinite')

    await fireEvent.changeText(await screen.findByLabelText(passwordLabel), 'pas-le-bon')
    await fireEvent.press(confirmPassword())

    expect(await screen.findByText(containing(fr.t(($) => $.errors.wrongPassword)))).toBeTruthy()
    expect(screen.getByLabelText(passwordLabel)).toBeTruthy()
    expect(screen.queryByText(containing(fr.t(($) => $.moderation.suspend.done)))).toBeNull()
  })
})

describe('lifting a suspension', () => {
  beforeEach(() => {
    jest.mocked(getMember).mockResolvedValue(suspendedLea)
  })

  const openLift = async () => {
    await renderWithProviders(<SuspendScreen memberId="u1" />)
    await screen.findByRole('header', { name: liftTitle })
  }

  it('becomes « Lever la suspension » for a member already suspended, without durations', async () => {
    await openLift()

    expect(screen.getByText(containing(fr.t(($) => $.moderation.lift.intro)))).toBeTruthy()
    expect(screen.queryByRole('header', { name: suspendTitle })).toBeNull()
    expect(
      screen.queryByRole('radio', { name: fr.t(($) => $.moderation.durations['7d']) }),
    ).toBeNull()
  })

  it('says until when the suspension runs, at the hour of Paris (J4)', async () => {
    // La fin, 23 h 30 UTC le 2 novembre, s'écrit le 3 novembre à 0 h 30. Sur ce PC (Europe/Paris),
    // une heure de l'appareil passerait aussi ; la CI, en UTC, la refuse.
    await openLift()

    const current = fr
      .t(($) => $.moderation.lift.current, { since: 'SINCE', endsAt: 'ENDS' })
      .replace(/\s+/g, ' ')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace('SINCE', '.+')
      .replace('ENDS', `${parisEndDate}.*${parisEndTime}`)
    expect(screen.getByText(new RegExp(current))).toBeTruthy()
  })

  it('says « until further notice » for a suspension without end', async () => {
    jest.mocked(getMember).mockResolvedValue({
      ...suspendedLea,
      moderation: {
        isAdmin: false,
        suspension: indefiniteSuspension,
        decisions: 1,
        canSuspend: false,
      },
    })
    await openLift()

    const current = fr
      .t(($) => $.moderation.lift.currentIndefinite, { since: 'SINCE' })
      .replace(/\s+/g, ' ')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace('SINCE', '.+')
    expect(screen.getByText(new RegExp(current))).toBeTruthy()
  })

  it('asks why it is lifted now (J10), and an explanation', async () => {
    await openLift()

    expect(screen.getByText(containing(fr.t(($) => $.moderation.lift.causeLabel)))).toBeTruthy()
    expect(
      screen.getByRole('radio', { name: fr.t(($) => $.moderation.lift.causes.early) }),
    ).toBeTruthy()
    expect(
      screen.getByRole('radio', { name: fr.t(($) => $.moderation.lift.causes.error) }),
    ).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.moderation.lift.causeHint)))).toBeTruthy()
    expect(screen.getByLabelText(fr.t(($) => $.moderation.explanation))).toBeTruthy()
    expect(
      screen.getByText(containing(fr.t(($) => $.moderation.lift.explanationHint))),
    ).toBeTruthy()
  })

  it('lifts the suspension with its cause and explanation, and says so', async () => {
    await openLift()

    await fireEvent.press(
      screen.getByRole('radio', { name: fr.t(($) => $.moderation.lift.causes.error) }),
    )
    await fireEvent.changeText(
      screen.getByLabelText(fr.t(($) => $.moderation.explanation)),
      'Le signalement visait un autre compte.',
    )
    await fireEvent.press(
      screen.getByRole('button', { name: fr.t(($) => $.moderation.lift.confirm) }),
    )

    expect(mockDecide).toHaveBeenCalledTimes(1)
    expect(mockDecide).toHaveBeenCalledWith({
      action: 'lift',
      memberId: 'u1',
      cause: 'error',
      explanation: 'Le signalement visait un autre compte.',
    })
    expect(await screen.findByText(containing(fr.t(($) => $.moderation.lift.done)))).toBeTruthy()
  })

  it('lifts nothing without a cause', async () => {
    await openLift()

    await fireEvent.changeText(
      screen.getByLabelText(fr.t(($) => $.moderation.explanation)),
      'Le signalement visait un autre compte.',
    )
    await fireEvent.press(
      screen.getByRole('button', { name: fr.t(($) => $.moderation.lift.confirm) }),
    )

    expect(mockDecide).not.toHaveBeenCalled()
  })
})

describe('who can use the page', () => {
  it('says the account cannot be suspended (one’s own, or an administrator’s), and offers no confirmation', async () => {
    jest.mocked(getMember).mockResolvedValue({
      ...leaPage,
      moderation: { isAdmin: true, suspension: null, decisions: 0, canSuspend: false },
    })
    await renderWithProviders(<SuspendScreen memberId="u1" />)

    expect(
      await screen.findByText(containing(fr.t(($) => $.moderation.suspend.notAllowed))),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: fr.t(($) => $.moderation.suspend.confirm) }),
    ).toBeNull()
  })

  it('says « not found » to a member who is not an administrator, and shows no form', async () => {
    // Pour tout autre visiteur, `Member.moderation` vaut null : la page n'existe pas pour lui.
    jest.mocked(getMember).mockResolvedValue(leaPage)
    await renderWithProviders(<SuspendScreen memberId="u1" />)

    expect(await screen.findByRole('button', { name: 'Retour à l’accueil' })).toBeTruthy()
    expect(
      screen.queryByRole('radio', { name: fr.t(($) => $.moderation.durations['7d']) }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: fr.t(($) => $.moderation.suspend.confirm) }),
    ).toBeNull()
  })
})
