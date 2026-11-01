// Tests de la note d'un projet suivi dans le fil (R4 « le fil et les cartes ») : sa date se dit par
// rapport à maintenant (« il y a 2 h ») et le lecteur d'écran l'entend en entier (« 20 octobre à
// 12:00 », heure de Paris). Toucher la carte mène à la page du projet.
import type { ProjectNote } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { recipesProject, summaryOf } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { parisDateTime } from '../ui/parisTime'
import { relativeDate } from '../ui/relativeDate'
import { FeedNoteCard } from './FeedNoteCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}))

/** Le mardi 20 octobre 2026 à 14 h, heure de Paris. */
const now = new Date('2026-10-20T12:00:00.000Z')
const project = summaryOf(recipesProject)
const note: ProjectNote = {
  id: '6f1c2d3e-4b5a-4c6d-8e7f-901a2b3c4d5e',
  body: 'v2 : mode hors ligne',
  // Deux heures plus tôt.
  createdAt: '2026-10-20T10:00:00.000Z',
  removal: null,
}

beforeEach(() => {
  mockPush.mockReset()
  // Seule l'horloge des dates est figée : les minuteurs restent vrais, pour React et les tests.
  jest.useFakeTimers({
    now,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  })
})
afterEach(() => {
  jest.useRealTimers()
})

describe('FeedNoteCard', () => {
  it('says when the note was written, relative to now, and reads the full date', async () => {
    await renderWithProviders(<FeedNoteCard note={note} project={project} />)

    expect(screen.getByText(relativeDate(note.createdAt, 'fr', now).label)).toBeTruthy()
    expect(screen.getByLabelText(parisDateTime(note.createdAt, 'fr', now).dateTime)).toBeTruthy()
  })

  it('opens the page of the project', async () => {
    await renderWithProviders(<FeedNoteCard note={note} project={project} />)

    await fireEvent.press(screen.getByRole('link', { name: /Mon agent de recettes/ }))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/projects/[id]',
      params: { id: project.id },
    })
  })
})
