// Tests des hooks des réglages d'e-mail (tranche 6c, R8) : lire les réglages, et les changer d'un
// toucher. Comme useFollow (follows/api.ts) : l'écran change tout de suite (mise à jour optimiste),
// les changements partent dans l'ordre, et un refus remet le réglage comme avant. R8 : chaque PATCH
// ne porte qu'un champ (EmailPreferencesPatch), celui qu'on vient de toucher ; deux types changés
// vite gardent chacun leur choix ; un refus ne remet en arrière que son champ ; et aucune relecture
// ne suit un changement (la page relit tout à sa prochaine ouverture).
import type { EmailPreferences } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request } from '../api/client'
import type { ApiResult } from '../api/errors'
import { leaEmailPreferences } from '../testing/email'
import { useEmailPreferences, useUpdateEmailPreferences } from './api'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

const path = '/v1/me/email-preferences'
let client: QueryClient
// Les réglages tels que le faux serveur les garde, et la réponse choisie pour le prochain PATCH
// (sans réponse choisie, il accepte et rend l'état complet, comme l'API).
let stored: EmailPreferences
let nextPatch: (() => Promise<ApiResult<EmailPreferences>>) | null

const fakeRequest = async (to: string, init: RequestInit = {}) => {
  if (to !== path) return { ok: false, error: 'notFound' } as const
  if (init.method === 'PATCH') {
    if (nextPatch) return nextPatch()
    stored = { ...stored, ...JSON.parse(String(init.body)) }
    return { ok: true, data: stored } as const
  }
  return { ok: true, data: stored } as const
}

/** Les corps des PATCH envoyés, dans l'ordre. */
const patches = () =>
  jest
    .mocked(request)
    .mock.calls.filter(([to, init]) => to === path && init.method === 'PATCH')
    .map(([, init]) => JSON.parse(String(init.body)) as unknown)

/** Le nombre de lectures (GET) des réglages. */
const reads = () =>
  jest.mocked(request).mock.calls.filter(([to, init]) => to === path && init.method === 'GET')
    .length

/**
 * Retient le prochain PATCH : le serveur l'enregistre seulement quand le test appelle la fonction
 * rendue, avec la réponse voulue (acceptée, il rend l'état complet, comme l'API ; refusée, l'erreur).
 */
