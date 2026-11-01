// Tests de l'arrivée des nouvelles cartes dans un fil (R4, plan « Appli » : « Les nouvelles cartes
// tombent en place ») : après « N nouveaux projets », les cartes arrivées en haut du fil tombent à
// leur place (une animation d'entrée de Reanimated, le ressort `drop`), ou apparaissent en fondu
// quand « Réduire les animations » est activé. Celles qui étaient déjà là ne bougent pas, ni au
// premier affichage, ni quand la suite du fil (plus ancienne) arrive en bas.
//
// Jest ne joue aucune animation : on lit l'animation d'entrée (`entering`) posée autour de chaque
// carte, celle que Reanimated jouerait à son arrivée à l'écran.
import type { FeedItem } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated'
import { recipesProject, summaryOf } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { FeedList } from './FeedList'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))
// Reanimated tel que le prépare jest.setup.ts, avec le réglage « Réduire les animations » de
// l'appareil choisi par chaque test (useCalmMotion le lit).
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  // __esModule et default : sans eux, `import Animated from …` ne retrouverait pas Animated.View.
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
  }
})

const reducedMotion = jest.mocked(useReducedMotion)

/** Un nouveau projet du fil, publié à cette date (`at`). */
const item = (id: string, title: string, at: string): FeedItem => ({
  kind: 'project',
  at,
  project: { ...summaryOf(recipesProject), id, title, demoUrl: null },
})

const cafes = item('a1', 'Carnet de cafés', '2026-10-20T10:00:00.000Z')
const quiz = item('a2', 'Le quiz des capitales', '2026-10-19T10:00:00.000Z')
// Arrivé après la première lecture, en haut du fil.
const garden = item('a3', 'Le carnet de jardin', '2026-10-21T10:00:00.000Z')
// La suite du fil : plus ancien que tout ce qui est affiché.
const photos = item('a4', 'Le tri des photos', '2026-10-01T10:00:00.000Z')

// Un fil lu, sans suite à demander.
const feed = {
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: () => Promise.resolve(),
  refetch: () => Promise.resolve(),
}

/** Le Fil (avec « Tu es à jour »), sur ces éléments. */
const list = (items: FeedItem[]) => (
  <FeedList
    feed={feed}
    items={items}
    upToDate={{ readBefore: '2026-10-19T12:00:00.000Z', onExplore: jest.fn() }}
  />
)

type Node = { props: Record<string, unknown>; parent: Node | null }

/** L'animation d'entrée posée autour de la carte de ce projet, ou undefined. */
const enteringOf = (title: string) => {
  let node: Node | null = screen.getByRole('link', { name: title }) as unknown as Node
  while (node) {
    if (node.props.entering !== undefined) return node.props.entering
    node = node.parent
  }
  return undefined
}

beforeEach(() => {
  reducedMotion.mockReturnValue(false)
})

describe('FeedList, the arrival of new cards', () => {
  it('does not animate the cards already there at the first display', async () => {
    await renderWithProviders(list([cafes, quiz]))

    // Témoin : les deux cartes sont là.
    expect(screen.getByRole('link', { name: 'Carnet de cafés' })).toBeTruthy()
    expect(enteringOf('Carnet de cafés')).toBeUndefined()
    expect(enteringOf('Le quiz des capitales')).toBeUndefined()
  })

  it('drops the cards that arrive at the top in place, and only them', async () => {
    const { rerender } = await renderWithProviders(list([cafes, quiz]))

    // « 1 nouveau projet » touché : le fil relu commence par la nouvelle carte.
    await rerender(list([garden, cafes, quiz]))

    // Une chute depuis le haut (FadeInUp : le nom dit d'où elle vient), pas le fondu du mode calme.
    expect(enteringOf('Le carnet de jardin')).toBeInstanceOf(FadeInUp)
    expect(enteringOf('Carnet de cafés')).toBeUndefined()
    expect(enteringOf('Le quiz des capitales')).toBeUndefined()
  })

  it('fades the new cards in when the device asks for calm motion', async () => {
    reducedMotion.mockReturnValue(true)
    const { rerender } = await renderWithProviders(list([cafes, quiz]))

    await rerender(list([garden, cafes, quiz]))

    expect(enteringOf('Le carnet de jardin')).toBeInstanceOf(FadeIn)
    expect(enteringOf('Carnet de cafés')).toBeUndefined()
  })

  it('does not animate the older cards of the next page, added at the bottom', async () => {
    const { rerender } = await renderWithProviders(list([cafes, quiz]))

    // « Afficher la suite » : la page suivante s'ajoute en bas.
    await rerender(list([cafes, quiz, photos]))

    // Témoin : la carte de la suite est là.
    expect(screen.getByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
    expect(enteringOf('Le tri des photos')).toBeUndefined()
  })

  it('does not drop a card twice when more news arrive after it', async () => {
    const { rerender } = await renderWithProviders(list([quiz]))
    await rerender(list([cafes, quiz]))
    expect(enteringOf('Carnet de cafés')).toBeDefined()

    // Une seconde vague de nouveautés : seule la dernière arrivée tombe.
    await rerender(list([garden, cafes, quiz]))

    expect(enteringOf('Le carnet de jardin')).toBeDefined()
    expect(enteringOf('Carnet de cafés')).toBeUndefined()
  })
})
