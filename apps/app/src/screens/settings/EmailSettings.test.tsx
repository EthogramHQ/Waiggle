// Tests de l'écran « Notifications » des réglages (R8, planche `R8-Reglages`), qui remplace la
// section « E-mails » de 6c (deux interrupteurs). En tête, un exemple de notification sans nom et
// ce qui arrive dans l'appli ; « Sur ce téléphone », grisé, « Bientôt » ; puis « Par e-mail », une
// ligne par type avec son choix actuel (« Tout de suite », « Dans le récap », « Jamais ») : un
// toucher ouvre les choix sur place, un seul type ouvert à la fois, et chaque choix s'enregistre
// aussitôt (un PATCH d'un seul champ). Puis l'interrupteur du récap ; coupé, les types « Dans le
// récap » le disent sans changer leur choix. En bas, la phrase des e-mails de sécurité.
// Scénario : docs/scenarios/refonte.md, « R8 », « L'écran Notifications des réglages ».
//
// Le client réseau est remplacé par un faux serveur qui garde les réglages de Léa.
import { appName } from '@ruche/brand'
import type { EmailPreferences, EmailType } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { request } from '../../api/client'
import type { ApiResult } from '../../api/errors'
import { visited } from '../../testing/navigation'
import { renderWithProviders } from '../../testing/render'
import { containing, fr } from '../../testing/text'
import * as focusModule from '../../ui/focus'
import { EmailSettings } from './EmailSettings'

jest.mock('../../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
}))

// --- Les textes ----------------------------------------------------------------------------------

const TEXT = {
  inApp: fr.t(($) => $.notificationSettings.inApp),
  phone: fr.t(($) => $.notificationSettings.phone),
  soon: fr.t(($) => $.notificationSettings.soon),
  byEmail: fr.t(($) => $.notificationSettings.byEmail),
  recap: fr.t(($) => $.notificationSettings.recap),
  recapHint: fr.t(($) => $.notificationSettings.recapHint),
  recapOff: fr.t(($) => $.notificationSettings.recapOff),
  security: fr.t(($) => $.notificationSettings.security),
  saveError: fr.t(($) => $.notificationSettings.saveError),
  loadError: fr.t(($) => $.notificationSettings.loadError),
  exampleSource: fr.t(($) => $.notificationSettings.exampleSource, { appName }),
}
const TYPE: Record<EmailType, string> = {
  reactions: fr.t(($) => $.notificationSettings.types.reactions),
  comments: fr.t(($) => $.notificationSettings.types.comments),
  replies: fr.t(($) => $.notificationSettings.types.replies),
  follows: fr.t(($) => $.notificationSettings.types.follows),
  updates: fr.t(($) => $.notificationSettings.types.updates),
  testers: fr.t(($) => $.notificationSettings.types.testers),
}
const CHOICE = {
  now: fr.t(($) => $.notificationSettings.choices.now),
  digest: fr.t(($) => $.notificationSettings.choices.digest),
  never: fr.t(($) => $.notificationSettings.choices.never),
}
/** Le nom lu d'une ligne : « Commentaires sur tes projets, Dans le récap ». */
const rowName = (type: EmailType, choice: keyof typeof CHOICE) =>
  fr.t(($) => $.notificationSettings.rowName, { label: TYPE[type], choice: CHOICE[choice] })

/** La ligne d'un type, quel que soit son choix, et si elle est ouverte. */
const row = (type: EmailType) =>
  screen.getByRole('button', { name: new RegExp(`^${escapeRegExp(TYPE[type])}, `) })
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const recapSwitch = () => screen.findByRole('switch', { name: TEXT.recap })

// --- Le faux serveur -----------------------------------------------------------------------------

/** Les réglages de Léa : ceux par défaut, « Réponses et mentions » sur « Tout de suite ». */
const leaChoices: EmailPreferences = {
  weeklyRecap: true,
  reactions: 'digest',
  comments: 'digest',
  replies: 'now',
  follows: 'digest',
  updates: 'never',
  testers: 'digest',
}