const holdNextPatch = () => {
  let answer: (refused?: 'rateLimited') => void = () => {}
  nextPatch = () => {
    // Le corps de ce PATCH : le dernier envoyé au moment où le faux serveur le reçoit.
    const body = patches().at(-1) as Partial<EmailPreferences>
    nextPatch = null
    return new Promise((resolve) => {
      answer = (refused) => {
        if (refused) return resolve({ ok: false, error: refused })
        stored = { ...stored, ...body }
        resolve({ ok: true, data: stored })
      }
    })
  }
  return (refused?: 'rateLimited') => answer(refused)
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** Les deux hooks ensemble, comme dans l'écran « Notifications » des réglages. */
const renderSettings = async () => {
  const hook = await renderHook(
    () => ({ preferences: useEmailPreferences(), save: useUpdateEmailPreferences() }),
    { wrapper },
  )
  await waitFor(() => expect(hook.result.current.preferences.data).toEqual(leaEmailPreferences))
  return hook
}

beforeEach(() => {
  // `gcTime: Infinity` aussi pour les mutations : sinon leur minuteur de nettoyage garde Jest ouvert
  // après les tests (« Jest did not exit »).
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  stored = { ...leaEmailPreferences }
  nextPatch = null
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(fakeRequest as typeof request)
})

describe('useEmailPreferences', () => {
  it('reads the settings of the member', async () => {
    await renderSettings()

    expect(request).toHaveBeenCalledWith(path, expect.anything(), expect.anything())
  })
})

describe('useUpdateEmailPreferences', () => {
  it('changes the setting at once, before the API even answers, and sends only that setting', async () => {
    // La réponse reste en attente : ce qu'on lit ensuite vient du changement immédiat.
    nextPatch = () => new Promise(() => {})
    const { result } = await renderSettings()

    await act(async () => result.current.save.update({ comments: 'now' }))

    expect(result.current.preferences.data).toEqual({ ...leaEmailPreferences, comments: 'now' })
    expect(patches()).toEqual([{ comments: 'now' }])
  })

  it('sends two quick touches one after the other, in order, and ends on the last one', async () => {
    const answerFirst = holdNextPatch()
    const { result } = await renderSettings()

    await act(async () => {
      result.current.save.update({ weeklyRecap: false })
      result.current.save.update({ weeklyRecap: true })
    })

    // Le second changement attend la fin du premier (une même « portée ») : jamais deux en même
    // temps, sinon le serveur pourrait les recevoir dans le désordre.
    expect(patches()).toEqual([{ weeklyRecap: false }])
    expect(result.current.preferences.data?.weeklyRecap).toBe(true)

    await act(async () => answerFirst())

    await waitFor(() => expect(patches()).toEqual([{ weeklyRecap: false }, { weeklyRecap: true }]))
    await waitFor(() => expect(result.current.preferences.data?.weeklyRecap).toBe(true))
  })

  it('keeps both choices when two types change quickly, even when the first answer comes in between', async () => {
    const answerFirst = holdNextPatch()
    const { result } = await renderSettings()

    await act(async () => {
      result.current.save.update({ comments: 'now' })
      result.current.save.update({ testers: 'never' })
    })
    // Le second reste retenu lui aussi : on regarde ce que fait la réponse du premier.
    const answerSecond = holdNextPatch()

    // La réponse du premier rend l'état complet du serveur, où « testeurs » vaut encore « digest » :
    // elle ne doit pas défaire le second choix, encore en route.
    await act(async () => answerFirst())
    await waitFor(() => expect(patches()).toEqual([{ comments: 'now' }, { testers: 'never' }]))
    expect(result.current.preferences.data).toEqual({
      ...leaEmailPreferences,
      comments: 'now',
      testers: 'never',
    })

    await act(async () => answerSecond())
    await waitFor(() => expect(result.current.save.saved).toBe(true))
    expect(result.current.preferences.data).toEqual({
      ...leaEmailPreferences,
      comments: 'now',
      testers: 'never',
    })
  })

  it('puts back only the refused field, and keeps the other choice made in the meantime', async () => {
    const answerFirst = holdNextPatch()
    const { result } = await renderSettings()

    await act(async () => {
      result.current.save.update({ comments: 'now' })
      result.current.save.update({ replies: 'never' })
    })
    const answerSecond = holdNextPatch()

    // Le premier est refusé : « commentaires » revient à « digest », « réponses » garde « never ».
    await act(async () => answerFirst('rateLimited'))
    await waitFor(() =>
      expect(result.current.preferences.data).toEqual({
        ...leaEmailPreferences,
        replies: 'never',
      }),
    )

    await act(async () => answerSecond())
    await waitFor(() => expect(patches()).toEqual([{ comments: 'now' }, { replies: 'never' }]))
    await waitFor(() => expect(result.current.save.saved).toBe(true))
    expect(result.current.preferences.data).toEqual({ ...leaEmailPreferences, replies: 'never' })
  })

  it('does not read the settings again after a change', async () => {
    const { result } = await renderSettings()
    expect(reads()).toBe(1)

    await act(async () => result.current.save.update({ follows: 'never' }))
    await waitFor(() => expect(result.current.save.saved).toBe(true))

    // Ni nouvelle lecture, ni lecture marquée « à refaire » : la page relira à sa prochaine
    // ouverture.
    expect(reads()).toBe(1)
    expect(client.getQueryState(['email-preferences'])?.isInvalidated).toBe(false)
    expect(result.current.preferences.data).toEqual({ ...leaEmailPreferences, follows: 'never' })
  })

  it('puts the setting back as it was, and says so, when the API refuses', async () => {
    nextPatch = async () => ({ ok: false, error: 'rateLimited' })
    const { result } = await renderSettings()

    await act(async () => result.current.save.update({ replies: 'now' }))

    await waitFor(() => expect(result.current.save.error).toBe(true))
    expect(result.current.save.expired).toBe(false)
    expect(result.current.preferences.data).toEqual(leaEmailPreferences)
  })

  it('says the session expired when the API answers « unauthorized »', async () => {
    nextPatch = async () => ({ ok: false, error: 'unauthorized' })
    const { result } = await renderSettings()

    await act(async () => result.current.save.update({ weeklyRecap: false }))

    await waitFor(() => expect(result.current.save.expired).toBe(true))
    expect(result.current.preferences.data).toEqual(leaEmailPreferences)
  })
})
