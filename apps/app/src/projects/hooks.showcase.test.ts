// Tests de `findProjectInShowcase` (R17, « La carte qui devient la page ») : ce que la vitrine déjà
// lue sait d'un projet (sa photo, son titre, son auteur, son statut), pour la page qui s'ouvre depuis
// une carte de « À la une », de la vitrine de l'accueil d'un membre ou de la modération. La vitrine
// ne sait ni l'identifiant de l'auteur, ni la visibilité, ni les réactions : ce qui en sort n'en a
// pas, et rien n'est rangé sous la clé du projet (`['project', id]`).
import type { ModerationShowcase, ShowcasePage } from '@ruche/contracts'
import { QueryClient } from '@tanstack/react-query'
import { projectWithPhotos } from '../testing/projects'
import { findProjectInShowcase, projectQueryKey } from './hooks'

const project = projectWithPhotos
const cover = project.visuals[0] ?? null

/** La vitrine d'un membre (« À la une », l'accueil), telle que GET /v1/showcase la rend. */
const memberShowcase: ShowcasePage = {
  items: [
    {
      id: project.id,
      title: project.title,
      pitch: project.pitch,
      status: project.status,
      cover,
      author: { name: project.author.name, avatarUrl: project.author.avatarUrl },
    },
  ],
}

/** L'onglet « Vitrine de l'accueil » de la modération : un projet en vitrine, un candidat. */
const moderation: ModerationShowcase = {
  items: [
    {
      project: {
        id: project.id,
        title: project.title,
        status: project.status,
        cover,
        author: { id: project.author.id, name: project.author.name },
      },
      position: 1,
      addedAt: '2026-11-01T10:00:00.000Z',
      editedSinceAdded: false,
    },
  ],
  candidates: [
    {
      project: {
        id: 'p-candidate',
        title: 'Un candidat',
        status: 'idea',
        cover: null,
        author: { id: 'u2', name: 'Inès' },
      },
      publishedAt: '2026-11-01T10:00:00.000Z',
      showcaseDeclinedAt: null,
    },
  ],
}

let client: QueryClient
beforeEach(() => {
  client = new QueryClient()
})

describe('what the cached showcase knows of a project (R17)', () => {
  it('reads the photo, the title, the pitch, the status and the author from the member showcase', () => {
    client.setQueryData(['showcase'], memberShowcase)

    expect(findProjectInShowcase(client, project.id)).toEqual({
      id: project.id,
      title: project.title,
      pitch: project.pitch,
      status: project.status,
      cover,
      author: { name: project.author.name, avatarUrl: project.author.avatarUrl },
    })
  })

  it('reads a project of the moderation showcase, its showcased ones and its candidates, without inventing a pitch or a photo of its author', () => {
    client.setQueryData(['moderation', 'showcase'], moderation)

    expect(findProjectInShowcase(client, project.id)).toEqual({
      id: project.id,
      title: project.title,
      pitch: null,
      status: project.status,
      cover,
      author: { name: project.author.name, avatarUrl: null },
    })
    expect(findProjectInShowcase(client, 'p-candidate')?.title).toBe('Un candidat')
  })

  it('never reads the showcase of a visitor (its key starts with « public »)', () => {
    client.setQueryData(['public', 'showcase'], memberShowcase)

    expect(findProjectInShowcase(client, project.id)).toBeNull()
  })

  it('knows nothing of a project absent from the showcase, nor without a showcase in cache', () => {
    expect(findProjectInShowcase(client, project.id)).toBeNull()
    client.setQueryData(['showcase'], memberShowcase)
    expect(findProjectInShowcase(client, 'p-absent')).toBeNull()
  })

  it('puts nothing under the key of the project', () => {
    client.setQueryData(['showcase'], memberShowcase)
    findProjectInShowcase(client, project.id)

    expect(client.getQueryData(projectQueryKey(project.id))).toBeUndefined()
  })
})
