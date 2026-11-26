// Tests de la page de tri des Éclaireuses, pour l'administrateur (R20, docs/scenarios/refonte.md,
// « La page de tri (l'administrateur) » ; planches R20-Tri, R20-Corrige, R20-Missions-Admin) :
// - en tête, le mois (pas lancé avec « Lancer le mois » et sa confirmation, en cours « Jour 12 sur
//   30 », fini), les places (« 18 sur 30 ») et les missions de la semaine (écrire, modifier) ;
// - l'onglet des retours : la liste (« Nouveau » pour un retour envoyé), filtrée par statut, sorte
//   et gravité ; un retour ouvert montre tout (texte brut, ce qui est joint, la capture), son
//   statut, la note privée et son aide (relecture juridique J2), et « Corrigé » demande une
//   confirmation, avec une note facultative pour l'Éclaireuse ; ouvrir ne marque pas « Lu » ;
// - l'onglet des Éclaireuses, et « Retirer », avec un motif obligatoire (J1) ;
// - pour tout autre membre, la page n'existe pas.
//
// Ce que ces tests supposent (plan R20, « Appli ») : `ScoutTriageScreen` (sans propriété), à
// l'adresse `/moderation/scouts` ; l'administrateur se reconnaît à `useMe` (`isAdmin`) ; les
// données et les écritures viennent de `moderation/scouts/api` (remplacé par `scout.testkit.tsx`).
import { programEndOf } from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { getMe } from '../profile/api'
import {
  adminScoutMe,
  endedTriage,
  inesReport,
  memberMe,
  notLaunchedTriage,
  papiJeanReport,
  resetScoutServer,
  runningTriage,
  scoutServer,
} from '../scout/scout.testkit'
import { passTapGuard } from '../testing/dialog'
import { mockSession, renderWithProviders } from '../testing/render'
import { choiceRole, containing, fr } from '../testing/text'
import { ScoutTriageScreen } from './ScoutTriageScreen'

const kit = () => require('../scout/scout.testkit') as typeof import('../scout/scout.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../moderation/scouts/api', () => kit().mockScoutTriageApi())
jest.mock('../api/client', () => {
  const answer = () => Promise.resolve({ ok: false, error: 'notFound' })
  return { request: jest.fn(answer), requestWithoutBody: jest.fn(answer), apiFetch: jest.fn() }
})
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => ({
  usePathname: () => '/moderation/scouts',
  useRouter: () => ({
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ addListener: () => () => {} }),
}))

// --- Les textes ---

const t = fr.t.bind(fr)
const T = {
  title: t(($) => $.scout.triage.title),
  notLaunched: t(($) => $.scout.triage.notLaunched),
  launch: t(($) => $.scout.triage.launch),
  launchTitle: t(($) => $.scout.triage.launchTitle),
  day: t(($) => $.scout.triage.day, { day: 12, total: 30 }),
  ended: t(($) => $.scout.triage.ended, { date: '' }).trim(),
  endedHint: t(($) => $.scout.triage.endedHint),
  places: t(($) => $.scout.triage.placesValue, { count: 18, total: 30 }),
  missions: t(($) => $.scout.triage.missions),
  editMissions: t(($) => $.scout.triage.editMissions),
  writeMissions: t(($) => $.scout.triage.writeMissions),
  noMission: t(($) => $.scout.triage.noMission),
  add: t(($) => $.scout.triage.editor.add),
  publish: t(($) => $.scout.triage.editor.publish),
  fr: t(($) => $.scout.triage.editor.fr),
  newReport: t(($) => $.scout.triage.new),
  filterStatus: t(($) => $.scout.triage.filterStatus),
  filterKind: t(($) => $.scout.triage.filterKind),
  noMatch: t(($) => $.scout.triage.noMatch),
  attached: t(($) => $.scout.triage.attached),
  openCapture: t(($) => $.scout.triage.openCapture),
  privateNote: t(($) => $.scout.triage.privateNote),
  privateNoteHint: t(($) => $.scout.triage.privateNoteHint, { name: 'Inès' }),
  fixTitle: t(($) => $.scout.triage.fixTitle),
  fixNote: t(($) => $.scout.triage.fixNote, { name: 'Inès' }),
  fixConfirm: t(($) => $.scout.triage.fixConfirm),
  remove: t(($) => $.scout.triage.scouts.remove),
  removeTitle: t(($) => $.scout.triage.scouts.removeTitle, { name: 'Inès' }),
  reason: t(($) => $.scout.triage.scouts.reason),
  reasonHint: t(($) => $.scout.triage.scouts.reasonHint),
  confirmRemove: t(($) => $.scout.triage.scouts.confirm),
  removedOn: t(($) => $.scout.triage.scouts.removed, { date: '' }).trim(),
  notFound: t(($) => $.states.notFoundTitle),
  status: (code: 'sent' | 'read' | 'planned' | 'fixed' | 'parked') =>
    t(($) => $.scout.statuses[code]),
  kind: (code: 'bug' | 'confusing' | 'idea' | 'love') => t(($) => $.scout.kinds[code]),
}

