// Tests de la fenêtre « Suspendre » (R9, planche R9-Suspendre), qui remplace la page `/suspend` de
// la tranche 7c (SuspendScreen.test.tsx, dont chaque comportement encore valable est repris ici).
// Scénario « La modération sur ordinateur » : « Suspendre le compte » ouvre une fenêtre : 7 jours,
// 30 jours ou sans fin, le fondement, l'explication, le mot de passe pour « sans fin » ; la page
// `/suspend` disparaît, la levée passe par la même fenêtre, avec sa raison (plus tôt, ou erreur,
// J10).
//
// L'interface attendue (fixée au plan, « Ce qui change au plan ») :
// - `src/moderation/SuspendSheet.tsx` exporte `SuspendSheet`, de props
//   `{ memberId: string; open: boolean; onClose: () => void; fromReport?: ReportTarget }` ;
//   `fromReport` : le signalement d'où l'on part (le détail de la file), envoyé tel quel à l'API
//   (relecture juridique J2) ;
// - la fenêtre lit le membre par `useMember(id)` (`src/members/api.ts`) : `Member.moderation` dit
//   s'il est suspendu (`suspension`) et s'il peut l'être (`canSuspend`) ; null pour qui n'est pas
//   administrateur ;
// - elle décide par `useDecide().decide(input)` (`src/moderation/api.ts`), qui rend un `ApiResult` ;
// - la durée, le fondement et la raison d'une levée sont des choix (rôle `radio`), rien de choisi
//   d'avance ; le mot de passe n'est demandé que si l'API répond `password_required`, confirmé par
//   « Confirmer » (`moderation.password.confirm`) ;
// - `guardTaps` : ses boutons ignorent une tape dans les 600 ms qui suivent l'ouverture ;
// - une décision prise se dit (« Compte suspendu. », « Suspension levée. ») : dans la fenêtre, ou
//   par un message bref (`useToast`), au choix de l'interface ; les deux sont acceptés ici.
import {
  type Member,
  MODERATION_DECISIONS_PER_DAY,
  REMOVALS_BEFORE_PASSWORD,
  type ReportTarget,
  SUSPENSIONS_BEFORE_PASSWORD,
} from '@ruche/contracts'
import { nameOf } from '@ruche/i18n'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { getMember } from '../members/api'
import { passTapGuard } from '../testing/dialog'
import { adminMe } from '../testing/fixtures'
import {
  indefiniteSuspension,
  parisEndDate,
  parisEndTime,
  scamCommentItem,
  sevenDaySuspension,
} from '../testing/moderation'
import { leaPage } from '../testing/projects'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { useDecide } from './api'
import { SuspendSheet } from './SuspendSheet'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
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
// Les messages brefs (« Compte suspendu. ») : relevés ici, la vraie file des messages n'est pas
// montée par les tests.
const mockToasts: string[] = []
jest.mock('../ui/theme/toast', () => ({
  ...jest.requireActual('../ui/theme/toast'),
  useToast: () => ({ show: (text: string) => mockToasts.push(text) }),
}))

