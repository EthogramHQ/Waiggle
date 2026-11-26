// Tests des réglages « Les Éclaireuses » (R20, docs/scenarios/refonte.md, « Devenir Éclaireuse » et
// « Mes retours et « Ta danse a été entendue » » ; planche R20-Reglages) :
// - un membre qui n'est pas Éclaireuse lit « J'ai un code », qui déplie le champ du code et la
//   phrase de ce que l'entrée change (relecture juridique J1) ; un refus se lit (« Les 30 places
//   sont prises. ») ;
// - une Éclaireuse lit son sceau et « Depuis le … », « Afficher la Goutte », le lien des missions,
//   et « Mes retours » (sorte, texte brut, statut, note de l'administrateur pour un retour corrigé),
//   et peut supprimer un retour après confirmation ;
// - une Éclaireuse retirée lit « Retirée le … » et « Mes retours » au lieu du champ du code (J1).
//
// Ce que ces tests supposent (plan R20, « Appli ») : `ScoutSettingsScreen` (sans propriété), à
// l'adresse `/settings/scouts` ; le membre vient de `useMe` (`getMe`, remplacé ici) ; les retours
// et les écritures de `scout/api` (remplacé par `scout.testkit.tsx`) ; les missions à
// `/scout/missions`.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import { getMe } from '../profile/api'
import {
  bugReportId,
  memberMe,
  myReports,
  removedScoutMe,
  resetScoutServer,
  scoutMe,
  scoutServer,
} from '../scout/scout.testkit'
import { passTapGuard } from '../testing/dialog'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ScoutSettingsScreen } from './ScoutSettingsScreen'

const kit = () => require('../scout/scout.testkit') as typeof import('../scout/scout.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../scout/api', () => kit().mockScoutApi())
// Toute autre lecture de l'API (la barre, les états partagés) répond « introuvable ».
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
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/settings/scouts',
    useRouter: () => ({
      push: mockPush,
      navigate: mockNavigate,
      replace: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => ({}),
    useNavigation: () => ({ addListener: () => () => {} }),
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, ...rest }, children),
  }
})

// --- Les textes ---

const t = fr.t.bind(fr)
const T = {
  haveCode: t(($) => $.scout.haveCode),
  codeLabel: t(($) => $.scout.codeLabel),
  join: t(($) => $.scout.join),
  joinInfo: t(($) => $.scout.joinInfo),
  showDrop: t(($) => $.scout.showDrop),
  myReports: t(($) => $.scout.myReports),
  reportsEmpty: t(($) => $.scout.reportsEmpty),
  reportMenu: t(($) => $.scout.reportMenu),
  deleteReport: t(($) => $.scout.deleteReport),
  deleteTitle: t(($) => $.scout.deleteTitle),
  delete: t(($) => $.scout.delete),
  missions: t(($) => $.scout.missions.title),
  seal: t(($) => $.game.seals.scout_founder),
  full: t(($) => $.errors.scoutFull),
  invalid: t(($) => $.errors.scoutCodeInvalid),
  status: (code: 'sent' | 'read' | 'planned' | 'fixed' | 'parked') =>
    t(($) => $.scout.statuses[code]),
}
const since = (date: string) => t(($) => $.scout.since, { date }).replace(date, '')
const removedOn = (date: string) => t(($) => $.scout.removedOn, { date }).replace(date, '')

// --- Les aides ---

beforeEach(() => {
  resetScoutServer()
  mockPush.mockReset()
  mockNavigate.mockReset()
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(scoutMe())
})

/** Ouvre les réglages et attend que le profil soit lu. */
const open = async () => {
  const view = await renderWithProviders(<ScoutSettingsScreen />)
  await act(async () => {})
  await act(async () => {})
  return view
}
const visitedPaths = () =>
  [mockPush, mockNavigate].flatMap((mock) => mock.mock.calls.map(([href]) => pathOf(href)))
/** Le lien ou le bouton qui porte ce nom. */
const control = (name: string | RegExp) =>
  screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name })

// --- Un membre qui n'est pas Éclaireuse ---