// --- Les aides ---

beforeEach(() => {
  resetScoutServer()
  // Le mois lancé il y a 11 jours, à la même heure : aujourd'hui est son 12e jour.
  const startedAt = new Date(Date.now() - 11 * 24 * 3_600_000)
  scoutServer.triage = {
    ...runningTriage,
    program: {
      startedAt: startedAt.toISOString(),
      endsAt: programEndOf(startedAt).toISOString(),
    },
  }
  mockSession({ user: { id: 'u9', name: 'Louis' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(adminScoutMe)
})

const open = async () => {
  const view = await renderWithProviders(<ScoutTriageScreen />)
  await act(async () => {})
  await act(async () => {})
  return view
}

/** Le dernier bouton de ce nom : celui de la fenêtre de confirmation, posée par-dessus la page. */
const lastButton = (name: string | RegExp) => {
  const buttons = screen.getAllByRole('button', { name })
  return buttons.at(-1) as (typeof buttons)[number]
}

/** Un choix d'un menu ou d'une rangée de pastilles, quel que soit le composant retenu. */
const pickChoice = async (name: string) => {
  for (const role of [choiceRole(), 'menuitem', 'radio', 'button'] as const) {
    const found = screen.queryAllByRole(role, { name })
    if (found.length > 0) {
      await fireEvent.press(found.at(-1) as (typeof found)[number])
      return
    }
  }
  throw new Error(`no choice named ${name}`)
}

/** Ouvre un retour de la liste par le début de son texte. */
const openReport = async (text: string) => {
  const row =
    screen.queryAllByRole('link', { name: containing(text) }).at(0) ??
    (await screen.findAllByRole('button', { name: containing(text) })).at(0)
  if (!row) throw new Error(`no report row for ${text}`)
  await fireEvent.press(row)
  await act(async () => {})
}

const isDisabled = (element: { props: Record<string, unknown> }) =>
  Boolean(
    element.props['aria-disabled'] ??
      (element.props.accessibilityState as { disabled?: boolean } | undefined)?.disabled,
  )

// --- Qui voit la page ---

describe('who sees the scouts triage page', () => {
  it('shows « Page introuvable » to a member who is not an admin, and reads no report', async () => {
    jest.mocked(getMe).mockResolvedValue(memberMe)
    await open()

    expect(await screen.findByText(containing(T.notFound))).toBeTruthy()
    expect(scoutServer.filters).toEqual([])
    expect(screen.queryByText(containing(inesReport.text))).toBeNull()
  })

  it('shows the page to an admin', async () => {
    await open()

    expect(await screen.findByRole('header', { name: containing(T.title) })).toBeTruthy()
  })
})

// --- Le haut de la page ---

describe('the month, the places and the missions', () => {
  it('offers « Lancer le mois » before the month, with a confirmation', async () => {
    scoutServer.triage = notLaunchedTriage
    await open()

    expect(await screen.findByText(containing(T.notLaunched))).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: T.launch }))
    expect(await screen.findByText(containing(T.launchTitle))).toBeTruthy()
    expect(scoutServer.launch).not.toHaveBeenCalled()
    await passTapGuard()
    await fireEvent.press(lastButton(T.launch))
    await act(async () => {})

    expect(scoutServer.launch).toHaveBeenCalledTimes(1)
  })

  it('says the day of the month while it runs, without « Lancer le mois »', async () => {
    await open()

    expect(await screen.findByText(containing(T.day))).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.launch })).toBeNull()
  })

  it('says when the month ended, and what stopped', async () => {
    scoutServer.triage = endedTriage
    await open()

    expect(await screen.findByText(containing(T.ended))).toBeTruthy()
    expect(screen.getByText(containing(T.endedHint))).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.launch })).toBeNull()
  })

  it('says the places taken', async () => {
    await open()

    expect(await screen.findByText(containing(T.places))).toBeTruthy()
  })

  it('shows the missions of the week, and publishes them changed', async () => {
    await open()
    expect(await screen.findByText(containing('Publie un projet avec une photo'))).toBeTruthy()

    await fireEvent.press(screen.getByRole('button', { name: containing(T.editMissions) }))
    await fireEvent.press(await screen.findByRole('button', { name: containing(T.add) }))
    const fields = screen.getAllByLabelText(containing(T.fr))
    fireEvent.changeText(fields.at(-1) as (typeof fields)[number], 'Essaie le mode nuit')
    await fireEvent.press(screen.getByRole('button', { name: T.publish }))
    await act(async () => {})

    expect(scoutServer.saveMissions).toHaveBeenCalledWith({
      missions: [
        expect.objectContaining({
          id: runningTriage.missions[0]?.id,
          textFr: 'Publie un projet avec une photo',
        }),
        expect.objectContaining({ textFr: 'Essaie le mode nuit' }),
      ],
    })
    const second = scoutServer.saveMissions.mock.calls[0]?.[0].missions[1]
    expect(second).not.toHaveProperty('id')
  })

  it('says a week without mission, with « Écrire »', async () => {
    scoutServer.triage = { ...scoutServer.triage, missions: [] }
    await open()

    expect(await screen.findByText(containing(T.noMission))).toBeTruthy()
    expect(screen.getByRole('button', { name: containing(T.writeMissions) })).toBeTruthy()
  })
})

