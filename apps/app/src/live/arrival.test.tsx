// Tests de l'arrivée annoncée d'une file qui ne se relit jamais seule (R21, live/arrival.ts) : un
// signal la marque périmée sans la relire, et l'écran l'annonce ; une écriture de l'écran qui la
// relit, elle, n'est pas une arrivée.
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { useKeptArrival } from './arrival'

const key = ['moderation', 'queue'] as const

let client: QueryClient
let reads = 0
// Une relecture qui attend (null : elle répond tout de suite).
let gate: Promise<void> | null = null
// Chaque valeur rendue : une arrivée d'un instant suffirait à faire parler le lecteur d'écran.
const seen: boolean[] = []

beforeEach(() => {
  reads = 0
  seen.length = 0
  gate = null
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
})

afterEach(() => client.clear())

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** La file montrée (une lecture suivie), et l'arrivée que l'écran écoute. */
const render = async (listening = true) => {
  const hook = await renderHook(
    ({ on }: { on: boolean }) => {
      useQuery({
        queryKey: key,
        queryFn: async () => {
          if (gate) await gate
          return ++reads
        },
      })
      const arrived = useKeptArrival(key, on)
      seen.push(arrived)
      return arrived
    },
    { wrapper, initialProps: { on: listening } },
  )
  await act(async () => {})
  return hook
}

const settle = () => act(async () => {})

describe('the arrival of a queue that never rereads by itself', () => {
  it('arrives when a signal marks the queue stale without rereading it', async () => {
    const { result } = await render()
    expect(result.current).toBe(false)

    await act(async () => {
      await client.invalidateQueries({ queryKey: key, refetchType: 'none' })
    })
    await settle()

    expect(result.current).toBe(true)
    expect(reads).toBe(1)
  })

  it('does not arrive when the screen itself rereads the queue', async () => {
    await render()
    // La relecture prend son temps, comme sur le réseau : l'écran se redessine pendant l'attente.
    let release = () => {}
    gate = new Promise<void>((resolve) => {
      release = resolve
    })

    await act(async () => {
      void client.invalidateQueries({ queryKey: key })
    })
    await settle()
    expect(seen).not.toContain(true)

    await act(async () => release())
    await settle()
    expect(reads).toBe(2)
    expect(seen).not.toContain(true)
  })

  it('does not arrive while the screen shows another tab', async () => {
    const { result } = await render(false)

    await act(async () => {
      await client.invalidateQueries({ queryKey: key, refetchType: 'none' })
    })
    await settle()

    expect(result.current).toBe(false)
  })

  it('is over once the queue is read again', async () => {
    const { result } = await render()
    await act(async () => {
      await client.invalidateQueries({ queryKey: key, refetchType: 'none' })
    })
    await settle()
    expect(result.current).toBe(true)

    await act(async () => {
      await client.refetchQueries({ queryKey: key })
    })
    await settle()

    expect(result.current).toBe(false)
  })

  it('keeps the queue stale when the screen writes into it after an arrival', async () => {
    const { result } = await render()
    await act(async () => {
      await client.invalidateQueries({ queryKey: key, refetchType: 'none' })
    })
    await settle()

    // Une décision retire une carte de la file (setQueryData) : la file se déclare fraîche.
    await act(async () => {
      client.setQueryData(key, 1)
    })
    await settle()

    expect(result.current).toBe(true)
    expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  })
})
