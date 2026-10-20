// Tests des hooks des réglages d'e-mail (tranche 6c) : lire les deux réglages, et les changer d'un
// toucher. Comme useFollow (follows/api.ts) : l'écran change tout de suite (mise à jour optimiste),
// les changements partent dans l'ordre, et un refus remet le réglage comme avant.
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

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** Les deux hooks ensemble, comme dans la section « E-mails » de « Mon profil ». */
const renderSettings = async () => {
  const hook = await renderHook(
    () => ({ preferences: useEmailPreferences(), save: useUpdateEmailPreferences() }),
    { wrapper },
  )
  await waitFor(() => expect(hook.result.current.preferences.data).toEqual(leaEmailPreferences))
  return hook
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
  stored = { ...leaEmailPreferences }
  nextPatch = null
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(fakeRequest as typeof request)
})

describe('useEmailPreferences', () => {
  it('reads the two settings of the member', async () => {
    await renderSettings()

    expect(request).toHaveBeenCalledWith(path, expect.anything(), expect.anything())
  })
})

describe('useUpdateEmailPreferences', () => {
  it('changes the setting at once, before the API even answers, and sends only that setting', async () => {
    // La réponse reste en attente : ce qu'on lit ensuite vient du changement immédiat.
    nextPatch = () => new Promise(() => {})
    const { result } = await renderSettings()

    await act(async () => result.current.save.update({ weeklyRecap: false }))

    expect(result.current.preferences.data).toEqual({ weeklyRecap: false, mentionEmails: false })
    expect(patches()).toEqual([{ weeklyRecap: false }])
  })

  it('sends two quick touches one after the other, in order, and ends on the last one', async () => {
    let answerFirst: () => void = () => {}
    nextPatch = () =>
      new Promise((resolve) => {
        answerFirst = () => {
          stored = { ...stored, weeklyRecap: false }
          nextPatch = null
          resolve({ ok: true, data: stored })
        }
      })
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

  it('puts the setting back as it was, and says so, when the API refuses', async () => {
    nextPatch = async () => ({ ok: false, error: 'rateLimited' })
    const { result } = await renderSettings()

    await act(async () => result.current.save.update({ mentionEmails: true }))

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
