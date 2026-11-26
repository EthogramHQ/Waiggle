// Tests de la page « Missions de la semaine » des Éclaireuses (R20, docs/scenarios/refonte.md,
// « Les missions de la semaine » ; planche R20-Missions) : les missions à faire d'abord, chacune
// avec son pollen et « Répondre », puis celles déjà faites (« Faite », encore touchables) ; une
// semaine sans mission le dit en une phrase ; une page réservée aux Éclaireuses.
//
// Ce que ces tests supposent (plan R20, « Appli ») : `ScoutMissionsScreen` (sans propriété), à
// l'adresse `/scout/missions` ; les missions viennent de `useScoutMissions` (scout/api, remplacé
// par `scout.testkit.tsx`) ; « Répondre » ouvre la feuille « Ton retour » avec la mission choisie :
// `/scout-report?from=/scout/missions&mission=<id>`.
import { POLLEN_GESTURES } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import { getMe } from '../profile/api'
import {
  missionPhotoId,
  missionSearchId,
  noMissions,
  removedScoutMe,
  resetScoutServer,
  scoutMe,
  scoutServer,
} from '../scout/scout.testkit'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ScoutMissionsScreen } from './ScoutMissionsScreen'

const kit = () => require('../scout/scout.testkit') as typeof import('../scout/scout.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../scout/api', () => kit().mockScoutApi())
jest.mock('../api/client', () => {
  const answer = () => Promise.resolve({ ok: false, error: 'notFound' })
  return { request: jest.fn(answer), requestWithoutBody: jest.fn(answer), apiFetch: jest.fn() }
})
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
const mockPush = jest.fn()
const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/scout/missions',
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ addListener: () => () => {} }),
}))

const t = fr.t.bind(fr)
const T = {
  title: t(($) => $.scout.missions.title),
  answer: t(($) => $.scout.missions.answer),
  done: t(($) => $.scout.missions.done),
  empty: t(($) => $.scout.missions.empty),
  left: t(($) => $.scout.missions.left, { count: 2 }),
  pollen: t(($) => $.scout.missions.pollen, {
    count: POLLEN_GESTURES.scout_mission.amount,
  }),
  scoutOnly: t(($) => $.errors.scoutOnly),
}
const PHOTO = 'Publie un projet avec une photo'
const SEARCH = 'Cherche un outil par son nom'
const PHONE = 'Essaie Waiggle sur ton téléphone'

beforeEach(() => {
  resetScoutServer()
  mockPush.mockReset()
  mockNavigate.mockReset()
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(scoutMe())
})

const open = async () => {
  const view = await renderWithProviders(<ScoutMissionsScreen />)
  await act(async () => {})
  return view
}
const visitedPaths = () =>
  [mockPush, mockNavigate].flatMap((mock) => mock.mock.calls.map(([href]) => pathOf(href)))
/** L'ordre d'apparition des textes donnés, dans l'arbre affiché. */
const orderOf = (texts: string[]) => {
  const all = screen
    .getAllByText(/./)
    .map((node) => [node.props.children].flat().join(''))
    .join('\n')
  return texts.map((text) => all.indexOf(text))
}

describe('ScoutMissionsScreen', () => {
  it('shows the missions of the week, with the number left to do', async () => {
    await open()

    expect(await screen.findByRole('header', { name: containing(T.title) })).toBeTruthy()
    for (const text of [PHOTO, SEARCH, PHONE])
      expect(screen.getByText(containing(text))).toBeTruthy()
    expect(screen.getByText(containing(T.left))).toBeTruthy()
  })

  it('lists the missions to do first, then the ones done', async () => {
    await open()
    await screen.findByText(containing(PHOTO))

    const [photo, phone, search] = orderOf([PHOTO, PHONE, SEARCH])
    expect(photo).toBeGreaterThanOrEqual(0)
    expect(search).toBeGreaterThan(photo as number)
    expect(search).toBeGreaterThan(phone as number)
  })

  it('marks the mission done with « Faite », and the others with their pollen', async () => {
    await open()
    await screen.findByText(containing(PHOTO))

    expect(screen.getAllByText(T.done)).toHaveLength(1)
    expect(screen.getAllByText(containing(T.pollen))).toHaveLength(2)
  })

  it('answers a mission with « Répondre », in the sheet « Ton retour »', async () => {
    await open()
    const answers = await screen.findAllByRole('button', { name: containing(T.answer) })
    expect(answers.length).toBeGreaterThanOrEqual(2)

    await fireEvent.press(answers[0] as (typeof answers)[number])

    const [path] = visitedPaths()
    expect(path?.split('?')[0]).toBe('/scout-report')
    const params = new URLSearchParams(path?.split('?')[1] ?? '')
    expect(params.get('mission')).toBe(missionPhotoId)
    expect(params.get('from')).toBe('/scout/missions')
  })

  it('leaves a mission done answerable', async () => {
    await open()
    await screen.findByText(containing(SEARCH))

    const answers = screen.getAllByRole('button', { name: containing(T.answer) })
    await fireEvent.press(answers.at(-1) as (typeof answers)[number])

    const params = new URLSearchParams(visitedPaths()[0]?.split('?')[1] ?? '')
    expect(params.get('mission')).toBe(missionSearchId)
  })

  it('says a week without mission in one sentence', async () => {
    scoutServer.missions = noMissions
    await open()

    expect(await screen.findByText(containing(T.empty))).toBeTruthy()
    expect(screen.queryByRole('button', { name: containing(T.answer) })).toBeNull()
  })

  it('says the page is for scouts to a member who is no longer one', async () => {
    jest.mocked(getMe).mockResolvedValue(removedScoutMe)
    scoutServer.missionsError = new ApiError('scoutOnly')
    await open()

    await waitFor(() => expect(screen.getByText(containing(T.scoutOnly))).toBeTruthy())
    expect(screen.queryByText(containing(PHONE))).toBeNull()
  })
})