const emailPath = '/v1/me/email-preferences'
// Les réglages tels que le faux serveur les garde, et la réponse choisie pour le prochain PATCH
// (sans elle, il accepte et rend l'état complet, comme l'API).
let storedEmails: EmailPreferences
let nextEmailPatch: (() => Promise<ApiResult<EmailPreferences>>) | null
const fakeRequest = async (to: string, init: RequestInit = {}) => {
  if (to !== emailPath) return { ok: false, error: 'notFound' } as const
  if (init.method === 'PATCH') {
    if (nextEmailPatch) return nextEmailPatch()
    storedEmails = { ...storedEmails, ...JSON.parse(String(init.body)) }
    return { ok: true, data: storedEmails } as const
  }
  return { ok: true, data: storedEmails } as const
}
/** Les corps des PATCH des réglages d'e-mail, dans l'ordre. */
const emailPatches = () =>
  jest
    .mocked(request)
    .mock.calls.filter(([to, init]) => to === emailPath && init.method === 'PATCH')
    .map(([, init]) => JSON.parse(String(init.body)) as unknown)

/** Le rang de chaque élément dans l'ordre de lecture de la page (de haut en bas). */
const readingOrder = (...elements: ReturnType<typeof screen.getByRole>[]) => {
  const all: unknown[] = []
  const walk = (node: ReturnType<typeof screen.getByRole>) => {
    all.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as ReturnType<typeof screen.getByRole>)
  return elements.map((element) => all.indexOf(element))
}

beforeEach(() => {
  storedEmails = { ...leaChoices }
  nextEmailPatch = null
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(fakeRequest as typeof request)
  mockPush.mockReset()
})

// --- L'écran -------------------------------------------------------------------------------------