const mockDecide = jest.fn()
const decided = { ok: true, data: { id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' } }

/** Léa, vue par un administrateur : pas suspendue, et elle peut l'être. */
const leaForAdmin: Member = {
  ...leaPage,
  removedParts: [],
  moderation: { isAdmin: false, suspension: null, decisions: 2, canSuspend: true },
}
/** Léa, suspendue 7 jours (fin : le 3 novembre à 0 h 30, heure de Paris). */
const suspendedLea: Member = {
  ...leaForAdmin,
  moderation: { isAdmin: false, suspension: sevenDaySuspension, decisions: 3, canSuspend: false },
}

const explanation = 'Trois messages d’arnaque en deux jours, après deux retraits.'
const onClose = jest.fn()

beforeEach(() => {
  mockSession({ user: { id: adminMe.id, name: adminMe.name } })
  jest.mocked(getMember).mockReset().mockResolvedValue(leaForAdmin)
  mockDecide.mockReset().mockResolvedValue(decided)
  jest
    .mocked(useDecide)
    .mockReset()
    .mockReturnValue({ decide: mockDecide } as unknown as ReturnType<typeof useDecide>)
  onClose.mockReset()
  mockToasts.length = 0
})

const suspendTitle = fr.t(($) => $.moderation.suspend.title, { nameOf: nameOf('fr', 'Léa') })
const liftTitle = fr.t(($) => $.moderation.lift.title, { nameOf: nameOf('fr', 'Léa') })
const confirmSuspend = () =>
  screen.getByRole('button', { name: fr.t(($) => $.moderation.suspend.confirm) })
const confirmLift = () =>
  screen.getByRole('button', { name: fr.t(($) => $.moderation.lift.confirm) })
const confirmPassword = () =>
  screen.getByRole('button', { name: fr.t(($) => $.moderation.password.confirm) })
const durationRadio = (duration: '7d' | '30d' | 'indefinite') =>
  screen.getByRole('radio', { name: containing(fr.t(($) => $.moderation.durations[duration])) })
const groundRadio = (ground: 'illegal' | 'rules') =>
  screen.getByRole('radio', { name: containing(fr.t(($) => $.moderation.grounds[ground])) })

/** Ouvre la fenêtre sur Léa, attend son titre puis la fin de la garde des tapes. */
const openSheet = async (
  props: { fromReport?: ReportTarget } = {},
  title: string = suspendTitle,
) => {
  await renderWithProviders(<SuspendSheet memberId="u1" open onClose={onClose} {...props} />)
  await screen.findByRole('header', { name: title })
  await passTapGuard()
}

/** Choisit la durée et le fondement, écrit l'explication, et confirme. */
const fillAndConfirm = async (duration: '7d' | '30d' | 'indefinite' = '7d') => {
  await fireEvent.press(durationRadio(duration))
  await fireEvent.press(groundRadio('rules'))
  await fireEvent.changeText(
    screen.getByLabelText(fr.t(($) => $.moderation.explanation)),
    explanation,
  )
  await fireEvent.press(confirmSuspend())
}

/** La décision est dite : dans la fenêtre, ou par un message bref. */
const expectSaid = async (text: string) => {
  await waitFor(() =>
    expect(mockToasts.includes(text) || screen.queryAllByText(containing(text)).length > 0).toBe(
      true,
    ),
  )
}

/** Attend que la fenêtre ait lu le membre, pour vérifier ensuite ce qui n'y est pas. */
const settle = async () => {
  await waitFor(() => expect(getMember).toHaveBeenCalled())
  await act(async () => {})
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
    await openSheet()

    expect(screen.getByText(containing(fr.t(($) => $.moderation.suspend.intro)))).toBeTruthy()
    for (const duration of ['7d', '30d', 'indefinite'] as const) {
      expect(durationRadio(duration)).toBeTruthy()
    }
  })

  it('chooses no duration nor ground beforehand', async () => {
    await openSheet()

    expect(durationRadio('7d')).not.toBeChecked()
    expect(durationRadio('30d')).not.toBeChecked()
    expect(durationRadio('indefinite')).not.toBeChecked()
    expect(groundRadio('illegal')).not.toBeChecked()
    expect(groundRadio('rules')).not.toBeChecked()
  })

  it('asks for the ground, the law or the rules, and an explanation with its hint (J9)', async () => {
    await openSheet()

    expect(groundRadio('illegal')).toBeTruthy()
    expect(groundRadio('rules')).toBeTruthy()
    expect(screen.getByLabelText(fr.t(($) => $.moderation.explanation))).toBeTruthy()
    // Relecture juridique J9 : les faits et la règle, pas la personne.
    expect(
      screen.getByText(containing(fr.t(($) => $.moderation.suspend.explanationHint))),
    ).toBeTruthy()
  })

  it('suspends for 7 days with the ground and the explanation, and says so', async () => {
    await openSheet()

    await fillAndConfirm('7d')

    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(1))
    expect(mockDecide).toHaveBeenCalledWith(suspension('7d'))
    await expectSaid(fr.t(($) => $.moderation.suspend.done))
  })

  it('sends the duration chosen: 30 days', async () => {
    await openSheet()

    await fillAndConfirm('30d')

    await waitFor(() => expect(mockDecide).toHaveBeenCalledWith(suspension('30d')))
  })

  it('suspends nothing without a ground', async () => {
    await openSheet()

    await fireEvent.press(durationRadio('7d'))
    await fireEvent.changeText(
      screen.getByLabelText(fr.t(($) => $.moderation.explanation)),
      explanation,
    )
    await fireEvent.press(confirmSuspend())

    expect(mockDecide).not.toHaveBeenCalled()
  })

  it('suspends nothing without an explanation', async () => {
    await openSheet()

    await fireEvent.press(durationRadio('7d'))
    await fireEvent.press(groundRadio('rules'))
    await fireEvent.changeText(screen.getByLabelText(fr.t(($) => $.moderation.explanation)), '   ')
    await fireEvent.press(confirmSuspend())

    expect(mockDecide).not.toHaveBeenCalled()
  })

  it('ignores a tap on « Suspendre le compte » right after opening (guardTaps)', async () => {
    await renderWithProviders(<SuspendSheet memberId="u1" open onClose={onClose} />)
    await screen.findByRole('header', { name: suspendTitle })

    await fillAndConfirm('7d')
    expect(mockDecide).not.toHaveBeenCalled()

    // Après la garde, la même tape suspend.
    await passTapGuard()
    await fireEvent.press(confirmSuspend())
    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(1))
  })

  it('sends a single suspension for a double tap', async () => {
    // La réponse reste en attente : le second appui arrive pendant l'envoi (charte, 7b).
    mockDecide.mockReturnValue(new Promise(() => {}))
    await openSheet()

    await fillAndConfirm('7d')
    await fireEvent.press(confirmSuspend())

    expect(mockDecide).toHaveBeenCalledTimes(1)
  })

  it('says the daily limit of decisions on 429 (J15)', async () => {
    mockDecide.mockResolvedValue({ ok: false, error: 'rateLimited' })
    await openSheet()

    await fillAndConfirm('7d')

    expect(
      await screen.findByText(
        containing(fr.t(($) => $.moderation.limited, { max: MODERATION_DECISIONS_PER_DAY })),
      ),
    ).toBeTruthy()
    expect(mockToasts).not.toContain(fr.t(($) => $.moderation.suspend.done))
    expect(screen.queryByText(containing(fr.t(($) => $.moderation.suspend.done)))).toBeNull()
  })

  it('sends the report it comes from, when opened from the detail of a report (J2)', async () => {
    const fromReport: ReportTarget = { kind: 'comment', id: scamCommentItem.target.id }
    await openSheet({ fromReport })

    await fillAndConfirm('7d')

    await waitFor(() =>
      expect(mockDecide).toHaveBeenCalledWith({ ...suspension('7d'), fromReport }),
    )
  })

  it('sends no report when opened from the page of the member', async () => {
    await openSheet()

    await fillAndConfirm('7d')

    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(1))
    expect(mockDecide.mock.calls[0]?.[0]).not.toHaveProperty('fromReport')
  })

  describe('on a computer', () => {
    let restoreWindow: () => void = () => {}
    beforeEach(() => {
      restoreWindow = setDesktopWindow()
    })
    afterEach(() => restoreWindow())

    const afterReport = fr.t(($) => $.moderation.suspendSheet.afterReport)

    it('says the suspension follows the report when it comes from one (planche R9-Suspendre)', async () => {
      await openSheet({ fromReport: { kind: 'comment', id: scamCommentItem.target.id } })

      expect(screen.getByText(containing(afterReport))).toBeTruthy()
    })

    it('says nothing of a report when opened from the page of the member', async () => {
      await openSheet()

      expect(confirmSuspend()).toBeTruthy() // témoin
      expect(screen.queryByText(containing(afterReport))).toBeNull()
    })
  })

  it('closes on « Annuler » without deciding anything', async () => {
    await openSheet()

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.moderation.cancel) }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockDecide).not.toHaveBeenCalled()
  })

  it('shows nothing while closed', async () => {
    await renderWithProviders(<SuspendSheet memberId="u1" open={false} onClose={onClose} />)
    await act(async () => {})

    expect(screen.queryByRole('header', { name: suspendTitle })).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
  })
})

