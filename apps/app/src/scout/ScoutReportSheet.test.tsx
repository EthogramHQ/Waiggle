// Tests de la feuille « Ton retour » des Éclaireuses (R20, docs/scenarios/refonte.md, « Le retour
// normé » et « Les missions de la semaine » ; planches R20-Retour, R20-Envoye) : les missions de la
// semaine en tête (« Faite » pour celles déjà faites), la sorte (Bug, Confus, Idée, J'adore, une
// seule, obligatoire), la gravité pour un Bug ou un Confus seulement, le texte obligatoire de 2 000
// caractères au plus, une capture facultative avec son aide (relecture juridique J3), « Joint à ton
// retour » qui écrit en clair chaque valeur envoyée, avec la case qui retire le tout (J5), la limite
// des 20 retours par jour dite dès l'ouverture, « Abandonner ce retour ? », et « Merci, c'est noté ».
//
// Ce que ces tests supposent (plan R20, « Appli ») : `ScoutReportSheet` (sans propriété), monté par
// `app/scout-report.tsx` ; l'écran d'où l'on vient arrive par le paramètre `from` ; le retour part
// par `useSendScoutReport().mutate({ report, capture })` (scout/api, remplacé par
// `scout.testkit.tsx`) ; la capture se choisit par `media/pick` (`pickImage`) ; la version de
// l'appli vient de `config.ts` (`appVersion`).
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import { getMe } from '../profile/api'
import { passTapGuard } from '../testing/dialog'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { ScoutDrop } from './ScoutDrop'
import { ScoutReportSheet } from './ScoutReportSheet'
import {
  missionPhotoId,
  missionSearchId,
  myReports,
  pressEscape,
  reportsSince,
  resetScoutServer,
  scoutMe,
  scoutServer,
} from './scout.testkit'

const kit = () => require('./scout.testkit') as typeof import('./scout.testkit')
const mockPicked = { next: null as { uri: string; width: number; height: number } | null }

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../scout/api', () => kit().mockScoutApi())
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../config', () => ({
  ...jest.requireActual('../config'),
  appVersion: 'a1b2c3d',
}))
jest.mock('../media/pick', () => ({
  ...jest.requireActual('../media/pick'),
  pickImage: async (_shape?: unknown, onChosen?: () => void) => {
    const image = mockPicked.next
    mockPicked.next = null
    if (image) onChosen?.()
    return image
  },
}))
const mockRouter = {
  push: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  dismiss: jest.fn(),
  canGoBack: () => true,
}
const mockNav = {
  pathname: '/scout-report',
  params: { from: '/projects/42' } as Record<string, string>,
}
jest.mock('expo-router', () => ({
  usePathname: () => mockNav.pathname,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockNav.params,
  useGlobalSearchParams: () => mockNav.params,
  useNavigation: () => ({ addListener: () => () => {} }),
  useSegments: () => [],
}))

// --- Les textes ---

const t = fr.t.bind(fr)
const T = {
  title: t(($) => $.scout.sheet.title),
  send: t(($) => $.scout.sheet.send),
  more: t(($) => $.scout.sheet.more),
  severity: t(($) => $.scout.sheet.severity),
  text: t(($) => $.scout.sheet.text),
  capture: t(($) => $.scout.sheet.capture),
  captureHint: t(($) => $.scout.sheet.captureHint),
  removeCapture: t(($) => $.scout.sheet.removeCapture),
  attached: t(($) => $.scout.sheet.attached),
  attach: t(($) => $.scout.sheet.attach),
  missingKind: t(($) => $.scout.sheet.missingKind),
  missingSeverity: t(($) => $.scout.sheet.missingSeverity),
  missingText: t(($) => $.scout.sheet.missingText),
  limit: t(($) => $.scout.sheet.limit),
  close: t(($) => $.scout.sheet.close),
  discardTitle: t(($) => $.scout.sheet.discardTitle),
  keep: t(($) => $.scout.sheet.keep),
  discard: t(($) => $.scout.sheet.discard),
  sent: t(($) => $.scout.sheet.sent),
  done: t(($) => $.scout.missions.done),
  removeMission: t(($) => $.scout.sheet.removeMission),
  fold: t(($) => $.scout.drop.fold),
  settings: t(($) => $.scout.drop.settings),
  unfold: t(($) => $.scout.drop.unfold),
  dropLabel: t(($) => $.scout.drop.label),
  kind: (code: 'bug' | 'confusing' | 'idea' | 'love') => t(($) => $.scout.kinds[code]),
  severityOf: (code: 'minor' | 'annoying' | 'blocking') => t(($) => $.scout.severities[code]),
  field: (code: 'screen' | 'device' | 'version' | 'language' | 'theme') =>
    t(($) => $.scout.sheet.fields[code]),
}
/** Ce que « Joint à ton retour » écrit pour un iPhone de 390 points, en français, de jour. */
const ATTACHED_VALUES = [
  '/projects/42',
  t(($) => $.scout.sheet.deviceValue, {
    platform: t(($) => $.scout.sheet.platforms.ios),
    width: 390,
  }),
  'a1b2c3d',
  t(($) => $.common.languages.fr),
  t(($) => $.scout.sheet.schemes.day),
]
const PHOTO_MISSION = 'Publie un projet avec une photo'