describe('EmailSettings, what the screen shows', () => {
  it('starts with an example without a name and what arrives in the app', async () => {
    await renderWithProviders(<EmailSettings />)

    await recapSwitch()
    expect(screen.getByText(containing(TEXT.exampleSource))).toBeTruthy()
    expect(screen.getByText(TEXT.inApp)).toBeTruthy()
  })

  it('shows « Sur ce téléphone » greyed out, « Bientôt », with nothing to touch', async () => {
    await renderWithProviders(<EmailSettings />)

    await recapSwitch()
    expect(screen.getByText(TEXT.phone)).toBeTruthy()
    expect(screen.getByText(TEXT.soon)).toBeTruthy()
    // Une ligne seulement montrée : pas un bouton, ou un bouton inactif.
    const phone = screen.queryByRole('button', { name: containing(TEXT.phone) })
    if (phone) expect(phone).toBeDisabled()
    expect(screen.queryByRole('switch', { name: containing(TEXT.phone) })).toBeNull()
  })

  it('shows one row per type, in the order of the board, each with its current choice', async () => {
    await renderWithProviders(<EmailSettings />)

    await recapSwitch()
    expect(screen.getByText(TEXT.byEmail)).toBeTruthy()
    const rows = [
      screen.getByRole('button', { name: rowName('reactions', 'digest'), expanded: false }),
      screen.getByRole('button', { name: rowName('comments', 'digest'), expanded: false }),
      screen.getByRole('button', { name: rowName('replies', 'now'), expanded: false }),
      screen.getByRole('button', { name: rowName('follows', 'digest'), expanded: false }),
      screen.getByRole('button', { name: rowName('updates', 'never'), expanded: false }),
      screen.getByRole('button', { name: rowName('testers', 'digest'), expanded: false }),
    ]
    const places = readingOrder(...rows, await recapSwitch())
    expect([...places].sort((a, b) => a - b)).toEqual(places)
    // Aucune ligne ouverte à l'arrivée.
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('shows the recap switch on, with when it leaves', async () => {
    await renderWithProviders(<EmailSettings />)

    expect(await recapSwitch()).toBeChecked()
    expect(screen.getByText(TEXT.recapHint)).toBeTruthy()
  })

  it('ends with the sentence about the security e-mails', async () => {
    await renderWithProviders(<EmailSettings />)

    const [recap] = readingOrder(await recapSwitch())
    const [security] = readingOrder(screen.getByText(TEXT.security))
    expect(security).toBeGreaterThan(recap as number)
  })

  it('shows the choices saved by the member', async () => {
    storedEmails = { ...leaChoices, weeklyRecap: false, comments: 'now', testers: 'never' }
    await renderWithProviders(<EmailSettings />)

    expect(await screen.findByRole('button', { name: rowName('comments', 'now') })).toBeTruthy()
    expect(screen.getByRole('button', { name: rowName('testers', 'never') })).toBeTruthy()
    expect(await recapSwitch()).not.toBeChecked()
  })
})

describe('EmailSettings, choosing', () => {
  it('opens the choices of a type in place, its current choice checked', async () => {
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(
      await screen.findByRole('button', { name: rowName('comments', 'digest') }),
    )

    expect(row('comments')).toBeExpanded()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: CHOICE.digest, checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: CHOICE.now })).toBeTruthy()
    expect(screen.getByRole('radio', { name: CHOICE.never })).toBeTruthy()
  })

  it('offers no « Tout de suite » for reactions, followers and updates', async () => {
    await renderWithProviders(<EmailSettings />)

    for (const type of ['reactions', 'follows', 'updates'] as const) {
      await fireEvent.press(row(type))
      expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel)).toEqual([
        CHOICE.digest,
        CHOICE.never,
      ])
    }
  })

  it('offers « Tout de suite » for comments, replies and the testers corner', async () => {
    await renderWithProviders(<EmailSettings />)

    for (const type of ['comments', 'replies', 'testers'] as const) {
      await fireEvent.press(await screen.findByRole('button', { name: containing(TYPE[type]) }))
      expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel)).toEqual([
        CHOICE.now,
        CHOICE.digest,
        CHOICE.never,
      ])
    }
  })

  it('keeps a single type open at a time', async () => {
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(
      await screen.findByRole('button', { name: rowName('comments', 'digest') }),
    )
    await fireEvent.press(row('replies'))

    expect(row('replies')).toBeExpanded()
    expect(row('comments')).not.toBeExpanded()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: CHOICE.now, checked: true })).toBeTruthy()
  })

  it('closes an open type when its row is touched again', async () => {
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(
      await screen.findByRole('button', { name: rowName('comments', 'digest') }),
    )
    await fireEvent.press(row('comments'))

    expect(row('comments')).not.toBeExpanded()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('saves a choice as soon as it is touched, one field only, and stays open', async () => {
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(
      await screen.findByRole('button', { name: rowName('comments', 'digest') }),
    )
    await fireEvent.press(screen.getByRole('radio', { name: CHOICE.now }))

    // Le nouveau choix se lit tout de suite, avant même la réponse.
    expect(screen.getByRole('button', { name: rowName('comments', 'now') })).toBeExpanded()
    expect(screen.getByRole('radio', { name: CHOICE.now, checked: true })).toBeTruthy()
    await waitFor(() => expect(emailPatches()).toEqual([{ comments: 'now' }]))
  })

  it('keeps both choices when two types change quickly, one after the other', async () => {
    let answer: (result: ApiResult<EmailPreferences>) => void = () => {}
    nextEmailPatch = () =>
      new Promise((resolve) => {
        answer = resolve
      })
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(
      await screen.findByRole('button', { name: rowName('comments', 'digest') }),
    )
    await fireEvent.press(screen.getByRole('radio', { name: CHOICE.now }))
    nextEmailPatch = null
    await fireEvent.press(row('testers'))
    await fireEvent.press(screen.getByRole('radio', { name: CHOICE.never }))
    answer({ ok: true, data: { ...leaChoices, comments: 'now' } })

    await waitFor(() => expect(emailPatches()).toEqual([{ comments: 'now' }, { testers: 'never' }]))
    expect(await screen.findByRole('button', { name: rowName('comments', 'now') })).toBeTruthy()
    expect(screen.getByRole('button', { name: rowName('testers', 'never') })).toBeTruthy()
  })

  it('puts the previous choice back, and says so, when it could not be saved', async () => {
    nextEmailPatch = async () => ({ ok: false, error: 'network' })
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(
      await screen.findByRole('button', { name: rowName('comments', 'digest') }),
    )
    await fireEvent.press(screen.getByRole('radio', { name: CHOICE.never }))

    expect(await screen.findByRole('alert')).toHaveTextContent(containing(TEXT.saveError))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: rowName('comments', 'digest') })).toBeTruthy(),
    )
  })

  it('says to sign in again, with a link back to this page, when the session expired', async () => {
    nextEmailPatch = async () => ({ ok: false, error: 'unauthorized' })
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(
      await screen.findByRole('button', { name: rowName('comments', 'digest') }),
    )
    await fireEvent.press(screen.getByRole('radio', { name: CHOICE.now }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
    await fireEvent.press(screen.getByRole('link', { name: 'Me reconnecter' }))
    expect(visited(mockPush)).toEqual(['/sign-in?next=/page/actuelle'])
  })
})

