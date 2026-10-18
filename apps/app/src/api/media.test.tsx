// Tests des sources d'images : la session accompagne les images de notre API, et seulement elles.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { getSessionCookie, useSession } from '../accounts/api'
import { useMediaSources } from './media'

jest.mock('../accounts/api', () => ({ useSession: jest.fn(), getSessionCookie: jest.fn() }))

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}
  >
    {children}
  </QueryClientProvider>
)

beforeEach(() => {
  jest
    .mocked(useSession)
    .mockReturnValue({ data: { user: { id: 'u1' } } } as unknown as ReturnType<typeof useSession>)
  jest.mocked(getSessionCookie).mockResolvedValue('ruche.session_token=abc')
})

describe('useMediaSources, on a phone', () => {
  it('adds the session to an image of our API', async () => {
    const { result } = await renderHook(() => useMediaSources(), { wrapper })

    await waitFor(() =>
      expect(result.current('http://localhost:3000/media/avatars/a.webp')).toEqual({
        uri: 'http://localhost:3000/media/avatars/a.webp',
        headers: { Cookie: 'ruche.session_token=abc' },
      }),
    )
  })

  it('never sends the session to another site', async () => {
    const { result } = await renderHook(() => useMediaSources(), { wrapper })
    await waitFor(() => expect(getSessionCookie).toHaveBeenCalled())

    expect(result.current('https://pirate.example.com/media/avatars/a.webp')).toBeNull()
    expect(result.current('http://localhost:3000.pirate.example.com/media/a.webp')).toBeNull()
    expect(result.current('http://localhost:3000/v1/me')).toBeNull()
  })

  it('gives nothing without an address', async () => {
    const { result } = await renderHook(() => useMediaSources(), { wrapper })

    expect(result.current(null)).toBeNull()
  })
})
