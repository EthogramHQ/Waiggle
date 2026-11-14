// L'historique après une décision (R9, relecture du design, C9). Sur ordinateur, la page de la
// modération montre les dernières décisions dans sa colonne de droite : la décision qu'on vient de
// prendre (retirer, classer, suspendre) doit y entrer aussitôt, sans recharger la page. Sur
// téléphone, l'historique n'est pas monté (sa vue est fermée, sa lecture coupée) : il est seulement
// marqué périmé, et se relira à son ouverture (la règle de la tranche 7c).
//
// Les vrais hooks, avec le client réseau remplacé : on compte les lectures de l'historique.
import type { ModerationDecision } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request } from '../api/client'
import { decisionHistoryPageOf, scamCommentItem } from '../testing/moderation'
import { useDecide, useDecisionHistory } from './api'

jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

let client: QueryClient

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** Les lectures de l'historique (GET), parmi toutes les demandes envoyées. */
const historyReads = () =>
  jest
    .mocked(request)
    .mock.calls.filter(
      ([path, init]) =>
        String(path).startsWith('/v1/moderation/decisions') &&
        (init as { method?: string } | undefined)?.method === undefined,
    ).length

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  jest.mocked(request).mockReset()
  jest
    .mocked(request)
    .mockImplementation(async (_path, init) =>
      (init as { method?: string } | undefined)?.method === 'POST'
        ? { ok: true, data: { id: 'd1' } as unknown as ModerationDecision }
        : { ok: true, data: decisionHistoryPageOf() },
    )
})

/** L'historique (monté ou non, comme la colonne de droite) et la décision, dans le même écran. */
const renderBoth = (historyShown: boolean) =>
  renderHook(() => ({ history: useDecisionHistory(undefined, historyShown), ...useDecide() }), {
    wrapper,
  })

const dismissSam = { action: 'dismiss', target: scamCommentItem.target } as const

describe('the decision history after a decision', () => {
  it('reads the history again when its column is shown (three columns)', async () => {
    const { result } = await renderBoth(true)
    await waitFor(() => expect(result.current.history.isSuccess).toBe(true))
    expect(historyReads()).toBe(1)

    await act(async () => {
      await result.current.decide(dismissSam)
    })

    await waitFor(() => expect(historyReads()).toBe(2))
  })

  it('only marks it stale on a phone, where it is not shown', async () => {
    const { result } = await renderBoth(false)

    await act(async () => {
      await result.current.decide(dismissSam)
    })

    // Témoin : l'historique est bien marqué périmé (il se relira à son ouverture).
    expect(client.getQueryState(['moderation', 'history', null])?.isInvalidated).toBe(true)
    expect(historyReads()).toBe(0)
  })
})