describe('EmailSettings, the recap', () => {
  it('turns the recap off as soon as it is touched', async () => {
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(await recapSwitch())

    expect(await recapSwitch()).not.toBeChecked()
    await waitFor(() => expect(emailPatches()).toEqual([{ weeklyRecap: false }]))
  })

  it('says under each « Dans le récap » type that nothing leaves while the recap is off, without changing it', async () => {
    storedEmails = { ...leaChoices, weeklyRecap: false }
    await renderWithProviders(<EmailSettings />)

    await screen.findByRole('button', { name: rowName('comments', 'digest') })
    await waitFor(() => expect(screen.getAllByText(TEXT.recapOff)).toHaveLength(4))
    // Les quatre types « Dans le récap » (réactions, commentaires, abonnés, testeurs) gardent leur
    // choix ; « Tout de suite » et « Jamais » n'ont pas la phrase.
    expect(screen.getByRole('button', { name: rowName('reactions', 'digest') })).toBeTruthy()
    expect(screen.getByRole('button', { name: rowName('testers', 'digest') })).toBeTruthy()
    expect(row('replies').props.accessibilityHint ?? null).toBeNull()
    expect(row('updates').props.accessibilityHint ?? null).toBeNull()
    // La phrase décrit sa ligne : elle se lit après son nom.
    expect(row('comments').props.accessibilityHint).toBe(TEXT.recapOff)
    expect(emailPatches()).toEqual([])
  })

  it('shows the sentence as soon as the recap is turned off, and removes it when turned on', async () => {
    await renderWithProviders(<EmailSettings />)
    await recapSwitch()
    expect(screen.queryByText(TEXT.recapOff)).toBeNull() // le récap est activé

    await fireEvent.press(await recapSwitch())
    expect(screen.getAllByText(TEXT.recapOff)).toHaveLength(4)

    await fireEvent.press(await recapSwitch())
    expect(screen.queryByText(TEXT.recapOff)).toBeNull()
    await waitFor(() =>
      expect(emailPatches()).toEqual([{ weeklyRecap: false }, { weeklyRecap: true }]),
    )
  })
})

// Repris de 6c et de ses relectures : la lecture des réglages, ses échecs et « Réessayer ».
describe('EmailSettings, reading the settings', () => {
  /** La première lecture des réglages échoue (`error`), les suivantes passent par le faux serveur. */
  const failFirstRead = (error: 'network' | 'unauthorized') => {
    let failed = false
    jest.mocked(request).mockImplementation((async (to: string, init: RequestInit = {}) => {
      if (to === emailPath && init.method === 'GET' && !failed) {
        failed = true
        return { ok: false, error }
      }
      return fakeRequest(to, init)
    }) as typeof request)
  }

  it('announces the line that waits for the settings as busy', async () => {
    jest.mocked(request).mockImplementation((() => new Promise(() => {})) as typeof request)
    await renderWithProviders(<EmailSettings />)

    expect(await screen.findByRole('progressbar', { name: 'Chargement…' })).toBeBusy()
  })

  it('says what could not be loaded, then offers to try again', async () => {
    failFirstRead('network')
    await renderWithProviders(<EmailSettings />)

    expect(await screen.findByText(TEXT.loadError)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: containing(TYPE.comments) })).toBeNull()
  })

  it('shows the settings once « Réessayer » worked, and gives the focus to the first row', async () => {
    const focus = jest.spyOn(focusModule, 'focusWithoutScroll').mockReturnValue(true)
    try {
      failFirstRead('network')
      await renderWithProviders(<EmailSettings />)
      await screen.findByText(TEXT.loadError)
      expect(focus).not.toHaveBeenCalled()

      await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))

      await screen.findByRole('button', { name: rowName('reactions', 'digest') })
      await waitFor(() => expect(focus).toHaveBeenCalledTimes(1))
      expect(focus.mock.calls[0]?.[0]).toBeTruthy()
    } finally {
      focus.mockRestore()
    }
  })

  it('does not move the focus when the settings arrive without « Réessayer »', async () => {
    const focus = jest.spyOn(focusModule, 'focusWithoutScroll').mockReturnValue(true)
    try {
      await renderWithProviders(<EmailSettings />)

      await recapSwitch()
      expect(focus).not.toHaveBeenCalled()
    } finally {
      focus.mockRestore()
    }
  })

  it('offers to sign in again, and no « Réessayer », when the session expired', async () => {
    failFirstRead('unauthorized')
    await renderWithProviders(<EmailSettings />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
    expect(screen.getByRole('link', { name: 'Me reconnecter' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
  })
})