// --- Les retours ---

describe('the reports', () => {
  it('lists the reports, the newest first, with « Nouveau » for a report just sent', async () => {
    await open()

    expect(await screen.findByText(containing(inesReport.text))).toBeTruthy()
    expect(screen.getByText(containing(papiJeanReport.text))).toBeTruthy()
    expect(screen.getAllByText(containing('Inès')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(T.newReport).length).toBeGreaterThan(0)
    // L'administrateur ne lit jamais « Envoyé » : c'est le mot de l'Éclaireuse.
    expect(screen.queryByText(T.status('sent'))).toBeNull()
  })

  it('filters the reports by status', async () => {
    await open()
    await screen.findByText(containing(inesReport.text))

    await fireEvent.press(screen.getByRole('button', { name: containing(T.filterStatus) }))
    await pickChoice(T.status('planned'))
    await act(async () => {})

    expect(scoutServer.filters.at(-1)).toEqual(expect.objectContaining({ status: 'planned' }))
    expect(screen.queryByText(containing(inesReport.text))).toBeNull()
    expect(screen.getByText(containing(papiJeanReport.text))).toBeTruthy()
  })

  it('filters the reports by kind, and says when nothing matches', async () => {
    await open()
    await screen.findByText(containing(inesReport.text))

    await fireEvent.press(screen.getByRole('button', { name: containing(T.filterKind) }))
    await pickChoice(T.kind('love'))
    await act(async () => {})

    expect(scoutServer.filters.at(-1)).toEqual(expect.objectContaining({ kind: 'love' }))
    expect(await screen.findByText(containing(T.noMatch))).toBeTruthy()
  })

  it('shows an opened report whole: text, what is attached and the capture', async () => {
    await open()
    await openReport(inesReport.text)

    expect(screen.getAllByText(containing(inesReport.text)).length).toBeGreaterThan(0)
    expect(screen.getByText(containing(T.attached))).toBeTruthy()
    expect(screen.getByText(containing('/projects/42'))).toBeTruthy()
    expect(screen.getByRole('button', { name: containing(T.openCapture) })).toBeTruthy()
  })

  // Relecture de sécurité du plan (A3) : l'écran joint se lit en texte, jamais en lien.
  it('shows the attached screen as text, never as a link', async () => {
    await open()
    await openReport(inesReport.text)

    expect(screen.queryByRole('link', { name: containing('/projects/42') })).toBeNull()
  })

  it('shows a report text as plain text, Markdown marks included', async () => {
    scoutServer.adminReports = [{ ...inesReport, text: '**gras** et [lien](https://exemple.fr)' }]
    await open()

    expect(
      (await screen.findAllByText(containing('**gras** et [lien](https://exemple.fr)'))).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'lien' })).toBeNull()
  })

  it('does not mark a report read when it is opened', async () => {
    await open()
    await openReport(inesReport.text)

    expect(scoutServer.patch).not.toHaveBeenCalled()
  })

  it('changes the status of a report', async () => {
    await open()
    await openReport(inesReport.text)

    await pickChoice(T.status('planned'))
    await act(async () => {})

    expect(scoutServer.patch).toHaveBeenCalledWith({
      id: inesReport.id,
      patch: { status: 'planned' },
    })
  })

  it('shows the private note with its hint: the scout sees it only in her export', async () => {
    await open()
    await openReport(inesReport.text)

    expect(screen.getByLabelText(containing(T.privateNote))).toBeTruthy()
    expect(screen.getByText(containing(T.privateNoteHint))).toBeTruthy()
  })

  it('asks a confirmation before « Corrigé », and sends the optional note for the scout', async () => {
    await open()
    await openReport(inesReport.text)

    await pickChoice(T.status('fixed'))
    expect(await screen.findByText(containing(T.fixTitle))).toBeTruthy()
    expect(scoutServer.patch).not.toHaveBeenCalled()
    fireEvent.changeText(screen.getByLabelText(containing(T.fixNote)), 'Corrigé le 28/11, merci !')
    await passTapGuard()
    await fireEvent.press(lastButton(T.fixConfirm))
    await act(async () => {})

    expect(scoutServer.patch).toHaveBeenCalledWith({
      id: inesReport.id,
      patch: expect.objectContaining({ status: 'fixed', fixedNote: 'Corrigé le 28/11, merci !' }),
    })
  })

  it('marks a report fixed without a note', async () => {
    await open()
    await openReport(inesReport.text)

    await pickChoice(T.status('fixed'))
    await screen.findByText(containing(T.fixTitle))
    await passTapGuard()
    await fireEvent.press(lastButton(T.fixConfirm))
    await act(async () => {})

    expect(scoutServer.patch).toHaveBeenCalledTimes(1)
    const sent = scoutServer.patch.mock.calls[0]?.[0]
    expect(sent?.patch.status).toBe('fixed')
    expect(sent?.patch.fixedNote ?? null).toBeNull()
  })

  // Le contrat (`scout_report_fixed`) : un retour corrigé ne change plus de statut.
  it('offers no other status to a fixed report', async () => {
    scoutServer.adminReports = [
      { ...inesReport, status: 'fixed', fixedNote: null, fixedAt: '2026-11-25T10:00:00.000Z' },
    ]
    await open()
    await openReport(inesReport.text)

    for (const code of ['read', 'planned', 'parked'] as const) {
      const choices = [choiceRole(), 'menuitem', 'radio', 'button'].flatMap((role) =>
        screen.queryAllByRole(role as 'button', { name: T.status(code) }),
      )
      for (const choice of choices) expect(isDisabled(choice)).toBe(true)
    }
  })
})