describe('the scouts settings of a member who is not a scout', () => {
  beforeEach(() => {
    jest.mocked(getMe).mockResolvedValue(memberMe)
  })

  it('shows « J’ai un code », which unfolds the code field and what joining means', async () => {
    await open()

    expect(screen.queryByLabelText(containing(T.codeLabel))).toBeNull()
    fireEvent.press(await screen.findByRole('button', { name: T.haveCode }))

    expect(screen.getByLabelText(containing(T.codeLabel))).toBeTruthy()
    expect(screen.getByText(containing(T.joinInfo))).toBeTruthy()
    expect(screen.getByRole('button', { name: T.join })).toBeTruthy()
  })

  it('joins the scouts with the typed code, then shows the scout settings', async () => {
    await open()
    fireEvent.press(await screen.findByRole('button', { name: T.haveCode }))

    fireEvent.changeText(screen.getByLabelText(containing(T.codeLabel)), 'ECLAIREUSES-2026')
    await fireEvent.press(screen.getByRole('button', { name: T.join }))
    await act(async () => {})

    expect(scoutServer.join).toHaveBeenCalledWith({ code: 'ECLAIREUSES-2026' })
    expect(await screen.findByText(containing(T.seal))).toBeTruthy()
    expect(screen.getByRole('switch', { name: T.showDrop })).toBeTruthy()
  })

  it('says « Les 30 places sont prises. » when the places are taken', async () => {
    scoutServer.join.mockRejectedValue(new ApiError('scoutFull'))
    await open()
    fireEvent.press(await screen.findByRole('button', { name: T.haveCode }))

    fireEvent.changeText(screen.getByLabelText(containing(T.codeLabel)), 'ECLAIREUSES-2026')
    await fireEvent.press(screen.getByRole('button', { name: T.join }))

    expect(await screen.findByText(containing(T.full))).toBeTruthy()
    // Le champ reste là, avec le code tapé.
    expect(screen.getByLabelText(containing(T.codeLabel)).props.value).toBe('ECLAIREUSES-2026')
  })

  it('says a wrong code like a wrong invite code', async () => {
    scoutServer.join.mockRejectedValue(new ApiError('scoutCodeInvalid'))
    await open()
    fireEvent.press(await screen.findByRole('button', { name: T.haveCode }))

    fireEvent.changeText(screen.getByLabelText(containing(T.codeLabel)), 'PAS-LE-BON-CODE')
    await fireEvent.press(screen.getByRole('button', { name: T.join }))

    expect(await screen.findByText(containing(T.invalid))).toBeTruthy()
  })

  it('shows neither the drop setting nor « Mes retours »', async () => {
    await open()
    await screen.findByRole('button', { name: T.haveCode })

    expect(screen.queryByRole('switch', { name: T.showDrop })).toBeNull()
    expect(screen.queryByText(T.myReports)).toBeNull()
  })
})

// --- Une Éclaireuse ---

describe('the scouts settings of a scout', () => {
  it('shows her seal and since when she is a scout, without the code field', async () => {
    await open()

    expect(await screen.findByText(containing(T.seal))).toBeTruthy()
    expect(screen.getByText(containing(since('').trim()))).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.haveCode })).toBeNull()
    expect(screen.queryByLabelText(containing(T.codeLabel))).toBeNull()
  })

  it('turns « Afficher la Goutte » off', async () => {
    await open()
    const toggle = await screen.findByRole('switch', { name: T.showDrop })

    await fireEvent(toggle, 'valueChange', false)
    await act(async () => {})

    expect(scoutServer.settings).toHaveBeenCalledWith({ showDrop: false })
  })

  it('leads to the missions of the week', async () => {
    await open()

    await fireEvent.press(await waitFor(() => control(containing(T.missions))))

    const link = screen.queryByRole('link', { name: containing(T.missions) })
    const paths = [...visitedPaths(), ...(link ? [pathOf(link.props.href)] : [])]
    expect(paths).toContain('/scout/missions')
  })

  it('lists her reports with their kind, text and status', async () => {
    await open()

    expect(await screen.findByText(containing(T.myReports))).toBeTruthy()
    for (const report of myReports) expect(screen.getByText(containing(report.text))).toBeTruthy()
    for (const code of ['sent', 'planned', 'fixed'] as const)
      expect(screen.getAllByText(T.status(code)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(t(($) => $.scout.kinds.bug)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(t(($) => $.scout.kinds.idea)).length).toBeGreaterThan(0)
  })

  it('shows the note of the administrator on a fixed report', async () => {
    await open()

    expect(
      await screen.findByText(
        containing(t(($) => $.scout.fixedNote, { note: 'Corrigé le 28/11, merci !' })),
      ),
    ).toBeTruthy()
  })

  // Choix 15 du plan : le texte d'un retour s'affiche en texte brut, jamais en Markdown.
  it('shows a report text as plain text, Markdown marks included', async () => {
    scoutServer.reports = [
      {
        ...(myReports[0] as (typeof myReports)[number]),
        text: '**gras** et [lien](https://exemple.fr)',
      },
    ]
    await open()

    expect(
      await screen.findByText(containing('**gras** et [lien](https://exemple.fr)')),
    ).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'lien' })).toBeNull()
  })

  it('says that there is no report yet', async () => {
    scoutServer.reports = []
    await open()

    expect(await screen.findByText(containing(T.reportsEmpty))).toBeTruthy()
  })

  it('deletes a report after a confirmation', async () => {
    await open()
    const menus = await screen.findAllByRole('button', { name: containing(T.reportMenu) })

    await fireEvent.press(menus[0] as (typeof menus)[number])
    await fireEvent.press(await screen.findByRole('menuitem', { name: T.deleteReport }))
    expect(await screen.findByText(T.deleteTitle)).toBeTruthy()
    expect(scoutServer.remove).not.toHaveBeenCalled()
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.delete }))
    await act(async () => {})

    expect(scoutServer.remove).toHaveBeenCalledWith(bugReportId)
  })
})

// --- Une Éclaireuse retirée (relecture juridique J1) ---

describe('the scouts settings of a removed scout', () => {
  beforeEach(() => {
    jest.mocked(getMe).mockResolvedValue(removedScoutMe)
  })

  it('shows a removed scout her removal and her reports instead of the code field', async () => {
    await open()

    expect(await screen.findByText(containing(removedOn('').trim()))).toBeTruthy()
    expect(screen.getByText(containing(T.myReports))).toBeTruthy()
    for (const report of myReports) expect(screen.getByText(containing(report.text))).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.haveCode })).toBeNull()
    expect(screen.queryByLabelText(containing(T.codeLabel))).toBeNull()
  })

  it('offers her no drop setting', async () => {
    await open()
    await screen.findByText(containing(removedOn('').trim()))

    expect(screen.queryByRole('switch', { name: T.showDrop })).toBeNull()
  })
})