// --- Les aides ---

beforeEach(() => {
  resetScoutServer()
  mockNav.pathname = '/scout-report'
  mockNav.params = { from: '/projects/42' }
  mockPicked.next = null
  for (const fn of Object.values(mockRouter)) if (jest.isMockFunction(fn)) fn.mockReset()
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(scoutMe())
})

/** Ouvre la feuille et attend son titre et ses missions, puis la fin de la garde des tapes. */
const openSheet = async () => {
  const view = await renderWithProviders(
    <ToastProvider>
      <ScoutReportSheet />
    </ToastProvider>,
  )
  await screen.findByRole('header', { name: T.title })
  await act(async () => {})
  await passTapGuard()
  return view
}

const radio = (name: string) => screen.getByRole('radio', { name })
/** Vrai si le choix ou la case est coché (`aria-checked`, ou l'état de React Native). */
const checked = (element: { props: Record<string, unknown> }) =>
  Boolean(
    element.props['aria-checked'] ??
      (element.props.accessibilityState as { checked?: boolean } | undefined)?.checked,
  )
const choose = (name: string) => fireEvent.press(radio(name))
const textField = () => screen.getByLabelText(containing(T.text))
const write = (text: string) => fireEvent.changeText(textField(), text)
const send = async () => {
  await fireEvent.press(screen.getByRole('button', { name: T.send }))
  await act(async () => {})
}
/** Ce qui est parti par `useSendScoutReport`, envoi par envoi. */
const sent = () => scoutServer.send.mock.calls.map(([one]) => one)
const departures = () =>
  (['push', 'navigate', 'replace', 'back', 'dismiss'] as const).reduce(
    (count, name) => count + mockRouter[name].mock.calls.length,
    0,
  )