// --- Les Éclaireuses ---

describe('the scouts tab', () => {
  const openScouts = async () => {
    await open()
    await fireEvent.press(await screen.findByRole('tab', { name: /^Éclaireuses/ }))
    await act(async () => {})
  }

  it('lists the scouts with their number of reports', async () => {
    await openScouts()

    expect(screen.getAllByText(containing('Inès')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(containing('Papi Jean')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('4').length).toBeGreaterThan(0)
  })

  it('refuses to remove a scout without a reason', async () => {
    await openScouts()
    const removes = screen.getAllByRole('button', { name: containing(T.remove) })

    await fireEvent.press(removes[0] as (typeof removes)[number])
    expect(await screen.findByText(containing(T.removeTitle))).toBeTruthy()
    expect(screen.getByLabelText(containing(T.reason))).toBeTruthy()
    expect(screen.getByText(containing(T.reasonHint))).toBeTruthy()
    await passTapGuard()
    await fireEvent.press(lastButton(T.confirmRemove))
    await act(async () => {})

    expect(scoutServer.removeScout).not.toHaveBeenCalled()
  })

  it('removes a scout with the reason typed', async () => {
    await openScouts()
    const removes = screen.getAllByRole('button', { name: containing(T.remove) })
    await fireEvent.press(removes[0] as (typeof removes)[number])
    await screen.findByText(containing(T.removeTitle))

    fireEvent.changeText(
      screen.getByLabelText(containing(T.reason)),
      'Des retours d’insultes à répétition.',
    )
    await passTapGuard()
    await fireEvent.press(lastButton(T.confirmRemove))
    await act(async () => {})

    expect(scoutServer.removeScout).toHaveBeenCalledWith({
      memberId: 'u5',
      reason: 'Des retours d’insultes à répétition.',
    })
  })

  it('shows a removed scout with her removal date, without « Retirer »', async () => {
    scoutServer.triage = {
      ...scoutServer.triage,
      scouts: [
        {
          member: inesReport.author,
          joinedAt: '2026-11-15T10:00:00.000Z',
          removedAt: '2026-11-20T10:00:00.000Z',
          reports: 4,
        },
      ],
    }
    await openScouts()

    expect(screen.getByText(containing(T.removedOn))).toBeTruthy()
    expect(screen.queryByRole('button', { name: containing(T.remove) })).toBeNull()
    expect(screen.getAllByText(containing('Inès')).length).toBeGreaterThan(0)
  })
})
