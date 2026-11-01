// Tests de useReadBefore (R4, « Tu es à jour ») : la date de dernière lecture est celle de la
// première page reçue, et ne bouge plus pendant la visite, même quand le fil est relu après la
// marque de lecture.
import { renderHook } from '@testing-library/react-native'
import { useReadBefore } from './readBefore'

type Page = { lastReadAt: string | null } | undefined

describe('useReadBefore', () => {
  it('knows nothing until the first page arrives', async () => {
    const { result } = await renderHook(() => useReadBefore(undefined))

    expect(result.current).toBeUndefined()
  })

  it('keeps the date of the first page for the whole visit', async () => {
    const { result, rerender } = await renderHook(
      ({ page }: { page: Page }) => useReadBefore(page),
      {
        initialProps: { page: undefined as Page },
      },
    )

    await rerender({ page: { lastReadAt: '2026-10-19T09:00:00.000Z' } })
    expect(result.current).toBe('2026-10-19T09:00:00.000Z')

    // Le fil relu porte la date tout juste écrite : la sphère ne doit pas sauter.
    await rerender({ page: { lastReadAt: '2026-10-20T11:00:00.000Z' } })
    expect(result.current).toBe('2026-10-19T09:00:00.000Z')
  })

  it('keeps « never read » (null) as well', async () => {
    const { result, rerender } = await renderHook(
      ({ page }: { page: Page }) => useReadBefore(page),
      {
        initialProps: { page: { lastReadAt: null } as Page },
      },
    )
    expect(result.current).toBeNull()

    await rerender({ page: { lastReadAt: '2026-10-20T11:00:00.000Z' } })
    expect(result.current).toBeNull()
  })
})
