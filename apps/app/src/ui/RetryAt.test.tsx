// Tests de « Nouvel essai possible à 21 h 47 » (refonte, tranche R2, décision D3 du 29/10/2026) :
// quand un quota est atteint (connexion, mot de passe oublié, renvoi du lien), l'appli dit une heure
// fixe, jamais un décompte qui défile (relecture juridique jur-13 : un texte qui change chaque
// seconde est relu sans fin par les lecteurs d'écran). Le hook `useRetryAt` reçoit le Retry-After de
// l'API (en secondes), calcule l'heure, et repasse `blocked` à faux tout seul quand elle est passée.
// Le composant `RetryAt` écrit la phrase, dans un statut (rôle status) lu une fois.
import { act, renderHook, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { RetryAt, useRetryAt } from './RetryAt'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Une fausse horloge : il est 21 h 32 et l'API a dit d'attendre 15 minutes (900 s).
const NOW = new Date(2026, 9, 30, 21, 32, 0)
const FIFTEEN_MINUTES = 15 * 60

/** Le texte lu du statut, tous les blancs ramenés à une espace (getByText fait pareil). */
const statusText = () => {
  const status = screen.getByRole('status')
  const collect = (node: unknown): string => {
    if (typeof node === 'string') return node
    if (!node || typeof node !== 'object') return ''
    return (node as { children: unknown[] }).children.map(collect).join('')
  }
  return collect(status).replace(/\s+/g, ' ').trim()
}

describe('useRetryAt', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(NOW)
  })
  afterEach(() => jest.useRealTimers())

  it('is not blocked without a Retry-After', async () => {
    const { result } = await renderHook(() => useRetryAt(null))

    expect(result.current.blocked).toBe(false)
    expect(result.current.until).toBeNull()
  })

  it('blocks until the hour the API gave, computed once from now', async () => {
    const { result } = await renderHook(() => useRetryAt(FIFTEEN_MINUTES))

    expect(result.current.blocked).toBe(true)
    expect(result.current.until).toEqual(new Date(2026, 9, 30, 21, 47, 0))
  })

  it('unblocks by itself once the hour has passed, and not before', async () => {
    const { result } = await renderHook(() => useRetryAt(FIFTEEN_MINUTES))

    await act(() => jest.advanceTimersByTime(FIFTEEN_MINUTES * 1000 - 1000))
    expect(result.current.blocked).toBe(true)

    await act(() => jest.advanceTimersByTime(1000))
    expect(result.current.blocked).toBe(false)
  })

  it('keeps the same hour from one second to the next (no countdown)', async () => {
    const { result } = await renderHook(() => useRetryAt(FIFTEEN_MINUTES))
    const first = result.current.until
    expect(first).not.toBeNull() // témoin

    await act(() => jest.advanceTimersByTime(1000))

    // Pas de nouvel objet à chaque seconde : rien ne redessine, rien n'est relu.
    expect(result.current.until).toBe(first)
  })

  it('starts again from a new Retry-After', async () => {
    const { result, rerender } = await renderHook(
      ({ seconds }: { seconds: number | null }) => useRetryAt(seconds),
      { initialProps: { seconds: FIFTEEN_MINUTES } },
    )
    await act(() => jest.advanceTimersByTime(FIFTEEN_MINUTES * 1000))
    expect(result.current.blocked).toBe(false)

    // Un nouveau refus, une heure plus tard : 60 secondes de plus.
    await rerender({ seconds: 60 })

    expect(result.current.blocked).toBe(true)
    expect(result.current.until).toEqual(new Date(2026, 9, 30, 21, 48, 0))
  })

  it('treats a zero or negative Retry-After as not blocked', async () => {
    const { result } = await renderHook(() => useRetryAt(0))
    const negative = await renderHook(() => useRetryAt(-5))

    expect(result.current.blocked).toBe(false)
    expect(result.current.until).toBeNull()
    expect(negative.result.current.blocked).toBe(false)
  })
})

describe('RetryAt', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(NOW)
  })
  afterEach(() => jest.useRealTimers())

  it('says at what time a new try is possible, in a status read once', async () => {
    await renderWithProviders(<RetryAt until={new Date(2026, 9, 30, 21, 47, 0)} />)

    // La phrase du texte auth.retryAt (« Nouvel essai possible à {{time}} »), puis l'heure sans les
    // secondes : « 21:47 » ou « 21 h 47 » selon la mise en forme.
    const sentence = fr
      .t(($) => $.auth.retryAt, { time: '' })
      .replace(/\s+/g, ' ')
      .trim()
    expect(sentence).toMatch(/essai/)
    expect(statusText()).toContain(sentence)
    expect(statusText()).toMatch(/21\s*(h|:)\s*47/)
    expect(statusText()).not.toMatch(/21\s*(h|:)\s*47\s*(:|min)\s*00/)
  })

  it('reads the same from one second to the next', async () => {
    await renderWithProviders(<RetryAt until={new Date(2026, 9, 30, 21, 47, 0)} />)
    const before = statusText()

    await act(() => jest.advanceTimersByTime(1000))
    expect(statusText()).toBe(before)

    await act(() => jest.advanceTimersByTime(30_000))
    expect(statusText()).toBe(before)
  })

  it('never shows a countdown of the minutes or seconds left', async () => {
    await renderWithProviders(<RetryAt until={new Date(2026, 9, 30, 21, 47, 0)} />)

    // Il reste 15 minutes : ni « 15 », ni « 14:59 », ni « 900 » ne doivent apparaître.
    expect(statusText()).not.toMatch(/\b(15|14|900)\b/)
  })

  it('says the time in the language of the app', async () => {
    await renderWithProviders(<RetryAt until={new Date(2026, 9, 30, 21, 47, 0)} />, 'en')

    // En anglais, l'heure se dit sur douze heures : 9:47 PM.
    expect(statusText()).toMatch(/9\s*:\s*47\s*PM/i)
  })
})