describe('the password asked again', () => {
  const passwordLabel = fr.t(($) => $.moderation.password.label)

  it('asks no password before the API requires it', async () => {
    await openSheet()

    expect(confirmSuspend()).toBeTruthy() // témoin
    expect(screen.queryByLabelText(passwordLabel)).toBeNull()
  })

  it('asks the password when the API requires it, says when, then sends it with the same suspension', async () => {
    // Une suspension sans fin le demande toujours (S11).
    mockDecide
      .mockResolvedValueOnce({ ok: false, error: 'passwordRequired' })
      .mockResolvedValueOnce(decided)
    await openSheet()
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

    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(2))
    expect(mockDecide).toHaveBeenLastCalledWith({
      ...suspension('indefinite'),
      password: 'mot-de-passe-de-louis',
    })
    await expectSaid(fr.t(($) => $.moderation.suspend.done))
  })

  it('says a wrong password, and keeps the field to try again', async () => {
    mockDecide
      .mockResolvedValueOnce({ ok: false, error: 'passwordRequired' })
      .mockResolvedValueOnce({ ok: false, error: 'wrongPassword' })
    await openSheet()
    await fillAndConfirm('indefinite')

    await fireEvent.changeText(await screen.findByLabelText(passwordLabel), 'pas-le-bon')
    await fireEvent.press(confirmPassword())

    expect(await screen.findByText(containing(fr.t(($) => $.errors.wrongPassword)))).toBeTruthy()
    expect(screen.getByLabelText(passwordLabel)).toBeTruthy()
    expect(mockToasts).not.toContain(fr.t(($) => $.moderation.suspend.done))
  })
})

