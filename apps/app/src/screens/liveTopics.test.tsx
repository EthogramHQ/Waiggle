// Tests des sujets du temps réel déclarés par les écrans (R21, choix 3 du plan) : une page ouverte
// dit au serveur ce qu'elle regarde, pour recevoir ses signaux. La page d'un projet écoute
// `project:<id>`, celle d'un membre `member:<id>`, celle d'une ruche `hive:<id>`, et le fil d'un
// testeur `corner:<id du projet>`. Quitter l'écran retire son sujet : le serveur n'envoie plus rien
// pour une page fermée.
//
// On lit le magasin des sujets (`liveTopics()` de src/live/topics.ts, ce que la connexion envoie
// dans `PUT /v1/live/<connexion>/topics`), sans regarder quel composant de l'écran le déclare.
// Le sujet ne dépend que de l'adresse : l'écran le déclare dès qu'il est monté, pendant la lecture
// de sa page (un refus du serveur est ignoré sans le dire). Ici, les lectures de l'API restent donc
// en attente : l'écran rendu est celui du chargement.
import { act } from '@testing-library/react-native'
import { request, requestWithoutBody } from '../api/client'
import { liveTopics } from '../live/topics'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { HiveScreen } from './HiveScreen'
import { MemberScreen } from './MemberScreen'
import { ProjectScreen } from './ProjectScreen'
import { TesterThreadScreen } from './TesterThreadScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

const projectId = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
const hiveId = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b'

beforeEach(() => {
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  // Les lectures ne répondent pas : l'écran reste sur son chargement.
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(() => new Promise(() => {}))
  jest
    .mocked(requestWithoutBody)
    .mockReset()
    .mockImplementation(() => new Promise(() => {}))
})

const cases = [
  ['the page of a project', <ProjectScreen key="p" id={projectId} />, `project:${projectId}`],
  ['the page of a member', <MemberScreen key="m" id="nora" />, 'member:nora'],
  ['the page of a hive', <HiveScreen key="h" id={hiveId} />, `hive:${hiveId}`],
  [
    'the thread of a tester',
    <TesterThreadScreen key="t" id={projectId} member="nora" />,
    `corner:${projectId}`,
  ],
] as const

describe('the live topics the screens listen to', () => {
  it.each(cases)('%s listens to its topic', async (_name, ui, topic) => {
    await renderWithProviders(ui)
    await act(async () => {})

    expect(liveTopics()).toContain(topic)
  })

  it.each(cases)('%s stops listening once left', async (_name, ui, topic) => {
    const { unmount } = await renderWithProviders(ui)
    await act(async () => {})
    // Témoin : le sujet est déclaré tant que l'écran est ouvert.
    expect(liveTopics()).toContain(topic)

    await act(async () => {
      unmount()
    })

    expect(liveTopics()).not.toContain(topic)
  })

  it('listens to the topic of the new project when the page changes project', async () => {
    const other = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
    const { rerender } = await renderWithProviders(<ProjectScreen id={projectId} />)
    await act(async () => {})

    await rerender(<ProjectScreen id={other} />)
    await act(async () => {})

    expect(liveTopics()).toContain(`project:${other}`)
    expect(liveTopics()).not.toContain(`project:${projectId}`)
  })
})