/** Déplie « Joint à ton retour ». */
const openAttached = () =>
  fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${T.attached}`) }))
const attachBox = () => screen.getByRole('checkbox', { name: T.attach })

// --- Ce que la feuille montre ---

describe('the sheet « Ton retour »', () => {
  it('offers the four kinds, one at a time', async () => {
    await openSheet()

    for (const code of ['bug', 'confusing', 'idea', 'love'] as const)
      expect(radio(T.kind(code))).toBeTruthy()

    await choose(T.kind('idea'))
    await choose(T.kind('love'))

    expect(checked(radio(T.kind('love')))).toBe(true)
    expect(checked(radio(T.kind('idea')))).toBe(false)
  })

  it.each(['bug', 'confusing'] as const)('asks the severity of a %s', async (code) => {
    await openSheet()

    await choose(T.kind(code))

    expect(screen.getByText(T.severity)).toBeTruthy()
    for (const level of ['minor', 'annoying', 'blocking'] as const)
      expect(radio(T.severityOf(level))).toBeTruthy()
  })

  it.each(['idea', 'love'] as const)('asks no severity for a %s', async (code) => {
    await openSheet()

    await choose(T.kind(code))

    expect(screen.queryByText(T.severity)).toBeNull()
    expect(screen.queryByRole('radio', { name: T.severityOf('minor') })).toBeNull()
  })

  it('sends no severity once a bug becomes an idea', async () => {
    await openSheet()
    await choose(T.kind('bug'))
    await choose(T.severityOf('blocking'))
    await choose(T.kind('idea'))
    await write('Trier mes projets par date')

    await send()

    expect(sent()).toHaveLength(1)
    expect(sent()[0]?.report.kind).toBe('idea')
    expect(sent()[0]?.report).not.toHaveProperty('severity')
  })

  it('sends a bug with its kind, severity, text and the screen it came from', async () => {
    await openSheet()
    await choose(T.kind('bug'))
    await choose(T.severityOf('annoying'))
    await write('Le bouton Publier se cache derrière le clavier')

    await send()

    expect(sent()).toEqual([
      {
        report: {
          kind: 'bug',
          severity: 'annoying',
          text: 'Le bouton Publier se cache derrière le clavier',
          context: {
            screen: '/projects/42',
            platform: 'ios',
            width: 390,
            appVersion: 'a1b2c3d',
            language: 'fr',
            scheme: 'day',
          },
        },
        capture: null,
      },
    ])
  })

  describe('what it requires', () => {
    it('refuses to send without a kind, and says so', async () => {
      await openSheet()
      await write('Quelque chose coince')

      await send()

      expect(sent()).toEqual([])
      expect(screen.getByText(T.missingKind)).toBeTruthy()
    })

    it('refuses to send a bug without a severity, and says so', async () => {
      await openSheet()
      await choose(T.kind('bug'))
      await write('Quelque chose coince')

      await send()

      expect(sent()).toEqual([])
      expect(screen.getByText(T.missingSeverity)).toBeTruthy()
    })

    it.each(['', '   '])('refuses to send an empty text (%j), and says so', async (text) => {
      await openSheet()
      await choose(T.kind('love'))
      await write(text)

      await send()

      expect(sent()).toEqual([])
      expect(screen.getByText(T.missingText)).toBeTruthy()
    })

    it('sends a text of 2 000 characters, and refuses one of 2 001', async () => {
      await openSheet()
      await choose(T.kind('idea'))
      await write('a'.repeat(2001))

      await send()
      expect(sent()).toEqual([])

      await write('a'.repeat(2000))
      await send()
      expect(sent()).toHaveLength(1)
    })

    it('shows the 2 000 characters limit with the text', async () => {
      await openSheet()
      await write('Bonjour')

      // Le compteur de `TextField` (« 7 / 2 000 », l'espace des milliers est insécable).
      expect(screen.getAllByText(/2\s000/).length).toBeGreaterThan(0)
    })
  })

  describe('the capture', () => {
    it('shows the personal data hint under the capture field', async () => {
      await openSheet()

      expect(screen.getByRole('button', { name: containing(T.capture) })).toBeTruthy()
      expect(screen.getByText(containing(T.captureHint))).toBeTruthy()
    })

    it('sends the chosen image with the report', async () => {
      await openSheet()
      await choose(T.kind('love'))
      await write('La danse de l’abeille')
      mockPicked.next = { uri: 'file:///capture.jpg', width: 1170, height: 2532 }

      await fireEvent.press(screen.getByRole('button', { name: containing(T.capture) }))
      await screen.findByRole('button', { name: T.removeCapture })
      await send()

      expect(sent()[0]?.capture).toEqual(expect.objectContaining({ uri: 'file:///capture.jpg' }))
    })

    it('sends no image once the capture is removed', async () => {
      await openSheet()
      await choose(T.kind('love'))
      await write('La danse de l’abeille')
      mockPicked.next = { uri: 'file:///capture.jpg', width: 1170, height: 2532 }
      await fireEvent.press(screen.getByRole('button', { name: containing(T.capture) }))

      await fireEvent.press(await screen.findByRole('button', { name: T.removeCapture }))
      await send()

      expect(sent()[0]?.capture).toBeNull()
    })
  })

  describe('« Joint à ton retour »', () => {
    it('shows in clear each value that will be attached', async () => {
      await openSheet()

      await openAttached()

      for (const code of ['screen', 'device', 'version', 'language', 'theme'] as const)
        expect(screen.getByText(containing(T.field(code)))).toBeTruthy()
      for (const value of ATTACHED_VALUES) expect(screen.getByText(containing(value))).toBeTruthy()
      // Et ce qui part est exactement ce qui est écrit.
      await choose(T.kind('love'))
      await write('Tout est clair')
      await send()
      expect(sent()[0]?.report.context).toEqual({
        screen: '/projects/42',
        platform: 'ios',
        width: 390,
        appVersion: 'a1b2c3d',
        language: 'fr',
        scheme: 'day',
      })
    })

    it('attaches the screen without its parameters', async () => {
      mockNav.params = { from: '/projects/42?comment=9#top' }
      await openSheet()
      await openAttached()

      expect(screen.getByText(containing('/projects/42'))).toBeTruthy()
      expect(screen.queryByText(/comment=9/)).toBeNull()
      await choose(T.kind('love'))
      await write('Tout est clair')
      await send()
      expect(sent()[0]?.report.context?.screen).toBe('/projects/42')
    })

    // Relecture de sécurité du plan (A3) : l'appli valide `from` ; une adresse qui ne commence pas
    // par « / » (un lien d'ailleurs) n'est ni montrée ni envoyée telle quelle.
    it('never attaches a screen that does not start with a slash', async () => {
      mockNav.params = { from: 'https://example.com/piege' }
      await openSheet()
      await choose(T.kind('love'))
      await write('Tout est clair')

      await send()

      expect(sent()).toHaveLength(1)
      expect(sent()[0]?.report.context?.screen ?? '/').toMatch(/^\//)
      expect(screen.queryByText(/example\.com/)).toBeNull()
    })

    it('checks the attach box by default', async () => {
      await openSheet()
      await openAttached()

      expect(checked(attachBox())).toBe(true)
    })

    it('sends no context once the attach box is unchecked', async () => {
      await openSheet()
      await openAttached()
      await fireEvent.press(attachBox())
      await choose(T.kind('bug'))
      await choose(T.severityOf('minor'))
      await write('Une faute dans le menu')

      await send()

      expect(sent()).toHaveLength(1)
      expect(sent()[0]?.report).not.toHaveProperty('context')
    })
  })

  describe('the missions of the week', () => {
    it('lists the missions first, with « Faite » on the one done', async () => {
      await openSheet()

      expect(await screen.findByText(containing(PHOTO_MISSION))).toBeTruthy()
      expect(screen.getByText(containing('Cherche un outil par son nom'))).toBeTruthy()
      expect(screen.getAllByText(T.done)).toHaveLength(1)
    })

    it('sends the chosen mission with the report, which reads « Mission : … »', async () => {
      await openSheet()

      await fireEvent.press(await screen.findByRole('button', { name: containing(PHOTO_MISSION) }))

      expect(
        screen.getByText(containing(t(($) => $.scout.sheet.mission, { mission: PHOTO_MISSION }))),
      ).toBeTruthy()
      await choose(T.kind('idea'))
      await write('Une photo de la fusée')
      await send()
      expect(sent()[0]?.report.missionId).toBe(missionPhotoId)
    })

    // Planches : une mission faite reste touchable (sans pollen de plus).
    it('lets a scout answer a mission already done', async () => {
      await openSheet()

      await fireEvent.press(
        await screen.findByRole('button', { name: containing('Cherche un outil par son nom') }),
      )
      await choose(T.kind('love'))
      await write('Trouvé du premier coup')
      await send()

      expect(sent()[0]?.report.missionId).toBe(missionSearchId)
    })

    // « Répondre », sur la page des missions, ouvre la feuille avec `mission=<id>`.
    it('opens with the mission given by the page of the missions', async () => {
      mockNav.params = { from: '/scout/missions', mission: missionPhotoId }
      await openSheet()

      expect(
        screen.getByText(containing(t(($) => $.scout.sheet.mission, { mission: PHOTO_MISSION }))),
      ).toBeTruthy()
      await choose(T.kind('idea'))
      await write('Une photo de la fusée')
      await send()
      expect(sent()[0]?.report.missionId).toBe(missionPhotoId)
      expect(sent()[0]?.report.context?.screen).toBe('/scout/missions')
    })

    it('sends no mission once its band is closed', async () => {
      await openSheet()
      await fireEvent.press(await screen.findByRole('button', { name: containing(PHOTO_MISSION) }))

      await fireEvent.press(screen.getByRole('button', { name: T.removeMission }))
      await choose(T.kind('idea'))
      await write('Une idée sans mission')
      await send()

      expect(sent()[0]?.report).not.toHaveProperty('missionId')
    })
  })

  describe('the daily limit', () => {
    it('says the limit when the sheet opens after 20 reports in 24 hours, with « Fermer »', async () => {
      scoutServer.reports = reportsSince(new Date(Date.now() - 60 * 60_000), 20)
      await renderWithProviders(
        <ToastProvider>
          <ScoutReportSheet />
        </ToastProvider>,
      )

      expect(await screen.findByText(containing(T.limit))).toBeTruthy()
      expect(screen.getByRole('button', { name: T.close })).toBeTruthy()
      expect(screen.queryByRole('button', { name: T.send })).toBeNull()
    })

    it('opens normally after 19 reports in 24 hours', async () => {
      scoutServer.reports = reportsSince(new Date(Date.now() - 60 * 60_000), 19)
      await openSheet()

      expect(screen.queryByText(containing(T.limit))).toBeNull()
      expect(screen.getByRole('button', { name: T.send })).toBeTruthy()
    })

    it('says the limit when the API refuses a report for the quota', async () => {
      scoutServer.send.mockRejectedValue(new ApiError('rateLimited'))
      await openSheet()
      await choose(T.kind('love'))
      await write('Encore un')

      await send()

      expect(await screen.findByText(containing(T.limit))).toBeTruthy()
      // Le texte reste : rien n'est perdu.
      expect(textField().props.value).toBe('Encore un')
    })
  })

  describe('closing', () => {
    it('asks « Abandonner ce retour ? » before closing with a typed text', async () => {
      await openSheet()
      await write('Un brouillon')

      await pressEscape(T.title)

      expect(await screen.findByText(T.discardTitle)).toBeTruthy()
      expect(departures()).toBe(0)
      await passTapGuard()
      await fireEvent.press(screen.getByRole('button', { name: T.discard }))
      await waitFor(() => expect(departures()).toBeGreaterThan(0))
    })

    it('keeps the text with « Continuer »', async () => {
      await openSheet()
      await write('Un brouillon')
      await pressEscape(T.title)
      await screen.findByText(T.discardTitle)
      await passTapGuard()

      await fireEvent.press(screen.getByRole('button', { name: T.keep }))

      expect(departures()).toBe(0)
      expect(textField().props.value).toBe('Un brouillon')
    })

    it('closes at once without a typed text', async () => {
      await openSheet()

      await pressEscape(T.title)

      expect(screen.queryByText(T.discardTitle)).toBeNull()
      expect(departures()).toBeGreaterThan(0)
    })
  })

  describe('once sent', () => {
    it('closes and says « Merci, c’est noté »', async () => {
      await openSheet()
      await choose(T.kind('love'))
      await write('Le pollen qui danse')

      await send()

      expect(await screen.findByText(containing(T.sent))).toBeTruthy()
      expect(departures()).toBeGreaterThan(0)
    })

    it('sends once on a double tap', async () => {
      let finish: (value: (typeof myReports)[number]) => void = () => {}
      scoutServer.send.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
      await openSheet()
      await choose(T.kind('love'))
      await write('Vite vite')

      const button = screen.getByRole('button', { name: T.send })
      await fireEvent.press(button)
      await fireEvent.press(button)
      await act(async () => finish(myReports[0] as (typeof myReports)[number]))

      expect(sent()).toHaveLength(1)
    })
  })

  describe('the menu « ⋯ »', () => {
    it('leads to the scouts settings', async () => {
      await openSheet()

      await fireEvent.press(screen.getByRole('button', { name: T.more }))
      await fireEvent.press(await screen.findByRole('menuitem', { name: T.settings }))

      const paths = [mockRouter.push, mockRouter.navigate, mockRouter.replace].flatMap((mock) =>
        mock.mock.calls.map(([href]) => pathOf(href)),
      )
      expect(paths).toContain('/settings/scouts')
    })

    // La languette est un état de la session de l'appli : replier depuis la feuille, c'est
    // retrouver la languette sur la page d'en dessous. Le test la rouvre avant de finir.
    it('folds the drop with « Replier la Goutte »', async () => {
      const view = await openSheet()

      await fireEvent.press(screen.getByRole('button', { name: T.more }))
      await fireEvent.press(await screen.findByRole('menuitem', { name: T.fold }))
      await view.unmount()
      mockNav.pathname = '/projects/42'
      await renderWithProviders(<ScoutDrop />)

      const tab = await screen.findByRole('button', { name: T.unfold })
      await fireEvent.press(tab)
      expect(screen.queryByRole('button', { name: T.unfold })).toBeNull()
      // Témoin : la Goutte est revenue.
      expect(screen.getByRole('button', { name: new RegExp(`^${T.dropLabel}`) })).toBeTruthy()
    })
  })
})
