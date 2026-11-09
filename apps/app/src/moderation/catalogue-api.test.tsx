// Tests des écritures de la page « Catégories » de la Modération (tranche R6b) : ranger un projet et
// créer une catégorie changent les catégories (leur nombre de projets, leur liste) ; les deux hooks
// font relire les catégories de toutes les langues (`['categories']`), en plus du journal.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { categoriesQueryKey } from '../categories/api'
import { catalogueChangesKey, useCreateCategory, useRecategorize } from './catalogue-api'

jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

/** Un client de cache neuf, et la liste des clés que les hooks lui ont demandé de relire. */
const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = jest.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const keys = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey)
  return { wrapper, keys }
}

describe('the categories page writes', () => {
  it('reloads the categories of every language after a project is filed', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null })
    const { wrapper, keys } = setup()
    const { result } = await renderHook(() => useRecategorize(), { wrapper })

    await act(async () => {
      await result.current.recategorize('00000000-0000-4000-8000-000000000041', 'animals')
    })

    expect(keys()).toEqual(expect.arrayContaining([categoriesQueryKey(), catalogueChangesKey]))
  })

  it('reloads the categories after a category is created, and not after a refusal', async () => {
    const created = { code: 'jardinage', name: 'Jardinage', icon: 'flower', projectCount: 0 }
    jest
      .mocked(request)
      .mockResolvedValueOnce({ ok: false, error: 'categoryNameTaken' })
      .mockResolvedValueOnce({ ok: true, data: created })
    const { wrapper, keys } = setup()
    const { result } = await renderHook(() => useCreateCategory(), { wrapper })
    const values = { nameFr: 'Jardinage', nameEn: 'Gardening', icon: 'flower' as const }

    await act(async () => {
      await result.current.create(values)
    })
    expect(keys()).toEqual([])

    await act(async () => {
      await result.current.create(values)
    })
    expect(keys()).toEqual(expect.arrayContaining([categoriesQueryKey()]))
  })
})
