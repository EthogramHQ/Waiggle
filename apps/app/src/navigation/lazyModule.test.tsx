// Tests des parties de page chargées à la demande (`lazyModule`, navigation/lazyModule.ts) : rien
// n'est demandé tant que la partie n'est pas voulue, le module est demandé une seule fois pour toute
// l'appli, et il arrive après un tour (`null` avant).
import { renderHook, waitFor } from '@testing-library/react-native'
import { lazyModule } from './lazyModule'

describe('lazyModule', () => {
  it('asks for nothing while the part is not wanted, then gives the module once it has arrived', async () => {
    const load = jest.fn(() => Promise.resolve({ name: 'harvest' }))
    const useModule = lazyModule(load)
    const { result, rerender } = await renderHook((wanted: boolean) => useModule(wanted), {
      initialProps: false,
    })
    expect(result.current).toBeNull()
    expect(load).not.toHaveBeenCalled()

    await rerender(true)
    await waitFor(() => expect(result.current).toEqual({ name: 'harvest' }))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('asks only once for two parts, and gives the module at once to a later one', async () => {
    const load = jest.fn(() => Promise.resolve({ name: 'sheet' }))
    const useModule = lazyModule(load)
    const first = await renderHook(() => useModule())
    const second = await renderHook(() => useModule())
    await waitFor(() => expect(first.result.current).not.toBeNull())
    await waitFor(() => expect(second.result.current).not.toBeNull())
    expect(load).toHaveBeenCalledTimes(1)

    // Une visite suivante : le module est déjà là, dès le premier rendu.
    const later = await renderHook(() => useModule())
    expect(later.result.current).toEqual({ name: 'sheet' })
  })
})
