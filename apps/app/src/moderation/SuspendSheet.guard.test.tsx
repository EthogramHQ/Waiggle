// La garde de sortie de la feuille « Suspendre » (R9, plan ui-P3), comme celle de « Signaler » : le
// retour du navigateur (ou le geste de retour) avec une explication écrite ou une durée choisie
// demande « Abandonner la décision ? » ; sans rien d'écrit, la feuille se ferme ; pendant l'envoi,
// elle reste ouverte, sans question. Mêmes simulations que SuspendSheet.test.tsx, plus un faux
// `useNavigation()` dont le test rejoue le `beforeRemove`.
import type { Member } from '@ruche/contracts'
import { nameOf } from '@ruche/i18n'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { getMember } from '../members/api'
import { passTapGuard } from '../testing/dialog'
import { adminMe } from '../testing/fixtures'
import { leaPage } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { useDecide } from './api'
import { SuspendSheet } from './SuspendSheet'

type BeforeRemove = { preventDefault: jest.Mock; data: { action: { type: string } } }

/** Le faux `useNavigation()` : ses écouteurs `beforeRemove`, que le test rejoue. */
const mockNav = {
  listeners: new Set<(event: BeforeRemove) => void>(),
  navigation: {
    addListener: jest.fn((_type: string, listener: (event: BeforeRemove) => void) => {
      mockNav.listeners.add(listener)
      return () => mockNav.listeners.delete(listener)
    }),
    dispatch: jest.fn(),
  },
}

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
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/suspend',
  useNavigation: () => mockNav.navigation,
}))

const leaForAdmin: Member = {
  ...leaPage,
  removedParts: [],
  moderation: { isAdmin: false, suspension: null, decisions: 2, canSuspend: true },
}
const mockDecide = jest.fn()
const onClose = jest.fn()

beforeEach(() => {
  mockSession({ user: { id: adminMe.id, name: adminMe.name } })
  jest.mocked(getMember).mockReset().mockResolvedValue(leaForAdmin)
  mockDecide.mockReset()
  jest
    .mocked(useDecide)
    .mockReset()
    .mockReturnValue({ decide: mockDecide } as unknown as ReturnType<typeof useDecide>)
  onClose.mockReset()
  mockNav.listeners.clear()
})

const T = {
  title: fr.t(($) => $.moderation.suspend.title, { nameOf: nameOf('fr', 'Léa') }),
  discardTitle: fr.t(($) => $.moderation.discard.title),
  keep: fr.t(($) => $.moderation.discard.keep),
  confirm: fr.t(($) => $.moderation.discard.confirm),
  explanation: fr.t(($) => $.moderation.explanation),
}

const openSheet = async () => {
  await renderWithProviders(<SuspendSheet memberId="u1" open onClose={onClose} />)
  await screen.findByRole('header', { name: T.title })
  await passTapGuard()
}

/** Rejoue un `beforeRemove` (le Retour du navigateur, le geste de retour) ; rend l'événement. */
const navigatorRemoves = async (): Promise<BeforeRemove> => {
  const event: BeforeRemove = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } }
  await act(async () => {
    for (const listener of mockNav.listeners) listener(event)
  })
  return event
}
const asking = () => screen.queryByRole('header', { name: T.discardTitle }) !== null

describe('leaving the « Suspendre » sheet', () => {
  it('asks « Abandonner ? » on the browser Back when an explanation is written', async () => {
    await openSheet()
    await fireEvent.changeText(screen.getByLabelText(T.explanation), 'Trois messages d’arnaque.')

    const back = await navigatorRemoves()

    expect(back.preventDefault).toHaveBeenCalled()
    expect(await screen.findByRole('header', { name: T.discardTitle })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('asks too when only a duration is chosen', async () => {
    await openSheet()
    await fireEvent.press(
      screen.getByRole('radio', { name: containing(fr.t(($) => $.moderation.durations['7d'])) }),
    )

    const back = await navigatorRemoves()

    expect(back.preventDefault).toHaveBeenCalled()
    expect(asking()).toBe(true)
  })

  it('lets the Back go through when nothing is written', async () => {
    await openSheet()

    const back = await navigatorRemoves()

    expect(back.preventDefault).not.toHaveBeenCalled()
    expect(asking()).toBe(false)
  })

  it('closes on « Annuler » without asking when nothing is written', async () => {
    await openSheet()

    const [cancel] = screen.getAllByRole('button', { name: fr.t(($) => $.moderation.cancel) })
    if (!cancel) throw new Error('no « Annuler »')
    await fireEvent.press(cancel)

    expect(asking()).toBe(false)
    await act(async () => {})
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open after « Continuer », and leaves after « Abandonner »', async () => {
    await openSheet()
    await fireEvent.changeText(screen.getByLabelText(T.explanation), 'Trois messages d’arnaque.')
    const [cancel] = screen.getAllByRole('button', { name: fr.t(($) => $.moderation.cancel) })
    if (!cancel) throw new Error('no « Annuler »')

    await fireEvent.press(cancel)
    expect(asking()).toBe(true)
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.keep }))
    expect(asking()).toBe(false)
    expect(onClose).not.toHaveBeenCalled()

    await fireEvent.press(cancel)
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))
    await act(async () => {})
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockDecide).not.toHaveBeenCalled()
  })

  it('stays open on Back while the decision is sending, without asking', async () => {
    let answer: (value: unknown) => void = () => {}
    mockDecide.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    await openSheet()
    await fireEvent.press(
      screen.getByRole('radio', { name: containing(fr.t(($) => $.moderation.durations['7d'])) }),
    )
    await fireEvent.press(
      screen.getByRole('radio', { name: containing(fr.t(($) => $.moderation.grounds.illegal)) }),
    )
    await fireEvent.changeText(screen.getByLabelText(T.explanation), 'Trois messages d’arnaque.')
    await fireEvent.press(
      screen.getByRole('button', { name: fr.t(($) => $.moderation.suspend.confirm) }),
    )

    const back = await navigatorRemoves()

    expect(back.preventDefault).toHaveBeenCalled()
    expect(asking()).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => answer({ ok: true, data: { id: 'x' } }))
  })
})