describe('lifting a suspension in the same sheet', () => {
  beforeEach(() => {
    jest.mocked(getMember).mockResolvedValue(suspendedLea)
  })

  const openLift = () => openSheet({}, liftTitle)

  it('becomes « Lever la suspension » for a member already suspended, without durations', async () => {
    await openLift()

    expect(screen.getByText(containing(fr.t(($) => $.moderation.lift.intro)))).toBeTruthy()
    expect(screen.queryByRole('header', { name: suspendTitle })).toBeNull()
    expect(
      screen.queryByRole('radio', { name: containing(fr.t(($) => $.moderation.durations['7d'])) }),
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
    const early = screen.getByRole('radio', {
      name: containing(fr.t(($) => $.moderation.lift.causes.early)),
    })
    const error = screen.getByRole('radio', {
      name: containing(fr.t(($) => $.moderation.lift.causes.error)),
    })
    // Rien de choisi d'avance : la raison compte dans le rappel des décisions (J10).
    expect(early).not.toBeChecked()
    expect(error).not.toBeChecked()
    expect(screen.getByText(containing(fr.t(($) => $.moderation.lift.causeHint)))).toBeTruthy()
    expect(screen.getByLabelText(fr.t(($) => $.moderation.explanation))).toBeTruthy()
    expect(
      screen.getByText(containing(fr.t(($) => $.moderation.lift.explanationHint))),
    ).toBeTruthy()
  })

  it('lifts the suspension with its cause and explanation, and says so', async () => {
    await openLift()

    await fireEvent.press(
      screen.getByRole('radio', { name: containing(fr.t(($) => $.moderation.lift.causes.error)) }),
    )
    await fireEvent.changeText(
      screen.getByLabelText(fr.t(($) => $.moderation.explanation)),
      'Le signalement visait un autre compte.',
    )
    await fireEvent.press(confirmLift())

    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(1))
    expect(mockDecide).toHaveBeenCalledWith({
      action: 'lift',
      memberId: 'u1',
      cause: 'error',
      explanation: 'Le signalement visait un autre compte.',
    })
    await expectSaid(fr.t(($) => $.moderation.lift.done))
  })

  it('lifts nothing without a cause', async () => {
    await openLift()

    await fireEvent.changeText(
      screen.getByLabelText(fr.t(($) => $.moderation.explanation)),
      'Le signalement visait un autre compte.',
    )
    await fireEvent.press(confirmLift())

    expect(mockDecide).not.toHaveBeenCalled()
  })

  it('sends a single lift for a double tap', async () => {
    mockDecide.mockReturnValue(new Promise(() => {}))
    await openLift()

    await fireEvent.press(
      screen.getByRole('radio', { name: containing(fr.t(($) => $.moderation.lift.causes.early)) }),
    )
    await fireEvent.changeText(
      screen.getByLabelText(fr.t(($) => $.moderation.explanation)),
      'Sam s’est excusé.',
    )
    await fireEvent.press(confirmLift())
    await fireEvent.press(confirmLift())

    expect(mockDecide).toHaveBeenCalledTimes(1)
  })
})

