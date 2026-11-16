// Tests des lectures d'un visiteur sans compte (tranche R12, `public/api.ts`) : elles vont aux seules
// routes /v1/public/*, sans cookie sur le web (le navigateur n'y joint pas la session), nomment les
// catégories dans la langue de la page, et gardent leur cache à part de celui des membres.
//
// Le vrai client (`api/client.ts`) tourne, branché sur le faux serveur de Public.testkit.tsx : un 404
// arrive au hook par le même chemin qu'en vrai.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { Platform } from 'react-native'
import { errorKey } from '../api/errors'
import { createI18n } from '../i18n'
import {
  countdownUpdate,
  decollage,
  decollageId,
  inesId,
  inesPublic,
  publicServer,
  resetPublic,
} from '../screens/Public.testkit'
import { publicKeys, usePublicMember, usePublicProject, usePublicUpdates } from './api'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

let client: QueryClient

/** Un hook dans une langue de la page, avec un cache neuf. */
const renderIn = <T,>(hook: () => T, language: 'fr' | 'en' = 'fr') => {
  const i18n = createI18n(language)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  )
  return renderHook(hook, { wrapper })
}

/** La seule demande reçue par le faux serveur. */
const onlyRequest = () => {
  expect(publicServer.sent).toHaveLength(1)
  const [sent] = publicServer.sent
  if (!sent) throw new Error('no request')
  return sent
}

beforeEach(() => {
  resetPublic('/fr/')
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
})

describe('usePublicProject', () => {
  it('reads the public route, with the language of the page, and the contract shape', async () => {
    const { result } = await renderIn(() => usePublicProject(decollageId), 'en')

    await waitFor(() => expect(result.current.data).toBeDefined())
    const sent = onlyRequest()
    expect(sent.path).toBe(`/v1/public/projects/${decollageId}`)
    expect(sent.query.get('lang')).toBe('en')
    expect(result.current.data?.title).toBe(decollage.title)
    // Le cache d'un visiteur est à part de celui d'un membre (['project', id]).
    expect(client.getQueryData(publicKeys.project(decollageId, 'en'))).toBeDefined()
    expect(client.getQueryData(['project', decollageId])).toBeUndefined()
  })

  it('sends no session cookie on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const { result } = await renderIn(() => usePublicProject(decollageId))
      await waitFor(() => expect(result.current.data).toBeDefined())
    } finally {
      jest.restoreAllMocks()
    }

    expect(onlyRequest().credentials).toBe('omit')
  })

  it('gives « not found » for a project that is not public, without retrying', async () => {
    publicServer.projects.clear()
    const { result } = await renderIn(() => usePublicProject(decollageId))

    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(errorKey(result.current.error)).toBe('notFound')
    expect(publicServer.sent).toHaveLength(1)
  })

  it('asks nothing while it is not enabled', async () => {
    await renderIn(() => usePublicProject(decollageId, false))

    await waitFor(() => expect(client.isFetching()).toBe(0))
    expect(publicServer.sent).toHaveLength(0)
  })

  it('never lets an id change the path of the request', async () => {
    const { result } = await renderIn(() => usePublicProject('../members/u-ines'))

    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(onlyRequest().path).toBe('/v1/public/projects/..%2Fmembers%2Fu-ines')
  })
})

describe('usePublicUpdates', () => {
  it('reads the updates of a public project from the public route, without cookie', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    let items: unknown
    try {
      const { result } = await renderIn(() => usePublicUpdates(decollageId))
      await waitFor(() => expect(result.current.data).toBeDefined())
      items = result.current.data?.pages[0]?.items
    } finally {
      jest.restoreAllMocks()
    }

    const sent = onlyRequest()
    expect(sent.path).toBe(`/v1/public/projects/${decollageId}/updates`)
    expect(sent.credentials).toBe('omit')
    expect(items).toEqual([countdownUpdate])
  })
})

describe('usePublicMember', () => {
  it('reads the public page of a member, without cookie, and keeps only what is there', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    let name: string | undefined
    try {
      const { result } = await renderIn(() => usePublicMember(inesId))
      await waitFor(() => expect(result.current.data).toBeDefined())
      name = result.current.data?.name
    } finally {
      jest.restoreAllMocks()
    }

    const sent = onlyRequest()
    expect(sent.path).toBe(`/v1/public/members/${inesId}`)
    expect(sent.credentials).toBe('omit')
    expect(name).toBe(inesPublic.name)
  })

  it('gives « not found » for a page that is closed', async () => {
    publicServer.members.clear()
    const { result } = await renderIn(() => usePublicMember(inesId))

    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(errorKey(result.current.error)).toBe('notFound')
  })
})
