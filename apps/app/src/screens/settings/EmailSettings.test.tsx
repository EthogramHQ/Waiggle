// Tests de la section « E-mails » des réglages (tranche 6c) : deux interrupteurs, enregistrés
// chacun dès qu'on le touche. Ils étaient dans ProfileScreen.test.tsx tant que la section vivait au
// bas de « Mon profil » ; depuis R2, elle est dans la rubrique « Notifications » des réglages
// (sections.tsx). Le client réseau est remplacé par un faux serveur qui garde les réglages de Léa.
import type { EmailPreferences } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { request } from '../../api/client'
import type { ApiResult } from '../../api/errors'
import { leaEmailPreferences } from '../../testing/email'
import { visited } from '../../testing/navigation'
import { renderWithProviders } from '../../testing/render'
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

const emailPath = '/v1/me/email-preferences'
// Les réglages d'e-mail tels que le faux serveur les garde, et la réponse choisie pour le prochain
// PATCH (sans elle, il accepte et rend l'état complet, comme l'API).
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

beforeEach(() => {
  storedEmails = { ...leaEmailPreferences }
  nextEmailPatch = null
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(fakeRequest as typeof request)
  mockPush.mockReset()
})

// Tranche 6c : la section « E-mails ». Deux réglages, chacun enregistré dès qu'on le touche, sans
// passer par « Enregistrer ». Scénario : docs/scenarios/phase-1.md, « Précisions (tranche 6c) ».
describe('EmailSettings', () => {
  const recap = () => screen.findByRole('switch', { name: 'Le récap de la semaine' })
  const mentions = () =>
    screen.findByRole('switch', { name: 'Un e-mail quand on me mentionne ou me répond' })

  it('shows the two settings, the weekly recap on and the mention e-mails off', async () => {
    await renderWithProviders(<EmailSettings />)

    expect(await screen.findByRole('header', { name: 'E-mails' })).toBeTruthy()
    expect(await recap()).toBeChecked()
    expect(await mentions()).not.toBeChecked()
    expect(screen.getByText('Le lundi matin, seulement s’il y a du nouveau.')).toBeTruthy()
    // Les e-mails du compte ne dépendent pas de ces réglages : la section le dit.
    expect(
      screen.getByText(
        'Les e-mails liés à ton compte, comme la vérification de ton adresse, arrivent toujours.',
      ),
    ).toBeTruthy()
  })

  it('shows the settings saved by the member', async () => {
    storedEmails = { weeklyRecap: false, mentionEmails: true }
    await renderWithProviders(<EmailSettings />)

    // Le temps que les réglages arrivent de l'API (s'ils s'affichent d'abord avec d'autres valeurs).
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Un e-mail quand on me mentionne ou me répond' }),
      ).toBeChecked(),
    )
    expect(await recap()).not.toBeChecked()
  })

  it('saves a setting as soon as it is touched, without « Enregistrer »', async () => {
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(await recap())

    expect(await recap()).not.toBeChecked()
    await waitFor(() => expect(emailPatches()).toEqual([{ weeklyRecap: false }]))
    expect(await screen.findByText('Réglage enregistré.')).toBeTruthy()
  })

  it('turns the mention e-mails on', async () => {
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(await mentions())

    expect(await mentions()).toBeChecked()
    await waitFor(() => expect(emailPatches()).toEqual([{ mentionEmails: true }]))
  })

  it('puts the setting back, and says so, when it could not be saved', async () => {
    nextEmailPatch = async () => ({ ok: false, error: 'network' })
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(await recap())

    expect(await screen.findByRole('alert')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Le récap de la semaine' })).toBeChecked(),
    )
    expect(screen.queryByText('Réglage enregistré.')).toBeNull()
  })

  it('says to sign in again, with a link back to this page, when the session expired', async () => {
    nextEmailPatch = async () => ({ ok: false, error: 'unauthorized' })
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(await recap())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
    await fireEvent.press(screen.getByRole('link', { name: 'Me reconnecter' }))
    expect(visited(mockPush)).toEqual(['/sign-in?next=/page/actuelle'])
  })
})

