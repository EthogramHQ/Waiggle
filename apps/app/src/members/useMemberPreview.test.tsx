// Tests de l'aperçu d'un membre (R16, plan, choix 10) : la page d'un membre ouverte depuis une
// carte montre tout de suite son nom et sa photo, tirés de ce que le cache sait déjà de lui
// (l'auteur d'un projet d'une liste, ou d'une page de projet lue), sans aucune requête. La page
// elle-même est couverte par screens/MemberScreen.test.tsx ; ici, où on le trouve, la donnée la
// plus fraîche quand deux le connaissent, et le hook lu une fois par membre.
import type { FeedPage, Member, ProjectSummary } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { findAuthorInLists } from '../projects/hooks'
import { leaPage, projectWithPhotos, summaryOf } from '../testing/projects'
import { useMemberPreview } from './api'

const summary: ProjectSummary = summaryOf(projectWithPhotos)
const lea = summary.author

/** Une page de fil avec un seul nouveau projet. */
const pageWith = (project: ProjectSummary): FeedPage => ({
  items: [{ kind: 'project', at: '2026-11-01T10:00:00.000Z', project }],
  nextCursor: null,
})

let client: QueryClient
beforeEach(() => {
  client = new QueryClient()
})
afterEach(() => client.clear())

describe('findAuthorInLists (R16)', () => {
  it('finds the author of a card in a feed read page by page', () => {
    client.setQueryData(['feed', 'following', false], {
      pages: [pageWith(summary)],
      pageParams: [undefined],
    })

    expect(findAuthorInLists(client, lea.id)).toEqual(lea)
  })

  it('finds the author of a project page already read', () => {
    client.setQueryData(['project', projectWithPhotos.id], projectWithPhotos)

    expect(findAuthorInLists(client, lea.id)?.name).toBe(projectWithPhotos.author.name)
  })

  it('takes the freshest answer when two lists know the member', () => {
    const renamed = { ...summary, author: { ...lea, name: 'Léa Moreau' } }
    client.setQueryData(
      ['feed', 'following', false],
      { pages: [pageWith(summary)], pageParams: [undefined] },
      { updatedAt: 1_000 },
    )
    client.setQueryData(['feed', 'discover', false, 'head'], pageWith(renamed), {
      updatedAt: 2_000,
    })

    expect(findAuthorInLists(client, lea.id)?.name).toBe('Léa Moreau')
  })

  it('finds nothing for a member no list knows', () => {
    // Témoin : la même liste connaît Léa.
    const page: Member = { ...leaPage, projects: [summary] }
    client.setQueryData(['member', 'u9'], page)
    expect(findAuthorInLists(client, lea.id)).toEqual(lea)

    expect(findAuthorInLists(client, 'inconnu')).toBeNull()
  })
})

describe('useMemberPreview (R16)', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )

  it('gives the name and photo a list knows, and null when none knows the member', async () => {
    client.setQueryData(['feed', 'following', false], {
      pages: [pageWith(summary)],
      pageParams: [undefined],
    })

    const known = await renderHook(() => useMemberPreview(lea.id), { wrapper })
    expect(known.result.current).toEqual(lea)

    const unknown = await renderHook(() => useMemberPreview('inconnu'), { wrapper })
    expect(unknown.result.current).toBeNull()
  })

  it('is read once per member: a list read again does not change it under the eyes', async () => {
    client.setQueryData(['feed', 'following', false], {
      pages: [pageWith(summary)],
      pageParams: [undefined],
    })
    const hook = await renderHook(() => useMemberPreview(lea.id), { wrapper })

    client.setQueryData(['feed', 'following', false], {
      pages: [pageWith({ ...summary, author: { ...lea, name: 'Autre nom' } })],
      pageParams: [undefined],
    })
    await hook.rerender({})

    expect(hook.result.current?.name).toBe(lea.name)
  })
})
