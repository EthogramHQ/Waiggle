// Tests de `findProjectInLists` (R14, plan, choix 4) : l'aperçu de la page d'un projet vient d'une
// liste déjà lue, quelle que soit sa forme dans le cache. La page d'un membre est couverte par
// screens/ProjectScreen.preview.test.tsx ; ici, les fils (lus page par page, ou leur seule tête),
// le Fil d'une ruche, la liste la plus fraîche quand deux le connaissent, et les données qui ne
// connaissent pas le projet.
import type { FeedPage, Member, ProjectSummary } from '@ruche/contracts'
import { QueryClient } from '@tanstack/react-query'
import { leaPage, projectWithPhotos, recipesProject, summaryOf } from '../testing/projects'
import { findProjectInLists } from './hooks'

const summary: ProjectSummary = summaryOf(projectWithPhotos)
/** Un autre projet de Léa (les deux fixtures partagent un identifiant : on lui en donne un). */
const other: ProjectSummary = { ...summaryOf(recipesProject), id: 'p-other', title: 'Autre projet' }

/** Une page de fil : un nouveau projet, puis un projet remonté par sa mise à jour. */
const pageWith = (project: ProjectSummary, update?: ProjectSummary): FeedPage => ({
  items: [
    { kind: 'project', at: '2026-11-01T10:00:00.000Z', project },
    ...(update
      ? [
          {
            kind: 'update' as const,
            at: '2026-11-02T10:00:00.000Z',
            update: {
              id: 'up1',
              at: '2026-11-02T10:00:00.000Z',
              version: null,
              firstLine: { family: 'new' as const, text: 'Une nouveauté' },
              lineCount: 1,
            },
            project: update,
          },
        ]
      : []),
  ],
  nextCursor: null,
})

let client: QueryClient
beforeEach(() => {
  client = new QueryClient()
})
afterEach(() => client.clear())

describe('findProjectInLists (R14)', () => {
  it('finds a project in a feed read page by page, on a later page too', () => {
    client.setQueryData(['feed', 'following', false], {
      pages: [pageWith(other), pageWith(other, summary)],
      pageParams: [undefined, 'c1'],
    })

    expect(findProjectInLists(client, summary.id)).toEqual(summary)
  })

  it('finds a project in the head of a feed and in the feed of a hive', () => {
    client.setQueryData(['feed', 'discover', false, 'head'], pageWith(summary))
    expect(findProjectInLists(client, summary.id)).toEqual(summary)

    client.clear()
    client.setQueryData(['feed', 'hive', 'h1'], { pages: [pageWith(summary)], pageParams: [null] })
    expect(findProjectInLists(client, summary.id)).toEqual(summary)
  })

  it('takes the freshest list when two lists know the project', () => {
    const older: Member = { ...leaPage, projects: [{ ...summary, title: 'Ancien titre' }] }
    client.setQueryData(['member', leaPage.id], older, { updatedAt: 1_000 })
    client.setQueryData(
      ['feed', 'following', false],
      { pages: [pageWith(summary)], pageParams: [undefined] },
      { updatedAt: 2_000 },
    )

    expect(findProjectInLists(client, summary.id)?.title).toBe(summary.title)
  })

  it('finds nothing when no list knows the project, nor in other caches', () => {
    // Témoin : la même liste connaît l'autre projet.
    client.setQueryData(['member', leaPage.id], { ...leaPage, projects: [other] })
    expect(findProjectInLists(client, other.id)).toEqual(other)

    // Ni un projet complet rangé ailleurs, ni une donnée d'une autre forme.
    client.setQueryData(['project', summary.id], projectWithPhotos)
    client.setQueryData(['feed', 'news'], 3)
    client.setQueryData(['member', 'u9', 'followers'], { items: [{ id: summary.id }] })

    expect(findProjectInLists(client, summary.id)).toBeNull()
  })
})