// Tranche 6c, après les relectures de l'interface et du design (commit 9b4172b).
describe('EmailSettings after the reviews', () => {
  const recapName = 'Le récap de la semaine'
  const loadError = 'Tes réglages d’e-mail n’ont pas pu se charger.'

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

  it('says that each setting is saved as soon as it is touched, under the group', async () => {
    await renderWithProviders(<EmailSettings />)

    await screen.findByRole('switch', { name: recapName })
    expect(screen.getByText('Chaque réglage s’enregistre dès que tu le touches.')).toBeTruthy()
  })

  // Sur téléphone, le groupe est en bas de la page : sous lui, le message sortait de l'écran.
  it('shows a refused change between the title and the switches', async () => {
    nextEmailPatch = async () => ({ ok: false, error: 'unauthorized' })
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(await screen.findByRole('switch', { name: recapName }))

    const alert = await screen.findByRole('alert')
    const [title, message, toggle] = readingOrder(
      screen.getByRole('header', { name: 'E-mails' }),
      alert,
      screen.getByRole('switch', { name: recapName }),
    )
    expect(title).toBeLessThan(message as number)
    expect(message).toBeLessThan(toggle as number)
    expect(screen.getByRole('link', { name: 'Me reconnecter' })).toBeTruthy()
  })

  it('shows the confirmation between the title and the switches too', async () => {
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(await screen.findByRole('switch', { name: recapName }))

    const [message, toggle] = readingOrder(
      await screen.findByRole('status'),
      screen.getByRole('switch', { name: recapName }),
    )
    expect(message).toBeLessThan(toggle as number)
  })

  // Le message reste en place pendant le changement suivant : sans cela, il disparaissait le
  // temps de l'envoi puis revenait, et les interrupteurs sautaient deux fois sous le doigt.
  it('keeps the confirmation in place while the next change is on its way', async () => {
    await renderWithProviders(<EmailSettings />)
    await fireEvent.press(await screen.findByRole('switch', { name: recapName }))
    expect(await screen.findByText('Réglage enregistré.')).toBeTruthy()

    let answer: (result: ApiResult<EmailPreferences>) => void = () => {}
    nextEmailPatch = () =>
      new Promise((resolve) => {
        answer = resolve
      })
    await fireEvent.press(
      screen.getByRole('switch', { name: 'Un e-mail quand on me mentionne ou me répond' }),
    )

    expect(screen.getByText('Réglage enregistré.')).toBeTruthy()
    answer({ ok: true, data: { weeklyRecap: false, mentionEmails: true } })
    await waitFor(() => expect(emailPatches()).toHaveLength(2))
  })

  it('announces the line that waits for the settings as busy', async () => {
    jest.mocked(request).mockImplementation((() => new Promise(() => {})) as typeof request)
    await renderWithProviders(<EmailSettings />)

    expect(await screen.findByRole('progressbar', { name: 'Chargement…' })).toBeBusy()
  })

  it('says what could not be loaded, then offers to try again', async () => {
    failFirstRead('network')
    await renderWithProviders(<EmailSettings />)

    expect(await screen.findByText(loadError)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('shows « Réessayer » as busy and inactive while the settings are read again', async () => {
    let answer: (result: ApiResult<EmailPreferences>) => void = () => {}
    let reads = 0
    jest.mocked(request).mockImplementation((async (to: string, init: RequestInit = {}) => {
      if (init.method !== 'GET') return fakeRequest(to, init)
      reads += 1
      if (reads === 1) return { ok: false, error: 'network' }
      return new Promise<ApiResult<EmailPreferences>>((resolve) => {
        answer = resolve
      })
    }) as typeof request)
    await renderWithProviders(<EmailSettings />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Réessayer' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Réessayer' })).toBeBusy())
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeDisabled()
    // Un second appui pendant la lecture ne relance rien.
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))
    expect(reads).toBe(2)
    answer({ ok: true, data: leaEmailPreferences })
    expect(await screen.findByRole('switch', { name: recapName })).toBeChecked()
  })

  it('gives the keyboard focus to the first switch once « Réessayer » worked', async () => {
    const focus = jest.spyOn(focusModule, 'focusWithoutScroll').mockReturnValue(true)
    try {
      failFirstRead('network')
      await renderWithProviders(<EmailSettings />)
      await screen.findByText(loadError)
      expect(focus).not.toHaveBeenCalled()

      await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))

      await screen.findByRole('switch', { name: recapName })
      await waitFor(() => expect(focus).toHaveBeenCalledTimes(1))
      expect(focus.mock.calls[0]?.[0]).toBeTruthy()
    } finally {
      focus.mockRestore()
    }
  })

  // Relecture de e414e88 : après un « Réessayer » qui échoue encore, le focus reste sur le bouton,
  // et le lecteur d'écran n'entendait que la fin de l'attente. La raison de l'échec est une alerte,
  // posée au-dessus du groupe dès le premier échec (rien ne bouge sous le doigt au suivant) ; chaque
  // nouvel échec la pose à neuf, et une alerte posée à neuf est lue.
  it('says why the settings could not be loaded, and says it again when « Réessayer » fails again', async () => {
    let reads = 0
    jest.mocked(request).mockImplementation((async (to: string, init: RequestInit = {}) => {
      if (to === emailPath && init.method === 'GET') {
        reads += 1
        return { ok: false, error: 'network' }
      }
      return fakeRequest(to, init)
    }) as typeof request)
    await renderWithProviders(<EmailSettings />)

    const first = await screen.findByRole('alert')
    expect(first).toHaveTextContent(/Vérifie ta connexion et réessaie\./)

    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))

    await waitFor(() => expect(reads).toBe(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Réessayer' })).not.toBeBusy())
    const again = screen.getByRole('alert')
    expect(again).toHaveTextContent(/Vérifie ta connexion et réessaie\./)
    // Une alerte neuve, pas la même restée en place (des valeurs simples : voir la charte).
    expect(again === first).toBe(false)
  })

  it('does not move the focus when the settings arrive without « Réessayer »', async () => {
    const focus = jest.spyOn(focusModule, 'focusWithoutScroll').mockReturnValue(true)
    try {
      await renderWithProviders(<EmailSettings />)

      await screen.findByRole('switch', { name: recapName })
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

// Relecture de design globale du 22/10/2026.
describe('EmailSettings after the global design review', () => {
  const loadError = 'Tes réglages d’e-mail n’ont pas pu se charger.'

  // Une alerte rouge au-dessus du groupe redisait ce que dit la ligne « n'ont pas pu se charger » :
  // la ligne seule dit ce qui manque et pourquoi, une seule fois.
  it('announces a failed read once, in the line that says what is missing', async () => {
    jest.mocked(request).mockImplementation((async (to: string, init: RequestInit = {}) => {
      if (to === emailPath && init.method === 'GET') return { ok: false, error: 'network' }
      return fakeRequest(to, init)
    }) as typeof request)
    await renderWithProviders(<EmailSettings />)

    expect(await screen.findByText(loadError)).toBeTruthy()
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent(/Vérifie ta connexion et réessaie\./)
    // L'alerte est dans la ligne, sous « n'ont pas pu se charger », et non plus au-dessus du groupe.
    const order: unknown[] = []
    const walk = (node: ReturnType<typeof screen.getByRole>) => {
      order.push(node)
      for (const child of node.children) if (typeof child !== 'string') walk(child)
    }
    walk(screen.root as ReturnType<typeof screen.getByRole>)
    expect(order.indexOf(screen.getByText(loadError))).toBeLessThan(order.indexOf(alerts[0]))
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy()
  })
})
