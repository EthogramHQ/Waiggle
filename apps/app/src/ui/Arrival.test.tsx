// Tests d'Arrival (R4) : un élément qui arrive dans une liste déjà affichée entre en scène (une
// chute, ou un fondu avec « Réduire les animations ») ; un élément déjà là est simplement montré.
// Jest ne joue aucune animation : on lit l'animation d'entrée (`entering`) que Reanimated jouerait.
import { screen } from '@testing-library/react-native'
import { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated'
import { arrivedFocusSuite, MORE, type PageState } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { Arrival } from './Arrival'
import { FeedEnd, useFirstArrived } from './FeedEnd'
import { Pressed } from './Pressed'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Reanimated tel que le prépare jest.setup.ts, avec le réglage « Réduire les animations » choisi par
// chaque test (useCalmMotion le lit).
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

type Node = { props: Record<string, unknown>; parent: Node | null }

/** L'animation d'entrée posée autour du lien de ce nom, ou undefined. */
const enteringOf = (name: string) => {
  let node: Node | null = screen.getByRole('link', { name }) as unknown as Node
  while (node) {
    if (node.props.entering !== undefined) return node.props.entering
    node = node.parent
  }
  return undefined
}

const card = (
  <Pressed label="Carnet de cafés" role="link" onPress={jest.fn()}>
    <Text>Carnet de cafés</Text>
  </Pressed>
)

beforeEach(() => {
  reducedMotion.mockReturnValue(false)
})

describe('Arrival', () => {
  it('shows an element already there without any entrance', async () => {
    await renderWithProviders(<Arrival arriving={false}>{card}</Arrival>)

    // Témoin : la carte est là, et reste un lien.
    expect(screen.getByRole('link', { name: 'Carnet de cafés' })).toBeTruthy()
    expect(enteringOf('Carnet de cafés')).toBeUndefined()
  })

  it('drops an arriving element into place', async () => {
    await renderWithProviders(<Arrival arriving>{card}</Arrival>)

    // FadeInUp : depuis le haut, vers sa place (le nom dit d'où elle vient).
    expect(enteringOf('Carnet de cafés')).toBeInstanceOf(FadeInUp)
  })

  it('fades an arriving element in when the device asks for calm motion', async () => {
    reducedMotion.mockReturnValue(true)
    await renderWithProviders(<Arrival arriving>{card}</Arrival>)

    expect(enteringOf('Carnet de cafés')).toBeInstanceOf(FadeIn)
  })
})

// RF, jur-RF2 : la liste donne `focusRef` à la carte arrivée en premier avec la page 2, et `FeedEnd`
// y met le focus quand « Afficher la suite » disparaît (la liste finit sans phrase).
const ArrivalList = ({ names, state }: { names: string[]; state: PageState }) => {
  const arrived = useFirstArrived(names.length, state === 'loading')
  return (
    <>
      {names.map((name, index) => (
        <Arrival
          key={name}
          arriving={false}
          focusRef={index === arrived.index ? arrived.ref : undefined}
        >
          <Text>{name}</Text>
        </Arrival>
      ))}
      <FeedEnd state={state} moreLabel={MORE} onMore={() => {}} firstArrived={arrived.ref} />
    </>
  )
}

arrivedFocusSuite('Arrival as the first arrived card', () => (names, state) => (
  <ArrivalList names={names} state={state} />
))
