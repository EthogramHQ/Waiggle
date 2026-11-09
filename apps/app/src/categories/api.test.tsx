// Tests de la lecture des catégories (tranche R6b, `categories/api.ts`) : les noms viennent de l'API
// dans la langue de l'appli (demandée par `Accept-Language`, gardée à part dans le cache), et
// `categoryOf` ne rend une catégorie que si la liste lue la contient : jamais un code brut.
import { CategoryList } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { request } from '../api/client'
import { createI18n } from '../i18n'
import { categoryList } from '../testing/categories'
import { categoriesQueryKey, categoryOf, useCategories } from './api'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

let client: QueryClient

/** Le hook dans une langue de l'appli, avec un cache neuf. */
const renderInLanguage = (language: 'fr' | 'en') => {
  const i18n = createI18n(language)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  )
  return renderHook(() => useCategories(), { wrapper })
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (_path: string, init: RequestInit) => {
      const language = new Headers(init.headers).get('Accept-Language') === 'en' ? 'en' : 'fr'
      return { ok: true, data: categoryList(language) }
    }) as typeof request)
})

describe('useCategories', () => {
  it('asks the API for the names in the language of the app, checked by the contract', async () => {
    const { result } = await renderInLanguage('en')

    await waitFor(() => expect(result.current.data).toBeDefined())
    const [path, init, schema] = jest.mocked(request).mock.calls[0] ?? []
    expect(path).toBe('/v1/categories')
    expect(new Headers(init?.headers).get('Accept-Language')).toBe('en')
    expect(schema).toBe(CategoryList)
    expect(result.current.data?.categories[1]?.name).toBe('Cooking')
  })

  it('keeps each language apart in the cache', async () => {
    const { result } = await renderInLanguage('fr')

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(client.getQueryData(categoriesQueryKey('fr'))).toEqual(categoryList('fr'))
    expect(client.getQueryData(categoriesQueryKey('en'))).toBeUndefined()
  })
})

describe('categoryOf', () => {
  const list = categoryList('fr').categories

  it('finds the category of a code in the list read', () => {
    expect(categoryOf(list, 'cooking')?.name).toBe('Cuisine')
  })

  it('gives nothing while the list is not read, without a category, or for an unknown code', () => {
    expect(categoryOf(undefined, 'cooking')).toBeUndefined()
    expect(categoryOf(list, null)).toBeUndefined()
    expect(categoryOf(list, 'knitting')).toBeUndefined()
  })
})