describe('who can be suspended', () => {
  it('says an administrator’s account cannot be suspended, and offers no confirmation', async () => {
    jest.mocked(getMember).mockResolvedValue({
      ...leaForAdmin,
      moderation: { isAdmin: true, suspension: null, decisions: 0, canSuspend: false },
    })
    await renderWithProviders(<SuspendSheet memberId="u1" open onClose={onClose} />)

    expect(
      await screen.findByText(containing(fr.t(($) => $.moderation.suspend.notAllowedAdmin))),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: fr.t(($) => $.moderation.suspend.confirm) }),
    ).toBeNull()
  })

  it('says one cannot suspend one’s own account, and offers no confirmation', async () => {
    // Sa propre page : l'administrateur qui regarde est aussi administrateur (isAdmin vrai) ; la
    // raison dite est pourtant « ton propre compte », la plus juste.
    jest.mocked(getMember).mockResolvedValue({
      ...leaForAdmin,
      isMe: true,
      moderation: { isAdmin: true, suspension: null, decisions: 0, canSuspend: false },
    })
    await renderWithProviders(<SuspendSheet memberId="u1" open onClose={onClose} />)

    expect(
      await screen.findByText(containing(fr.t(($) => $.moderation.suspend.notAllowedSelf))),
    ).toBeTruthy()
    expect(
      screen.queryByText(containing(fr.t(($) => $.moderation.suspend.notAllowedAdmin))),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: fr.t(($) => $.moderation.suspend.confirm) }),
    ).toBeNull()
  })

  it('tells an administrator who blocked the member that another one has to decide', async () => {
    jest.mocked(getMember).mockResolvedValue({
      ...leaForAdmin,
      isBlocked: true,
      moderation: { isAdmin: false, suspension: null, decisions: 0, canSuspend: false },
    })
    await renderWithProviders(<SuspendSheet memberId="u1" open onClose={onClose} />)

    expect(
      await screen.findByText(containing(fr.t(($) => $.moderation.blockedTarget))),
    ).toBeTruthy()
    expect(
      screen.queryByText(containing(fr.t(($) => $.moderation.suspend.notAllowedAdmin))),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: fr.t(($) => $.moderation.suspend.confirm) }),
    ).toBeNull()
  })

  it('offers no lift to an administrator who blocked the suspended member, and says why', async () => {
    // L'API refuserait la levée (422) : la fenêtre le dit d'avance plutôt qu'après le formulaire.
    jest.mocked(getMember).mockResolvedValue({ ...suspendedLea, isBlocked: true })
    await renderWithProviders(<SuspendSheet memberId="u1" open onClose={onClose} />)

    expect(
      await screen.findByText(containing(fr.t(($) => $.moderation.blockedTarget))),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: fr.t(($) => $.moderation.lift.confirm) }),
    ).toBeNull()
    expect(
      screen.queryByRole('radio', {
        name: containing(fr.t(($) => $.moderation.lift.causes.error)),
      }),
    ).toBeNull()
  })

  it('shows no form to a member who is not an administrator', async () => {
    // Pour tout autre visiteur, `Member.moderation` vaut null : la fenêtre n'a rien à lui offrir.
    jest.mocked(getMember).mockResolvedValue({ ...leaForAdmin, moderation: null })
    await renderWithProviders(<SuspendSheet memberId="u1" open onClose={onClose} />)
    await settle()

    expect(screen.queryByRole('radio')).toBeNull()
    expect(
      screen.queryByRole('button', { name: fr.t(($) => $.moderation.suspend.confirm) }),
    ).toBeNull()
    expect(screen.queryByLabelText(fr.t(($) => $.moderation.explanation))).toBeNull()
  })
})
